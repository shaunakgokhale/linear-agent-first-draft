// Cloudflare Worker entry point

import { Env } from './types/env';
import { LinearWebhookEvent } from './lib/linear/types';
import { handleOAuthAuthorize, handleOAuthCallback } from './lib/linear/oauth';
import { handleAgentSession } from './lib/agent/session-handler';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Route handling
    if (url.pathname === '/oauth/authorize' && request.method === 'GET') {
      return handleOAuthAuthorize(env);
    }

    if (url.pathname === '/oauth/callback' && request.method === 'GET') {
      return handleOAuthCallback(request, env);
    }

    if (url.pathname === '/webhook' && request.method === 'POST') {
      return handleWebhook(request, env);
    }

    if (url.pathname === '/' && request.method === 'GET') {
      return new Response(
        `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Linear First Draft Agent</title>
            <style>
              body {
                font-family: system-ui, -apple-system, sans-serif;
                max-width: 800px;
                margin: 4rem auto;
                padding: 2rem;
                line-height: 1.6;
                color: #333;
              }
              h1 {
                color: #5e6ad2;
                margin-bottom: 1rem;
              }
              .status {
                background: #e8f5e9;
                border-left: 4px solid #4caf50;
                padding: 1rem;
                margin: 2rem 0;
              }
              a {
                color: #5e6ad2;
                text-decoration: none;
              }
              a:hover {
                text-decoration: underline;
              }
              code {
                background: #f5f5f5;
                padding: 0.2rem 0.4rem;
                border-radius: 3px;
                font-size: 0.9em;
              }
            </style>
          </head>
          <body>
            <h1>Linear First Draft Agent</h1>
            <div class="status">
              <strong>✅ Agent is running</strong>
            </div>
            <p>
              This agent generates first drafts for copywriting and content tasks in Linear.
            </p>
            <h2>Features</h2>
            <ul>
              <li>12 content templates (social media, docs, UI copy, emails, etc.)</li>
              <li>Cross-issue memory for style preferences</li>
              <li>Image analysis for wireframes and mockups</li>
              <li>External link content fetching</li>
              <li>Hybrid intelligence for context analysis</li>
            </ul>
            <h2>Setup</h2>
            <p>
              To install this agent in your Linear workspace, visit:<br>
              <a href="/oauth/authorize"><code>/oauth/authorize</code></a>
            </p>
            <h2>Commands</h2>
            <ul>
              <li><code>@agent show current preferences</code> - Display saved preferences</li>
              <li><code>@agent forget all preferences</code> - Clear all saved preferences</li>
            </ul>
          </body>
        </html>
        `,
        {
          headers: {
            'Content-Type': 'text/html',
          },
        }
      );
    }

    return new Response('Not Found', { status: 404 });
  },
};

async function handleWebhook(request: Request, env: Env): Promise<Response> {
  try {
    // Verify webhook signature (optional but recommended)
    const signature = request.headers.get('linear-signature');

    if (env.LINEAR_WEBHOOK_SECRET && signature) {
      const body = await request.text();
      const isValid = await verifyWebhookSignature(
        body,
        signature,
        env.LINEAR_WEBHOOK_SECRET
      );

      if (!isValid) {
        console.error('Invalid webhook signature');
        return new Response('Unauthorized', { status: 401 });
      }

      // Parse the webhook event
      const event: LinearWebhookEvent = JSON.parse(body);

      // Handle agent session events
      if (event.type === 'AgentSession' && event.action === 'created') {
        // Process asynchronously (don't wait for completion)
        handleAgentSession(event, env).catch(error => {
          console.error('Agent session handler error:', error);
        });

        return new Response('OK', { status: 200 });
      }

      return new Response('Event type not supported', { status: 200 });
    }

    // No signature verification - parse directly
    const event: LinearWebhookEvent = await request.json();

    if (event.type === 'AgentSession' && event.action === 'created') {
      handleAgentSession(event, env).catch(error => {
        console.error('Agent session handler error:', error);
      });

      return new Response('OK', { status: 200 });
    }

    return new Response('Event type not supported', { status: 200 });
  } catch (error) {
    console.error('Webhook handler error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}

async function verifyWebhookSignature(
  body: string,
  signature: string,
  secret: string
): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const signatureBuffer = hexToBuffer(signature);
    const bodyBuffer = encoder.encode(body);

    return await crypto.subtle.verify('HMAC', key, signatureBuffer, bodyBuffer);
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

function hexToBuffer(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes.buffer;
}
