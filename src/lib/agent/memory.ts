// Cross-issue memory management

import { Env, WorkspaceMemory } from '../../types/env';
import { MemoryUpdate } from './types';
import { parseSpecialKeywords } from '../utils/signal-parser';

export async function loadMemory(env: Env, workspaceId: string): Promise<WorkspaceMemory> {
  const key = `memory:${workspaceId}`;
  const memoryJson = await env.MEMORY.get(key);

  if (!memoryJson) {
    // Return default empty memory
    return {
      stylePreferences: {},
      antiPatterns: [],
      lastUpdated: new Date().toISOString(),
      version: 1,
    };
  }

  return JSON.parse(memoryJson);
}

export async function updateMemory(
  env: Env,
  workspaceId: string,
  update: MemoryUpdate
): Promise<void> {
  const memory = await loadMemory(env, workspaceId);

  if (update.type === 'anti-pattern') {
    // Add to anti-patterns if not already present
    if (!memory.antiPatterns.includes(update.value)) {
      memory.antiPatterns.push(update.value);
    }

    // If there's an "avoid" value, add that too
    if (update.avoid && !memory.antiPatterns.includes(update.avoid)) {
      memory.antiPatterns.push(update.avoid);
    }
  } else if (update.type === 'preference') {
    // Parse the preference for special keywords
    const parsed = parseSpecialKeywords(update.value);

    // Merge style preferences
    memory.stylePreferences = {
      ...memory.stylePreferences,
      ...parsed.stylePreferences,
    };

    // If it's a general preference, add to voice notes
    if (parsed.antiPattern) {
      if (!memory.stylePreferences.voiceNotes) {
        memory.stylePreferences.voiceNotes = [];
      }
      if (!memory.stylePreferences.voiceNotes.includes(parsed.antiPattern)) {
        memory.stylePreferences.voiceNotes.push(parsed.antiPattern);
      }
    }

    // If there's an "avoid" value, add to anti-patterns
    if (update.avoid && !memory.antiPatterns.includes(update.avoid)) {
      memory.antiPatterns.push(update.avoid);
    }
  }

  memory.lastUpdated = new Date().toISOString();

  const key = `memory:${workspaceId}`;
  await env.MEMORY.put(key, JSON.stringify(memory));
}

export async function clearMemory(env: Env, workspaceId: string): Promise<void> {
  const key = `memory:${workspaceId}`;
  await env.MEMORY.delete(key);
}

export function formatMemoryForDisplay(memory: WorkspaceMemory): string {
  if (
    Object.keys(memory.stylePreferences).length === 0 &&
    memory.antiPatterns.length === 0
  ) {
    return "No preferences stored yet. I'll learn from your feedback as we work together!";
  }

  let output = '**Current preferences:**\n';

  // Style preferences
  if (memory.stylePreferences.tone) {
    output += `✓ Tone: ${memory.stylePreferences.tone}\n`;
  }

  if (memory.stylePreferences.emojiUsage) {
    output += `✓ Emoji usage: ${memory.stylePreferences.emojiUsage}\n`;
  }

  if (memory.stylePreferences.formality) {
    output += `✓ Formality: ${memory.stylePreferences.formality}\n`;
  }

  if (memory.stylePreferences.voiceNotes && memory.stylePreferences.voiceNotes.length > 0) {
    output += `✓ Voice notes:\n`;
    memory.stylePreferences.voiceNotes.forEach(note => {
      output += `  - ${note}\n`;
    });
  }

  // Anti-patterns
  if (memory.antiPatterns.length > 0) {
    output += `✓ Anti-patterns:\n`;
    memory.antiPatterns.forEach(pattern => {
      output += `  - ${pattern}\n`;
    });
  }

  // Last updated
  const lastUpdated = new Date(memory.lastUpdated);
  const daysAgo = Math.floor((Date.now() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24));

  if (daysAgo === 0) {
    output += '✓ Last updated: Today';
  } else if (daysAgo === 1) {
    output += '✓ Last updated: 1 day ago';
  } else {
    output += `✓ Last updated: ${daysAgo} days ago`;
  }

  return output;
}
