# Linear First Draft Agent

A Linear agent that generates first drafts for copywriting and content tasks using AI. When assigned to an issue, it analyzes the context and delivers professional, on-brand content ready for your review.

## Features

- **12 Content Templates**: Social media posts, landing pages, emails, docs, API documentation, UI microcopy, and more
- **Hybrid Intelligence**: Automatically determines if it has enough context or needs clarification
- **Cross-Issue Memory**: Learns your style preferences and remembers what to avoid
- **Image Analysis**: Processes wireframes and mockups to generate contextual copy
- **External Content**: Fetches and incorporates content from links in your issues
- **Agent Commands**: Show or forget preferences with simple commands

## Prerequisites

Before deploying, you'll need:

1. **Cloudflare Account** (free tier works)
2. **Linear Workspace** (with admin access)
3. **Mistral AI API Key** (get one at [console.mistral.ai](https://console.mistral.ai))

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Secrets

You need to configure secrets for the agent. You can do this in two ways:

#### Option A: Using Wrangler CLI (Recommended)

```bash
# Set Cloudflare API token (if not already authenticated)
export CLOUDFLARE_API_TOKEN=your_cloudflare_api_token

# Set required secrets
npx wrangler secret put LINEAR_CLIENT_ID
npx wrangler secret put LINEAR_CLIENT_SECRET
npx wrangler secret put LINEAR_WEBHOOK_SECRET
npx wrangler secret put MISTRAL_API_KEY
npx wrangler secret put WORKER_URL
```

#### Option B: Using Cloudflare Dashboard

1. Go to your Cloudflare Workers dashboard
2. Select your worker
3. Go to Settings → Variables
4. Add each secret:
   - `LINEAR_CLIENT_ID`
   - `LINEAR_CLIENT_SECRET`
   - `LINEAR_WEBHOOK_SECRET`
   - `MISTRAL_API_KEY`
   - `WORKER_URL` (e.g., `https://your-worker.your-subdomain.workers.dev`)

### 3. Create Linear OAuth App

1. Go to Linear Settings → API → Create New Application
2. Configure:
   - **Application Name**: "First Draft Agent" (or your preferred name)
   - **Enable "Actor: Application" mode**
   - **Redirect URL**: `https://your-worker.your-subdomain.workers.dev/oauth/callback`
   - **Scopes**: Select these:
     - `read`
     - `write`
     - `issues:create`
     - `comments:create`
     - `app:assignable`
     - `app:mentionable`
3. Save and note your **Client ID** and **Client Secret**
4. In Webhooks section:
   - **Webhook URL**: `https://your-worker.your-subdomain.workers.dev/webhook`
   - **Events**: Enable "Agent session events"
   - Note your **Webhook Signing Secret**

### 4. Deploy to Cloudflare

```bash
# Deploy the worker
export CLOUDFLARE_API_TOKEN=your_cloudflare_api_token
npx wrangler deploy
```

After deployment, Wrangler will show you your worker URL (e.g., `https://linear-first-draft-agent.your-subdomain.workers.dev`)

### 5. Install Agent in Linear

1. Visit your worker's authorization URL:
   ```
   https://your-worker.your-subdomain.workers.dev/oauth/authorize
   ```
2. Click "Authorize" to install the agent in your Linear workspace
3. The agent will now appear as an assignable user in Linear!

## Usage

### Assigning Issues

Simply assign any copywriting issue to the agent:

**Example Issue:**
```
Title: Create LinkedIn post about new feature
Description: We just launched collaborative cursors. Emphasize real-time
collaboration for remote teams.
```

The agent will:
1. Acknowledge within 10 seconds
2. Analyze the context
3. Generate a first draft with copy, hashtags, and visual suggestions
4. Auto-close the session

### Providing Feedback

If you want revisions:
1. Add a comment with your feedback
2. Re-assign the agent
3. It will generate an improved version

### Memory Learning

The agent learns from explicit signals in your feedback:

**Examples:**
- "Always use casual tone" → Remembers to use casual tone
- "Never use emoji in LinkedIn posts" → Avoids emojis on LinkedIn
- "Prefer 'collaborate' over 'leverage'" → Favors specific wording
- "From now on keep it under 280 characters" → Remembers length preference

### Agent Commands

**Show current preferences:**
```
@agent show current preferences
```

**Forget all preferences:**
```
@agent forget all preferences
```

## Supported Content Types

The agent recognizes 12 content templates:

1. **Social Media Posts** - Twitter, LinkedIn, Instagram, Facebook
2. **Email Campaigns** - Subject lines and body copy
3. **Landing Pages** - Headers, descriptions, CTAs
4. **Blog Posts** - Headlines, intros, outlines, meta descriptions
5. **Product Documentation** - Guides, tutorials, FAQs
6. **API Documentation** - Endpoints, parameters, examples
7. **Feature Announcements** - Headlines, benefits, descriptions
8. **Release Notes** - Version summaries, changelogs
9. **UI Microcopy** - Buttons, labels, error messages, placeholders
10. **Help Center Articles** - Problem/solution format
11. **Video Scripts** - Hooks, outlines, talking points
12. **Product Pages** - Feature descriptions, benefits

## How It Works

### Context Gathering

The agent analyzes:
- Issue title and description
- Project name and description
- Attached images (wireframes, mockups, screenshots)
- External links in the description
- Your saved style preferences

### Intelligence System

**Sufficient Context** (4+ words in description):
- Proceeds with generation

**Insufficient Context** (< 4 words):
- Asks for clarification

**Out of Scope** (technical tasks without copywriting):
- Politely declines

### Memory System

Stored in Cloudflare KV per workspace:
- Style preferences (tone, emoji usage, formality)
- Anti-patterns (things to avoid)
- Voice notes (general preferences)

## Development

### Local Development

```bash
# Run locally with wrangler dev
npm run dev
```

### Project Structure

```
src/
├── index.ts                    # Worker entry point
├── lib/
│   ├── agent/
│   │   ├── session-handler.ts # Main session logic
│   │   ├── intelligence.ts    # Context analysis
│   │   ├── templates.ts       # 12 content templates
│   │   ├── memory.ts          # KV storage management
│   │   ├── commands.ts        # @agent commands
│   │   └── types.ts           # Agent types
│   ├── linear/
│   │   ├── client.ts          # Linear API client
│   │   ├── oauth.ts           # OAuth flow
│   │   └── types.ts           # Linear types
│   ├── mistral/
│   │   ├── client.ts          # Mistral AI client
│   │   └── prompts.ts         # Prompt templates
│   └── utils/
│       ├── image-processor.ts # Image download/base64
│       ├── link-fetcher.ts    # External content fetching
│       └── signal-parser.ts   # Memory signal detection
└── types/
    └── env.d.ts               # Environment types
```

### Environment Variables

**Configured in wrangler.toml:**
- `MISTRAL_MODEL` - Model to use (default: `mistral-large-latest`)
- `MISTRAL_TEMPERATURE` - Creativity setting (default: `0.7`)
- `MISTRAL_MAX_TOKENS` - Max response length (default: `4000`)
- `MAX_LINK_FETCH_SIZE` - Max tokens from external links (default: `10000`)
- `MAX_IMAGE_SIZE` - Max image size in bytes (default: `10485760`)

**Configured as secrets:**
- `LINEAR_CLIENT_ID` - From Linear OAuth app
- `LINEAR_CLIENT_SECRET` - From Linear OAuth app
- `LINEAR_WEBHOOK_SECRET` - From Linear webhook settings
- `MISTRAL_API_KEY` - From Mistral AI console
- `WORKER_URL` - Your deployed worker URL

## Cost Estimates

With Mistral Large pricing ($0.5/M input tokens, $1.5/M output tokens):

- **100 issues/month**: ~$1-5/month
- **500 issues/month**: ~$5-25/month

Cloudflare Workers and KV are free tier (100k requests/day, 100k KV reads/day).

## Troubleshooting

### Agent not responding?
- Check Cloudflare Workers logs: `npx wrangler tail`
- Verify webhook is configured in Linear
- Ensure all secrets are set correctly

### OAuth installation failing?
- Verify `WORKER_URL` matches your actual worker URL
- Check Linear OAuth app redirect URI matches `/oauth/callback`
- Ensure `LINEAR_CLIENT_ID` and `LINEAR_CLIENT_SECRET` are correct

### Generated content not as expected?
- Use explicit memory signals to teach preferences
- Provide more context in issue descriptions
- Attach wireframes/mockups for UI copy tasks

### Memory not persisting?
- Check KV namespace is properly bound in `wrangler.toml`
- Verify workspace ID is consistent
- Use `@agent show current preferences` to debug

## Support

For issues or questions:
1. Check the [technical specification](./TECHNICAL_SPEC.md)
2. Review Cloudflare Workers logs
3. Verify Linear webhook events are being sent

## License

ISC
