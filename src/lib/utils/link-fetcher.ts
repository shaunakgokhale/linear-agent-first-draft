// Web content fetching for external links

import { FetchedContent } from '../agent/types';
import { Env } from '../../types/env';

const URL_REGEX = /https?:\/\/[^\s<>"]+/gi;

export function extractUrls(text: string): string[] {
  const matches = text.match(URL_REGEX);
  return matches ? Array.from(new Set(matches)) : [];
}

export async function fetchExternalContent(
  urls: string[],
  env: Env
): Promise<FetchedContent[]> {
  const maxSize = parseInt(env.MAX_LINK_FETCH_SIZE);

  // Process URLs in parallel with timeout protection
  const fetchPromises = urls.map(async (url): Promise<FetchedContent> => {
    try {
      // Add 5 second timeout per URL to prevent hanging
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'LinearFirstDraftAgent/1.0',
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          url,
          content: '',
          truncated: false,
          error: `HTTP ${response.status}`,
        };
      }

      const contentType = response.headers.get('content-type') || '';

      // Only process text-based content
      if (!contentType.includes('text') && !contentType.includes('json')) {
        return {
          url,
          content: '',
          truncated: false,
          error: 'Non-text content type',
        };
      }

      let text = await response.text();

      // Simple HTML to text conversion
      if (contentType.includes('html')) {
        text = htmlToText(text);
      }

      // Truncate if too long (rough token estimation: 1 token ≈ 4 chars)
      const charLimit = maxSize * 4;
      let truncated = false;

      if (text.length > charLimit) {
        text = text.substring(0, charLimit);
        truncated = true;
      }

      return {
        url,
        content: text,
        truncated,
      };
    } catch (error) {
      return {
        url,
        content: '',
        truncated: false,
        error: error instanceof Error ? error.message : 'Fetch failed',
      };
    }
  });

  // Wait for all fetches to complete in parallel
  return Promise.all(fetchPromises);
}

function htmlToText(html: string): string {
  // Remove script and style tags
  let text = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

  // Remove HTML tags
  text = text.replace(/<[^>]+>/g, ' ');

  // Decode HTML entities
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'");

  // Collapse whitespace
  text = text.replace(/\s+/g, ' ').trim();

  return text;
}
