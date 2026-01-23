/**
 * Zod schemas for validating Claude's task prioritization response.
 */

import { z } from 'zod';

/**
 * Confidence level for the prioritization decision.
 */
export const ConfidenceLevelSchema = z.enum(['high', 'medium', 'low']);
export type ConfidenceLevel = z.infer<typeof ConfidenceLevelSchema>;

/**
 * Schema for Claude's prioritization decision.
 */
export const PrioritizationDecisionSchema = z.object({
  selectedIssueId: z.string().min(1, 'Selected issue ID cannot be empty'),
  reasoning: z.string().min(1, 'Reasoning cannot be empty'),
  confidence: ConfidenceLevelSchema,
});

export type PrioritizationDecision = z.infer<typeof PrioritizationDecisionSchema>;

/**
 * Schema for the full Claude response wrapper.
 */
export const PrioritizationResponseSchema = z.object({
  decision: PrioritizationDecisionSchema,
});

export type PrioritizationResponse = z.infer<typeof PrioritizationResponseSchema>;

/**
 * Completion marker for prioritization output.
 */
export const PRIORITIZATION_COMPLETE_MARKER = '<prioritization>COMPLETE</prioritization>';

/**
 * Validates a raw parsed object against the prioritization response schema.
 */
export function validatePrioritizationResponse(
  raw: unknown
): { success: true; data: PrioritizationResponse } | { success: false; error: string } {
  const result = PrioritizationResponseSchema.safeParse(raw);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    error: `Invalid prioritization response: ${result.error.message}`,
  };
}
