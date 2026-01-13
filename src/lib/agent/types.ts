// Agent internal types

// Planning phase result - LLM determines content structure
export interface ContentPlan {
  contentType: string; // e.g., "social media post", "documentation", "email campaign"
  reasoning: string; // why this content type and structure makes sense
  proposedStructure: {
    sections: string[]; // list of sections/components
    format: string; // description of format
    organization: string; // how content should be organized
  };
  keyRequirements: string[]; // what needs to be addressed
  approach: string; // generation strategy
  considerations: string[]; // special notes
}

export interface AgentContext {
  issue: {
    id: string;
    title: string;
    description: string;
    projectName: string;
    projectDescription: string;
    attachments: Attachment[];
    comments: Comment[];
    teamId: string;
    stateId: string;
  };
  memory: WorkspaceMemory;
  externalContent: FetchedContent[];
  images: ProcessedImage[];
  sessionId: string;
  workspaceId: string;
}

export interface Attachment {
  id: string;
  url: string;
  title?: string;
  metadata?: any;
}

export interface Comment {
  id: string;
  body: string;
  user: {
    id: string;
    name: string;
    isMe: boolean;
  };
  createdAt: string;
}

export interface ProcessedImage {
  url: string;
  base64: string;
  mimeType: string;
  size: number;
}

export interface FetchedContent {
  url: string;
  content: string;
  truncated: boolean;
  error?: string;
}

export interface ResearchSummary {
  keyFacts: string[]; // extracted facts and details
  toneIndicators: string[]; // tone and style indicators
  audienceContext: string; // target audience information
  contentRequirements: string[]; // what the content needs to accomplish
  constraints: string[]; // limitations and preferences
  synthesizedInfo: string; // overall synthesis of all sources
}

export interface GenerationResult {
  thoughtContent: string;
  responseContent: string;
  plan: ContentPlan; // the plan used for generation
  research: ResearchSummary; // the research summary used
}

export interface WorkspaceMemory {
  stylePreferences: {
    tone?: string;
    emojiUsage?: string;
    formality?: string;
    voiceNotes?: string[];
  };
  antiPatterns: string[];
  lastUpdated: string;
  version: number;
}

export enum Command {
  ShowPreferences = 'show_preferences',
  ForgetPreferences = 'forget_preferences'
}

export interface MemoryUpdate {
  type: 'preference' | 'anti-pattern';
  value: string;
  avoid?: string;
}
