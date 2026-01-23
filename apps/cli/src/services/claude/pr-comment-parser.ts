/**
 * Pure functions for parsing PR comments into actionable tasks.
 */

import { z } from 'zod';
import type { NormalizedPriority } from '@mrck-labs/ralphy-shared';
import type { PRComment, PRDetails, ParsedPRTask } from '../github/types.js';

// ============ Output Schema ============

export const ParsedTaskSchema = z.object({
  title: z.string().min(1),
  description: z.string(),
  priority: z.enum(['urgent', 'high', 'medium', 'low', 'none']),
});

export const PRTasksOutputSchema = z.object({
  tasks: z.array(ParsedTaskSchema),
});

export type PRTasksOutput = z.infer<typeof PRTasksOutputSchema>;

// ============ Markers ============

export const PR_TASK_MARKERS = {
  outputStart: '<tasks>',
  outputEnd: '</tasks>',
  complete: '<parsing>COMPLETE</parsing>',
} as const;

// ============ Prompt Builder ============

export interface PRCommentParserOptions {
  includeIssueComments?: boolean;
  maxCommentsToInclude?: number;
}

/**
 * Builds the prompt for parsing PR comments into tasks.
 */
export function buildPRCommentParserPrompt(
  pr: PRDetails,
  comments: PRComment[],
  options: PRCommentParserOptions = {}
): string {
  const { maxCommentsToInclude = 50 } = options;
  const commentsToProcess = comments.slice(0, maxCommentsToInclude);

  const lines: string[] = [
    '# Task: Parse PR Review Comments into Actionable Tasks',
    '',
    'You are analyzing review comments from a GitHub Pull Request to identify actionable improvement tasks.',
    '',
    '## Pull Request Context',
    '',
    `**PR #${pr.number}:** ${pr.title}`,
    `**URL:** ${pr.url}`,
    `**Author:** ${pr.author}`,
    `**Branch:** ${pr.headBranch} → ${pr.baseBranch}`,
    '',
  ];

  if (pr.body) {
    lines.push('**PR Description:**', pr.body, '');
  }

  lines.push(
    '## Review Comments',
    '',
    'Below are the review comments to analyze. Each comment may represent:',
    '- A code quality improvement suggestion',
    '- A bug fix needed',
    '- A refactoring opportunity',
    '- A documentation improvement',
    '- A test coverage gap',
    '',
  );

  for (const comment of commentsToProcess) {
    lines.push('---');
    lines.push(`**Author:** ${comment.author} (${comment.authorType})`);
    if (comment.path) {
      lines.push(`**File:** ${comment.path}${comment.line ? `:${comment.line}` : ''}`);
    }
    if (comment.diffHunk) {
      lines.push('**Code Context:**', '```', comment.diffHunk, '```');
    }
    lines.push('**Comment:**', comment.body, '');
  }

  lines.push(
    '---',
    '',
    '## Your Task',
    '',
    'Analyze the review comments above and extract actionable tasks. For each distinct issue or suggestion:',
    '',
    '1. Create a clear, concise task title (imperative form, e.g., "Add error handling for API timeout")',
    '2. Write a detailed description that includes:',
    '   - What needs to be done',
    '   - The file(s) and location(s) involved',
    '   - The original comment context',
    '   - Link to the PR comment',
    '3. Assign a priority based on:',
    '   - **urgent**: Security issues, data loss risks, blocking bugs',
    '   - **high**: Bugs, broken functionality, significant code quality issues',
    '   - **medium**: Refactoring, code improvements, minor bugs',
    '   - **low**: Nice-to-haves, minor style issues, documentation',
    '   - **none**: Questions or discussions that don\'t need action',
    '',
    '## Guidelines',
    '',
    '- Group related comments into a single task when they address the same issue',
    '- Skip comments that are just acknowledgments (e.g., "LGTM", "Thanks", "Fixed")',
    '- Skip resolved discussions that don\'t need further action',
    '- For Copilot suggestions, extract the core improvement being suggested',
    '- Include enough context that someone unfamiliar with the PR can understand and act on the task',
    '',
    '## Output Format',
    '',
    'Output your analysis as JSON between the markers:',
    '',
    '```',
    PR_TASK_MARKERS.outputStart,
    '{',
    '  "tasks": [',
    '    {',
    '      "title": "Add input validation for email field",',
    '      "description": "## Context\\n\\nFrom PR #123 comment by @reviewer...\\n\\n## What needs to be done\\n\\n...",',
    '      "priority": "medium"',
    '    }',
    '  ]',
    '}',
    PR_TASK_MARKERS.outputEnd,
    '```',
    '',
    `When complete, output: ${PR_TASK_MARKERS.complete}`,
    '',
  );

  return lines.join('\n');
}

// ============ Output Parser ============

/**
 * Parses the Claude output to extract tasks.
 */
export function parsePRTasksOutput(output: string): ParsedPRTask[] | null {
  // Find JSON between markers
  const startIndex = output.indexOf(PR_TASK_MARKERS.outputStart);
  const endIndex = output.indexOf(PR_TASK_MARKERS.outputEnd);

  if (startIndex === -1 || endIndex === -1) {
    return null;
  }

  const jsonContent = output.slice(startIndex + PR_TASK_MARKERS.outputStart.length, endIndex).trim();

  try {
    const parsed = JSON.parse(jsonContent);
    const validated = PRTasksOutputSchema.safeParse(parsed);

    if (!validated.success) {
      return null;
    }

    return validated.data.tasks.map((task) => ({
      title: task.title,
      description: task.description,
      priority: task.priority as NormalizedPriority,
      sourceComments: [], // Will be populated by the caller if needed
    }));
  } catch {
    return null;
  }
}

/**
 * Checks if the parsing is complete.
 */
export function isPRParsingComplete(output: string): boolean {
  return output.includes(PR_TASK_MARKERS.complete);
}

// ============ Task Description Formatter ============

/**
 * Formats a task description with PR context, comment links, and code context.
 */
export function formatTaskDescription(
  pr: PRDetails,
  comments: PRComment[],
  taskDescription: string
): string {
  const lines: string[] = [taskDescription];

  lines.push('', '---', '');
  lines.push('## Source', '');
  lines.push(`- **PR:** [#${pr.number} - ${pr.title}](${pr.url})`);
  lines.push(`- **Branch:** \`${pr.headBranch}\` → \`${pr.baseBranch}\``);

  if (comments.length > 0) {
    lines.push('', '## Original Comments', '');

    for (const comment of comments) {
      lines.push(`### [Comment by @${comment.author}](${comment.url})`);
      if (comment.path) {
        lines.push(`**File:** \`${comment.path}\`${comment.line ? ` (line ${comment.line})` : ''}`);
      }
      if (comment.diffHunk) {
        lines.push('```diff', comment.diffHunk, '```');
      }
      lines.push('', '> ' + comment.body.split('\n').join('\n> '), '');
    }
  }

  return lines.join('\n');
}

/**
 * Builds Claude CLI arguments for PR comment parsing.
 */
export function buildPRParserClaudeArgs(prompt: string, model?: string): string[] {
  const args = ['-p', prompt, '--output-format', 'text'];
  if (model) args.push('--model', model);
  return args;
}
