---
"@mrck-labs/ralphy": minor
---

Add watch mode for continuous issue monitoring

- New `ralphy watch` command that continuously monitors for `ralph-ready` issues
- Configurable polling interval (default: 120s)
- Graceful shutdown with two-press Ctrl+C pattern
- API error handling with exponential backoff
- Dry-run mode, desktop notifications, and verbose output support
