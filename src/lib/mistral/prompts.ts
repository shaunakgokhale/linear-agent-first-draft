// Mistral prompt templates

import { Template, WorkspaceMemory } from '../agent/types';

export function buildSystemPrompt(
  memory: WorkspaceMemory,
  projectName: string,
  projectDescription: string,
  externalContent: string,
  templateName: Template,
  artifactList: string
): string {
  const memoryContext = memory.antiPatterns.length > 0 || Object.keys(memory.stylePreferences).length > 0
    ? `\n\nMEMORY CONTEXT:
Style Preferences: ${JSON.stringify(memory.stylePreferences, null, 2)}
Anti-patterns to avoid: ${memory.antiPatterns.join(', ')}`
    : '';

  const projectContext = projectName || projectDescription
    ? `\n\nPROJECT CONTEXT:
Project: ${projectName || 'N/A'}
Description: ${projectDescription || 'N/A'}`
    : '';

  const externalContext = externalContent
    ? `\n\nEXTERNAL CONTENT:
${externalContent}`
    : '';

  return `You are a casual, collaborative copywriting assistant integrated into Linear. Your role is to generate first drafts of content based on issue assignments.

PERSONALITY:
- Casual collaborator tone - friendly but professional
- Concise communication - no fluff
- Helpful and creative${memoryContext}${projectContext}${externalContext}

TASK:
Generate content artifacts for: ${templateName}

Required artifacts:
${artifactList}

GUIDELINES:
- Use casual, engaging language unless memory preferences indicate otherwise
${memory.antiPatterns.length > 0 ? `- Avoid these anti-patterns: ${memory.antiPatterns.join(', ')}` : ''}
- Analyze any provided images carefully for context
- Be creative but stay on-brand based on project context
- Output should be ready to use with minimal editing

Format your response as structured artifacts with clear labels using markdown.`;
}

export function buildUserPrompt(
  issueTitle: string,
  issueDescription: string
): string {
  return `Issue Title: ${issueTitle}

Issue Description:
${issueDescription || '(No description provided)'}

Generate the artifacts as specified above.`;
}

export function buildConciseAssumptions(
  projectName: string,
  templateName: Template,
  memory: WorkspaceMemory,
  artifacts: string[]
): string {
  const assumptions: string[] = [];

  // Add project context
  if (projectName) {
    assumptions.push(projectName);
  }

  // Add template/scenario
  assumptions.push(templateName.replace(/_/g, ' '));

  // Add tone from memory
  if (memory.stylePreferences.tone) {
    assumptions.push(`${memory.stylePreferences.tone} tone`);
  } else {
    assumptions.push('casual tone');
  }

  const assumptionText = `Assumptions: ${assumptions.join(', ')}`;
  const deliveringText = `Delivering: ${artifacts.join(', ')}`;

  return `${assumptionText}\n${deliveringText}`;
}
