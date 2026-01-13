// Explicit memory signal detection from user feedback
// Enhanced with LLM-based pattern extraction

import { MemoryUpdate } from '../agent/types';
import { Env } from '../../types/env';
import { MistralClient } from '../mistral/client';

export function extractMemorySignals(comment: string): MemoryUpdate | null {
  const lower = comment.toLowerCase();

  // Anti-patterns (things to avoid)
  const neverMatch = lower.match(/never\s+(.+)/i);
  const dontMatch = lower.match(/don't\s+ever\s+(.+)/i);
  const avoidMatch = lower.match(/avoid\s+(.+)/i);
  const stopMatch = lower.match(/stop\s+(.+)/i);

  if (neverMatch || dontMatch || avoidMatch || stopMatch) {
    const pattern = (neverMatch || dontMatch || avoidMatch || stopMatch)![1];
    return {
      type: 'anti-pattern',
      value: pattern.trim(),
    };
  }

  // Preferences (things to do)
  const alwaysMatch = lower.match(/always\s+(.+)/i);
  const fromNowMatch = lower.match(/from\s+now\s+on\s+(.+)/i);
  const rememberMatch = lower.match(/remember\s+to\s+(.+)/i);
  const defaultMatch = lower.match(/default\s+to\s+(.+)/i);

  if (alwaysMatch || fromNowMatch || rememberMatch || defaultMatch) {
    const preference = (alwaysMatch || fromNowMatch || rememberMatch || defaultMatch)![1];
    return {
      type: 'preference',
      value: preference.trim(),
    };
  }

  // Preference comparison
  const preferMatch = lower.match(/prefer\s+(.+?)\s+over\s+(.+)/i);
  if (preferMatch) {
    return {
      type: 'preference',
      value: preferMatch[1].trim(),
      avoid: preferMatch[2].trim(),
    };
  }

  return null;
}

/**
 * LLM-based pattern extraction from feedback
 * Extracts implicit preferences and patterns from user feedback
 */
export async function extractPatternsFromFeedback(
  comment: string,
  previousOutput: string | null,
  env: Env
): Promise<MemoryUpdate | null> {
  // First try explicit signal extraction
  const explicitSignal = extractMemorySignals(comment);
  if (explicitSignal) {
    return explicitSignal;
  }

  // If no explicit signal and we have previous output, use LLM to find patterns
  if (!previousOutput) {
    return null;
  }

  const mistralClient = new MistralClient(env);

  const systemPrompt = `You are analyzing user feedback to extract preferences and patterns for content generation.

Your task is to identify:
1. Style preferences (tone, formality, emoji usage, etc.)
2. Things to avoid (anti-patterns)
3. General preferences about content structure or approach

Look for implicit signals in the feedback, not just explicit commands.
Respond with JSON:
{
  "hasPattern": true/false,
  "type": "preference" | "anti-pattern" | null,
  "value": "extracted preference or pattern",
  "confidence": "high" | "medium" | "low"
}`;

  const userPrompt = `User feedback: "${comment}"

Previous output that was generated:
${previousOutput.substring(0, 1000)}${previousOutput.length > 1000 ? '...' : ''}

Does this feedback contain any preferences or patterns to learn from?`;

  try {
    const response = await mistralClient.generateContent(systemPrompt, userPrompt);

    // Parse JSON response
    let jsonStr = response.trim();
    if (jsonStr.includes('```json')) {
      jsonStr = jsonStr.split('```json')[1].split('```')[0].trim();
    } else if (jsonStr.includes('```')) {
      jsonStr = jsonStr.split('```')[1].split('```')[0].trim();
    }

    const parsed = JSON.parse(jsonStr);

    if (parsed.hasPattern && parsed.type && parsed.value && parsed.confidence !== 'low') {
      return {
        type: parsed.type,
        value: parsed.value,
      };
    }
  } catch (error) {
    console.error('Failed to extract patterns from feedback:', error);
  }

  return null;
}

export function parseSpecialKeywords(value: string): {
  stylePreferences: Record<string, any>;
  antiPattern: string | null;
} {
  const result: { stylePreferences: Record<string, any>; antiPattern: string | null } = {
    stylePreferences: {},
    antiPattern: null,
  };

  const lower = value.toLowerCase();

  // Detect tone
  if (lower.includes('casual') || lower.includes('informal')) {
    result.stylePreferences.tone = 'casual';
  } else if (lower.includes('formal') || lower.includes('professional')) {
    result.stylePreferences.tone = 'formal';
  } else if (lower.includes('playful') || lower.includes('fun')) {
    result.stylePreferences.tone = 'playful';
  }

  // Detect emoji usage
  if (lower.includes('no emoji') || lower.includes('without emoji')) {
    result.stylePreferences.emojiUsage = 'none';
  } else if (lower.includes('use emoji') || lower.includes('with emoji')) {
    result.stylePreferences.emojiUsage = 'moderate';
  }

  // If no specific style detected, treat as general anti-pattern or voice note
  if (Object.keys(result.stylePreferences).length === 0) {
    result.antiPattern = value;
  }

  return result;
}
