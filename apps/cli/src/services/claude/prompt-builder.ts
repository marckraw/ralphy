/**
 * Pure functions for building Claude prompts.
 */

import type { NormalizedIssue } from '@mrck-labs/ralphy-shared';
import { NORMALIZED_PRIORITY_LABELS } from '@mrck-labs/ralphy-shared';
import { COMPLETION_MARKER } from './completion.js';

export interface PromptOptions {
  issue: NormalizedIssue;
  iteration: number;
  maxIterations: number;
  progressFilePath: string;
}

export function buildTaskFileContent(issue: NormalizedIssue): string {
  return [
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
    NORMALIZED_PRIORITY_LABELS[issue.priority],
    '',
    `## Labels`,
    issue.labels.length > 0 ? issue.labels.map((l) => `- ${l.name}`).join('\n') : 'No labels',
    '',
  ].join('\n');
}

export function buildInitialProgressContent(issue: NormalizedIssue): string {
  return [
    `# Progress: ${issue.identifier}`,
    '',
    `Started: ${new Date().toISOString()}`,
    '',
    '## Notes',
    '',
    'Add your progress notes below this line.',
    '',
    '---',
    '',
  ].join('\n');
}

export function buildPrompt(options: PromptOptions): string {
  const { issue, iteration, maxIterations, progressFilePath } = options;

  return [
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
  ].join('\n');
}

export function buildClaudeArgs(prompt: string, model?: string): string[] {
  const args = ['--permission-mode', 'acceptEdits', '-p', prompt, '--output-format', 'text'];
  if (model) args.push('--model', model);
  return args;
}
