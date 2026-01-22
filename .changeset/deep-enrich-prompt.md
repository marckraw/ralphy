---
"@mrck-labs/ralphy": patch
---

feat(enrich): add deep codebase research phase to enrichment prompt

The enrich command now instructs Claude to thoroughly research the codebase before generating the enriched issue description. This includes:

- Understanding system architecture and project structure
- Finding related code, patterns, and conventions
- Analyzing dependencies and impact on other parts of the system
- Deep diving into the problem with edge cases and complications

The output requirements now enforce that steps must reference actual file paths, function names, and existing patterns from the codebase rather than generic implementation steps.
