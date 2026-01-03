# Linear First Draft Agent - Technical Specification

## 1. Executive Summary

### Purpose
A Linear agent that generates first drafts for copywriting and content tasks. When assigned to an issue, it analyzes the context, generates appropriate content artifacts based on predefined templates, learns from user feedback, and maintains style preferences across issues.

### Key Characteristics
- **Hybrid Intelligence**: Analyzes issue completeness and only asks questions when truly needed
- **Cross-Issue Memory**: Learns style preferences and anti-patterns globally across all issues
- **Multi-Modal**: Processes text and images (wireframes, screenshots, mockups)
- **Template-Based**: 12 predefined artifact templates for common content types
- **Casual Collaborator**: Friendly, concise communication style
- **Lightweight**: Simple, low-cost, fast responses

---

## 2. Architecture Overview

### Technology Stack
- **Platform**: Cloudflare Workers (serverless, edge-deployed)
- **Language**: TypeScript
- **LLM**: Mistral Large (`mistral-large-latest`) with vision capabilities
- **Storage**: Cloudflare KV (for cross-issue memory)
- **Integration**: Linear API (GraphQL) with OAuth2
- **Authentication**: `actor=app` OAuth flow (workspace-level agent)

### Core Components
```
src/
├── index.ts                    # Worker entry point, webhook router
├── lib/
│   ├── linear/
│   │   ├── oauth.ts           # OAuth flow handlers
│   │   ├── client.ts          # Linear API client wrapper
│   │   └── types.ts           # Linear GraphQL types
│   ├── agent/
│   │   ├── session-handler.ts # Main agent session logic
│   │   ├── intelligence.ts    # Hybrid intelligence analyzer
│   │   ├── templates.ts       # Artifact template definitions
│   │   ├── memory.ts          # Cross-issue memory management
│   │   └── commands.ts        # @agent command parser
│   ├── mistral/
│   │   ├── client.ts          # Mistral API client
│   │   └── prompts.ts         # Prompt templates
│   └── utils/
│       ├── image-processor.ts # Image download and preprocessing
│       ├── link-fetcher.ts    # Web content fetching
│       └── signal-parser.ts   # Explicit memory signal detection
└── types/
    └── env.d.ts               # Cloudflare environment types
```

### Data Flow
```
Linear Issue Assignment
    ↓
Webhook: AgentSession Created
    ↓
Cloudflare Worker Receives Event
    ↓
Hybrid Intelligence Analysis
    ├─→ Insufficient Context? → Emit Elicitation Activity
    └─→ Sufficient Context? → Continue
         ↓
    Context Gathering
    ├─→ Read Project Description
    ├─→ Download Images (if any)
    ├─→ Fetch External Links (if any)
    └─→ Load Memory from KV
         ↓
    Template Selection & Artifact Planning
         ↓
    Mistral API Call (with vision if images present)
         ↓
    Emit Activities
    ├─→ Thought: Concise assumptions
    └─→ Response: Generated artifacts
         ↓
    Auto-close Session
```

---

## 3. Functional Requirements

### 3.1 Trigger Mechanism
- **Primary Trigger**: User assigns issue to the agent
- **Webhook Event**: `AgentSession` with type `created`
- **Response Time**: Emit first `thought` activity within 10 seconds

### 3.2 Hybrid Intelligence Decision Logic

**Context Completeness Check:**
```typescript
function isContextSufficient(issue: Issue): boolean {
  const description = issue.description || "";
  const wordCount = description.trim().split(/\s+/).length;

  // Insufficient if no description or less than 4 words
  if (wordCount < 4) {
    return false;
  }

  return true;
}
```

**Decision Tree:**
1. If description < 4 words OR no description → Emit `elicitation` asking for more info
2. Otherwise → Proceed with draft generation

**Elicitation Message (Insufficient Context):**
```
Hey! I need a bit more info. What kind of draft are you looking for?
```

### 3.3 Context Gathering

**Sources (in order of priority):**
1. **Issue Description**: Primary content source
2. **Project Name & Description**: Retrieved via Linear API
3. **Attached Images**: All images attached to the issue
4. **External Links**: URLs found in issue description
5. **Cross-Issue Memory**: Style preferences and anti-patterns from KV

**Linear API Queries Needed:**
```graphql
# Get issue with project context
query GetIssueContext($issueId: String!) {
  issue(id: $issueId) {
    id
    title
    description
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
  }
}
```

**Image Processing:**
- Download all images from `attachments.nodes[].url`
- Convert to base64 for Mistral vision API
- Support formats: PNG, JPG, JPEG, WebP
- Max 10MB per image (Mistral limit)

**Link Fetching:**
- Extract URLs from issue description using regex
- Fetch all URLs in parallel
- Handle errors gracefully:
  - 404/broken links → Mention in thought activity: "Note: Couldn't access [url]"
  - Auth-required → Mention: "Note: [url] requires authentication, couldn't access"
  - Success → Include content in context
- For long content (>10k tokens):
  - Truncate to first 10k tokens
  - Add note in thought: "Processed first portion of [url]"

**Memory Loading:**
```typescript
// KV key structure: `memory:{workspaceId}`
interface Memory {
  stylePreferences: {
    tone?: string;              // e.g., "casual", "formal"
    avoidFormalLanguage?: boolean;
    emojiUsage?: string;        // e.g., "moderate", "none", "frequent"
    [key: string]: any;         // Flexible for future preferences
  };
  antiPatterns: string[];       // e.g., ["avoid 'leverage'", "no corporate jargon"]
  lastUpdated: string;          // ISO timestamp
}
```

### 3.4 Template Selection & Artifact Planning

**12 Predefined Templates:**

1. **Social Media Post**
   - Copy (post text)
   - Hashtags (5-8 relevant hashtags)
   - Visual suggestion (description of recommended image/graphic)

2. **Product Page UI**
   - Context-dependent based on issue description or provided image
   - Analyze wireframe/mockup if present
   - Generate copy for identified sections

3. **Email Campaign**
   - Subject line
   - Body copy

4. **Landing Page**
   - Header/Hero headline
   - Description/subheadline
   - Additional sections based on issue context

5. **Blog Post/Article**
   - Headline
   - 2 alternative headlines
   - Introduction paragraph
   - Body outline (section headers with key points)
   - Conclusion/CTA
   - Meta description (for SEO, ~155 characters)

6. **Product Documentation**
   - Overview/Introduction
   - Key concepts explanation
   - Step-by-step instructions
   - Code examples (if applicable)
   - Troubleshooting/FAQs

7. **API Documentation**
   - Endpoint description
   - Request parameters (with types)
   - Response format (with example)
   - Example request/response
   - Error codes and meanings

8. **Feature Announcement**
   - Headline
   - Short description (tweet-length, ~280 chars)
   - Long description (paragraph)
   - Key benefits (3-5 bullet points)
   - Visual suggestion

9. **Release Notes**
   - Version title
   - New features list
   - Improvements list
   - Bug fixes list
   - Breaking changes (if any)

10. **UI Microcopy**
    - Analysis of wireframe/screenshot (identifying where copy is needed)
    - Copy for each identified element:
      - Headlines/titles
      - Button text
      - Form labels
      - Error messages
      - Success messages
      - Placeholder text
      - Tooltip/helper text
      - Empty states
      - Navigation labels
    - Tone/voice rationale for UI context

11. **Help Center Article**
    - Article title
    - Problem statement
    - Solution steps (numbered)
    - Visual suggestions (screenshots needed)
    - Related articles suggestions

12. **Video Script**
    - Hook (first 5 seconds)
    - Main content outline
    - Key talking points
    - Call-to-action
    - Suggested duration

**Template Detection Logic:**
```typescript
function detectTemplate(issueTitle: string, issueDescription: string): Template {
  const combined = `${issueTitle} ${issueDescription}`.toLowerCase();

  // Pattern matching (order matters - most specific first)
  if (combined.match(/\b(tweet|twitter|linkedin post|instagram|facebook post|social)\b/)) {
    return Template.SocialMediaPost;
  }
  if (combined.match(/\b(email|newsletter|campaign)\b/)) {
    return Template.EmailCampaign;
  }
  if (combined.match(/\b(api|endpoint|rest|graphql)\b/)) {
    return Template.APIDocumentation;
  }
  if (combined.match(/\b(ui|wireframe|microcopy|button|placeholder)\b/)) {
    return Template.UIMicrocopy;
  }
  if (combined.match(/\b(landing page|hero|welcome page)\b/)) {
    return Template.LandingPage;
  }
  if (combined.match(/\b(blog|article|post)\b/)) {
    return Template.BlogPost;
  }
  if (combined.match(/\b(documentation|docs|guide|tutorial)\b/)) {
    return Template.ProductDocumentation;
  }
  if (combined.match(/\b(release notes|changelog|version)\b/)) {
    return Template.ReleaseNotes;
  }
  if (combined.match(/\b(feature announcement|launch|new feature)\b/)) {
    return Template.FeatureAnnouncement;
  }
  if (combined.match(/\b(help|support|faq|how to)\b/)) {
    return Template.HelpCenterArticle;
  }
  if (combined.match(/\b(video|script|youtube)\b/)) {
    return Template.VideoScript;
  }
  if (combined.match(/\b(product page|product ui)\b/)) {
    return Template.ProductPageUI;
  }

  // No match - use fallback reasoning
  return Template.Generic;
}
```

**Fallback for Generic Template:**
- If no template matches, agent uses LLM to reason about required artifacts
- Prompt: "Based on the issue, determine what content artifacts would be most helpful"
- LLM generates artifact structure dynamically

### 3.5 Mistral API Integration

**Configuration:**
- **Model**: `mistral-large-latest`
- **API Endpoint**: `https://api.mistral.ai/v1/chat/completions`
- **Temperature**: 0.7 (configurable via env var)
- **Max Tokens**: 4000 (configurable via env var)

**Prompt Structure:**

**System Prompt:**
```
You are a casual, collaborative copywriting assistant integrated into Linear. Your role is to generate first drafts of content based on issue assignments.

PERSONALITY:
- Casual collaborator tone - friendly but professional
- Concise communication - no fluff
- Helpful and creative

MEMORY CONTEXT:
{memory_preferences_json}

PROJECT CONTEXT:
Project: {project_name}
Description: {project_description}

EXTERNAL CONTENT:
{fetched_links_content}

TASK:
Generate content artifacts for: {template_name}

Required artifacts:
{artifact_list}

GUIDELINES:
- Use casual, engaging language unless memory preferences indicate otherwise
- Avoid anti-patterns from memory: {anti_patterns}
- Analyze any provided images carefully for context
- Be creative but stay on-brand based on project context
- Output should be ready to use with minimal editing

Format your response as structured artifacts with clear labels.
```

**User Prompt:**
```
Issue Title: {issue_title}
Issue Description: {issue_description}

{images_as_vision_input}

Generate the {template_name} artifacts listed above.
```

**Vision Integration:**
- If images present, use Mistral's vision API
- Include images in `messages` array with type `image_url`
- Format: `{"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,{base64}"}}`

**Error Handling:**
- API failure → Emit error activity: "I ran into an issue generating the draft. Please re-assign me to try again."
- No retry logic (user re-assigns if needed)
- Log full error to Cloudflare logs

### 3.6 Activity Emission

**Activity Types Used:**

1. **`thought`** (Concise assumptions)
   ```
   Assumptions: B2B SaaS, collaborative focus, casual tone
   Delivering: Header, description, CTA
   ```

2. **`response`** (Final deliverable)
   ```markdown
   ## Landing Page Copy

   **Header:**
   Collaborate in real-time, wherever your team works

   **Description:**
   Our whiteboarding app brings your distributed team together with
   instant collaboration, infinite canvas, and zero lag.

   **CTA:**
   Start collaborating free →
   ```

3. **`elicitation`** (When context insufficient)
   ```
   Hey! I need a bit more info. What kind of draft are you looking for?
   ```

4. **`error`** (Scope rejection or failures)
   ```
   I only handle content and copywriting tasks. If you need specific copy
   for this task, let me know in a comment!
   ```

**Linear API Mutations:**
```graphql
mutation CreateAgentActivity($input: AgentActivityCreateInput!) {
  agentActivityCreate(input: $input) {
    success
    activity {
      id
      type
      content
    }
  }
}
```

### 3.7 Session Management

**Lifecycle:**
1. Session created → Acknowledge within 10s
2. Generate draft → Emit thought + response
3. **Auto-close session** immediately after response
4. User provides feedback → **User must re-assign** to trigger new session
5. New session treats previous draft as context

**Issue Status Handling:**
- When assigned, if issue not in `started` state → Move to first `started` status
- After delivering draft → **Leave in `started`** (user manually completes)
- No automatic completion

**Iteration Model:**
- Each revision = new agent session
- User comments "make it more casual" → User re-assigns agent
- Agent reads previous comments + original draft as context
- Generates new draft as comment (not activity, since new session)
- Previous draft remains visible in Linear

### 3.8 Cross-Issue Memory System

**Memory Storage (Cloudflare KV):**
- **Key**: `memory:{workspaceId}`
- **Value**: JSON object (see structure in 3.3)
- **TTL**: None (persistent)

**Memory Learning - Explicit Signals:**

Detect these phrases in user comments:
- "always [do X]"
- "never [do Y]"
- "from now on [X]"
- "don't ever [Y]"
- "prefer [X] over [Y]"
- "stop [doing X]"
- "remember to [X]"
- "default to [X]"

**Parsing Logic:**
```typescript
function extractMemorySignals(comment: string): MemoryUpdate | null {
  const lower = comment.toLowerCase();

  // Anti-patterns (things to avoid)
  const neverMatch = lower.match(/never\s+(.+)/i);
  const dontMatch = lower.match(/don't\s+ever\s+(.+)/i);
  const avoidMatch = lower.match(/avoid\s+(.+)/i);
  const stopMatch = lower.match(/stop\s+(.+)/i);

  if (neverMatch || dontMatch || avoidMatch || stopMatch) {
    const pattern = (neverMatch || dontMatch || avoidMatch || stopMatch)![1];
    return {
      type: 'anti-pattern',
      value: pattern.trim()
    };
  }

  // Preferences (things to do)
  const alwaysMatch = lower.match(/always\s+(.+)/i);
  const fromNowMatch = lower.match(/from\s+now\s+on\s+(.+)/i);
  const rememberMatch = lower.match(/remember\s+to\s+(.+)/i);
  const defaultMatch = lower.match(/default\s+to\s+(.+)/i);

  if (alwaysMatch || fromNowMatch || rememberMatch || defaultMatch) {
    const preference = (alwaysMatch || fromNowMatch || rememberMatch || defaultMatch)![1];
    return {
      type: 'preference',
      value: preference.trim()
    };
  }

  // Preference comparison
  const preferMatch = lower.match(/prefer\s+(.+?)\s+over\s+(.+)/i);
  if (preferMatch) {
    return {
      type: 'preference',
      value: preferMatch[1].trim(),
      avoid: preferMatch[2].trim()
    };
  }

  return null;
}
```

**Memory Update Flow:**
1. After each session, scan user's feedback comment
2. Extract memory signals
3. Update KV storage
4. Timestamp the update

**Memory Application:**
- Load memory before generating draft
- Include in Mistral system prompt
- Use for template selection biases (e.g., if "casual tone" preferred, influence creative choices)

### 3.9 Agent Commands

**Command Detection:**
Detect commands only when agent is @mentioned:
```typescript
function parseCommand(comment: string, agentMentioned: boolean): Command | null {
  if (!agentMentioned) return null;

  const lower = comment.toLowerCase();

  if (lower.includes('show current preferences') || lower.includes('show preferences')) {
    return Command.ShowPreferences;
  }

  if (lower.includes('forget all preferences') || lower.includes('forget preferences')) {
    return Command.ForgetPreferences;
  }

  return null;
}
```

**Command Implementations:**

**Show Preferences:**
- Read memory from KV
- Format as markdown
- Post as issue comment (not agent activity)

Response format:
```markdown
**Current preferences:**
✓ Tone: Casual
✓ Anti-patterns:
  - Avoid "leverage"
  - No corporate jargon
  - No excessive exclamation marks
✓ Last updated: 3 days ago
```

If no preferences stored:
```markdown
No preferences stored yet. I'll learn from your feedback as we work together!
```

**Forget Preferences:**
- Delete KV entry for workspace
- Confirm with comment:
```markdown
All preferences forgotten! I'll start learning fresh from your feedback.
```

### 3.10 Scope Handling

**In-Scope Tasks:**
- All copywriting/content tasks
- Social media content
- Marketing copy
- Documentation (product, API, help center)
- UI copy
- Email/newsletter content
- Scripts and outlines
- Any text-based creative work

**Out-of-Scope Detection:**
If issue appears to be code/technical implementation (not documentation):
```typescript
function isOutOfScope(issueTitle: string, issueDescription: string): boolean {
  const combined = `${issueTitle} ${issueDescription}`.toLowerCase();

  const technicalKeywords = [
    'fix bug', 'refactor', 'implement', 'deploy', 'migrate',
    'optimize performance', 'database', 'schema', 'authentication flow',
    'build feature', 'add endpoint', 'unit test'
  ];

  // Check if it's technical AND has no copywriting keywords
  const hasTechnical = technicalKeywords.some(kw => combined.includes(kw));
  const hasCopywriting = combined.match(/\b(copy|write|draft|content|text)\b/);

  return hasTechnical && !hasCopywriting;
}
```

**Out-of-Scope Response:**
```markdown
I only handle content and copywriting tasks. If you need specific copy for
this task (like documentation, comments, or text), let me know in a comment
and I'll help with that!
```

**Borderline Cases (API docs, tutorials):**
- These ARE in scope (they're content)
- Agent should handle them with appropriate templates

---

## 4. Non-Functional Requirements

### 4.1 Performance
- **Cold start**: < 1 second (Cloudflare Workers standard)
- **First activity emission**: < 10 seconds from webhook receipt
- **Total generation time**: < 30 seconds for most requests
- **Parallel processing**: Support concurrent issue assignments

### 4.2 Security
- **OAuth2 with actor=app**: Workspace-level authentication
- **Webhook signature verification**: Verify Linear webhook signatures in production
- **Environment variables**: All secrets stored in Cloudflare environment
- **Private workspace**: Agent installed only in user's workspace

### 4.3 Cost Optimization
- **Mistral pricing**: $0.5/M input tokens, $1.5/M output tokens
- **KV pricing**: Free tier sufficient (100k reads/day, 1k writes/day)
- **Workers pricing**: Free tier sufficient (100k requests/day)
- **Estimated cost**: ~$1-5/month for 100 issues

### 4.4 Monitoring & Logging
- **Cloudflare logs only**: No external monitoring for v1
- **Log levels**: Error, Warning, Info
- **Log retention**: Cloudflare default (24 hours)
- **No error notifications**: Check logs manually if issues arise

### 4.5 Scalability
- **Single workspace**: Designed for one user initially
- **Concurrent sessions**: Unlimited (Workers auto-scale)
- **Memory storage**: One KV entry per workspace (no scalability issues)

---

## 5. API Specifications

### 5.1 Webhook Endpoints

**POST /webhook**
- Receives Linear `AgentSession` events
- Validates webhook signature
- Routes to appropriate handler

Request body (from Linear):
```json
{
  "action": "create",
  "type": "AgentSession",
  "data": {
    "id": "session-uuid",
    "status": "open",
    "issue": {
      "id": "issue-uuid",
      "title": "Create LinkedIn post",
      "description": "About our new collaborative cursor feature...",
      "project": {
        "id": "project-uuid",
        "name": "Whiteboarding App",
        "description": "Real-time collaborative whiteboarding..."
      }
    },
    "comment": null,
    "previousComments": [],
    "guidance": null
  },
  "workspaceId": "workspace-uuid"
}
```

### 5.2 OAuth Endpoints

**GET /oauth/authorize**
- Redirects to Linear OAuth page
- Parameters: `client_id`, `redirect_uri`, `scope`, `actor=app`

**GET /oauth/callback**
- Receives OAuth code from Linear
- Exchanges code for access token
- Stores token in KV: `token:{workspaceId}`
- Redirects to success page

### 5.3 Linear API Interactions

**GraphQL Endpoint:** `https://api.linear.app/graphql`

**Key Queries:**

```graphql
# Get workspace ID
query GetViewer {
  viewer {
    id
    name
  }
}

# Get issue with full context
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

# Get team workflow states
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
```

**Key Mutations:**

```graphql
# Create agent activity
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

# Update issue status
mutation UpdateIssue($id: String!, $stateId: String!) {
  issueUpdate(
    id: $id
    input: { stateId: $stateId }
  ) {
    success
    issue {
      id
      state {
        name
      }
    }
  }
}

# Create comment
mutation CreateComment($issueId: String!, $body: String!) {
  commentCreate(
    input: {
      issueId: $issueId
      body: $body
    }
  ) {
    success
    comment {
      id
    }
  }
}

# Close agent session
mutation CloseSession($sessionId: String!) {
  agentSessionUpdate(
    id: $sessionId
    input: { status: closed }
  ) {
    success
  }
}
```

### 5.4 Mistral API

**Endpoint:** `https://api.mistral.ai/v1/chat/completions`

**Request Format:**
```json
{
  "model": "mistral-large-latest",
  "messages": [
    {
      "role": "system",
      "content": "You are a casual, collaborative copywriting assistant..."
    },
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "Issue Title: Create LinkedIn post\nIssue Description: ..."
        },
        {
          "type": "image_url",
          "image_url": {
            "url": "data:image/jpeg;base64,..."
          }
        }
      ]
    }
  ],
  "temperature": 0.7,
  "max_tokens": 4000
}
```

**Response Format:**
```json
{
  "id": "cmpl-xxx",
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": "## Social Media Post\n\n**Copy:**\n..."
      }
    }
  ],
  "usage": {
    "prompt_tokens": 1234,
    "completion_tokens": 567
  }
}
```

---

## 6. Data Models

### 6.1 Memory Schema (KV)

**Key:** `memory:{workspaceId}`

**Value:**
```typescript
interface WorkspaceMemory {
  stylePreferences: {
    tone?: 'casual' | 'formal' | 'playful' | 'professional' | string;
    emojiUsage?: 'none' | 'minimal' | 'moderate' | 'frequent';
    formality?: 'high' | 'medium' | 'low';
    voiceNotes?: string[];  // Freeform preference notes
  };
  antiPatterns: string[];  // Things to avoid
  lastUpdated: string;     // ISO 8601 timestamp
  version: number;         // Schema version for future migrations
}
```

### 6.2 OAuth Token Schema (KV)

**Key:** `token:{workspaceId}`

**Value:**
```typescript
interface OAuthToken {
  accessToken: string;
  tokenType: string;      // "Bearer"
  scope: string;
  expiresAt?: number;     // Unix timestamp (if Linear provides expiry)
  createdAt: number;      // Unix timestamp
}
```

### 6.3 Internal Types

```typescript
enum Template {
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

interface AgentContext {
  issue: {
    id: string;
    title: string;
    description: string;
    projectName: string;
    projectDescription: string;
    attachments: Attachment[];
    comments: Comment[];
  };
  memory: WorkspaceMemory;
  externalContent: FetchedContent[];
  images: ProcessedImage[];
}

interface ProcessedImage {
  url: string;
  base64: string;
  mimeType: string;
  size: number;
}

interface FetchedContent {
  url: string;
  content: string;
  truncated: boolean;
  error?: string;
}

interface GenerationResult {
  thoughtContent: string;  // Concise assumptions
  responseContent: string; // Main artifacts
  templateUsed: Template;
}
```

---

## 7. Environment Variables

Configure in Cloudflare Workers settings:

```bash
# Linear OAuth
LINEAR_CLIENT_ID=your_linear_client_id
LINEAR_CLIENT_SECRET=your_linear_client_secret
LINEAR_WEBHOOK_SECRET=your_webhook_signing_secret
WORKER_URL=https://your-worker.workers.dev

# Mistral AI
MISTRAL_API_KEY=your_mistral_api_key

# Configuration
MISTRAL_MODEL=mistral-large-latest
MISTRAL_TEMPERATURE=0.7
MISTRAL_MAX_TOKENS=4000
MAX_LINK_FETCH_SIZE=10000  # tokens
MAX_IMAGE_SIZE=10485760    # 10MB in bytes

# OAuth Scopes (comma-separated)
LINEAR_SCOPES=read,write,issues:create,comments:create,app:assignable,app:mentionable
```

---

## 8. Implementation Checklist

### Phase 1: Infrastructure Setup
- [ ] Initialize Cloudflare Workers project with Wrangler
- [ ] Set up TypeScript configuration
- [ ] Create KV namespace for memory storage
- [ ] Configure environment variables
- [ ] Set up basic webhook endpoint structure

### Phase 2: OAuth & Linear Integration
- [ ] Implement OAuth authorization flow
- [ ] Implement OAuth callback handler
- [ ] Create Linear GraphQL client wrapper
- [ ] Add token storage/retrieval from KV
- [ ] Test Linear API connectivity

### Phase 3: Webhook Handler
- [ ] Implement webhook signature verification
- [ ] Parse AgentSession webhook events
- [ ] Route events to appropriate handlers
- [ ] Set up basic logging

### Phase 4: Hybrid Intelligence
- [ ] Implement context sufficiency checker
- [ ] Create elicitation response for insufficient context
- [ ] Test with various issue descriptions

### Phase 5: Context Gathering
- [ ] Fetch issue with project details
- [ ] Download and process images (base64 conversion)
- [ ] Extract and fetch external URLs
- [ ] Load memory from KV
- [ ] Combine all context into structured format

### Phase 6: Template System
- [ ] Define all 12 artifact templates
- [ ] Implement template detection logic
- [ ] Create fallback generic template handler
- [ ] Build artifact structure formatters

### Phase 7: Mistral Integration
- [ ] Create Mistral API client
- [ ] Build prompt templates (system + user)
- [ ] Implement vision API calls (multimodal)
- [ ] Handle API errors gracefully
- [ ] Parse and format LLM responses

### Phase 8: Activity Emission
- [ ] Implement thought activity emission (concise)
- [ ] Implement response activity emission (artifacts)
- [ ] Implement elicitation activity emission
- [ ] Implement error activity emission
- [ ] Auto-close session after response

### Phase 9: Memory System
- [ ] Implement explicit signal phrase detection
- [ ] Extract memory updates from user feedback
- [ ] Update KV storage with new preferences
- [ ] Load and apply memory in prompts
- [ ] Test cross-issue learning

### Phase 10: Agent Commands
- [ ] Implement @mention detection
- [ ] Parse "show preferences" command
- [ ] Parse "forget preferences" command
- [ ] Format and post command responses as comments

### Phase 11: Edge Cases & Error Handling
- [ ] Handle out-of-scope tasks (scope rejection)
- [ ] Handle broken/auth-required links
- [ ] Handle oversized images
- [ ] Handle Mistral API failures
- [ ] Test with various edge cases

### Phase 12: Testing & Deployment
- [ ] Test OAuth flow end-to-end
- [ ] Test various issue types and templates
- [ ] Test memory learning and application
- [ ] Test agent commands
- [ ] Deploy to Cloudflare Workers
- [ ] Configure Linear app in workspace
- [ ] End-to-end integration test

---

## 9. Testing Strategy

### 9.1 Unit Tests (Optional for v1)
- Context gathering logic
- Template detection
- Memory signal parsing
- Image processing utilities

### 9.2 Integration Tests
- **OAuth Flow**: Manually test authorization and callback
- **Webhook Processing**: Use Linear test workspace
- **Template Coverage**: Test each of 12 templates with real issues
- **Memory Learning**: Test explicit signals across multiple issues
- **Commands**: Test @agent show/forget preferences

### 9.3 Manual Test Cases

**Test Case 1: Insufficient Context**
- Issue: "Draft" (no description)
- Expected: Elicitation activity asking for more info

**Test Case 2: Social Media Post**
- Issue: "Create LinkedIn post about our new collaborative cursor"
- Expected: Copy, hashtags, visual suggestion

**Test Case 3: Landing Page with Image**
- Issue: "Landing page copy" + wireframe attachment
- Expected: Header, description, sections based on wireframe

**Test Case 4: Memory Learning**
- Issue 1: Generate draft → Feedback: "always use casual tone"
- Issue 2: Generate draft → Should apply casual tone from memory

**Test Case 5: External Link**
- Issue: "Blog post about [feature]" + link to product page
- Expected: Fetch link content, use in generation

**Test Case 6: Show Preferences Command**
- Comment: "@agent show current preferences"
- Expected: Formatted list of preferences

**Test Case 7: Forget Preferences Command**
- Comment: "@agent forget all preferences"
- Expected: KV cleared, confirmation message

**Test Case 8: Out of Scope**
- Issue: "Fix authentication bug in login flow"
- Expected: Error activity explaining scope

**Test Case 9: Revision Iteration**
- Issue: Generate draft → Feedback: "make it more playful" → Re-assign
- Expected: Revised draft as new comment

**Test Case 10: API Documentation**
- Issue: "Write API docs for POST /users endpoint"
- Expected: Template with parameters, response, examples

---

## 10. Deployment Instructions

### 10.1 Prerequisites
- Node.js 18+ installed
- Cloudflare account
- Linear workspace (admin access)
- Mistral API key

### 10.2 Setup Steps

1. **Install Wrangler CLI**
   ```bash
   npm install -g wrangler
   wrangler login
   ```

2. **Create KV Namespace**
   ```bash
   wrangler kv:namespace create "LINEAR_AGENT_MEMORY"
   ```

3. **Create Linear OAuth App**
   - Go to Linear Settings → API → Create New Application
   - Enable "Actor: Application" mode
   - Add scopes: `read`, `write`, `issues:create`, `comments:create`, `app:assignable`, `app:mentionable`
   - Set redirect URI: `https://your-worker.workers.dev/oauth/callback`
   - Note: Client ID and Client Secret

4. **Configure Environment Variables**
   ```bash
   wrangler secret put LINEAR_CLIENT_ID
   wrangler secret put LINEAR_CLIENT_SECRET
   wrangler secret put LINEAR_WEBHOOK_SECRET
   wrangler secret put MISTRAL_API_KEY
   ```

5. **Update wrangler.toml**
   ```toml
   name = "linear-first-draft-agent"
   main = "src/index.ts"
   compatibility_date = "2024-01-01"

   [[kv_namespaces]]
   binding = "MEMORY"
   id = "your_kv_namespace_id"

   [vars]
   WORKER_URL = "https://your-worker.workers.dev"
   MISTRAL_MODEL = "mistral-large-latest"
   MISTRAL_TEMPERATURE = "0.7"
   MISTRAL_MAX_TOKENS = "4000"
   ```

6. **Deploy**
   ```bash
   npm install
   npm run build
   wrangler deploy
   ```

7. **Configure Linear Webhook**
   - In Linear app settings, add webhook URL: `https://your-worker.workers.dev/webhook`
   - Enable "Agent session events"
   - Set webhook signing secret (same as LINEAR_WEBHOOK_SECRET)

8. **Install Agent in Workspace**
   - Navigate to: `https://your-worker.workers.dev/oauth/authorize`
   - Authorize the app
   - Agent should appear in Linear as assignable user

### 10.3 Ongoing Updates
```bash
# Make code changes
npm run build
wrangler deploy

# No need to reinstall in Linear unless OAuth scopes change
```

---

## 11. Future Enhancements (Out of Scope for v1)

- Pattern detection for memory learning (vs. explicit signals only)
- Multiple model support (configurable per template)
- Custom templates via UI/config
- Analytics dashboard (usage, costs, popular templates)
- Public marketplace distribution
- Team-wide installation (vs. single workspace)
- A/B testing (multiple draft variations)
- Integration with external brand guidelines tools
- Scheduled content generation
- Batch processing of multiple issues

---

## 12. Success Criteria

**v1 is successful if:**
1. ✅ Agent responds to issue assignments within 10 seconds
2. ✅ Correctly detects all 12 template types with >90% accuracy
3. ✅ Generates usable first drafts requiring minimal editing
4. ✅ Learns and applies style preferences across issues
5. ✅ Handles images (wireframes, screenshots) effectively
6. ✅ Fetches and incorporates external link content
7. ✅ Commands (@agent show/forget) work reliably
8. ✅ Total cost stays under $10/month for 100 issues
9. ✅ No manual intervention needed for 95% of sessions
10. ✅ User workflow feels natural and efficient

---

## 13. Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Mistral API rate limits | High | Monitor usage, add retry logic if needed |
| Poor template detection | Medium | Test extensively, refine regex patterns |
| Memory not learning correctly | Medium | Careful signal parsing, logging for debugging |
| Linear API changes | Low | Monitor Linear changelog, update as needed |
| Image processing failures | Low | Graceful degradation (work without images) |
| Cost overruns | Low | Monitor Mistral usage, set alerts |

---

## Appendix A: Example Interactions

### Example 1: Social Media Post with Memory

**Issue:**
```
Title: LinkedIn post about cursor feature
Description: Announce our new real-time collaborative cursors. Helps
remote teams see what everyone is working on.
```

**Agent Thought Activity:**
```
Assumptions: B2B audience, collaborative focus, casual tone (from memory)
Delivering: Copy, hashtags, visual suggestion
```

**Agent Response:**
```markdown
## LinkedIn Post

**Copy:**
Your team just got more connected. 🎯

Our new collaborative cursors let everyone see exactly where their
teammates are working in real-time. No more "wait, which board were
you looking at?" moments.

Perfect for remote teams who want that in-the-same-room feeling,
even when you're continents apart.

**Hashtags:**
#RemoteWork #Collaboration #ProductUpdate #TeamWork #RealTime
#DistributedTeams #WorkTech

**Visual Suggestion:**
Screen recording showing multiple colored cursors moving across a
whiteboard simultaneously, with user avatars appearing next to each
cursor. Bright, energetic feel with your brand colors.
```

**User Feedback:**
```
Never use emoji in LinkedIn posts from now on
```

**Memory Update:**
```json
{
  "antiPatterns": ["no emoji in LinkedIn posts"],
  "lastUpdated": "2026-01-03T10:30:00Z"
}
```

### Example 2: UI Microcopy from Wireframe

**Issue:**
```
Title: Copy for new onboarding flow
Description: First-time user experience
[Attachment: wireframe.png showing 3 onboarding screens]
```

**Agent Thought Activity:**
```
Assumptions: Consumer app, friendly tone, analyzing wireframe
Delivering: Copy for all UI elements across 3 screens
```

**Agent Response:**
```markdown
## Onboarding Flow Copy

### Screen 1: Welcome
**Headline:** Welcome to [App Name]!
**Subheadline:** Collaborate with your team in real-time, anywhere
**Button:** Get started →
**Skip link:** I've used this before

### Screen 2: Create Workspace
**Headline:** Create your workspace
**Input label:** Workspace name
**Placeholder:** e.g., "Design Team" or "Marketing Projects"
**Helper text:** You can always change this later
**Button:** Continue →
**Back link:** ← Back

### Screen 3: Invite Team
**Headline:** Invite your team
**Subheadline:** Collaboration is better together
**Input label:** Email addresses
**Placeholder:** colleague@company.com
**Helper text:** Separate multiple emails with commas
**Button:** Send invites →
**Skip link:** I'll do this later

**Empty State (if no emails entered):**
No team members yet. Add emails above to get started!

**Success Message:**
Invites sent! Your team will receive an email shortly.
```

### Example 3: Insufficient Context

**Issue:**
```
Title: Draft
Description: [empty]
```

**Agent Elicitation Activity:**
```
Hey! I need a bit more info. What kind of draft are you looking for?
```

**User Response (in comment):**
```
Email campaign for product launch
```

**User Action:** Re-assigns agent

**Agent Thought Activity:**
```
Assumptions: Product launch context, professional but approachable
Delivering: Subject line, email body
```

### Example 4: API Documentation

**Issue:**
```
Title: Document POST /api/boards endpoint
Description: Creates a new whiteboard. Requires workspace_id,
optional name and template_id
```

**Agent Response:**
```markdown
## API Documentation: Create Board

### Endpoint
`POST /api/boards`

Creates a new whiteboard in the specified workspace.

### Request Parameters

**Headers:**
- `Authorization` (string, required): Bearer token
- `Content-Type` (string, required): application/json

**Body Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| workspace_id | string | Yes | The workspace where the board will be created |
| name | string | No | Custom name for the board. Defaults to "Untitled" |
| template_id | string | No | ID of template to use. Defaults to blank board |

### Response Format

**Success (201 Created):**
```json
{
  "id": "board_abc123",
  "workspace_id": "ws_xyz789",
  "name": "My New Board",
  "template_id": null,
  "created_at": "2026-01-03T10:30:00Z",
  "url": "https://app.example.com/boards/board_abc123"
}
```

**Error (400 Bad Request):**
```json
{
  "error": "invalid_workspace",
  "message": "Workspace not found or you don't have access"
}
```

### Example Request/Response

**Request:**
```bash
curl -X POST https://api.example.com/api/boards \
  -H "Authorization: Bearer your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "workspace_id": "ws_xyz789",
    "name": "Q1 Planning Board",
    "template_id": "tpl_brainstorm"
  }'
```

**Response:**
```json
{
  "id": "board_abc123",
  "workspace_id": "ws_xyz789",
  "name": "Q1 Planning Board",
  "template_id": "tpl_brainstorm",
  "created_at": "2026-01-03T10:30:00Z",
  "url": "https://app.example.com/boards/board_abc123"
}
```

### Error Codes

| Code | Description |
|------|-------------|
| 400 | Invalid workspace_id or template_id |
| 401 | Missing or invalid authentication token |
| 403 | Insufficient permissions to create boards |
| 429 | Rate limit exceeded (max 100 boards/hour) |
```

---

End of Technical Specification
