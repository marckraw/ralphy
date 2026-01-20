/**
 * Pure functions for enriching issues with AI-generated content.
 */

import type { NormalizedIssue } from '@mrck-labs/ralphy-shared';
import { NORMALIZED_PRIORITY_LABELS } from '@mrck-labs/ralphy-shared';

/**
 * Enriched issue structure.
 */
export interface EnrichedContent {
  description: string;
  steps: string[];
  acceptanceCriteria: string[];
  technicalNotes: string[];
}

/**
 * Markers for parsing enriched output.
 */
export const ENRICHMENT_MARKERS = {
  descriptionStart: '## Description',
  stepsStart: '## Steps',
  acceptanceCriteriaStart: '## Acceptance Criteria',
  technicalNotesStart: '## Technical Notes',
  enrichmentComplete: '<enrichment>COMPLETE</enrichment>',
} as const;

/**
 * Builds the prompt for enriching an issue.
 */
export function buildEnrichmentPrompt(
  issue: NormalizedIssue,
  codebaseContext?: string
): string {
  const lines: string[] = [
    '# Task: Enrich Issue',
    '',
    `You are enriching the issue **${issue.identifier}** to make it actionable for an AI coding assistant.`,
    '',
    '## Current Issue',
    '',
    `**Title:** ${issue.title}`,
    '',
    `**Current Description:**`,
    issue.description ?? '_No description provided._',
    '',
    `**Priority:** ${NORMALIZED_PRIORITY_LABELS[issue.priority]}`,
    `**State:** ${issue.state.name}`,
    `**Labels:** ${issue.labels.map((l) => l.name).join(', ') || 'None'}`,
    '',
  ];

  if (codebaseContext) {
    lines.push('## Codebase Context', '', codebaseContext, '');
  }

  lines.push(
    '## Your Task',
    '',
    'Analyze this issue and produce an enriched description with:',
    '',
    '1. **Description** - A clear, detailed description of what needs to be done',
    '2. **Steps** - Numbered implementation steps (be specific and actionable)',
    '3. **Acceptance Criteria** - Checkboxes for verification (use `- [ ]` format)',
    '4. **Technical Notes** - Any relevant technical considerations',
    '',
    '## Output Format',
    '',
    '```markdown',
    '## Description',
    '[Clear description]',
    '',
    '## Steps',
    '1. [First step]',
    '',
    '## Acceptance Criteria',
    '- [ ] [First criterion]',
    '',
    '## Technical Notes',
    '- [Technical note]',
    '```',
    '',
    `When complete, output: ${ENRICHMENT_MARKERS.enrichmentComplete}`,
    '',
  );

  return lines.join('\n');
}

export function parseEnrichedContent(output: string): EnrichedContent | null {
  const description = extractSection(output, ENRICHMENT_MARKERS.descriptionStart, ENRICHMENT_MARKERS.stepsStart);
  const stepsSection = extractSection(output, ENRICHMENT_MARKERS.stepsStart, ENRICHMENT_MARKERS.acceptanceCriteriaStart);
  const acceptanceSection = extractSection(output, ENRICHMENT_MARKERS.acceptanceCriteriaStart, ENRICHMENT_MARKERS.technicalNotesStart);
  const technicalSection = extractSection(output, ENRICHMENT_MARKERS.technicalNotesStart, ENRICHMENT_MARKERS.enrichmentComplete);

  if (!description) return null;

  return {
    description: description.trim(),
    steps: parseNumberedList(stepsSection ?? ''),
    acceptanceCriteria: parseCheckboxList(acceptanceSection ?? ''),
    technicalNotes: parseBulletList(technicalSection ?? ''),
  };
}

function extractSection(text: string, startMarker: string, endMarker: string): string | null {
  const startIndex = text.indexOf(startMarker);
  if (startIndex === -1) return null;
  const contentStart = startIndex + startMarker.length;
  const endIndex = text.indexOf(endMarker, contentStart);
  return endIndex === -1 ? text.slice(contentStart) : text.slice(contentStart, endIndex);
}

function parseNumberedList(text: string): string[] {
  return text.split('\n')
    .map(line => /^\s*\d+\.\s+(.+)$/.exec(line.trim()))
    .filter((match): match is RegExpExecArray => match !== null)
    .map(match => match[1]?.trim() ?? '');
}

function parseCheckboxList(text: string): string[] {
  return text.split('\n')
    .map(line => /^\s*-\s*\[[ x]\]\s+(.+)$/.exec(line.trim()))
    .filter((match): match is RegExpExecArray => match !== null)
    .map(match => match[1]?.trim() ?? '');
}

function parseBulletList(text: string): string[] {
  return text.split('\n')
    .map(line => /^\s*-\s+(.+)$/.exec(line.trim()))
    .filter((match): match is RegExpExecArray => match !== null && !/^\[[ x]\]/.test(match[1] ?? ''))
    .map(match => match[1]?.trim() ?? '');
}

export function formatEnrichedMarkdown(content: EnrichedContent): string {
  const lines: string[] = ['## Description', '', content.description, ''];
  if (content.steps.length > 0) {
    lines.push('## Steps', '');
    content.steps.forEach((step, i) => lines.push(`${i + 1}. ${step}`));
    lines.push('');
  }
  if (content.acceptanceCriteria.length > 0) {
    lines.push('## Acceptance Criteria', '');
    content.acceptanceCriteria.forEach(c => lines.push(`- [ ] ${c}`));
    lines.push('');
  }
  if (content.technicalNotes.length > 0) {
    lines.push('## Technical Notes', '');
    content.technicalNotes.forEach(n => lines.push(`- ${n}`));
    lines.push('');
  }
  return lines.join('\n');
}

export function isEnrichmentComplete(output: string): boolean {
  return output.includes(ENRICHMENT_MARKERS.enrichmentComplete);
}

export function buildEnrichmentClaudeArgs(prompt: string, model?: string): string[] {
  const args = ['-p', prompt, '--output-format', 'text'];
  if (model) args.push('--model', model);
  return args;
}
