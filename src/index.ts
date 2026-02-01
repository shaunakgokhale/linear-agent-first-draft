// Cloudflare Worker entry point

import { Env } from './types/env';
import { LinearWebhookEvent } from './lib/linear/types';
import { handleOAuthAuthorize, handleOAuthCallback } from './lib/linear/oauth';
import { handleAgentSession } from './lib/agent/session-handler';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Route handling
    if (url.pathname === '/oauth/authorize' && request.method === 'GET') {
      return handleOAuthAuthorize(env);
    }

    if (url.pathname === '/oauth/callback' && request.method === 'GET') {
      return handleOAuthCallback(request, env);
    }

    if (url.pathname === '/webhook' && request.method === 'POST') {
      return handleWebhook(request, env, ctx);
    }

    // Debug endpoint to verify OAuth tokens are stored correctly
    if (url.pathname === '/debug' && request.method === 'GET') {
      return handleDebug(request, env);
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
              <li>Intelligent content structure determination (LLM reasons about optimal output)</li>
              <li>Multi-phase reasoning (planning → research → generation)</li>
              <li>Cross-issue memory for style preferences</li>
              <li>Image analysis for wireframes and mockups</li>
              <li>External link content fetching</li>
              <li>LLM-based context analysis and quality assessment</li>
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

async function handleWebhook(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  try {
    // Verify webhook signature (optional but recommended)
    const signature = request.headers.get('linear-signature');
    let event: LinearWebhookEvent;

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
      try {
        event = JSON.parse(body);
      } catch (parseError) {
        console.error('Failed to parse webhook body:', parseError);
        return new Response('Invalid JSON', { status: 400 });
      }
    } else {
      // No signature verification - parse directly
      try {
        event = await request.json();
      } catch (parseError) {
        console.error('Failed to parse webhook JSON:', parseError);
        return new Response('Invalid JSON', { status: 400 });
      }
    }

    console.log(`[Webhook] Received event: type=${event.type}, action=${event.action}, organizationId=${event.organizationId}`);

    // Handle agent session events (created, updated, etc.)
    if (event.type === 'AgentSessionEvent') {
      console.log(`[Webhook] Processing AgentSessionEvent: action=${event.action}, sessionId=${event.agentSession?.id}, commentId=${event.agentSession?.commentId}, hasComment=${!!event.agentSession?.comment}`);
      
      // Use waitUntil to keep the worker alive while processing
      // This is CRITICAL - without it, the worker terminates before the agent can respond
      ctx.waitUntil(
        handleAgentSession(event, env).catch(error => {
          console.error('[Webhook] Agent session handler error:', error);
        })
      );

      return new Response('OK', { status: 200 });
    }

    console.log(`[Webhook] Unsupported event type: ${event.type}, action: ${event.action}`);
    return new Response('Event type not supported', { status: 200 });
  } catch (error) {
    console.error('[Webhook] Handler error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}

async function verifyWebhookSignature(
  body: string,
  signature: string,
  secret: string
): Promise<boolean> {
  try {
    // Linear may send signatures in different formats depending on their docs/version.
    // Common patterns in webhook providers are:
    // - raw hex digest: "abcdef..."
    // - prefixed hex: "sha256=abcdef..."
    // - base64 digest (sometimes prefixed)
    const normalizedSignature = normalizeWebhookSignature(signature);
    if (!normalizedSignature) {
      console.error('Webhook signature missing/invalid format');
      return false;
    }

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const bodyBuffer = encoder.encode(body);

    const expected = new Uint8Array(await crypto.subtle.sign('HMAC', key, bodyBuffer));
    const provided = decodeSignatureToBytes(normalizedSignature);

    if (!provided) {
      console.error('Unable to decode webhook signature:', normalizedSignature.slice(0, 12) + '…');
      return false;
    }

    return timingSafeEqual(expected, provided);
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

function normalizeWebhookSignature(signatureHeader: string): string | null {
  const raw = signatureHeader.trim();
  if (!raw) return null;

  // Strip common prefixes, e.g. "sha256=..." or "v1=..."
  const parts = raw.split('=');
  if (parts.length === 2 && parts[0].length <= 10) {
    return parts[1].trim();
  }

  return raw;
}

function decodeSignatureToBytes(sig: string): Uint8Array | null {
  const trimmed = sig.trim();
  if (!trimmed) return null;

  // hex-encoded (SHA-256 digest is 32 bytes => 64 hex chars)
  const isHex = /^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length % 2 === 0;
  if (isHex) {
    try {
      return new Uint8Array(hexToBuffer(trimmed));
    } catch {
      // fall through
    }
  }

  // base64-encoded
  try {
    const bin = atob(trimmed);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

async function handleDebug(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get('workspaceId')?.trim() || null;

    // List all token keys in KV
    const tokenKeys = await env.MEMORY.list({ prefix: 'token:' });
    
    const tokens: {
      key: string;
      hasValue: boolean;
      createdAt?: number;
      expiresAt?: number;
      isExpired?: boolean;
      hasRefreshToken?: boolean;
    }[] = [];
    
    for (const key of tokenKeys.keys) {
      const value = await env.MEMORY.get(key.name);
      if (value) {
        const parsed = JSON.parse(value);
        const expiresAt = typeof parsed.expiresAt === 'number' ? parsed.expiresAt : undefined;
        tokens.push({
          key: key.name,
          hasValue: true,
          createdAt: parsed.createdAt,
          expiresAt,
          isExpired: expiresAt ? Date.now() > expiresAt : false,
          hasRefreshToken: typeof parsed.refreshToken === 'string' && parsed.refreshToken.length > 0,
        });
      } else {
        tokens.push({
          key: key.name,
          hasValue: false,
        });
      }
    }

    let expectedTokenLookup: any = null;
    if (workspaceId) {
      const expectedKey = `token:${workspaceId}`;
      const tokenJson = await env.MEMORY.get(expectedKey);
      if (!tokenJson) {
        expectedTokenLookup = { workspaceId, expectedKey, found: false };
      } else {
        const token = JSON.parse(tokenJson);
        const expiresAt = typeof token.expiresAt === 'number' ? token.expiresAt : undefined;
        expectedTokenLookup = {
          workspaceId,
          expectedKey,
          found: true,
          createdAt: token.createdAt,
          expiresAt,
          isExpired: expiresAt ? Date.now() > expiresAt : false,
        };
      }
    }

    return new Response(
      JSON.stringify({
        status: 'ok',
        tokenCount: tokens.length,
        tokens: tokens,
        expectedTokenLookup,
        message: tokens.length === 0 
          ? 'No tokens found. Please complete OAuth flow at /oauth/authorize'
          : 'Tokens found. If agent still not working, check that workspaceId in webhook matches token key.',
      }, null, 2),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      }, null, 2),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
