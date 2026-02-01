// Combined Planning + Research phase - Single LLM call for better performance
// This combines planning and research into one call to reduce latency

import { Env } from '../../types/env';
import { AgentContext, ContentPlan, ResearchSummary } from './types';
import { MistralClient } from '../mistral/client';

interface CombinedPlanAndResearch {
  plan: ContentPlan;
  research: ResearchSummary;
}

/**
 * Combined planning and research in a single LLM call
 * This is more efficient than separate calls and reduces total processing time
 */
export async function analyzeContextAndSynthesize(
  context: AgentContext,
  env: Env
): Promise<CombinedPlanAndResearch> {
  const mistralClient = new MistralClient(env);

  // Build combined prompt
  const systemPrompt = buildCombinedPrompt(context);
  const userPrompt = buildCombinedUserPrompt(context);

  // Generate combined response
  const response = await mistralClient.generateContent(
    systemPrompt,
    userPrompt,
    context.images.length > 0 ? context.images : undefined
  );

  // Parse combined response
  try {
    let jsonStr = response.trim();
    if (jsonStr.includes('```json')) {
      jsonStr = jsonStr.split('```json')[1].split('```')[0].trim();
    } else if (jsonStr.includes('```')) {
      jsonStr = jsonStr.split('```')[1].split('```')[0].trim();
    }

    const parsed = JSON.parse(jsonStr);

    // Extract plan
    const plan: ContentPlan = {
      contentType: parsed.contentType || 'generic content',
      reasoning: parsed.reasoning || 'Content structure determined',
      proposedStructure: parsed.proposedStructure || {
        sections: ['Content'],
        format: 'markdown',
        organization: 'single section',
      },
      keyRequirements: parsed.keyRequirements || [],
      approach: parsed.approach || 'Generate content based on issue description',
      considerations: parsed.considerations || [],
    };

    // Extract research
    const research: ResearchSummary = {
      keyFacts: parsed.keyFacts || [],
      toneIndicators: parsed.toneIndicators || [],
      audienceContext: parsed.audienceContext || '',
      contentRequirements: parsed.contentRequirements || [],
      constraints: parsed.constraints || [],
      synthesizedInfo: parsed.synthesizedInfo || response,
    };

    // Validate plan
    if (!plan.contentType || !plan.reasoning || !plan.proposedStructure) {
      throw new Error('Invalid plan structure - missing required fields');
    }

    return { plan, research };
  } catch (error) {
    console.error('Failed to parse combined planning+research response:', error);
    console.error('Response was:', response.substring(0, 500));

    // Fallback to generic plan and research
    return {
      plan: {
        contentType: 'generic content',
        reasoning: 'Unable to parse response, using generic structure',
        proposedStructure: {
          sections: ['Content'],
          format: 'markdown',
          organization: 'single section',
        },
        keyRequirements: ['Address the issue requirements'],
        approach: 'Generate content based on issue description',
        considerations: ['Parsing error occurred'],
      },
      research: {
        keyFacts: [],
        toneIndicators: [],
        audienceContext: '',
        contentRequirements: [],
        constraints: [],
        synthesizedInfo: response,
      },
    };
  }
}

function buildCombinedPrompt(context: AgentContext): string {
  const memoryContext = context.memory.antiPatterns.length > 0 || Object.keys(context.memory.stylePreferences).length > 0
    ? `\n\nMEMORY CONTEXT:
Style Preferences: ${JSON.stringify(context.memory.stylePreferences, null, 2)}
Anti-patterns to avoid: ${context.memory.antiPatterns.join(', ')}`
    : '';

  const projectContext = context.issue.projectName || context.issue.projectDescription
    ? `\n\nPROJECT CONTEXT:
Project: ${context.issue.projectName || 'N/A'}
Description: ${context.issue.projectDescription || 'N/A'}`
    : '';

  // Build context sources
  const sources: string[] = [];
  if (context.issue.description) {
    sources.push(`ISSUE DESCRIPTION:\n${context.issue.description}`);
  }
  if (context.externalContent.length > 0) {
    const externalText = context.externalContent
      .filter(c => !c.error && c.content)
      .map(c => `From ${c.url}${c.truncated ? ' (truncated)' : ''}:\n${c.content.substring(0, 2000)}`)
      .join('\n\n');
    if (externalText) {
      sources.push(`EXTERNAL CONTENT:\n${externalText}`);
    }
  }
  const userComments = context.issue.comments.filter(c => c.user && c.user.name && !c.user.isMe);
  if (userComments.length > 0) {
    const commentsText = userComments
      .map(c => `${c.user?.name || 'Unknown'}: ${c.body || ''}`)
      .join('\n\n');
    sources.push(`COMMENTS:\n${commentsText}`);
  }

  const availableResources: string[] = [];
  if (context.images.length > 0) {
    availableResources.push(`${context.images.length} image(s) attached`);
  }
  if (context.externalContent.length > 0) {
    availableResources.push(`${context.externalContent.filter(c => !c.error).length} external link(s) provided`);
  }
  if (userComments.length > 0) {
    availableResources.push(`${userComments.length} user comment(s) with additional context`);
  }

  const resourcesContext = availableResources.length > 0
    ? `\n\nAVAILABLE RESOURCES:\n${availableResources.join('\n')}`
    : '';

  return `You are an expert content strategist analyzing a Linear issue to determine the optimal content structure AND synthesize all relevant information in a single pass.

Your role is to:
1. Analyze the issue requirements and determine what content structure makes the most sense
2. Synthesize all available information from the context sources
3. Provide both a content plan AND a research summary

CONTEXT:${memoryContext}${projectContext}${resourcesContext}

AVAILABLE INFORMATION SOURCES:
${sources.join('\n\n---\n\n')}

TASK - PART 1: PLANNING
1. Analyze the issue requirements and understand what the user needs
2. Determine what type of content would best serve this need (e.g., "social media post", "documentation", "email campaign", "UI copy", etc.)
3. Reason about the optimal structure and organization for this content
4. Identify what sections/components would be most helpful
5. Plan the generation approach
6. Note any special considerations

TASK - PART 2: RESEARCH
1. Extract key facts and details from all available sources
2. Identify tone and style indicators (formal, casual, technical, etc.)
3. Determine audience context (who is this for, what do they need to know)
4. Identify content requirements (what the content needs to accomplish)
5. Note constraints and preferences (what to avoid, what to emphasize)

OUTPUT FORMAT:
You must respond with a valid JSON object combining both planning and research:
{
  "contentType": "description of content type",
  "reasoning": "why this content type and structure makes sense",
  "proposedStructure": {
    "sections": ["section1", "section2"],
    "format": "description of format",
    "organization": "how content should be organized"
  },
  "keyRequirements": ["requirement1", "requirement2"],
  "approach": "generation strategy",
  "considerations": ["note1", "note2"],
  "keyFacts": ["fact1", "fact2"],
  "toneIndicators": ["indicator1", "indicator2"],
  "audienceContext": "description of target audience",
  "contentRequirements": ["requirement1", "requirement2"],
  "constraints": ["constraint1", "constraint2"],
  "synthesizedInfo": "overall synthesis of all information"
}

Be specific, thoughtful, and efficient. Combine planning and research insights in one response.`;
}

function buildCombinedUserPrompt(context: AgentContext): string {
  return `Analyze this issue and provide both a content plan and research summary:

Issue Title: ${context.issue.title}

Issue Description:
${context.issue.description || '(No description provided)'}

Think step by step about:
1. What the user actually needs
2. What type of content would best serve this need
3. What structure and organization would be most helpful
4. What information from the context sources is relevant
5. What tone and style would be appropriate
6. Who is the audience and what do they need

Respond with the combined JSON object as specified in the system prompt.`;
}

