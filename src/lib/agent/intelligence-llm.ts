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

IMPORTANT: Respond with valid JSON only. Escape all control characters (newlines, tabs, etc.) in string values using \\n, \\t, etc.
Do not include any text before or after the JSON object.

Respond with JSON:
{
  "isSufficient": true/false,
  "quality": "high" | "medium" | "low",
  "missingInformation": ["item1", "item2"],
  "elicitationQuestion": "question to ask if insufficient (escape newlines as \\n)",
  "reasoning": "why you made this assessment (escape newlines as \\n)"
}`;

  // Filter out agent/system-generated comments and get user comments
  const userComments = context.issue.comments.filter(comment => {
    const body = (comment.body || '').toLowerCase().trim();
    // Filter out agent session thread headers and agent-generated content
    return !body.startsWith('this thread is for an agent session') &&
           !body.includes('connected first draft') &&
           comment.user && 
           comment.user.name && // Ensure user name exists
           !comment.user.isMe; // Exclude comments from the agent itself
  });

  console.log(`[Context Analysis] Analyzing ${userComments.length} user comments out of ${context.issue.comments.length} total comments`);

  // Build comments text
  let commentsText = '';
  if (userComments.length > 0) {
    const commentsContent = userComments
      .map(c => `${c.user?.name || 'Unknown'}: ${c.body || ''}`)
      .join('\n\n');
    commentsText = '\n\nUser Comments:\n' + commentsContent;
    console.log(`[Context Analysis] Including user comments: ${commentsContent.substring(0, 200)}...`);
  } else {
    console.log(`[Context Analysis] No user comments found after filtering`);
  }

  const userPrompt = `Analyze this issue:

Title: ${context.issue.title}
Description: ${context.issue.description || '(No description)'}
Project: ${context.issue.projectName || 'N/A'}
${context.images.length > 0 ? `Images: ${context.images.length} attached` : ''}
${context.externalContent.length > 0 ? `External links: ${context.externalContent.length} provided` : ''}${commentsText}

Is there sufficient context to generate useful content?`;

  try {
    const response = await mistralClient.generateContent(systemPrompt, userPrompt);

    // Parse JSON response with better error handling
    let jsonStr = response.trim();
    if (jsonStr.includes('```json')) {
      jsonStr = jsonStr.split('```json')[1].split('```')[0].trim();
    } else if (jsonStr.includes('```')) {
      jsonStr = jsonStr.split('```')[1].split('```')[0].trim();
    }

    // Try to parse JSON, with fallback strategies for malformed JSON
    let analysis: ContextAnalysis;
    try {
      analysis = JSON.parse(jsonStr);
    } catch (parseError) {
      console.log(`[Context Analysis] Initial JSON parse failed, attempting recovery. Error: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
      console.log(`[Context Analysis] JSON string preview: ${jsonStr.substring(0, 500)}...`);
      
      // Try to extract just the JSON object if there's extra text
      const firstBrace = jsonStr.indexOf('{');
      const lastBrace = jsonStr.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        const jsonObj = jsonStr.substring(firstBrace, lastBrace + 1);
        try {
          analysis = JSON.parse(jsonObj);
          console.log(`[Context Analysis] Successfully parsed after extracting JSON object`);
        } catch (secondError) {
          console.log(`[Context Analysis] Second parse attempt failed: ${secondError instanceof Error ? secondError.message : String(secondError)}`);
          // If still failing, log the problematic section and throw to use fallback
          throw parseError;
        }
      } else {
        throw parseError;
      }
    }

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
    const hasDescription = !!(context.issue.description && context.issue.description.trim().length >= 10);
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


