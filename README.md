# Ralphy CLI

[![npm version](https://img.shields.io/npm/v/@mrck-labs/ralphy.svg)](https://www.npmjs.com/package/@mrck-labs/ralphy)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)

A CLI tool implementing the **Ralph Wiggum technique** for AI-assisted development with Linear and Jira integration.

## What is the Ralph Wiggum Technique?

The Ralph Wiggum technique is an approach to AI-assisted development where you run an infinite loop that repeatedly feeds the same prompt to an AI coding agent (Claude). The key insight is that **progress persists in files and git history**, not in the LLM's context window.

This technique is named after Ralph Wiggum because, like Ralph, the AI keeps happily working on the task without remembering previous attempts - but unlike Ralph, it makes actual progress because the codebase itself remembers.

**How it works:**

1. Fetch an issue from your issue tracker (Linear or Jira)
2. Create a progress file describing the task
3. Run Claude Code repeatedly until the task is complete
4. Track progress in git commits and a progress file
5. Report completion back to the issue tracker

## Installation

Ralphy requires [Bun](https://bun.sh/) as its runtime and the [Claude CLI](https://claude.ai/code) for AI capabilities.

```bash
# Install Bun (if not already installed)
curl -fsSL https://bun.sh/install | bash

# Install Ralphy globally
bun add -g @mrck-labs/ralphy

# Verify installation
ralphy --version
```

### Prerequisites

- **Bun** v1.0 or higher
- **Claude CLI** - Install from [claude.ai/code](https://claude.ai/code)
- **Linear** or **Jira Cloud** account with API access

## Quick Start

```bash
# 1. Initialize Ralphy in your project
cd your-project
ralphy init

# 2. Add labels to issues in Linear/Jira:
#    - ralph-candidate: Issues to consider for automation
#    - ralph-ready: Issues ready to be processed

# 3. View available issues
ralphy candidates
ralphy ready

# 4. Run the Ralph Wiggum loop on an issue
ralphy run PROJ-123
```

## Commands

Ralphy provides 8 commands for managing AI-assisted development workflows.

### `ralphy init`

Initialize Ralphy in the current directory. Sets up configuration for Linear or Jira.

```bash
ralphy init
ralphy init --force  # Reinitialize even if already configured
```

The init wizard will:
- Ask you to choose between Linear and Jira
- Validate your API credentials
- Let you select a team and project
- Create the `.ralphy/` configuration directory

### `ralphy candidates`

List issues with the `ralph-candidate` label. These are issues you're considering for AI automation.

```bash
ralphy candidates
ralphy candidates --json  # Output as JSON
ralphy candidates --all   # Include completed/in-review issues
```

### `ralphy ready`

List issues with the `ralph-ready` label. These issues are ready to be processed by the AI.

```bash
ralphy ready
ralphy ready --json  # Output as JSON
ralphy ready --all   # Include completed/in-review issues
```

### `ralphy run [issue]`

Execute the Ralph Wiggum loop for one or more issues. This is the core command.

```bash
# Run on a single issue
ralphy run PROJ-123

# Run on all ready issues (batch mode)
ralphy run --all-ready

# Preview what would be processed
ralphy run --all-ready --dry-run

# Options
ralphy run PROJ-123 --max-iterations 10  # Limit iterations (default: 20)
ralphy run PROJ-123 --auto-commit        # Git commit after completion
ralphy run PROJ-123 --notify             # Desktop notification on completion
ralphy run PROJ-123 --verbose            # Show Claude tool activity in real-time
```

During batch mode (`--all-ready`), press `Ctrl+C` once to stop gracefully after the current issue, or twice to force exit.

### `ralphy enrich [issues...]`

Enrich issues with AI-generated implementation details. Adds structured acceptance criteria, steps, and technical notes to issue descriptions.

```bash
# Enrich specific issues
ralphy enrich PROJ-123
ralphy enrich PROJ-123 PROJ-124 PROJ-125

# Enrich all candidate issues
ralphy enrich --all-candidates

# Preview without updating issues
ralphy enrich PROJ-123 --dry-run

# Options
ralphy enrich PROJ-123 --verbose  # Show Claude output
ralphy enrich PROJ-123 --force    # Re-enrich already enriched issues
```

### `ralphy promote <issues...>`

Promote issues from `ralph-candidate` to `ralph-ready` label.

```bash
ralphy promote PROJ-123
ralphy promote PROJ-123 PROJ-124

# Preview label changes
ralphy promote PROJ-123 --dry-run
```

### `ralphy create <path>`

Create issues from markdown files or a folder of markdown files.

```bash
# Create from a single file
ralphy create task.md

# Extract multiple tasks from one file
ralphy create task.md --multi

# Create from all markdown files in a folder
ralphy create ./tasks/

# Options
ralphy create task.md --dry-run           # Preview without creating
ralphy create task.md --verbose           # Show Claude output
ralphy create task.md --status "Backlog"  # Set initial status
```

### `ralphy status`

Display comprehensive status information about your Ralphy environment.

```bash
ralphy status
ralphy status --json  # Output as JSON
```

Shows:
- Configuration details (provider, project, labels)
- Issue statistics (candidates, ready, enriched counts)
- Execution history (total runs, completion rate, recent activity)
- System health (Claude CLI availability, API connection status)

## Configuration

Ralphy stores configuration in `.ralphy/config.json` in your project root.

### Environment Variables

You can provide credentials via environment variables instead of entering them during `init`:

**For Linear:**
```bash
export LINEAR_API_KEY="lin_api_..."
```

**For Jira:**
```bash
export JIRA_HOST="https://company.atlassian.net"
export JIRA_EMAIL="you@company.com"
export JIRA_API_TOKEN="your-api-token"
```

### Configuration Options

```json
{
  "version": 2,
  "provider": {
    "type": "linear",
    "config": {
      "apiKey": "...",
      "projectId": "...",
      "projectName": "...",
      "teamId": "..."
    }
  },
  "labels": {
    "candidate": "ralph-candidate",
    "ready": "ralph-ready",
    "enriched": "ralph-enriched"
  },
  "claude": {
    "maxIterations": 20,
    "timeout": 1200000,
    "model": "sonnet"
  }
}
```

**Labels:**
- `candidate` - Label for issues being considered for automation
- `ready` - Label for issues ready to be processed
- `enriched` - Label added after AI enrichment

**Claude Settings:**
- `maxIterations` - Maximum loop iterations before stopping (default: 20)
- `timeout` - Timeout per Claude execution in milliseconds (default: 20 minutes)
- `model` - Claude model to use (default: "sonnet")

## How It Works

The Ralph Wiggum loop algorithm:

```
1. FETCH issue from Linear/Jira
2. CREATE progress.md file with issue context
3. LOOP until complete or max iterations:
   a. BUILD prompt from issue + progress file
   b. EXECUTE Claude CLI with prompt
   c. ANALYZE output for completion signals
   d. Handle rate limits with exponential backoff
4. GIT COMMIT changes
5. UPDATE issue status in Linear/Jira
6. ADD completion comment with execution log
```

Key features of the loop:
- **Stateless execution** - Each iteration starts fresh, reading state from files
- **Progress persistence** - Work is saved in git history and progress files
- **Graceful shutdown** - Ctrl+C stops after current iteration completes
- **Rate limit handling** - Automatic retry with backoff on API limits
- **Completion detection** - Analyzes Claude output for success/failure signals

## Development

This is a monorepo using Bun workspaces.

### Project Structure

```
/
├── apps/
│   └── cli/           # Main CLI application (@mrck-labs/ralphy)
│       ├── src/
│       │   ├── commands/    # CLI command handlers
│       │   ├── services/    # Business logic
│       │   │   ├── claude/  # Claude CLI integration
│       │   │   ├── config/  # Configuration management
│       │   │   └── linear/  # Linear API client
│       │   └── utils/       # Logging, spinners, tables
│       └── tests/
├── packages/
│   └── shared/        # Shared library (@mrck-labs/ralphy-shared)
│       └── src/
│           ├── services/    # Ticket service abstraction
│           │   └── ticket/  # Linear + Jira implementations
│           ├── types/       # Zod schemas and TypeScript types
│           └── utils/       # Common utilities
└── templates/
    └── prompts/       # Prompt templates
```

### Commands

```bash
# Install dependencies
bun install

# Run CLI in development mode
bun run dev

# Build all packages
bun run build

# Run tests
bun run test

# Type check
bun run typecheck

# Clean build artifacts
bun run clean
```

### Building Binaries

Ralphy can be compiled to standalone binaries:

```bash
cd apps/cli

# Build for current platform
bun run build:binary

# Build for all platforms
bun run build:binary:all
```

Supported targets:
- `darwin-arm64` (macOS Apple Silicon)
- `darwin-x64` (macOS Intel)
- `linux-x64`
- `windows-x64`

## Contributing

Contributions are welcome. Please see the [CLAUDE.md](./CLAUDE.md) file for coding standards.

Key guidelines:
- Use TypeScript strict mode, never use `any`
- Prefer pure functions for testability
- Validate external data with Zod schemas
- Follow kebab-case for file names
- Always use Bun, not npm or node

## License

ISC License - see package.json for details.
