# @mrck-labs/ralphy

## 1.6.0

### Minor Changes

- 92ea84f: prioritization in run command

### Patch Changes

- Updated dependencies [92ea84f]
  - @mrck-labs/ralphy-shared@1.3.0

## 1.5.1

### Patch Changes

- 7bde116: Always add comments to Linear issues when running the run command, not just in batch mode or with auto-commit enabled

## 1.5.0

### Minor Changes

- 927133e: Add comprehensive README.md documentation for the project, including installation instructions, quick start guide, all CLI commands with examples, configuration options, and development setup.
- 132d873: Add watch mode for continuous issue monitoring

  - New `ralphy watch` command that continuously monitors for `ralph-ready` issues
  - Configurable polling interval (default: 120s)
  - Graceful shutdown with two-press Ctrl+C pattern
  - API error handling with exponential backoff
  - Dry-run mode, desktop notifications, and verbose output support

## 1.4.1

### Patch Changes

- 559d7f7: feat(enrich): add deep codebase research phase to enrichment prompt

  The enrich command now instructs Claude to thoroughly research the codebase before generating the enriched issue description. This includes:

  - Understanding system architecture and project structure
  - Finding related code, patterns, and conventions
  - Analyzing dependencies and impact on other parts of the system
  - Deep diving into the problem with edge cases and complications

  The output requirements now enforce that steps must reference actual file paths, function names, and existing patterns from the codebase rather than generic implementation steps.

## 1.4.0

### Minor Changes

- 626fd55: Filter completed/in-review issues from ready and candidates commands by default. Add --all flag to show all issues. Support enriching multiple issues at once with enrich command.

## 1.3.0

### Minor Changes

- d134c90: Add --verbose flag to run command to show Claude tool activity in real-time

## 1.2.0

### Minor Changes

- f65a919: fix upload artifacts

### Patch Changes

- Updated dependencies [f65a919]
  - @mrck-labs/ralphy-shared@1.2.0

## 1.1.0

### Minor Changes

- 2f3ba63: initial commit
- 09ca3ff: ralphy run and other commands

### Patch Changes

- Updated dependencies [2f3ba63]
- Updated dependencies [09ca3ff]
  - @mrck-labs/ralphy-shared@1.1.0
