// Research phase - LLM synthesizes information from all context sources

import { Env } from '../../types/env';
import { AgentContext, ContentPlan, ResearchSummary } from './types';
import { MistralClient } from '../mistral/client';
import { buildResearchPrompt } from '../mistral/prompts';

export async function synthesizeContext(
  context: AgentContext,
  plan: ContentPlan,
  env: Env
): Promise<ResearchSummary> {
  const mistralClient = new MistralClient(env);

  // Build research prompt
  const systemPrompt = buildResearchPrompt(plan);

  // Build context sources text
  const sources: string[] = [];

  // Issue description
  if (context.issue.description) {
    sources.push(`ISSUE DESCRIPTION:\n${context.issue.description}`);
  }

  // Project context
  if (context.issue.projectName || context.issue.projectDescription) {
    sources.push(
      `PROJECT CONTEXT:\nProject: ${context.issue.projectName || 'N/A'}\nDescription: ${context.issue.projectDescription || 'N/A'}`
    );
  }

  // External content
  if (context.externalContent.length > 0) {
    const externalText = context.externalContent
      .filter(c => !c.error && c.content)
      .map(c => {
        const truncatedNote = c.truncated ? ' (truncated)' : '';
        return `From ${c.url}${truncatedNote}:\n${c.content}`;
      })
      .join('\n\n');
    if (externalText) {
      sources.push(`EXTERNAL CONTENT:\n${externalText}`);
    }
  }

  // Comments (filter out agent comments and ensure user exists)
  const userComments = context.issue.comments.filter(c => c.user && c.user.name && !c.user.isMe);
  if (userComments.length > 0) {
    const commentsText = userComments
      .map(c => `${c.user?.name || 'Unknown'}: ${c.body || ''}`)
      .join('\n\n');
    sources.push(`COMMENTS:\n${commentsText}`);
  }

  // Memory preferences
  if (context.memory.antiPatterns.length > 0 || Object.keys(context.memory.stylePreferences).length > 0) {
    sources.push(
      `MEMORY & PREFERENCES:\n${JSON.stringify(context.memory.stylePreferences, null, 2)}\nAnti-patterns: ${context.memory.antiPatterns.join(', ')}`
    );
  }

  const userPrompt = `Synthesize information from these sources:

${sources.join('\n\n---\n\n')}

Extract and organize all relevant information to support creating the planned content structure:
- Content Type: ${plan.contentType}
- Planned Sections: ${plan.proposedStructure.sections.join(', ')}

Think step by step and provide a structured research summary.`;

  // Generate research response
  const response = await mistralClient.generateContent(
    systemPrompt,
    userPrompt,
    context.images.length > 0 ? context.images : undefined
  );

  // Parse structured response
  try {
    // Try to parse as JSON first
    let jsonStr = response.trim();
    if (jsonStr.includes('```json')) {
      jsonStr = jsonStr.split('```json')[1].split('```')[0].trim();
    } else if (jsonStr.includes('```')) {
      jsonStr = jsonStr.split('```')[1].split('```')[0].trim();
    }

    try {
      const parsed = JSON.parse(jsonStr);
      return {
        keyFacts: parsed.keyFacts || [],
        toneIndicators: parsed.toneIndicators || [],
        audienceContext: parsed.audienceContext || '',
        contentRequirements: parsed.contentRequirements || [],
        constraints: parsed.constraints || [],
        synthesizedInfo: parsed.synthesizedInfo || response,
      };
    } catch {
      // If JSON parsing fails, parse from structured text
      return parseStructuredText(response);
    }
  } catch (error) {
    console.error('Failed to parse research response:', error);
    // Fallback: use raw response as synthesized info
    return {
      keyFacts: [],
      toneIndicators: [],
      audienceContext: '',
      contentRequirements: [],
      constraints: [],
      synthesizedInfo: response,
    };
  }
}

function parseStructuredText(text: string): ResearchSummary {
  const summary: ResearchSummary = {
    keyFacts: [],
    toneIndicators: [],
    audienceContext: '',
    contentRequirements: [],
    constraints: [],
    synthesizedInfo: text,
  };

  // Try to extract structured information from text
  const lines = text.split('\n');
  let currentSection = '';

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.includes('key facts') || lower.includes('facts:')) {
      currentSection = 'facts';
    } else if (lower.includes('tone') || lower.includes('style')) {
      currentSection = 'tone';
    } else if (lower.includes('audience')) {
      currentSection = 'audience';
    } else if (lower.includes('requirements') || lower.includes('needs')) {
      currentSection = 'requirements';
    } else if (lower.includes('constraints') || lower.includes('limitations')) {
      currentSection = 'constraints';
    } else if (line.trim().startsWith('-') || line.trim().startsWith('•')) {
      const item = line.replace(/^[-•]\s*/, '').trim();
      if (currentSection === 'facts' && item) {
        summary.keyFacts.push(item);
      } else if (currentSection === 'tone' && item) {
        summary.toneIndicators.push(item);
      } else if (currentSection === 'requirements' && item) {
        summary.contentRequirements.push(item);
      } else if (currentSection === 'constraints' && item) {
        summary.constraints.push(item);
      }
    } else if (currentSection === 'audience' && line.trim()) {
      summary.audienceContext += (summary.audienceContext ? ' ' : '') + line.trim();
    }
  }

  return summary;
}


