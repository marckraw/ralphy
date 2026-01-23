/**
 * Unit tests for the prioritizer schema validation.
 */

import { describe, test, expect } from 'bun:test';
import {
  PrioritizationDecisionSchema,
  PrioritizationResponseSchema,
  ConfidenceLevelSchema,
  validatePrioritizationResponse,
} from '../../src/services/claude/prioritizer.schema.js';

describe('prioritizer schema', () => {
  describe('ConfidenceLevelSchema', () => {
    test('should accept "high"', () => {
      const result = ConfidenceLevelSchema.safeParse('high');
      expect(result.success).toBe(true);
    });

    test('should accept "medium"', () => {
      const result = ConfidenceLevelSchema.safeParse('medium');
      expect(result.success).toBe(true);
    });

    test('should accept "low"', () => {
      const result = ConfidenceLevelSchema.safeParse('low');
      expect(result.success).toBe(true);
    });

    test('should reject invalid values', () => {
      const result = ConfidenceLevelSchema.safeParse('very-high');
      expect(result.success).toBe(false);
    });
  });

  describe('PrioritizationDecisionSchema', () => {
    test('should accept valid decision', () => {
      const decision = {
        selectedIssueId: 'TEST-1',
        reasoning: 'This is the most important task',
        confidence: 'high',
      };

      const result = PrioritizationDecisionSchema.safeParse(decision);
      expect(result.success).toBe(true);
    });

    test('should reject empty selectedIssueId', () => {
      const decision = {
        selectedIssueId: '',
        reasoning: 'Some reason',
        confidence: 'high',
      };

      const result = PrioritizationDecisionSchema.safeParse(decision);
      expect(result.success).toBe(false);
    });

    test('should reject empty reasoning', () => {
      const decision = {
        selectedIssueId: 'TEST-1',
        reasoning: '',
        confidence: 'high',
      };

      const result = PrioritizationDecisionSchema.safeParse(decision);
      expect(result.success).toBe(false);
    });

    test('should reject missing fields', () => {
      const partial = {
        selectedIssueId: 'TEST-1',
      };

      const result = PrioritizationDecisionSchema.safeParse(partial);
      expect(result.success).toBe(false);
    });
  });

  describe('PrioritizationResponseSchema', () => {
    test('should accept valid response', () => {
      const response = {
        decision: {
          selectedIssueId: 'TEST-42',
          reasoning: 'Urgent priority',
          confidence: 'high',
        },
      };

      const result = PrioritizationResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    test('should reject response without decision', () => {
      const response = {};

      const result = PrioritizationResponseSchema.safeParse(response);
      expect(result.success).toBe(false);
    });
  });

  describe('validatePrioritizationResponse', () => {
    test('should return success with valid data', () => {
      const raw = {
        decision: {
          selectedIssueId: 'TEST-1',
          reasoning: 'Best choice',
          confidence: 'medium',
        },
      };

      const result = validatePrioritizationResponse(raw);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.decision.selectedIssueId).toBe('TEST-1');
        expect(result.data.decision.confidence).toBe('medium');
      }
    });

    test('should return error with invalid data', () => {
      const raw = {
        decision: {
          selectedIssueId: 'TEST-1',
          // missing required fields
        },
      };

      const result = validatePrioritizationResponse(raw);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Invalid prioritization response');
      }
    });

    test('should return error for null input', () => {
      const result = validatePrioritizationResponse(null);

      expect(result.success).toBe(false);
    });

    test('should return error for non-object input', () => {
      const result = validatePrioritizationResponse('not an object');

      expect(result.success).toBe(false);
    });
  });
});
