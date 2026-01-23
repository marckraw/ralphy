/**
 * Intelligent task prioritization using Claude.
 *
 * Provides AI-powered decision-making for which task to tackle next
 * when processing multiple issues with --all-ready or watch mode.
 */

import type { NormalizedIssue, RalphyConfigV2 } from '@mrck-labs/ralphy-shared';
import { NORMALIZED_PRIORITY_LABELS, logger } from '@mrck-labs/ralphy-shared';
import { executeClaude } from './executor.js';
import {
  type PrioritizationDecision,
  PRIORITIZATION_COMPLETE_MARKER,
  validatePrioritizationResponse,
} from './prioritizer.schema.js';

/**
 * Context about a completed task to inform future prioritization.
 */
export interface CompletedTaskContext {
  identifier: string;
  title: string;
  status: 'completed' | 'max_iterations' | 'error';
  durationMs: number;
  iterations: number;
}

/**
 * Options for prioritization.
 */
export interface PrioritizationOptions {
  /** Timeout for Claude call in milliseconds (default: 30000) */
  timeout?: number;
  /** Model to use (default: haiku for speed) */
  model?: string;
  /** Enable verbose output */
  verbose?: boolean;
}

/**
 * Result of a prioritization attempt.
 */
export interface PrioritizationResult {
  success: true;
  decision: PrioritizationDecision;
  selectedIssue: NormalizedIssue;
}

export interface PrioritizationFailure {
  success: false;
  error: string;
  fallbackIssue: NormalizedIssue;
}

export type PrioritizeResult = PrioritizationResult | PrioritizationFailure;

/**
 * Formats a single issue for the prioritization prompt.
 * Pure function.
 */
function formatIssueForPrompt(issue: NormalizedIssue): string {
  const lines = [
    `- **${issue.identifier}**: ${issue.title}`,
    `  - Priority: ${NORMALIZED_PRIORITY_LABELS[issue.priority]}`,
    `  - State: ${issue.state.name}`,
    `  - Labels: ${issue.labels.map(l => l.name).join(', ') || 'None'}`,
  ];

  if (issue.description) {
    const preview = issue.description.slice(0, 200).replace(/\n/g, ' ');
    lines.push(`  - Description: ${preview}${issue.description.length > 200 ? '...' : ''}`);
  }

  return lines.join('\n');
}

/**
 * Builds the prioritization prompt for initial selection (no prior context).
 * Pure function.
 */
export function buildInitialPrioritizationPrompt(issues: NormalizedIssue[]): string {
  const issuesList = issues.map(formatIssueForPrompt).join('\n\n');

  return `# Task: Select Next Issue to Process

You are helping prioritize which issue to tackle next from a queue of ready tasks.
Your goal is to select the SINGLE most valuable issue to work on now.

## Available Issues

${issuesList}

## Selection Criteria

Consider these factors when selecting:
1. **Priority level** - Urgent/High priority issues may need immediate attention
2. **Dependencies** - Some tasks may be prerequisites for others
3. **Complexity** - Balance quick wins with larger tasks
4. **Relatedness** - Group related work for efficiency

## Response Format

Respond with ONLY a JSON object in this exact format:
\`\`\`json
{
  "decision": {
    "selectedIssueId": "<identifier like PROJ-42>",
    "reasoning": "<brief 1-2 sentence explanation>",
    "confidence": "high|medium|low"
  }
}
\`\`\`

After the JSON, output: ${PRIORITIZATION_COMPLETE_MARKER}

IMPORTANT:
- The selectedIssueId MUST be one of the identifiers listed above
- Keep reasoning concise but informative
- Use "high" confidence when the choice is clear, "low" when multiple options are equally valid
`;
}

/**
 * Builds the prioritization prompt with context from a completed task.
 * Pure function.
 */
export function buildReprioritizationPrompt(
  remainingIssues: NormalizedIssue[],
  completedTask: CompletedTaskContext
): string {
  const issuesList = remainingIssues.map(formatIssueForPrompt).join('\n\n');
  const statusEmoji = completedTask.status === 'completed' ? 'completed successfully' :
    completedTask.status === 'max_iterations' ? 'stopped at max iterations' : 'encountered an error';

  return `# Task: Select Next Issue (Re-prioritization)

You just finished working on a task. Now select the next issue to tackle.

## Just Completed

- **${completedTask.identifier}**: ${completedTask.title}
- Status: ${statusEmoji}
- Duration: ${Math.round(completedTask.durationMs / 1000)}s (${completedTask.iterations} iterations)

## Remaining Issues

${issuesList}

## Selection Criteria

Consider:
1. **Relatedness to completed task** - Is there follow-up work or related tasks?
2. **Priority level** - Should urgent items take precedence?
3. **Workflow efficiency** - Group similar work together
4. **Complexity balance** - After a complex task, maybe pick something simpler (or vice versa)

## Response Format

Respond with ONLY a JSON object in this exact format:
\`\`\`json
{
  "decision": {
    "selectedIssueId": "<identifier like PROJ-42>",
    "reasoning": "<brief 1-2 sentence explanation>",
    "confidence": "high|medium|low"
  }
}
\`\`\`

After the JSON, output: ${PRIORITIZATION_COMPLETE_MARKER}

IMPORTANT:
- The selectedIssueId MUST be one of the remaining issue identifiers listed above
- Keep reasoning concise but informative
`;
}

/**
 * Parses Claude's prioritization response to extract the decision.
 * Pure function.
 */
export function parsePrioritizationResponse(
  output: string
): { success: true; decision: PrioritizationDecision } | { success: false; error: string } {
  // Try to extract JSON from the output
  const jsonMatch = output.match(/```json\s*([\s\S]*?)```/);
  let jsonStr: string;

  if (jsonMatch?.[1]) {
    jsonStr = jsonMatch[1].trim();
  } else {
    // Try to find raw JSON object
    const rawJsonMatch = output.match(/\{[\s\S]*"decision"[\s\S]*\}/);
    if (rawJsonMatch) {
      jsonStr = rawJsonMatch[0];
    } else {
      return { success: false, error: 'No JSON found in response' };
    }
  }

  try {
    const parsed: unknown = JSON.parse(jsonStr);
    const validated = validatePrioritizationResponse(parsed);

    if (!validated.success) {
      return validated;
    }

    return { success: true, decision: validated.data.decision };
  } catch (err) {
    return {
      success: false,
      error: `Failed to parse JSON: ${err instanceof Error ? err.message : 'Unknown error'}`
    };
  }
}

/**
 * Validates that the selected issue ID exists in the available issues.
 * Pure function.
 */
export function validateSelectedIssue(
  selectedId: string,
  availableIssues: NormalizedIssue[]
): NormalizedIssue | null {
  return availableIssues.find(issue => issue.identifier === selectedId) ?? null;
}

/**
 * Main prioritization function. Calls Claude to decide which issue to tackle next.
 *
 * @param issues - Available issues to choose from
 * @param completedTask - Context from just-completed task (optional)
 * @param config - Ralphy configuration
 * @param options - Prioritization options
 * @returns The selected issue or fallback to first issue on error
 */
export async function prioritizeNextTask(
  issues: NormalizedIssue[],
  completedTask: CompletedTaskContext | null,
  _config: RalphyConfigV2,
  options: PrioritizationOptions = {}
): Promise<PrioritizeResult> {
  const {
    timeout = 30000,
    model = 'haiku',
    verbose = false,
  } = options;

  // If only one issue, no need to prioritize
  if (issues.length === 1) {
    const issue = issues[0];
    if (!issue) {
      return {
        success: false,
        error: 'No issues available',
        fallbackIssue: issues[0]!,
      };
    }
    return {
      success: true,
      decision: {
        selectedIssueId: issue.identifier,
        reasoning: 'Only one issue available',
        confidence: 'high',
      },
      selectedIssue: issue,
    };
  }

  // Build appropriate prompt
  const prompt = completedTask
    ? buildReprioritizationPrompt(issues, completedTask)
    : buildInitialPrioritizationPrompt(issues);

  // Execute Claude
  const result = await executeClaude({
    prompt,
    model,
    timeout,
    autoAccept: false, // Prioritization doesn't need file access
    verbose,
  });

  // Fallback issue (first in list)
  const fallbackIssue = issues[0]!;

  if (!result.success) {
    logger.warn(`Prioritization failed: ${result.error}. Falling back to FIFO.`);
    return {
      success: false,
      error: result.error,
      fallbackIssue,
    };
  }

  // Parse the response
  const parseResult = parsePrioritizationResponse(result.data.output);
  if (!parseResult.success) {
    logger.warn(`Failed to parse prioritization response: ${parseResult.error}. Falling back to FIFO.`);
    return {
      success: false,
      error: parseResult.error,
      fallbackIssue,
    };
  }

  const decision = parseResult.decision;

  // Validate the selected issue exists
  const selectedIssue = validateSelectedIssue(decision.selectedIssueId, issues);
  if (!selectedIssue) {
    logger.warn(`Selected issue ${decision.selectedIssueId} not found in queue. Falling back to FIFO.`);
    return {
      success: false,
      error: `Selected issue ${decision.selectedIssueId} not found in available issues`,
      fallbackIssue,
    };
  }

  return {
    success: true,
    decision,
    selectedIssue,
  };
}

/**
 * Formats the prioritization decision for display.
 * Pure function.
 */
export function formatPrioritizationDecision(decision: PrioritizationDecision): string {
  const confidenceEmoji = decision.confidence === 'high' ? '++' :
    decision.confidence === 'medium' ? '+' : '?';

  return `Selected: ${decision.selectedIssueId} [${confidenceEmoji}${decision.confidence}]\n  Reason: ${decision.reasoning}`;
}
