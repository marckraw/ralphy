# @mrck-labs/ralphy-shared

## 1.5.0

### Minor Changes

- 01fc47a: Implement Jira write operations (createIssue, addComment, updateIssueState)

  - Swap marklassian → extended-markdown-adf-parser for ADF conversion
  - Implement createIssue with ADF description, runtime priority resolution, and labels support
  - Implement addComment with ADF conversion and plain-string fallback
  - Implement updateIssueState using Jira workflow transitions
  - Add NORMALIZED_TO_JIRA_PRIORITY mapping and normalizedToJiraPriority() function
  - Fix ADF table cells: wrap inline content in paragraphs, handle empty cells
  - Add fallback patterns matching ralphy-jira-agent for robustness

## 1.4.0

### Minor Changes

- d06e5fb: Add GitHub PR integration for importing review comments as tasks

  - New `ralphy github prs` command to list PRs with review comments
  - New `ralphy github import <pr-number>` command to create Linear/Jira tasks from PR comments
  - Enhanced `ralphy init` to be incremental and configure GitHub integration
  - Added support for Copilot reviewer comments
  - New `ralph-pr-feedback` label for PR-sourced tasks

## 1.3.0

### Minor Changes

- 92ea84f: prioritization in run command

## 1.2.0

### Minor Changes

- f65a919: fix upload artifacts

## 1.1.0

### Minor Changes

- 2f3ba63: initial commit
- 09ca3ff: ralphy run and other commands
