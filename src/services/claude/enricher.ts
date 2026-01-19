/**
 * Pure functions for enriching Linear issues with AI-generated content.
 */

import type { LinearIssue } from '../../types/linear.js';

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
 * Pure function - no side effects.
 *
 * @param issue - The Linear issue to enrich
 * @param codebaseContext - Optional context about the codebase
 * @returns The enrichment prompt
 */
export function buildEnrichmentPrompt(
  issue: LinearIssue,
  codebaseContext?: string
): string {
  const lines: string[] = [
    '# Task: Enrich Linear Issue',
    '',
    `You are enriching the Linear issue **${issue.identifier}** to make it actionable for an AI coding assistant.`,
    '',
    '## Current Issue',
    '',
    `**Title:** ${issue.title}`,
    '',
    `**Current Description:**`,
    issue.description ?? '_No description provided._',
    '',
    `**Priority:** ${getPriorityText(issue.priority)}`,
    `**State:** ${issue.state.name}`,
    `**Labels:** ${issue.labels.map((l) => l.name).join(', ') || 'None'}`,
    '',
  ];

  if (codebaseContext) {
    lines.push(
      '## Codebase Context',
      '',
      codebaseContext,
      ''
    );
  }

  lines.push(
    '## Your Task',
    '',
    'Analyze this issue and produce an enriched description with:',
    '',
    '1. **Description** - A clear, detailed description of what needs to be done',
    '2. **Steps** - Numbered implementation steps (be specific and actionable)',
    '3. **Acceptance Criteria** - Checkboxes for verification (use `- [ ]` format)',
    '4. **Technical Notes** - Any relevant technical considerations, files to modify, patterns to follow',
    '',
    '## Output Format',
    '',
    'Output the enriched content in this exact markdown format:',
    '',
    '```markdown',
    '## Description',
    '[Clear description of what needs to be done]',
    '',
    '## Steps',
    '1. [First step]',
    '2. [Second step]',
    '3. [Continue as needed...]',
    '',
    '## Acceptance Criteria',
    '- [ ] [First criterion]',
    '- [ ] [Second criterion]',
    '- [ ] [Continue as needed...]',
    '',
    '## Technical Notes',
    '- [Technical note 1]',
    '- [Technical note 2]',
    '- [Continue as needed...]',
    '```',
    '',
    `When complete, output: ${ENRICHMENT_MARKERS.enrichmentComplete}`,
    '',
    '## Important Guidelines',
    '',
    '- Be specific and actionable - avoid vague language',
    '- Steps should be concrete and verifiable',
    '- Include testing steps in acceptance criteria',
    '- Reference specific files/components if you can identify them',
    '- Keep the original intent of the issue intact',
    '- Do not add scope beyond what the original issue requests',
    '',
  );

  return lines.join('\n');
}

/**
 * Gets human-readable priority text.
 */
function getPriorityText(priority: number): string {
  const labels: Record<number, string> = {
    0: 'No priority',
    1: 'Urgent',
    2: 'High',
    3: 'Medium',
    4: 'Low',
  };
  return labels[priority] ?? 'Unknown';
}

/**
 * Parses the enriched content from Claude's output.
 * Pure function - no side effects.
 *
 * @param output - The raw output from Claude
 * @returns Parsed enriched content or null if parsing fails
 */
export function parseEnrichedContent(output: string): EnrichedContent | null {
  // Extract sections using markers
  const description = extractSection(output, ENRICHMENT_MARKERS.descriptionStart, ENRICHMENT_MARKERS.stepsStart);
  const stepsSection = extractSection(output, ENRICHMENT_MARKERS.stepsStart, ENRICHMENT_MARKERS.acceptanceCriteriaStart);
  const acceptanceSection = extractSection(output, ENRICHMENT_MARKERS.acceptanceCriteriaStart, ENRICHMENT_MARKERS.technicalNotesStart);
  const technicalSection = extractSection(output, ENRICHMENT_MARKERS.technicalNotesStart, ENRICHMENT_MARKERS.enrichmentComplete);

  if (!description) {
    return null;
  }

  return {
    description: description.trim(),
    steps: parseNumberedList(stepsSection ?? ''),
    acceptanceCriteria: parseCheckboxList(acceptanceSection ?? ''),
    technicalNotes: parseBulletList(technicalSection ?? ''),
  };
}

/**
 * Extracts content between two markers.
 */
function extractSection(text: string, startMarker: string, endMarker: string): string | null {
  const startIndex = text.indexOf(startMarker);
  if (startIndex === -1) {
    return null;
  }

  const contentStart = startIndex + startMarker.length;
  const endIndex = text.indexOf(endMarker, contentStart);

  if (endIndex === -1) {
    // If no end marker, take everything after start
    return text.slice(contentStart);
  }

  return text.slice(contentStart, endIndex);
}

/**
 * Parses a numbered list (1. item, 2. item, etc.)
 */
function parseNumberedList(text: string): string[] {
  const lines = text.split('\n');
  const items: string[] = [];

  for (const line of lines) {
    const match = /^\s*\d+\.\s+(.+)$/.exec(line.trim());
    if (match?.[1]) {
      items.push(match[1].trim());
    }
  }

  return items;
}

/**
 * Parses a checkbox list (- [ ] item or - [x] item)
 */
function parseCheckboxList(text: string): string[] {
  const lines = text.split('\n');
  const items: string[] = [];

  for (const line of lines) {
    const match = /^\s*-\s*\[[ x]\]\s+(.+)$/.exec(line.trim());
    if (match?.[1]) {
      items.push(match[1].trim());
    }
  }

  return items;
}

/**
 * Parses a bullet list (- item)
 */
function parseBulletList(text: string): string[] {
  const lines = text.split('\n');
  const items: string[] = [];

  for (const line of lines) {
    const match = /^\s*-\s+(.+)$/.exec(line.trim());
    if (match?.[1]) {
      // Skip checkbox items
      if (!/^\[[ x]\]/.test(match[1])) {
        items.push(match[1].trim());
      }
    }
  }

  return items;
}

/**
 * Formats enriched content back to markdown for Linear.
 * Pure function - no side effects.
 *
 * @param content - The enriched content
 * @returns Formatted markdown string
 */
export function formatEnrichedMarkdown(content: EnrichedContent): string {
  const lines: string[] = [
    '## Description',
    '',
    content.description,
    '',
  ];

  if (content.steps.length > 0) {
    lines.push('## Steps', '');
    content.steps.forEach((step, index) => {
      lines.push(`${index + 1}. ${step}`);
    });
    lines.push('');
  }

  if (content.acceptanceCriteria.length > 0) {
    lines.push('## Acceptance Criteria', '');
    for (const criterion of content.acceptanceCriteria) {
      lines.push(`- [ ] ${criterion}`);
    }
    lines.push('');
  }

  if (content.technicalNotes.length > 0) {
    lines.push('## Technical Notes', '');
    for (const note of content.technicalNotes) {
      lines.push(`- ${note}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Checks if Claude output indicates enrichment is complete.
 * Pure function - no side effects.
 *
 * @param output - The Claude output to check
 * @returns true if enrichment is complete
 */
export function isEnrichmentComplete(output: string): boolean {
  return output.includes(ENRICHMENT_MARKERS.enrichmentComplete);
}

/**
 * Builds Claude CLI arguments for enrichment.
 * Pure function - no side effects.
 *
 * @param prompt - The enrichment prompt
 * @param model - The model to use (e.g., 'sonnet', 'opus', 'haiku')
 * @returns Array of CLI arguments
 */
export function buildEnrichmentClaudeArgs(prompt: string, model?: string): string[] {
  const args = [
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
