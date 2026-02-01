// Planning phase - LLM analyzes context and determines optimal content structure

import { Env } from '../../types/env';
import { AgentContext, ContentPlan } from './types';
import { MistralClient } from '../mistral/client';
import { buildPlanningPrompt } from '../mistral/prompts';

export async function analyzeContext(
  context: AgentContext,
  env: Env
): Promise<ContentPlan> {
  const mistralClient = new MistralClient(env);

  // Build planning prompt
  const systemPrompt = buildPlanningPrompt(context);

  const userPrompt = `Analyze this issue and determine what content structure makes the most sense:

Issue Title: ${context.issue.title}

Issue Description:
${context.issue.description || '(No description provided)'}

Think step by step about:
1. What the user actually needs
2. What type of content would best serve this need
3. What structure and organization would be most helpful
4. What sections or components would be needed

Respond with a JSON object following the exact format specified in the system prompt.`;

  // Generate planning response
  const response = await mistralClient.generateContent(
    systemPrompt,
    userPrompt,
    context.images.length > 0 ? context.images : undefined
  );

  // Parse JSON response
  try {
    // Extract JSON from response (handle markdown code blocks if present)
    let jsonStr = response.trim();
    if (jsonStr.includes('```json')) {
      jsonStr = jsonStr.split('```json')[1].split('```')[0].trim();
    } else if (jsonStr.includes('```')) {
      jsonStr = jsonStr.split('```')[1].split('```')[0].trim();
    }

    const plan: ContentPlan = JSON.parse(jsonStr);

    // Validate required fields
    if (!plan.contentType || !plan.reasoning || !plan.proposedStructure) {
      throw new Error('Invalid plan structure - missing required fields');
    }

    return plan;
  } catch (error) {
    console.error('Failed to parse planning response:', error);
    console.error('Response was:', response);

    // Fallback to a generic plan
    return {
      contentType: 'generic content',
      reasoning: 'Unable to parse planning response, using generic structure',
      proposedStructure: {
        sections: ['Content'],
        format: 'markdown',
        organization: 'single section',
      },
      keyRequirements: ['Address the issue requirements'],
      approach: 'Generate content based on issue description',
      considerations: ['Parsing error occurred'],
    };
  }
}


