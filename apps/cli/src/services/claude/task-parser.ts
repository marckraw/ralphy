/**
 * Pure functions for parsing markdown into tasks using Claude.
 */

import type { ParsedTask, Result } from '@mrck-labs/ralphy-shared';
import { parseTasksFromJson } from '@mrck-labs/ralphy-shared';

/**
 * Markers for parsing task output.
 */
export const TASK_PARSER_MARKERS = {
  jsonStart: '<tasks-json>',
  jsonEnd: '</tasks-json>',
  parsingComplete: '<parsing>COMPLETE</parsing>',
} as const;

/**
 * Builds the prompt for parsing a single task from markdown.
 */
export function buildSingleTaskPrompt(markdown: string): string {
  return `# Task: Parse Markdown into a Task

You are parsing a markdown file into a structured task for a ticket management system (Linear).

## Input Markdown

\`\`\`markdown
${markdown}
\`\`\`

## Your Task

Parse this markdown and extract a single task with the following structure:
- **title**: A concise title for the task (required)
- **description**: The full description in markdown format (optional)
- **priority**: One of "urgent", "high", "medium", "low", "none" (default: "none")

## Output Format

Output the task as JSON wrapped in markers:

${TASK_PARSER_MARKERS.jsonStart}
{
  "title": "Task title here",
  "description": "Full description in markdown",
  "priority": "medium"
}
${TASK_PARSER_MARKERS.jsonEnd}

When complete, output: ${TASK_PARSER_MARKERS.parsingComplete}
`;
}

/**
 * Builds the prompt for parsing multiple tasks from markdown.
 */
export function buildMultiTaskPrompt(markdown: string): string {
  return `# Task: Parse Markdown into Multiple Tasks

You are parsing a markdown file into multiple structured tasks for a ticket management system (Linear).

## Input Markdown

\`\`\`markdown
${markdown}
\`\`\`

## Your Task

Parse this markdown and extract multiple tasks. Look for natural task boundaries like:
- Markdown headers (# Task 1, ## Feature A)
- Numbered lists
- Clear logical separations

Each task should have:
- **title**: A concise title (required)
- **description**: The full description in markdown format (optional)
- **priority**: One of "urgent", "high", "medium", "low", "none" (default: "none")

## Output Format

Output the tasks as a JSON array wrapped in markers:

${TASK_PARSER_MARKERS.jsonStart}
{
  "tasks": [
    {
      "title": "First task title",
      "description": "First task description",
      "priority": "high"
    },
    {
      "title": "Second task title",
      "description": "Second task description",
      "priority": "medium"
    }
  ]
}
${TASK_PARSER_MARKERS.jsonEnd}

When complete, output: ${TASK_PARSER_MARKERS.parsingComplete}
`;
}

/**
 * Builds the appropriate prompt based on mode.
 */
export function buildTaskParserPrompt(
  markdown: string,
  multiMode: boolean
): string {
  return multiMode
    ? buildMultiTaskPrompt(markdown)
    : buildSingleTaskPrompt(markdown);
}

/**
 * Extracts JSON from Claude's output using the markers.
 * Pure function.
 */
export function extractTasksJson(output: string): string | null {
  const startIndex = output.indexOf(TASK_PARSER_MARKERS.jsonStart);
  if (startIndex === -1) return null;

  const contentStart = startIndex + TASK_PARSER_MARKERS.jsonStart.length;
  const endIndex = output.indexOf(TASK_PARSER_MARKERS.jsonEnd, contentStart);
  if (endIndex === -1) return null;

  return output.slice(contentStart, endIndex).trim();
}

/**
 * Checks if Claude signaled completion.
 * Pure function.
 */
export function isParsingComplete(output: string): boolean {
  return output.includes(TASK_PARSER_MARKERS.parsingComplete);
}

/**
 * Parses tasks from Claude's raw output.
 * Pure function that combines JSON extraction and validation.
 */
export function parseTasksFromOutput(
  output: string,
  multiMode: boolean
): Result<ParsedTask[]> {
  const jsonStr = extractTasksJson(output);
  if (!jsonStr) {
    return {
      success: false,
      error: 'Could not find task JSON in Claude output',
    };
  }

  let json: unknown;
  try {
    json = JSON.parse(jsonStr);
  } catch {
    return {
      success: false,
      error: `Failed to parse JSON: ${jsonStr.slice(0, 100)}...`,
    };
  }

  return parseTasksFromJson(json, multiMode);
}

/**
 * Formats tasks for CLI preview display.
 * Pure function.
 */
export function formatTasksPreview(tasks: ParsedTask[]): string {
  const lines: string[] = [];

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    if (!task) continue;

    lines.push(`--- Task ${i + 1} ---`);
    lines.push(`Title: ${task.title}`);
    lines.push(`Priority: ${task.priority}`);

    if (task.description) {
      lines.push(`Description:`);
      // Indent description lines
      const descLines = task.description.split('\n');
      for (const line of descLines) {
        lines.push(`  ${line}`);
      }
    }

    if (task.labels && task.labels.length > 0) {
      lines.push(`Labels: ${task.labels.join(', ')}`);
    }

    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Builds Claude CLI arguments for task parsing.
 */
export function buildTaskParserClaudeArgs(
  prompt: string,
  model?: string
): string[] {
  const args = ['-p', prompt, '--output-format', 'text'];
  if (model) args.push('--model', model);
  return args;
}
