// Agent internal types

export enum Template {
  SocialMediaPost = 'social_media_post',
  ProductPageUI = 'product_page_ui',
  EmailCampaign = 'email_campaign',
  LandingPage = 'landing_page',
  BlogPost = 'blog_post',
  ProductDocumentation = 'product_documentation',
  APIDocumentation = 'api_documentation',
  FeatureAnnouncement = 'feature_announcement',
  ReleaseNotes = 'release_notes',
  UIMicrocopy = 'ui_microcopy',
  HelpCenterArticle = 'help_center_article',
  VideoScript = 'video_script',
  Generic = 'generic'
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

export interface GenerationResult {
  thoughtContent: string;
  responseContent: string;
  templateUsed: Template;
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
