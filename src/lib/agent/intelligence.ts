// Hybrid intelligence - context sufficiency analysis

export function isContextSufficient(issueDescription: string): boolean {
  if (!issueDescription) {
    return false;
  }

  const description = issueDescription.trim();
  const wordCount = description.split(/\s+/).length;

  // Insufficient if less than 4 words
  if (wordCount < 4) {
    return false;
  }

  return true;
}

export function isOutOfScope(issueTitle: string, issueDescription: string): boolean {
  const combined = `${issueTitle} ${issueDescription}`.toLowerCase();

  const technicalKeywords = [
    'fix bug',
    'refactor',
    'implement',
    'deploy',
    'migrate',
    'optimize performance',
    'database',
    'schema',
    'authentication flow',
    'build feature',
    'add endpoint',
    'unit test',
  ];

  // Check if it's technical AND has no copywriting keywords
  const hasTechnical = technicalKeywords.some(kw => combined.includes(kw));
  const hasCopywriting = combined.match(/\b(copy|write|draft|content|text|documentation|docs)\b/);

  return hasTechnical && !hasCopywriting;
}

export const INSUFFICIENT_CONTEXT_MESSAGE =
  "Hey! I need a bit more info. What kind of draft are you looking for?";

export const OUT_OF_SCOPE_MESSAGE = `I only handle content and copywriting tasks. If you need specific copy for this task (like documentation, comments, or text), let me know in a comment and I'll help with that!`;
