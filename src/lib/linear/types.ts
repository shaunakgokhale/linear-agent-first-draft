// Linear API GraphQL types

export interface LinearWebhookEvent {
  action: string;
  type: string;
  organizationId: string;
  agentSession: AgentSessionData;
  previousComments: CommentData[] | null;
  guidance: string | null;
  promptContext: string | null;
}

export interface AgentSessionData {
  id: string;
  status: string;
  issue: IssueData;
  comment: CommentData | null;
  issueId: string;
  commentId: string | null;
}

export interface IssueData {
  id: string;
  title: string;
  description?: string;
  identifier: string;
  url: string;
  teamId: string;
  team: {
    id: string;
    key: string;
    name: string;
  };
  state?: {
    id: string;
    name: string;
    type: string;
  };
  project?: {
    id: string;
    name: string;
    description: string;
  };
}

export interface CommentData {
  id: string;
  body: string;
  issueId?: string;
  user?: {
    id: string;
    name: string;
    isMe: boolean;
  };
  createdAt?: string;
}

export interface AttachmentData {
  id: string;
  url: string;
  title?: string;
  metadata?: any;
}

export interface WorkflowState {
  id: string;
  name: string;
  type: string;
  position: number;
}
