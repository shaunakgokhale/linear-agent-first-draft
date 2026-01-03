// Main agent session handler

import { Env } from '../../types/env';
import { LinearClient } from '../linear/client';
import { LinearWebhookEvent, AgentSessionData } from '../linear/types';
import { MistralClient } from '../mistral/client';
import { buildSystemPrompt, buildUserPrompt, buildConciseAssumptions } from '../mistral/prompts';
import { processImages } from '../utils/image-processor';
import { extractUrls, fetchExternalContent } from '../utils/link-fetcher';
import { extractMemorySignals } from '../utils/signal-parser';
import { loadMemory, updateMemory, clearMemory, formatMemoryForDisplay } from './memory';
import { parseCommand, isAgentMentioned, Command } from './commands';
import { detectTemplate, getArtifactList, getArtifactNames } from './templates';
import {
  isContextSufficient,
  isOutOfScope,
  INSUFFICIENT_CONTEXT_MESSAGE,
  OUT_OF_SCOPE_MESSAGE,
} from './intelligence';
import { Template, AgentContext } from './types';

export async function handleAgentSession(event: LinearWebhookEvent, env: Env): Promise<void> {
  const sessionData = event.data;
  const workspaceId = event.workspaceId;

  // Get access token
  const { getAccessToken } = await import('../linear/oauth');
  const accessToken = await getAccessToken(env, workspaceId);

  if (!accessToken) {
    console.error('No access token found for workspace:', workspaceId);
    return;
  }

  const linearClient = new LinearClient(accessToken);

  try {
    // Check if this is a command (from a comment)
    if (sessionData.comment) {
      const mentioned = isAgentMentioned(sessionData.comment.body);
      const command = parseCommand(sessionData.comment.body, mentioned);

      if (command) {
        await handleCommand(command, sessionData, linearClient, env, workspaceId);
        await linearClient.closeSession(sessionData.id);
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
      await linearClient.closeSession(sessionData.id);
      return;
    }

    // Check if context is sufficient
    if (!isContextSufficient(issue.description || '')) {
      await linearClient.createAgentActivity(
        sessionData.id,
        'elicitation',
        INSUFFICIENT_CONTEXT_MESSAGE
      );
      await linearClient.closeSession(sessionData.id);
      return;
    }

    // Emit acknowledgment thought
    await linearClient.createAgentActivity(
      sessionData.id,
      'thought',
      'Analyzing context...'
    );

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

    // Gather context
    const memory = await loadMemory(env, workspaceId);

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

    // Detect template
    const template = detectTemplate(issue.title, issue.description || '');

    // Generate content
    const result = await generateDraft(context, template, env);

    // Emit thought with assumptions
    const thoughtContent = buildConciseAssumptions(
      context.issue.projectName,
      template,
      memory,
      getArtifactNames(template)
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

    // Close session
    await linearClient.closeSession(sessionData.id);
  } catch (error) {
    console.error('Session handler error:', error);

    // Emit error activity
    await linearClient.createAgentActivity(
      sessionData.id,
      'error',
      "I ran into an issue generating the draft. Please re-assign me to try again."
    );

    await linearClient.closeSession(sessionData.id);
  }
}

async function generateDraft(
  context: AgentContext,
  template: Template,
  env: Env
): Promise<{ responseContent: string; templateUsed: Template }> {
  const mistralClient = new MistralClient(env);

  // Build external content summary
  const externalContentText = context.externalContent
    .filter(c => !c.error && c.content)
    .map(c => {
      const truncatedNote = c.truncated ? ' (truncated to first portion)' : '';
      return `From ${c.url}${truncatedNote}:\n${c.content}`;
    })
    .join('\n\n');

  // Build prompts
  const systemPrompt = buildSystemPrompt(
    context.memory,
    context.issue.projectName,
    context.issue.projectDescription,
    externalContentText,
    template,
    getArtifactList(template)
  );

  const userPrompt = buildUserPrompt(context.issue.title, context.issue.description);

  // Generate content with Mistral
  const content = await mistralClient.generateContent(
    systemPrompt,
    userPrompt,
    context.images.length > 0 ? context.images : undefined
  );

  return {
    responseContent: content,
    templateUsed: template,
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
