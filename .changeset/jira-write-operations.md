---
"@mrck-labs/ralphy-shared": minor
---

Implement Jira write operations (createIssue, addComment, updateIssueState)

- Swap marklassian → extended-markdown-adf-parser for ADF conversion
- Implement createIssue with ADF description, runtime priority resolution, and labels support
- Implement addComment with ADF conversion and plain-string fallback
- Implement updateIssueState using Jira workflow transitions
- Add NORMALIZED_TO_JIRA_PRIORITY mapping and normalizedToJiraPriority() function
- Fix ADF table cells: wrap inline content in paragraphs, handle empty cells
- Add fallback patterns matching ralphy-jira-agent for robustness
