import type { NormalizedIssue } from '../types/ticket-service.js';

/**
 * States that indicate an issue should be skipped (already done or in review).
 */
const SKIP_STATE_TYPES = ['completed', 'canceled'];
const SKIP_STATE_NAMES = ['done', 'in review', 'review', 'cancelled', 'canceled'];

/**
 * Checks if an issue is actionable (not completed/in-review).
 * Returns true if the issue should be shown by default.
 */
export function isIssueActionable(issue: NormalizedIssue): boolean {
  const stateType = issue.state.type.toLowerCase();
  const stateName = issue.state.name.toLowerCase();

  if (SKIP_STATE_TYPES.includes(stateType)) {
    return false;
  }

  for (const skipName of SKIP_STATE_NAMES) {
    if (stateName.includes(skipName)) {
      return false;
    }
  }

  return true;
}

/**
 * Filters issues to only include actionable ones (not completed/in-review).
 */
export function filterActionableIssues(issues: NormalizedIssue[]): NormalizedIssue[] {
  return issues.filter(isIssueActionable);
}
