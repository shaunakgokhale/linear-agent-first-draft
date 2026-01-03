// Linear API GraphQL types

export interface LinearWebhookEvent {
  action: string;
  type: string;
  data: AgentSessionData;
  workspaceId: string;
}

export interface AgentSessionData {
  id: string;
  status: string;
  issue: IssueData;
  comment: CommentData | null;
  previousComments: CommentData[];
  guidance: string | null;
}

export interface IssueData {
  id: string;
  title: string;
  description: string;
  state: {
    id: string;
    name: string;
    type: string;
  };
  team: {
    id: string;
    key: string;
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
  user: {
    id: string;
    name: string;
    isMe: boolean;
  };
  createdAt: string;
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
