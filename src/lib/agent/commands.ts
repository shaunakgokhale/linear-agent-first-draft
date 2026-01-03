// @agent command parser

import { Command } from './types';

export function parseCommand(comment: string, agentMentioned: boolean): Command | null {
  if (!agentMentioned) {
    return null;
  }

  const lower = comment.toLowerCase();

  if (lower.includes('show current preferences') || lower.includes('show preferences')) {
    return Command.ShowPreferences;
  }

  if (lower.includes('forget all preferences') || lower.includes('forget preferences')) {
    return Command.ForgetPreferences;
  }

  return null;
}

export function isAgentMentioned(comment: string): boolean {
  const lower = comment.toLowerCase();
  return lower.includes('@agent') || lower.includes('@ agent');
}
