/**
 * Pure functions for enriching issues with AI-generated content.
 */

import type { NormalizedIssue, ProjectContext } from '@mrck-labs/ralphy-shared';
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
 * Formats project context into markdown for inclusion in the enrichment prompt.
 */
function formatProjectContext(projectContext: ProjectContext): string {
  const lines: string[] = [];

  lines.push(`**Project:** ${projectContext.name}`);

  if (projectContext.description) {
    lines.push('', `**Project Description:** ${projectContext.description}`);
  }

  if (projectContext.content) {
    lines.push('', '### Project Overview', '', projectContext.content);
  }

  if (projectContext.externalLinks.length > 0) {
    lines.push('', '### External Links');
    for (const link of projectContext.externalLinks) {
      lines.push(`- [${link.label}](${link.url})`);
    }
  }

  return lines.join('\n');
}

/**
 * Options for building the enrichment prompt.
 */
export interface EnrichmentPromptOptions {
  codebaseContext?: string | undefined;
  projectContext?: ProjectContext | undefined;
}

/**
 * Builds the prompt for enriching an issue.
 */
export function buildEnrichmentPrompt(
  issue: NormalizedIssue,
  options?: EnrichmentPromptOptions | string
): string {
  // Support legacy signature where second param was codebaseContext string
  const opts: EnrichmentPromptOptions =
    typeof options === 'string' ? { codebaseContext: options } : options ?? {};

  const { codebaseContext, projectContext } = opts;

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

  if (projectContext) {
    lines.push('## Project Context', '', formatProjectContext(projectContext), '');
  }

  if (codebaseContext) {
    lines.push('## Codebase Context', '', codebaseContext, '');
  }

  lines.push(
    '## Research Phase (REQUIRED)',
    '',
    'Before writing the enriched description, you MUST thoroughly research the codebase to understand the full context. This is critical for producing actionable implementation steps.',
    '',
    '### Step 1: Understand the System Architecture',
    '- Explore the project structure and identify key directories',
    '- Read configuration files (package.json, tsconfig.json, etc.) to understand the tech stack',
    '- Identify the main entry points and how the application is organized',
    '',
    '### Step 2: Find Related Code',
    '- Search for files, functions, and components related to this issue',
    '- Trace the data flow and understand how different parts connect',
    '- Identify existing patterns, conventions, and abstractions used in the codebase',
    '',
    '### Step 3: Analyze Dependencies and Impact',
    '- Understand what other parts of the system might be affected',
    '- Identify any shared utilities, types, or services that should be reused',
    '- Note any tests that cover related functionality',
    '',
    '### Step 4: Deep Dive into the Problem',
    '- Think critically about what the issue is really asking for',
    '- Consider edge cases and potential complications',
    '- Identify any ambiguities that need to be addressed in the implementation',
    '',
    '## Your Task',
    '',
    'After completing your research, produce an enriched description with:',
    '',
    '1. **Description** - A clear, detailed description that demonstrates deep understanding of the problem in the context of THIS specific codebase. Reference actual files, patterns, and architecture you discovered.',
    '2. **Steps** - Numbered implementation steps that are specific to this codebase. Reference actual file paths, function names, and existing patterns. Each step should be concrete and actionable.',
    '3. **Acceptance Criteria** - Checkboxes for verification (use `- [ ]` format). Include both functional requirements and technical quality checks.',
    '4. **Technical Notes** - Important technical considerations discovered during research: existing patterns to follow, potential pitfalls, related code to be aware of, architectural decisions to respect.',
    '',
    '## Output Format',
    '',
    '```markdown',
    '## Description',
    '[Clear description that shows understanding of the codebase context]',
    '',
    '## Steps',
    '1. [Specific step referencing actual files/patterns in the codebase]',
    '',
    '## Acceptance Criteria',
    '- [ ] [Specific, verifiable criterion]',
    '',
    '## Technical Notes',
    '- [Important technical consideration from your research]',
    '```',
    '',
    'IMPORTANT: Your enriched description should demonstrate that you have actually explored and understood the codebase. Generic steps like "implement the feature" are not acceptable. Every step should reference specific files, functions, or patterns from the codebase.',
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
  const args = ['--print', '-p', prompt, '--output-format', 'text'];
  if (model) args.push('--model', model);
  return args;
}
