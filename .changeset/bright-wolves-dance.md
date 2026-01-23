---
"@mrck-labs/ralphy": minor
"@mrck-labs/ralphy-shared": minor
---

Add GitHub PR integration for importing review comments as tasks

- New `ralphy github prs` command to list PRs with review comments
- New `ralphy github import <pr-number>` command to create Linear/Jira tasks from PR comments
- Enhanced `ralphy init` to be incremental and configure GitHub integration
- Added support for Copilot reviewer comments
- New `ralph-pr-feedback` label for PR-sourced tasks
