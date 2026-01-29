---
"@mrck-labs/ralphy": minor
"@mrck-labs/ralphy-shared": minor
---

feat: Separate secrets from config using environment variables

- Secrets (LINEAR_API_KEY, JIRA_API_TOKEN, GITHUB_TOKEN) are now stored in `.env` file instead of `.ralphy/config.json`
- The `.ralphy/` folder is now safe to commit to version control
- Init command writes secrets to `.env` and saves config without secrets
- Full backwards compatibility: existing configs with embedded secrets still work
- Added `loadAndResolveConfig()` that resolves secrets from env vars with fallback to config values
- Added `writeSecretsToEnv()` service for managing `.env` files
- Updated all commands to use the new config resolution
