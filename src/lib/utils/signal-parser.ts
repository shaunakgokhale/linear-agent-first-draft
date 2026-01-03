// Explicit memory signal detection from user feedback

import { MemoryUpdate } from '../agent/types';

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
