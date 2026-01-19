/**
 * Pure functions for building Claude prompts.
 */

import type { NormalizedIssue, NormalizedPriority } from '../../types/ticket-service.js';
import { NORMALIZED_PRIORITY_LABELS } from '../../types/ticket-service.js';
import { COMPLETION_MARKER } from './completion.js';

/**
 * Options for building a task prompt.
 */
export interface PromptOptions {
  issue: NormalizedIssue;
  iteration: number;
  maxIterations: number;
  progressFilePath: string;
}

/**
 * Builds the task context file content.
 * Pure function - no side effects.
 *
 * @param issue - The issue to create context for
 * @returns Markdown content for the task file
 */
export function buildTaskFileContent(issue: NormalizedIssue): string {
  const lines: string[] = [
    `# Task: ${issue.identifier}`,
    '',
    `## Title`,
    issue.title,
    '',
    `## Description`,
    issue.description ?? 'No description provided.',
    '',
    `## State`,
    issue.state.name,
    '',
    `## Priority`,
    getPriorityText(issue.priority),
    '',
    `## Labels`,
    issue.labels.length > 0
      ? issue.labels.map((l) => `- ${l.name}`).join('\n')
      : 'No labels',
    '',
  ];

  return lines.join('\n');
}

/**
 * Gets human-readable priority text.
 */
function getPriorityText(priority: NormalizedPriority): string {
  return NORMALIZED_PRIORITY_LABELS[priority];
}

/**
 * Builds the initial progress file content.
 * Pure function - no side effects.
 *
 * @param issue - The issue
 * @returns Initial progress file content
 */
export function buildInitialProgressContent(issue: NormalizedIssue): string {
  const timestamp = new Date().toISOString();
  return [
    `# Progress: ${issue.identifier}`,
    '',
    `Started: ${timestamp}`,
    '',
    '## Notes',
    '',
    'Add your progress notes below this line.',
    '',
    '---',
    '',
  ].join('\n');
}

/**
 * Builds the prompt for Claude execution.
 * Pure function - no side effects.
 *
 * @param options - Prompt building options
 * @returns The complete prompt string
 */
export function buildPrompt(options: PromptOptions): string {
  const { issue, iteration, maxIterations, progressFilePath } = options;

  const lines: string[] = [
    `# Task: ${issue.identifier} - ${issue.title}`,
    '',
    `**Iteration ${iteration} of ${maxIterations}**`,
    '',
    '## Progress Notes',
    `Read and update: @${progressFilePath}`,
    '',
    '## Description',
    issue.description ?? 'No description provided.',
    '',
    '## Instructions',
    '',
    '1. Read the task details and progress notes from the context files above.',
    '2. Work on this task following the project\'s coding standards.',
    '3. Run tests to verify your changes: `npm test`',
    '4. Run type check: `npm run typecheck`',
    '5. After completing work, append your notes to the progress file.',
    `6. When the task is fully complete, output: ${COMPLETION_MARKER}`,
    '',
    '## Important',
    '',
    `- Output ${COMPLETION_MARKER} ONLY when the task is fully complete`,
    '- If blocked or need clarification, describe the issue clearly in the progress file',
    '- Do not skip tests or type checking',
    '',
  ];

  return lines.join('\n');
}

/**
 * Builds the Claude CLI arguments for execution.
 * Pure function - no side effects.
 *
 * @param prompt - The prompt to execute
 * @param model - The model to use (e.g., 'sonnet', 'opus', 'haiku')
 * @returns Array of CLI arguments
 */
export function buildClaudeArgs(prompt: string, model?: string): string[] {
  const args = [
    '--permission-mode',
    'acceptEdits',
    '-p',
    prompt,
    '--output-format',
    'text',
  ];

  if (model) {
    args.push('--model', model);
  }

  return args;
}
