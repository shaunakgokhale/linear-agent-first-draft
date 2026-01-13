// Mistral prompt templates - Multi-phase reasoning prompts

import { AgentContext, ContentPlan, ResearchSummary, WorkspaceMemory } from '../agent/types';

/**
 * Phase 1: Planning Prompt
 * LLM analyzes context and determines optimal content structure
 */
export function buildPlanningPrompt(context: AgentContext): string {
  const memoryContext = context.memory.antiPatterns.length > 0 || Object.keys(context.memory.stylePreferences).length > 0
    ? `\n\nMEMORY CONTEXT:
Style Preferences: ${JSON.stringify(context.memory.stylePreferences, null, 2)}
Anti-patterns to avoid: ${context.memory.antiPatterns.join(', ')}`
    : '';

  const projectContext = context.issue.projectName || context.issue.projectDescription
    ? `\n\nPROJECT CONTEXT:
Project: ${context.issue.projectName || 'N/A'}
Description: ${context.issue.projectDescription || 'N/A'}`
    : '';

  const availableResources: string[] = [];
  if (context.images.length > 0) {
    availableResources.push(`${context.images.length} image(s) attached`);
  }
  if (context.externalContent.length > 0) {
    availableResources.push(`${context.externalContent.filter(c => !c.error).length} external link(s) provided`);
  }
  if (context.issue.comments.length > 0) {
    availableResources.push(`${context.issue.comments.length} comment(s) with additional context`);
  }

  const resourcesContext = availableResources.length > 0
    ? `\n\nAVAILABLE RESOURCES:\n${availableResources.join('\n')}`
    : '';

  return `You are an expert content strategist analyzing a Linear issue to determine what content structure makes the most sense.

Your role is to think deeply about what the user actually needs and determine the optimal way to structure and organize content to serve that need.

CONTEXT:${memoryContext}${projectContext}${resourcesContext}

TASK:
1. Analyze the issue requirements and understand what the user needs
2. Determine what type of content would best serve this need (e.g., "social media post", "documentation", "email campaign", "UI copy", etc.)
3. Reason about the optimal structure and organization for this content
4. Identify what sections/components would be most helpful
5. Plan the generation approach
6. Note any special considerations

Think step by step about why this structure makes sense for this specific issue. Consider:
- What is the user trying to accomplish?
- Who is the audience?
- What format would be most effective?
- What information needs to be included?
- How should it be organized for clarity and usability?

OUTPUT FORMAT:
You must respond with a valid JSON object in this exact format:
{
  "contentType": "description of content type (e.g., 'social media post', 'documentation', 'email campaign')",
  "reasoning": "why this content type and structure makes sense for this specific issue",
  "proposedStructure": {
    "sections": ["section1", "section2", "section3"],
    "format": "description of format (e.g., 'markdown with headers', 'structured list', 'narrative')",
    "organization": "how content should be organized (e.g., 'hierarchical with main sections and subsections', 'linear flow', 'modular components')"
  },
  "keyRequirements": ["requirement1", "requirement2"],
  "approach": "generation strategy (how to approach creating this content)",
  "considerations": ["special note1", "special note2"]
}

Be specific and thoughtful. The structure you propose will guide the actual content generation.`;
}

/**
 * Phase 2: Research Prompt
 * LLM synthesizes information from all context sources
 */
export function buildResearchPrompt(plan: ContentPlan): string {
  return `You are a research assistant synthesizing information for content generation.

PLANNED CONTENT STRUCTURE:
- Content Type: ${plan.contentType}
- Planned Sections: ${plan.proposedStructure.sections.join(', ')}
- Format: ${plan.proposedStructure.format}
- Organization: ${plan.proposedStructure.organization}

TASK:
Extract and synthesize all relevant information from the provided sources, identifying:
- Key facts and details that need to be included
- Tone and style indicators (formal, casual, technical, etc.)
- Audience context (who is this for, what do they need to know)
- Content requirements (what the content needs to accomplish)
- Constraints and preferences (what to avoid, what to emphasize)
- Any specific information needed for the planned structure

Think step by step:
1. What are the essential facts and details?
2. What tone and style would be appropriate?
3. Who is the audience and what do they need?
4. What must the content accomplish?
5. Are there any constraints or preferences to consider?
6. How does this information support the planned structure?

OUTPUT FORMAT:
You can respond in either JSON format or structured text. If using JSON:
{
  "keyFacts": ["fact1", "fact2"],
  "toneIndicators": ["indicator1", "indicator2"],
  "audienceContext": "description of target audience",
  "contentRequirements": ["requirement1", "requirement2"],
  "constraints": ["constraint1", "constraint2"],
  "synthesizedInfo": "overall synthesis of all information"
}

Or provide a well-structured text summary organized by these categories. Be thorough and extract all relevant information.`;
}

/**
 * Phase 3: Generation Prompt
 * LLM generates content following the planned structure
 */
export function buildGenerationPrompt(
  context: AgentContext,
  plan: ContentPlan,
  research: ResearchSummary
): { systemPrompt: string; userPrompt: string } {
  const memoryContext = context.memory.antiPatterns.length > 0 || Object.keys(context.memory.stylePreferences).length > 0
    ? `\n\nMEMORY & PREFERENCES:
Style Preferences: ${JSON.stringify(context.memory.stylePreferences, null, 2)}
Anti-patterns to avoid: ${context.memory.antiPatterns.join(', ')}`
    : '';

  const systemPrompt = `You are an expert copywriter creating content based on a strategic plan.

PLANNED STRUCTURE:
- Content Type: ${plan.contentType}
- Sections: ${plan.proposedStructure.sections.join(', ')}
- Format: ${plan.proposedStructure.format}
- Organization: ${plan.proposedStructure.organization}

REASONING:
${plan.reasoning}

KEY REQUIREMENTS:
${plan.keyRequirements.map(r => `- ${r}`).join('\n')}

APPROACH:
${plan.approach}

CONSIDERATIONS:
${plan.considerations.map(c => `- ${c}`).join('\n')}${memoryContext}

RESEARCH SUMMARY:
- Key Facts: ${research.keyFacts.join(', ')}
- Tone Indicators: ${research.toneIndicators.join(', ')}
- Audience: ${research.audienceContext || 'Not specified'}
- Requirements: ${research.contentRequirements.join(', ')}
- Constraints: ${research.constraints.join(', ')}

${research.synthesizedInfo ? `\nSynthesized Information:\n${research.synthesizedInfo}` : ''}

TASK:
Generate the content following the structure determined in the planning phase.
- Use the exact sections and organization planned: ${plan.proposedStructure.sections.join(', ')}
- Incorporate all relevant information from the research summary
- Apply memory preferences and avoid anti-patterns
- Ensure the content is well-formatted, clear, and ready to use
- Think step by step as you create each section
- Make the content production-ready with minimal editing needed

OUTPUT REQUIREMENTS:
- Use clear markdown formatting
- Follow the planned structure exactly: ${plan.proposedStructure.organization}
- Include all planned sections: ${plan.proposedStructure.sections.join(', ')}
- Format consistently throughout
- Use appropriate markdown features (headers, lists, tables, code blocks) as needed
- Make it professional, polished, and ready to use`;

  const userPrompt = `Issue Title: ${context.issue.title}

Issue Description:
${context.issue.description || '(No description provided)'}

Generate the content now, following the planned structure and incorporating all the research information.`;

  return { systemPrompt, userPrompt };
}

/**
 * Build concise assumptions for thought activity
 * Shows the reasoning and planned structure
 */
export function buildConciseAssumptions(
  projectName: string,
  plan: ContentPlan,
  memory: WorkspaceMemory
): string {
  const assumptions: string[] = [];

  // Add project context
  if (projectName) {
    assumptions.push(projectName);
  }

  // Add content type
  assumptions.push(plan.contentType);

  // Add tone from memory
  if (memory.stylePreferences.tone) {
    assumptions.push(`${memory.stylePreferences.tone} tone`);
  } else {
    assumptions.push('casual tone');
  }

  const assumptionText = `Assumptions: ${assumptions.join(', ')}`;
  const reasoningText = `Reasoning: ${plan.reasoning}`;
  const deliveringText = `Delivering: ${plan.proposedStructure.sections.join(', ')}`;

  return `${assumptionText}\n${reasoningText}\n${deliveringText}`;
}
