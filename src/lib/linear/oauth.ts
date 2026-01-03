// Linear OAuth2 flow implementation

import { Env } from '../../types/env';
import { OAuthToken } from '../../types/env';

const LINEAR_OAUTH_URL = 'https://linear.app/oauth/authorize';
const LINEAR_TOKEN_URL = 'https://api.linear.app/oauth/token';

export async function handleOAuthAuthorize(env: Env): Promise<Response> {
  const params = new URLSearchParams({
    client_id: env.LINEAR_CLIENT_ID,
    redirect_uri: `${env.WORKER_URL}/oauth/callback`,
    scope: env.LINEAR_SCOPES,
    response_type: 'code',
    actor: 'app', // Important: agent mode
  });

  const authUrl = `${LINEAR_OAUTH_URL}?${params.toString()}`;

  return Response.redirect(authUrl, 302);
}

export async function handleOAuthCallback(
  request: Request,
  env: Env
): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) {
    return new Response(`OAuth error: ${error}`, { status: 400 });
  }

  if (!code) {
    return new Response('Missing authorization code', { status: 400 });
  }

  try {
    // Exchange code for access token
    const tokenResponse = await fetch(LINEAR_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: env.LINEAR_CLIENT_ID,
        client_secret: env.LINEAR_CLIENT_SECRET,
        redirect_uri: `${env.WORKER_URL}/oauth/callback`,
      }).toString(),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      throw new Error(`Token exchange failed: ${error}`);
    }

    const tokenData = await tokenResponse.json<{
      access_token: string;
      token_type: string;
      scope: string;
      expires_in?: number;
    }>();

    // Get workspace ID using the viewer query
    const viewerResponse = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenData.access_token}`,
      },
      body: JSON.stringify({
        query: `
          query {
            viewer {
              id
              organization {
                id
              }
            }
          }
        `,
      }),
    });

    const viewerData = await viewerResponse.json<any>();
    const workspaceId = viewerData.data.viewer.organization.id;

    // Store token in KV
    const token: OAuthToken = {
      accessToken: tokenData.access_token,
      tokenType: tokenData.token_type,
      scope: tokenData.scope,
      expiresAt: tokenData.expires_in
        ? Date.now() + tokenData.expires_in * 1000
        : undefined,
      createdAt: Date.now(),
    };

    await env.MEMORY.put(`token:${workspaceId}`, JSON.stringify(token));

    return new Response(
      `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Linear Agent Installed</title>
          <style>
            body {
              font-family: system-ui, -apple-system, sans-serif;
              display: flex;
              align-items: center;
              justify-content: center;
              height: 100vh;
              margin: 0;
              background: #f6f8fa;
            }
            .container {
              text-align: center;
              background: white;
              padding: 3rem;
              border-radius: 12px;
              box-shadow: 0 2px 8px rgba(0,0,0,0.1);
              max-width: 500px;
            }
            h1 {
              color: #5e6ad2;
              margin: 0 0 1rem 0;
            }
            p {
              color: #666;
              margin: 0.5rem 0;
            }
            .success {
              font-size: 3rem;
              margin-bottom: 1rem;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="success">✅</div>
            <h1>Agent Installed Successfully!</h1>
            <p>Your Linear First Draft Agent is now ready to use.</p>
            <p style="margin-top: 2rem; color: #888; font-size: 0.9rem;">
              You can close this window and return to Linear.
            </p>
          </div>
        </body>
      </html>
      `,
      {
        status: 200,
        headers: {
          'Content-Type': 'text/html',
        },
      }
    );
  } catch (error) {
    console.error('OAuth callback error:', error);
    return new Response(
      `Installation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      { status: 500 }
    );
  }
}

export async function getAccessToken(env: Env, workspaceId: string): Promise<string | null> {
  const tokenJson = await env.MEMORY.get(`token:${workspaceId}`);

  if (!tokenJson) {
    return null;
  }

  const token: OAuthToken = JSON.parse(tokenJson);

  // Check if token is expired
  if (token.expiresAt && Date.now() > token.expiresAt) {
    return null;
  }

  return token.accessToken;
}
