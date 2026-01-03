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

    if (!response.ok) {
      throw new Error(`Linear API error: ${response.status} ${response.statusText}`);
    }

    const json = await response.json();

    if (json.errors) {
      throw new Error(`Linear GraphQL error: ${JSON.stringify(json.errors)}`);
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
    type: 'thought' | 'response' | 'elicitation' | 'error',
    content: string
  ): Promise<void> {
    await this.query(`
      mutation CreateActivity(
        $sessionId: String!
        $type: String!
        $content: String!
      ) {
        agentActivityCreate(
          input: {
            agentSessionId: $sessionId
            type: $type
            content: $content
          }
        ) {
          success
          activity {
            id
          }
        }
      }
    `, { sessionId, type, content });
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
      mutation CloseSession($sessionId: String!) {
        agentSessionUpdate(
          id: $sessionId
          input: { status: closed }
        ) {
          success
        }
      }
    `, { sessionId });
  }
}
