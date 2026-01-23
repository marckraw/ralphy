/**
 * Unit tests for the task prioritizer pure functions.
 */

import { describe, test, expect } from 'bun:test';
import {
  buildInitialPrioritizationPrompt,
  buildReprioritizationPrompt,
  parsePrioritizationResponse,
  validateSelectedIssue,
  formatPrioritizationDecision,
  type CompletedTaskContext,
} from '../../src/services/claude/prioritizer.js';
import type { NormalizedIssue } from '@mrck-labs/ralphy-shared';

// Helper to create test issues
function createTestIssue(overrides: Partial<NormalizedIssue> = {}): NormalizedIssue {
  return {
    id: 'issue-1',
    identifier: 'TEST-1',
    title: 'Test Issue',
    description: 'A test issue description',
    priority: 'medium',
    state: { id: 'state-1', name: 'Todo', type: 'unstarted' },
    labels: [{ id: 'label-1', name: 'ralph-ready' }],
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-02'),
    url: 'https://linear.app/test/issue/TEST-1',
    ...overrides,
  };
}

describe('prioritizer pure functions', () => {
  describe('buildInitialPrioritizationPrompt', () => {
    test('should build prompt with all issue details', () => {
      const issues = [
        createTestIssue({ identifier: 'TEST-1', title: 'First Issue', priority: 'high' }),
        createTestIssue({ identifier: 'TEST-2', title: 'Second Issue', priority: 'low' }),
      ];

      const prompt = buildInitialPrioritizationPrompt(issues);

      expect(prompt).toContain('TEST-1');
      expect(prompt).toContain('First Issue');
      expect(prompt).toContain('High');
      expect(prompt).toContain('TEST-2');
      expect(prompt).toContain('Second Issue');
      expect(prompt).toContain('Low');
      expect(prompt).toContain('Select Next Issue');
    });

    test('should include description preview when available', () => {
      const issues = [
        createTestIssue({
          identifier: 'TEST-1',
          description: 'This is a detailed description of the issue.',
        }),
      ];

      const prompt = buildInitialPrioritizationPrompt(issues);

      expect(prompt).toContain('This is a detailed description');
    });

    test('should truncate long descriptions', () => {
      const longDescription = 'A'.repeat(300);
      const issues = [
        createTestIssue({ identifier: 'TEST-1', description: longDescription }),
      ];

      const prompt = buildInitialPrioritizationPrompt(issues);

      // Description should be truncated (only first 200 chars included)
      expect(prompt).toContain('...');
      // The prompt should not contain the full 300 char description
      expect(prompt).not.toContain('A'.repeat(250));
    });

    test('should include selection criteria', () => {
      const issues = [createTestIssue()];
      const prompt = buildInitialPrioritizationPrompt(issues);

      expect(prompt).toContain('Priority level');
      expect(prompt).toContain('Dependencies');
      expect(prompt).toContain('Complexity');
      expect(prompt).toContain('Relatedness');
    });
  });

  describe('buildReprioritizationPrompt', () => {
    test('should include completed task context', () => {
      const remainingIssues = [createTestIssue({ identifier: 'TEST-2' })];
      const completedTask: CompletedTaskContext = {
        identifier: 'TEST-1',
        title: 'Completed Task',
        status: 'completed',
        durationMs: 60000,
        iterations: 3,
      };

      const prompt = buildReprioritizationPrompt(remainingIssues, completedTask);

      expect(prompt).toContain('TEST-1');
      expect(prompt).toContain('Completed Task');
      expect(prompt).toContain('completed successfully');
      expect(prompt).toContain('60s');
      expect(prompt).toContain('3 iterations');
    });

    test('should handle max_iterations status', () => {
      const remainingIssues = [createTestIssue()];
      const completedTask: CompletedTaskContext = {
        identifier: 'TEST-1',
        title: 'Stopped Task',
        status: 'max_iterations',
        durationMs: 120000,
        iterations: 10,
      };

      const prompt = buildReprioritizationPrompt(remainingIssues, completedTask);

      expect(prompt).toContain('stopped at max iterations');
    });

    test('should handle error status', () => {
      const remainingIssues = [createTestIssue()];
      const completedTask: CompletedTaskContext = {
        identifier: 'TEST-1',
        title: 'Failed Task',
        status: 'error',
        durationMs: 5000,
        iterations: 1,
      };

      const prompt = buildReprioritizationPrompt(remainingIssues, completedTask);

      expect(prompt).toContain('encountered an error');
    });

    test('should include remaining issues', () => {
      const remainingIssues = [
        createTestIssue({ identifier: 'TEST-2', title: 'Remaining Issue 1' }),
        createTestIssue({ identifier: 'TEST-3', title: 'Remaining Issue 2' }),
      ];
      const completedTask: CompletedTaskContext = {
        identifier: 'TEST-1',
        title: 'Done',
        status: 'completed',
        durationMs: 1000,
        iterations: 1,
      };

      const prompt = buildReprioritizationPrompt(remainingIssues, completedTask);

      expect(prompt).toContain('TEST-2');
      expect(prompt).toContain('Remaining Issue 1');
      expect(prompt).toContain('TEST-3');
      expect(prompt).toContain('Remaining Issue 2');
    });
  });

  describe('parsePrioritizationResponse', () => {
    test('should parse valid JSON in code block', () => {
      const output = `Here's my decision:
\`\`\`json
{
  "decision": {
    "selectedIssueId": "TEST-42",
    "reasoning": "This is the highest priority task",
    "confidence": "high"
  }
}
\`\`\`
<prioritization>COMPLETE</prioritization>`;

      const result = parsePrioritizationResponse(output);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.decision.selectedIssueId).toBe('TEST-42');
        expect(result.decision.reasoning).toBe('This is the highest priority task');
        expect(result.decision.confidence).toBe('high');
      }
    });

    test('should parse raw JSON without code block', () => {
      const output = `{"decision": {"selectedIssueId": "TEST-1", "reasoning": "Only option", "confidence": "high"}}`;

      const result = parsePrioritizationResponse(output);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.decision.selectedIssueId).toBe('TEST-1');
      }
    });

    test('should return error for missing JSON', () => {
      const output = 'I think you should work on TEST-1 because it is important.';

      const result = parsePrioritizationResponse(output);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('No JSON found');
      }
    });

    test('should return error for invalid JSON', () => {
      const output = '```json\n{invalid json}\n```';

      const result = parsePrioritizationResponse(output);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Failed to parse JSON');
      }
    });

    test('should return error for missing required fields', () => {
      const output = '```json\n{"decision": {"selectedIssueId": "TEST-1"}}\n```';

      const result = parsePrioritizationResponse(output);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Invalid prioritization response');
      }
    });

    test('should return error for invalid confidence level', () => {
      const output = `\`\`\`json
{
  "decision": {
    "selectedIssueId": "TEST-1",
    "reasoning": "Some reason",
    "confidence": "very high"
  }
}
\`\`\``;

      const result = parsePrioritizationResponse(output);

      expect(result.success).toBe(false);
    });
  });

  describe('validateSelectedIssue', () => {
    test('should return issue when found', () => {
      const issues = [
        createTestIssue({ identifier: 'TEST-1' }),
        createTestIssue({ identifier: 'TEST-2', id: 'issue-2' }),
      ];

      const result = validateSelectedIssue('TEST-2', issues);

      expect(result).not.toBeNull();
      expect(result?.identifier).toBe('TEST-2');
    });

    test('should return null when not found', () => {
      const issues = [
        createTestIssue({ identifier: 'TEST-1' }),
        createTestIssue({ identifier: 'TEST-2', id: 'issue-2' }),
      ];

      const result = validateSelectedIssue('TEST-99', issues);

      expect(result).toBeNull();
    });

    test('should return null for empty issues array', () => {
      const result = validateSelectedIssue('TEST-1', []);

      expect(result).toBeNull();
    });
  });

  describe('formatPrioritizationDecision', () => {
    test('should format high confidence decision', () => {
      const decision = {
        selectedIssueId: 'TEST-1',
        reasoning: 'Highest priority item',
        confidence: 'high' as const,
      };

      const result = formatPrioritizationDecision(decision);

      expect(result).toContain('TEST-1');
      expect(result).toContain('++high');
      expect(result).toContain('Highest priority item');
    });

    test('should format medium confidence decision', () => {
      const decision = {
        selectedIssueId: 'TEST-2',
        reasoning: 'Reasonable choice',
        confidence: 'medium' as const,
      };

      const result = formatPrioritizationDecision(decision);

      expect(result).toContain('+medium');
    });

    test('should format low confidence decision', () => {
      const decision = {
        selectedIssueId: 'TEST-3',
        reasoning: 'Multiple options equally valid',
        confidence: 'low' as const,
      };

      const result = formatPrioritizationDecision(decision);

      expect(result).toContain('?low');
    });
  });
});
