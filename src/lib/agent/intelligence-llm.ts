// LLM-based intelligence for context analysis and quality assessment

import { Env } from '../../types/env';
import { AgentContext } from './types';
import { MistralClient } from '../mistral/client';

export interface ContextAnalysis {
  isSufficient: boolean;
  quality: 'high' | 'medium' | 'low';
  missingInformation: string[];
  elicitationQuestion?: string;
  reasoning: string;
}

/**
 * LLM-based context sufficiency check
 * More sophisticated than simple word count
 */
export async function analyzeContextSufficiency(
  context: AgentContext,
  env: Env
): Promise<ContextAnalysis> {
  const mistralClient = new MistralClient(env);

  const systemPrompt = `You are an expert at analyzing whether an issue has sufficient context for content generation.

Your task is to evaluate:
1. Does the issue have enough information to generate useful content?
2. What is the quality of the provided context?
3. What information might be missing?
4. If insufficient, what question would help clarify?

Think about:
- Is the intent clear?
- Are there enough details to create meaningful content?
- Could you generate something useful with what's provided?
- What would make this better?

Respond with JSON:
{
  "isSufficient": true/false,
  "quality": "high" | "medium" | "low",
  "missingInformation": ["item1", "item2"],
  "elicitationQuestion": "question to ask if insufficient",
  "reasoning": "why you made this assessment"
}`;

  const userPrompt = `Analyze this issue:

Title: ${context.issue.title}
Description: ${context.issue.description || '(No description)'}
Project: ${context.issue.projectName || 'N/A'}
${context.images.length > 0 ? `Images: ${context.images.length} attached` : ''}
${context.externalContent.length > 0 ? `External links: ${context.externalContent.length} provided` : ''}
${context.issue.comments.length > 0 ? `Comments: ${context.issue.comments.length} available` : ''}

Is there sufficient context to generate useful content?`;

  try {
    const response = await mistralClient.generateContent(systemPrompt, userPrompt);

    // Parse JSON response
    let jsonStr = response.trim();
    if (jsonStr.includes('```json')) {
      jsonStr = jsonStr.split('```json')[1].split('```')[0].trim();
    } else if (jsonStr.includes('```')) {
      jsonStr = jsonStr.split('```')[1].split('```')[0].trim();
    }

    const analysis: ContextAnalysis = JSON.parse(jsonStr);

    // Validate and provide defaults
    return {
      isSufficient: analysis.isSufficient !== false,
      quality: analysis.quality || 'medium',
      missingInformation: analysis.missingInformation || [],
      elicitationQuestion: analysis.elicitationQuestion,
      reasoning: analysis.reasoning || 'Context analysis completed',
    };
  } catch (error) {
    console.error('Failed to parse context analysis:', error);
    // Fallback to basic check
    const hasDescription = context.issue.description && context.issue.description.trim().length >= 10;
    return {
      isSufficient: hasDescription,
      quality: hasDescription ? 'medium' : 'low',
      missingInformation: hasDescription ? [] : ['Issue description'],
      elicitationQuestion: "What kind of content are you looking for? Can you provide more details about what you need?",
      reasoning: 'Fallback analysis: checking for basic description',
    };
  }
}

/**
 * Generate intelligent elicitation question based on context
 */
export function generateElicitationQuestion(analysis: ContextAnalysis): string {
  if (analysis.elicitationQuestion) {
    return analysis.elicitationQuestion;
  }

  if (analysis.missingInformation.length > 0) {
    return `I need a bit more info to help you best. ${analysis.missingInformation[0]} would be helpful. What kind of content are you looking for?`;
  }

  return "Hey! I need a bit more info. What kind of draft are you looking for?";
}

