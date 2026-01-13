// Main agent session handler

import { Env } from '../../types/env';
import { LinearClient } from '../linear/client';
import { LinearWebhookEvent, AgentSessionData } from '../linear/types';
import { MistralClient } from '../mistral/client';
import { buildGenerationPrompt, buildConciseAssumptions } from '../mistral/prompts';
import { processImages } from '../utils/image-processor';
import { extractUrls, fetchExternalContent } from '../utils/link-fetcher';
import { extractMemorySignals } from '../utils/signal-parser';
import { loadMemory, updateMemory, clearMemory, formatMemoryForDisplay } from './memory';
import { parseCommand, isAgentMentioned, Command } from './commands';
import {
  isOutOfScope,
  OUT_OF_SCOPE_MESSAGE,
} from './intelligence';
import { analyzeContextSufficiency, generateElicitationQuestion } from './intelligence-llm';
import { analyzeContext } from './planning';
import { synthesizeContext } from './research';
import { AgentContext, GenerationResult, ContentPlan, ResearchSummary } from './types';

export async function handleAgentSession(event: LinearWebhookEvent, env: Env): Promise<void> {
  const sessionData = event.agentSession;
  const workspaceId = event.organizationId;

  // Get access token
  const { getAccessToken } = await import('../linear/oauth');
  const accessToken = await getAccessToken(env, workspaceId);

  if (!accessToken) {
    console.error('No access token for workspace:', workspaceId);
    return;
  }

  const linearClient = new LinearClient(accessToken);

  try {
    // CRITICAL: Emit acknowledgment immediately (within 10 seconds requirement)
    await linearClient.createAgentActivity(
      sessionData.id,
      'thought',
      'Let me have a look at the issue'
    );

    // Check if this is a command (from a comment)
    if (sessionData.comment) {
      const mentioned = isAgentMentioned(sessionData.comment.body);
      const command = parseCommand(sessionData.comment.body, mentioned);

      if (command) {
        await handleCommand(command, sessionData, linearClient, env, workspaceId);
        return;
      }

      // Check for memory signals in feedback
      const signal = extractMemorySignals(sessionData.comment.body);
      if (signal) {
        await updateMemory(env, workspaceId, signal);
      }
    }

    // Get full issue context
    const issue = await linearClient.getIssue(sessionData.issue.id);

    // Check if out of scope
    if (isOutOfScope(issue.title, issue.description || '')) {
      await linearClient.createAgentActivity(
        sessionData.id,
        'error',
        OUT_OF_SCOPE_MESSAGE
      );
      return;
    }

    // Gather context for analysis
    const memory = await loadMemory(env, workspaceId);
    const minimalContext: AgentContext = {
      issue: {
        id: issue.id,
        title: issue.title,
        description: issue.description || '',
        projectName: issue.project?.name || '',
        projectDescription: issue.project?.description || '',
        attachments: issue.attachments?.nodes || [],
        comments: issue.comments?.nodes || [],
        teamId: issue.team.id,
        stateId: issue.state.id,
      },
      memory,
      externalContent: [],
      images: [],
      sessionId: sessionData.id,
      workspaceId,
    };

    // Check if context is sufficient using LLM-based analysis
    const contextAnalysis = await analyzeContextSufficiency(minimalContext, env);
    if (!contextAnalysis.isSufficient) {
      const elicitationMessage = generateElicitationQuestion(contextAnalysis);
      await linearClient.createAgentActivity(
        sessionData.id,
        'elicitation',
        elicitationMessage
      );
      return;
    }

    // Move issue to "started" if not already
    if (issue.state.type !== 'started' && issue.state.type !== 'completed' && issue.state.type !== 'canceled') {
      const states = await linearClient.getTeamStates(issue.team.id);
      const startedState = states
        .filter(s => s.type === 'started')
        .sort((a, b) => a.position - b.position)[0];

      if (startedState) {
        await linearClient.updateIssueState(issue.id, startedState.id);
      }
    }

    // Process images
    const images = await processImages(issue.attachments?.nodes || [], env);

    // Fetch external links
    const urls = extractUrls(issue.description || '');
    const externalContent = await fetchExternalContent(urls, env);

    // Build context
    const context: AgentContext = {
      issue: {
        id: issue.id,
        title: issue.title,
        description: issue.description || '',
        projectName: issue.project?.name || '',
        projectDescription: issue.project?.description || '',
        attachments: issue.attachments?.nodes || [],
        comments: issue.comments?.nodes || [],
        teamId: issue.team.id,
        stateId: issue.state.id,
      },
      memory,
      externalContent,
      images,
      sessionId: sessionData.id,
      workspaceId,
    };

    // Phase 1: Planning - Determine content structure
    await linearClient.createAgentActivity(
      sessionData.id,
      'thought',
      'Analyzing the issue and planning the content structure...'
    );

    const plan = await analyzeContext(context, env);

    // Phase 2: Research - Synthesize context
    await linearClient.createAgentActivity(
      sessionData.id,
      'thought',
      'Gathering and synthesizing information...'
    );

    const research = await synthesizeContext(context, plan, env);

    // Phase 3: Generation - Create content
    await linearClient.createAgentActivity(
      sessionData.id,
      'thought',
      'Generating content based on the plan...'
    );

    const result = await generateDraft(context, plan, research, env);

    // Emit thought with reasoning and assumptions
    const thoughtContent = buildConciseAssumptions(
      context.issue.projectName,
      plan,
      memory
    );

    // Add notes about external content/images
    let additionalNotes = '';
    if (externalContent.length > 0) {
      const failed = externalContent.filter(c => c.error);
      if (failed.length > 0) {
        additionalNotes += `\nNote: Couldn't access ${failed.map(c => c.url).join(', ')}`;
      }
    }

    await linearClient.createAgentActivity(
      sessionData.id,
      'thought',
      thoughtContent + additionalNotes
    );

    // Emit response with generated content
    await linearClient.createAgentActivity(
      sessionData.id,
      'response',
      result.responseContent
    );
    // Session closes automatically after response activity
  } catch (error) {
    console.error('Session handler error:', error);

    // Emit error activity
    await linearClient.createAgentActivity(
      sessionData.id,
      'error',
      "I ran into an issue generating the draft. Please re-assign me to try again."
    );
  }
}

async function generateDraft(
  context: AgentContext,
  plan: ContentPlan,
  research: ResearchSummary,
  env: Env
): Promise<GenerationResult> {
  const mistralClient = new MistralClient(env);

  // Build generation prompts
  const { systemPrompt, userPrompt } = buildGenerationPrompt(context, plan, research);

  // Generate content with Mistral
  const content = await mistralClient.generateContent(
    systemPrompt,
    userPrompt,
    context.images.length > 0 ? context.images : undefined
  );

  return {
    responseContent: content,
    plan,
    research,
    thoughtContent: buildConciseAssumptions(context.issue.projectName, plan, context.memory),
  };
}

async function handleCommand(
  command: Command,
  sessionData: AgentSessionData,
  linearClient: LinearClient,
  env: Env,
  workspaceId: string
): Promise<void> {
  if (command === Command.ShowPreferences) {
    const memory = await loadMemory(env, workspaceId);
    const formatted = formatMemoryForDisplay(memory);
    await linearClient.createComment(sessionData.issue.id, formatted);
  } else if (command === Command.ForgetPreferences) {
    await clearMemory(env, workspaceId);
    await linearClient.createComment(
      sessionData.issue.id,
      "All preferences forgotten! I'll start learning fresh from your feedback."
    );
  }
}
