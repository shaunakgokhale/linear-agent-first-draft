// Format and clean agent responses for Linear display

/**
 * Formats agent response content to ensure it's clean, concise, and well-formatted for Linear
 * Linear supports Markdown formatting, so we ensure proper structure and remove verbosity
 */
export function formatResponseForLinear(content: string): string {
  let formatted = content.trim();

  // Remove common LLM meta-commentary patterns
  const metaPatterns = [
    /^Here's (?:what I (?:created|generated|wrote)|the (?:content|draft|result)):?\s*/i,
    /^Here is (?:the (?:content|draft|result)|what I (?:created|generated|wrote)):?\s*/i,
    /^I've (?:created|generated|written) (?:the following|this):?\s*/i,
    /^Below is (?:the (?:content|draft|result)|what I (?:created|generated|wrote)):?\s*/i,
    /^This is (?:the (?:content|draft|result)|what I (?:created|generated|wrote)):?\s*/i,
    /^Let me (?:create|generate|write|provide) (?:the|this):?\s*/i,
    /^I'll (?:create|generate|write|provide) (?:the|this):?\s*/i,
    /^Based on (?:your|the) (?:requirements|request|issue),?\s*/i,
    /^Following (?:your|the) (?:requirements|request|issue),?\s*/i,
    /^As (?:requested|per your request),?\s*/i,
    /^Here you go:?\s*/i,
    /^Here it is:?\s*/i,
  ];

  for (const pattern of metaPatterns) {
    formatted = formatted.replace(pattern, '');
  }

  // Remove thinking/explanation blocks that might appear (only standalone lines)
  formatted = formatted.replace(/^Note:\s+.*$/gim, '');
  formatted = formatted.replace(/^Note that\s+.*$/gim, '');
  formatted = formatted.replace(/^Keep in mind that\s+.*$/gim, '');
  formatted = formatted.replace(/^Remember that\s+.*$/gim, '');

  // Clean up excessive whitespace while preserving structure
  formatted = formatted
    // Remove more than 2 consecutive blank lines
    .replace(/\n{3,}/g, '\n\n')
    // Remove trailing whitespace from lines
    .replace(/[ \t]+$/gm, '')
    // Ensure consistent spacing around headers (one blank line before, one after)
    .replace(/\n+(#{1,6}\s+[^\n]+)\n+/g, '\n\n$1\n\n')
    // Clean up spacing around lists (ensure proper line breaks)
    .replace(/\n+([-*+])\s/g, '\n$1 ')
    // Remove empty list items
    .replace(/^[-*+]\s*$/gm, '')
    // Ensure proper spacing before lists (but not if already spaced)
    .replace(/([^\n])\n([-*+]\s)/g, '$1\n\n$2')
    // Fix spacing after lists (but not if already spaced or if next line is also a list item)
    .replace(/([-*+]\s+[^\n]+)\n([^\n-*+\s#])/g, '$1\n\n$2');

  // Ensure proper Markdown header hierarchy (at least one ## header if content is structured)
  const hasHeaders = /^#{1,6}\s+/m.test(formatted);
  const hasMultipleLines = formatted.split('\n').length > 3;
  
  // If content looks structured but has no headers, try to infer structure
  if (!hasHeaders && hasMultipleLines && formatted.includes('\n\n')) {
    // Check if first line could be a title
    const lines = formatted.split('\n');
    const firstLine = lines[0].trim();
    if (firstLine.length > 0 && firstLine.length < 100 && !firstLine.includes('.')) {
      // Make first line a header if it looks like a title
      formatted = `## ${firstLine}\n\n${lines.slice(1).join('\n')}`;
    }
  }

  // Remove any remaining meta-commentary at the end
  formatted = formatted.replace(/\n+(?:I hope this helps|Let me know if|Feel free to|If you need).*$/i, '');
  formatted = formatted.replace(/\n+(?:This should|This will|This can).*$/i, '');

  // Final trim
  formatted = formatted.trim();

  // Ensure content doesn't start with a colon or dash (common after removing meta text)
  formatted = formatted.replace(/^[:—]\s*/, '');

  return formatted;
}

