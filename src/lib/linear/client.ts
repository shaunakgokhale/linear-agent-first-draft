// Linear API GraphQL client

import { AttachmentData, WorkflowState } from './types';

const LINEAR_API_URL = 'https://api.linear.app/graphql';

export class LinearClient {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  private async query<T>(query: string, variables?: any): Promise<T> {
    const response = await fetch(LINEAR_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.accessToken}`,
      },
      body: JSON.stringify({ query, variables }),
    });

    // `Response.json()` is `unknown` in newer TS/lib.dom versions.
    const json = (await response.json()) as any;
    
    if (!response.ok || json.errors) {
      console.error('Linear API error:', JSON.stringify(json.errors || json));
      throw new Error(`Linear API error: ${response.status} - ${JSON.stringify(json.errors)}`);
    }

    return json.data;
  }

  async getViewer(): Promise<{ id: string; name: string }> {
    const data = await this.query<{ viewer: { id: string; name: string } }>(`
      query {
        viewer {
          id
          name
        }
      }
    `);

    return data.viewer;
  }

  async getIssue(issueId: string): Promise<any> {
    const data = await this.query<{ issue: any }>(`
      query GetIssue($id: String!) {
        issue(id: $id) {
          id
          title
          description
          state {
            id
            name
            type
          }
          team {
            id
            key
          }
          project {
            id
            name
            description
          }
          attachments {
            nodes {
              id
              url
              title
              metadata
            }
          }
          comments {
            nodes {
              id
              body
              user {
                id
                name
                isMe
              }
              createdAt
            }
          }
        }
      }
    `, { id: issueId });

    return data.issue;
  }

  async getTeamStates(teamId: string): Promise<WorkflowState[]> {
    const data = await this.query<{ team: { states: { nodes: WorkflowState[] } } }>(`
      query GetTeamStates($teamId: String!) {
        team(id: $teamId) {
          states {
            nodes {
              id
              name
              type
              position
            }
          }
        }
      }
    `, { teamId });

    return data.team.states.nodes;
  }

  async createAgentActivity(
    sessionId: string,
    activityType: 'thought' | 'response' | 'elicitation' | 'error',
    body: string
  ): Promise<void> {
    // Content must be a JSONObject with "type" and "body" fields
    const content = { type: activityType, body };
    
    await this.query(`
      mutation CreateActivity(
        $sessionId: String!
        $content: JSONObject!
      ) {
        agentActivityCreate(
          input: {
            agentSessionId: $sessionId
            content: $content
          }
        ) {
          success
        }
      }
    `, { sessionId, content });
  }

  async updateIssueState(issueId: string, stateId: string): Promise<void> {
    await this.query(`
      mutation UpdateIssue($id: String!, $stateId: String!) {
        issueUpdate(
          id: $id
          input: { stateId: $stateId }
        ) {
          success
        }
      }
    `, { id: issueId, stateId });
  }

  async createComment(issueId: string, body: string): Promise<void> {
    await this.query(`
      mutation CreateComment($issueId: String!, $body: String!) {
        commentCreate(
          input: {
            issueId: $issueId
            body: $body
          }
        ) {
          success
        }
      }
    `, { issueId, body });
  }

  async closeSession(sessionId: string): Promise<void> {
    await this.query(`
      mutation CloseSession($sessionId: String!, $status: AgentSessionStatus!) {
        agentSessionUpdate(
          id: $sessionId
          input: { status: $status }
        ) {
          success
        }
      }
    `, { sessionId, status: 'closed' });
  }
}
