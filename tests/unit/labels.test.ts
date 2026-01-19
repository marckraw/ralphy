import { describe, it, expect } from 'vitest';
import { computeLabelSwap, hasLabelByName, filterUnenrichedIssues } from '../../src/services/linear/issues.js';
import type { LinearIssue } from '../../src/types/linear.js';

describe('Label manipulation functions', () => {
  describe('computeLabelSwap', () => {
    it('should remove old label and add new label', () => {
      const currentLabels = ['label-1', 'label-2', 'label-3'];
      const result = computeLabelSwap(currentLabels, 'label-2', 'label-4');

      expect(result).toEqual(['label-1', 'label-3', 'label-4']);
    });

    it('should not duplicate new label if it already exists', () => {
      const currentLabels = ['label-1', 'label-2', 'label-3'];
      const result = computeLabelSwap(currentLabels, 'label-2', 'label-1');

      expect(result).toEqual(['label-1', 'label-3']);
    });

    it('should handle removing non-existent label gracefully', () => {
      const currentLabels = ['label-1', 'label-2'];
      const result = computeLabelSwap(currentLabels, 'label-not-exist', 'label-3');

      expect(result).toEqual(['label-1', 'label-2', 'label-3']);
    });

    it('should work with empty label array', () => {
      const currentLabels: string[] = [];
      const result = computeLabelSwap(currentLabels, 'label-1', 'label-2');

      expect(result).toEqual(['label-2']);
    });

    it('should preserve order of remaining labels', () => {
      const currentLabels = ['a', 'b', 'c', 'd'];
      const result = computeLabelSwap(currentLabels, 'b', 'e');

      expect(result).toEqual(['a', 'c', 'd', 'e']);
    });

    it('should handle swapping label with itself (no-op)', () => {
      const currentLabels = ['label-1', 'label-2'];
      const result = computeLabelSwap(currentLabels, 'label-1', 'label-1');

      expect(result).toEqual(['label-2', 'label-1']);
    });
  });

  describe('hasLabelByName', () => {
    const labels = [
      { id: 'id-1', name: 'ralph-candidate' },
      { id: 'id-2', name: 'ralph-ready' },
      { id: 'id-3', name: 'bug' },
    ];

    it('should return true when label exists', () => {
      expect(hasLabelByName(labels, 'ralph-candidate')).toBe(true);
      expect(hasLabelByName(labels, 'ralph-ready')).toBe(true);
      expect(hasLabelByName(labels, 'bug')).toBe(true);
    });

    it('should return false when label does not exist', () => {
      expect(hasLabelByName(labels, 'non-existent')).toBe(false);
      expect(hasLabelByName(labels, 'Ralph-Candidate')).toBe(false); // case-sensitive
      expect(hasLabelByName(labels, '')).toBe(false);
    });

    it('should return false for empty labels array', () => {
      expect(hasLabelByName([], 'ralph-candidate')).toBe(false);
    });

    it('should match by name, not by id', () => {
      expect(hasLabelByName(labels, 'id-1')).toBe(false);
    });
  });

  describe('filterUnenrichedIssues', () => {
    const createMockIssue = (identifier: string, labelNames: string[]): LinearIssue => ({
      id: `id-${identifier}`,
      identifier,
      title: `Test issue ${identifier}`,
      description: 'Test description',
      priority: 2,
      state: { id: 'state-1', name: 'Todo', type: 'unstarted' },
      labels: labelNames.map((name, idx) => ({ id: `label-${idx}`, name })),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    it('should filter out issues with the enriched label', () => {
      const issues = [
        createMockIssue('PROJ-1', ['ralph-candidate']),
        createMockIssue('PROJ-2', ['ralph-candidate', 'ralph-enriched']),
        createMockIssue('PROJ-3', ['ralph-candidate', 'bug']),
      ];

      const result = filterUnenrichedIssues(issues, 'ralph-enriched');

      expect(result).toHaveLength(2);
      expect(result.map((i) => i.identifier)).toEqual(['PROJ-1', 'PROJ-3']);
    });

    it('should return all issues when none have the enriched label', () => {
      const issues = [
        createMockIssue('PROJ-1', ['ralph-candidate']),
        createMockIssue('PROJ-2', ['ralph-candidate', 'bug']),
        createMockIssue('PROJ-3', ['ralph-candidate', 'feature']),
      ];

      const result = filterUnenrichedIssues(issues, 'ralph-enriched');

      expect(result).toHaveLength(3);
    });

    it('should return empty array when all issues have the enriched label', () => {
      const issues = [
        createMockIssue('PROJ-1', ['ralph-candidate', 'ralph-enriched']),
        createMockIssue('PROJ-2', ['ralph-enriched', 'bug']),
      ];

      const result = filterUnenrichedIssues(issues, 'ralph-enriched');

      expect(result).toHaveLength(0);
    });

    it('should handle empty issues array', () => {
      const result = filterUnenrichedIssues([], 'ralph-enriched');

      expect(result).toHaveLength(0);
    });

    it('should handle custom enriched label names', () => {
      const issues = [
        createMockIssue('PROJ-1', ['ralph-candidate']),
        createMockIssue('PROJ-2', ['ralph-candidate', 'custom-enriched']),
      ];

      const result = filterUnenrichedIssues(issues, 'custom-enriched');

      expect(result).toHaveLength(1);
      expect(result[0].identifier).toBe('PROJ-1');
    });

    it('should be case-sensitive for label matching', () => {
      const issues = [
        createMockIssue('PROJ-1', ['Ralph-Enriched']),
        createMockIssue('PROJ-2', ['ralph-enriched']),
      ];

      const result = filterUnenrichedIssues(issues, 'ralph-enriched');

      expect(result).toHaveLength(1);
      expect(result[0].identifier).toBe('PROJ-1');
    });
  });
});
