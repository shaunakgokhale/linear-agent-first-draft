// Cloudflare Workers environment interface

export interface Env {
  // KV Namespace
  MEMORY: KVNamespace;

  // Secrets (set via wrangler secret put)
  LINEAR_CLIENT_ID: string;
  LINEAR_CLIENT_SECRET: string;
  LINEAR_WEBHOOK_SECRET: string;
  MISTRAL_API_KEY: string;
  WORKER_URL: string;

  // Configuration variables (set in wrangler.toml)
  MISTRAL_MODEL: string;
  MISTRAL_TEMPERATURE: string;
  MISTRAL_MAX_TOKENS: string;
  MAX_LINK_FETCH_SIZE: string;
  MAX_IMAGE_SIZE: string;
  LINEAR_SCOPES: string;
}

// Memory stored in KV
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

// OAuth token stored in KV
export interface OAuthToken {
  accessToken: string;
  tokenType: string;
  scope: string;
  expiresAt?: number;
  createdAt: number;
}
