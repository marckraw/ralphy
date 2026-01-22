import { describe, it, expect } from 'vitest';
import { shouldProcessIssuePure } from '../../src/commands/watch.js';
import type { NormalizedIssue } from '@mrck-labs/ralphy-shared';

/**
 * Helper to create a mock NormalizedIssue for testing.
 */
function createMockIssue(
  id: string,
  identifier: string,
  stateType: string,
  stateName: string
): NormalizedIssue {
  return {
    id,
    identifier,
    title: `Test issue ${identifier}`,
    description: 'Test description',
    priority: 2,
    state: {
      id: 'state-id',
      name: stateName,
      type: stateType,
    },
    labels: [],
    url: `https://linear.app/test/${identifier}`,
  };
}

describe('watch command pure functions', () => {
  describe('shouldProcessIssuePure', () => {
    it('should return true for actionable issue not in processed set', () => {
      const issue = createMockIssue('issue-1', 'PROJ-1', 'started', 'In Progress');
      const processedIds = new Set<string>();

      const result = shouldProcessIssuePure(issue, processedIds);

      expect(result).toBe(true);
    });

    it('should return false for issue already in processed set', () => {
      const issue = createMockIssue('issue-1', 'PROJ-1', 'started', 'In Progress');
      const processedIds = new Set<string>(['issue-1']);

      const result = shouldProcessIssuePure(issue, processedIds);

      expect(result).toBe(false);
    });

    it('should return false for issue in "completed" state type', () => {
      const issue = createMockIssue('issue-2', 'PROJ-2', 'completed', 'Done');
      const processedIds = new Set<string>();

      const result = shouldProcessIssuePure(issue, processedIds);

      expect(result).toBe(false);
    });

    it('should return false for issue in "canceled" state type', () => {
      const issue = createMockIssue('issue-3', 'PROJ-3', 'canceled', 'Cancelled');
      const processedIds = new Set<string>();

      const result = shouldProcessIssuePure(issue, processedIds);

      expect(result).toBe(false);
    });

    it('should return false for issue with "In Review" state name', () => {
      const issue = createMockIssue('issue-4', 'PROJ-4', 'started', 'In Review');
      const processedIds = new Set<string>();

      const result = shouldProcessIssuePure(issue, processedIds);

      expect(result).toBe(false);
    });

    it('should return false for issue with "Done" state name', () => {
      const issue = createMockIssue('issue-5', 'PROJ-5', 'unstarted', 'Done');
      const processedIds = new Set<string>();

      const result = shouldProcessIssuePure(issue, processedIds);

      expect(result).toBe(false);
    });

    it('should return true for issue in "Backlog" state', () => {
      const issue = createMockIssue('issue-6', 'PROJ-6', 'backlog', 'Backlog');
      const processedIds = new Set<string>();

      const result = shouldProcessIssuePure(issue, processedIds);

      expect(result).toBe(true);
    });

    it('should return true for issue in "Todo" state', () => {
      const issue = createMockIssue('issue-7', 'PROJ-7', 'unstarted', 'Todo');
      const processedIds = new Set<string>();

      const result = shouldProcessIssuePure(issue, processedIds);

      expect(result).toBe(true);
    });

    it('should handle case-insensitive state name matching', () => {
      const issue = createMockIssue('issue-8', 'PROJ-8', 'started', 'IN REVIEW');
      const processedIds = new Set<string>();

      const result = shouldProcessIssuePure(issue, processedIds);

      expect(result).toBe(false);
    });

    it('should return false when both conditions fail (processed AND completed)', () => {
      const issue = createMockIssue('issue-9', 'PROJ-9', 'completed', 'Done');
      const processedIds = new Set<string>(['issue-9']);

      const result = shouldProcessIssuePure(issue, processedIds);

      expect(result).toBe(false);
    });

    it('should correctly filter multiple issues', () => {
      const issues = [
        createMockIssue('issue-1', 'PROJ-1', 'started', 'In Progress'),
        createMockIssue('issue-2', 'PROJ-2', 'completed', 'Done'),
        createMockIssue('issue-3', 'PROJ-3', 'started', 'In Review'),
        createMockIssue('issue-4', 'PROJ-4', 'unstarted', 'Backlog'),
        createMockIssue('issue-5', 'PROJ-5', 'started', 'In Progress'),
      ];
      const processedIds = new Set<string>(['issue-1']);

      const actionable = issues.filter(issue => shouldProcessIssuePure(issue, processedIds));

      expect(actionable).toHaveLength(2);
      expect(actionable[0]?.identifier).toBe('PROJ-4');
      expect(actionable[1]?.identifier).toBe('PROJ-5');
    });
  });
});
