# Ralphy Webhook Service: Jira-Triggered Automation

## Overview

Create a webhook service that listens to Jira events and automatically triggers Ralphy when issues are assigned to a designated "Ralphy" user. This enables remote, automated code generation using the Claude Code CLI (subscription-based, not API credits).

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         RALPHY WEBHOOK SERVICE                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────┐     ┌──────────────┐     ┌─────────────────────────┐ │
│  │    Jira      │────>│   Express    │────>│   Job Queue (BullMQ)    │ │
│  │   Webhook    │     │   Server     │     │   - Issue key           │ │
│  │              │     │   (validates │     │   - Repo config         │ │
│  └──────────────┘     │    & queues) │     └───────────┬─────────────┘ │
│                       └──────────────┘                 │               │
│                                                        ▼               │
│                                            ┌─────────────────────────┐ │
│                                            │   Worker Process        │ │
│                                            │                         │ │
│                                            │  1. Git pull            │ │
│                                            │  2. Create branch       │ │
│                                            │  3. Run: ralphy run     │ │
│                                            │  4. Commit & push       │ │
│                                            │  5. Create PR (GitHub)  │ │
│                                            │  6. Comment on Jira     │ │
│                                            └─────────────────────────┘ │
│                                                        │               │
│                                                        ▼               │
│                                              Uses Claude CLI           │
│                                              (Your subscription!)      │
└─────────────────────────────────────────────────────────────────────────┘
```

## Key Design Decisions

- **Execution**: Spawns `ralphy run <issue>` CLI (uses Claude subscription, not API)
- **Queue**: BullMQ + Redis for job management and preventing duplicates
- **Git**: simple-git for clone/pull/commit/push operations
- **GitHub**: Octokit for PR creation
- **Jira**: jira.js (reuse from Ralphy CLI) for comments/updates
- **Config**: Support multiple repos mapped to Jira projects

## Project Structure

```
docs/ralphy-webhook-service/
├── README.md                    # Setup & deployment guide
├── src/
│   ├── index.ts                 # Express server entry point
│   ├── config.ts                # Environment & configuration
│   ├── server/
│   │   ├── routes.ts            # HTTP routes
│   │   └── middleware.ts        # Auth, logging, error handling
│   ├── jira/
│   │   ├── webhook-handler.ts   # Parse & validate Jira events
│   │   ├── client.ts            # Post comments, update status
│   │   └── types.ts             # Jira webhook payload types
│   ├── worker/
│   │   ├── queue.ts             # BullMQ job queue setup
│   │   ├── processor.ts         # Job processing logic
│   │   └── executor.ts          # Spawn ralphy CLI
│   ├── git/
│   │   └── operations.ts        # Clone, branch, commit, push
│   └── github/
│       └── pr.ts                # Create pull requests
├── package.json
├── tsconfig.json
├── Dockerfile
├── docker-compose.yml           # App + Redis
└── .env.example
```

## Implementation Phases

### Phase 1: Project Setup & Webhook Receiver

**Goal**: Express server that receives and validates Jira webhooks.

#### 1.1 Initialize Project

```bash
# In docs/ralphy-webhook-service/
npm init -y
npm install express bullmq ioredis simple-git @octokit/rest jira.js zod dotenv
npm install -D typescript @types/node @types/express vitest
```

#### 1.2 Create Configuration (`src/config.ts`)

```typescript
export interface WebhookConfig {
  port: number;
  ralphyUserId: string;           // Jira user ID for "Ralphy W"
  jiraWebhookSecret?: string;     // Optional webhook signature verification
  repos: RepoConfig[];            // Map Jira projects to repos
  redis: { host: string; port: number };
}

export interface RepoConfig {
  jiraProjectKey: string;         // e.g., "GCTT"
  repoUrl: string;                // e.g., "git@github.com:org/repo.git"
  localPath: string;              // e.g., "/home/ralphy/repos/backpack"
  defaultBranch: string;          // e.g., "main"
}
```

#### 1.3 Create Webhook Handler (`src/jira/webhook-handler.ts`)

- Parse Jira webhook payload
- Detect "issue assigned" events
- Filter for Ralphy user assignment
- Return structured job data

#### 1.4 Create Express Server (`src/index.ts`, `src/server/routes.ts`)

- POST `/webhook/jira` - Main webhook endpoint
- GET `/health` - Health check
- GET `/jobs/:id` - Job status (optional)

### Phase 2: Job Queue & Worker

**Goal**: Queue jobs and process them sequentially.

#### 2.1 Setup BullMQ Queue (`src/worker/queue.ts`)

- Create `ralphy-jobs` queue
- Configure concurrency (start with 1)
- Add job deduplication (by issue key)

#### 2.2 Create Job Processor (`src/worker/processor.ts`)

- Pull latest code
- Create feature branch: `ralphy/<issue-key>`
- Run `ralphy run <issue-key>`
- Handle timeouts and errors

#### 2.3 Create Executor (`src/worker/executor.ts`)

```typescript
async function executeRalphy(
  issueKey: string,
  workingDir: string,
  timeout: number
): Promise<ExecutionResult>
```

### Phase 3: Git & GitHub Integration

**Goal**: Commit changes and create PRs.

#### 3.1 Git Operations (`src/git/operations.ts`)

- `cloneOrPull(repoUrl, localPath)`
- `createBranch(localPath, branchName)`
- `commitAll(localPath, message)`
- `push(localPath, branchName)`

#### 3.2 GitHub PR Creation (`src/github/pr.ts`)

- Create PR from feature branch to default branch
- Include issue key in title
- Add Ralphy output as PR description

### Phase 4: Jira Feedback

**Goal**: Update Jira with progress and results.

#### 4.1 Jira Client (`src/jira/client.ts`)

- `addComment(issueKey, message)` - Progress updates
- `transitionIssue(issueKey, status)` - Move to "In Review"
- Reuse jira.js from Ralphy CLI

#### 4.2 Feedback Integration

- Comment when job starts: "Ralphy is on it!"
- Comment when complete: PR link + summary
- Comment on failure: Error details

### Phase 5: Docker & Deployment

**Goal**: Containerized deployment.

#### 5.1 Dockerfile

```dockerfile
FROM node:20-slim
# Install git, Claude CLI, Ralphy CLI
# Copy application
# Set up volumes for repos and credentials
```

#### 5.2 docker-compose.yml

```yaml
services:
  webhook:
    build: .
    ports: ["3000:3000"]
    volumes:
      - ./repos:/app/repos
      - ~/.claude:/root/.claude:ro  # Claude credentials
    depends_on: [redis]
  redis:
    image: redis:alpine
```

---

## Configuration

### Environment Variables

```env
# Server
PORT=3000
NODE_ENV=production

# Jira
JIRA_HOST=https://company.atlassian.net
JIRA_EMAIL=ralphy@company.com
JIRA_API_TOKEN=xxx
RALPHY_JIRA_USER_ID=xxx

# GitHub
GITHUB_TOKEN=ghp_xxx

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Repos (JSON array)
REPOS_CONFIG='[{"jiraProjectKey":"GCTT","repoUrl":"git@github.com:org/repo.git","localPath":"/app/repos/backpack","defaultBranch":"main"}]'
```

### Jira Automation Rule Setup

1. Go to **Project Settings → Automation**
2. Create new rule:
   - **Trigger**: Field value changed → Assignee
   - **Condition**: Assignee = "Ralphy W"
   - **Action**: Send web request
     - URL: `https://your-server.com/webhook/jira`
     - Method: POST
     - Headers: `Content-Type: application/json`
     - Body: Issue data (use Jira smart values)

---

## Files to Create

| File | Purpose |
|------|---------|
| `docs/ralphy-webhook-service/README.md` | Documentation |
| `docs/ralphy-webhook-service/package.json` | Dependencies |
| `docs/ralphy-webhook-service/tsconfig.json` | TypeScript config |
| `docs/ralphy-webhook-service/src/index.ts` | Entry point |
| `docs/ralphy-webhook-service/src/config.ts` | Configuration |
| `docs/ralphy-webhook-service/src/server/routes.ts` | HTTP routes |
| `docs/ralphy-webhook-service/src/server/middleware.ts` | Middleware |
| `docs/ralphy-webhook-service/src/jira/webhook-handler.ts` | Webhook parsing |
| `docs/ralphy-webhook-service/src/jira/client.ts` | Jira API client |
| `docs/ralphy-webhook-service/src/jira/types.ts` | Type definitions |
| `docs/ralphy-webhook-service/src/worker/queue.ts` | BullMQ setup |
| `docs/ralphy-webhook-service/src/worker/processor.ts` | Job processor |
| `docs/ralphy-webhook-service/src/worker/executor.ts` | Ralphy executor |
| `docs/ralphy-webhook-service/src/git/operations.ts` | Git operations |
| `docs/ralphy-webhook-service/src/github/pr.ts` | PR creation |
| `docs/ralphy-webhook-service/Dockerfile` | Container build |
| `docs/ralphy-webhook-service/docker-compose.yml` | Local dev stack |
| `docs/ralphy-webhook-service/.env.example` | Environment template |

---

## Verification Plan

### Phase 1: Webhook Receiver
1. `npm run build` compiles successfully
2. Server starts on configured port
3. POST to `/webhook/jira` with test payload returns 200
4. Invalid payloads return 400

### Phase 2: Job Queue
1. Valid webhook creates job in queue
2. Duplicate issue keys are deduplicated
3. Jobs process sequentially

### Phase 3: Git & GitHub
1. Repo is cloned/pulled correctly
2. Feature branch is created
3. Changes are committed and pushed
4. PR is created with correct title/body

### Phase 4: Jira Feedback
1. "Starting" comment appears on Jira issue
2. "Completed" comment with PR link appears
3. Failure comments include error details

### Phase 5: Docker
1. `docker-compose up` starts all services
2. Webhook endpoint is accessible
3. Claude CLI works inside container

---

## Security Considerations

- Store Jira/GitHub tokens as environment variables
- Claude credentials mounted read-only
- Consider webhook signature verification
- Run in isolated network/container
- Don't expose Redis externally

---

## Future Enhancements

- Slack bot integration (mention @ralphy)
- Web dashboard for job monitoring
- Support for Linear webhooks
- Multiple concurrent workers
- Retry failed jobs with backoff
