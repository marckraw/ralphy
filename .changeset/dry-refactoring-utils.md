---
"@mrck-labs/ralphy-cli": minor
---

DRY refactoring: Extract reusable utility functions

- Add config-helpers.ts with extractTeamAndProjectIds pure function
- Add command-helpers.ts with requireConfig, requireClaude, requireGitHubIntegration IO wrappers
- Add ticket-helpers.ts with fetchIssuesWithSpinner wrapper
- Add display-helpers.ts with formatDuration, displayDryRunNotice, displaySummary functions
- Add utils/index.ts to re-export all utilities
- Update all command files to use shared helpers, eliminating code duplication
- Consolidate formatDuration from status.ts and run.ts into single implementation

