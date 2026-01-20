import { describe, it, expect } from 'vitest';
import {
  parseHistoryRun,
  calculateHistorySummary,
  extractConfigStatus,
  formatDuration,
  formatRelativeTime,
  formatStatusSymbol,
  type HistoryRun,
} from '../../src/commands/status.js';
import type { RalphyConfigV2 } from '@mrck-labs/ralphy-shared';

describe('status command pure functions', () => {
  describe('parseHistoryRun', () => {
    it('should parse a valid history run', () => {
      const raw = {
        identifier: 'MAR-123',
        startedAt: '2026-01-19T12:00:00.000Z',
        completedAt: '2026-01-19T12:30:00.000Z',
        status: 'completed',
        iterations: 5,
        totalDurationMs: 1800000,
      };

      const result = parseHistoryRun(raw);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.identifier).toBe('MAR-123');
        expect(result.data.status).toBe('completed');
        expect(result.data.iterations).toBe(5);
      }
    });

    it('should parse a run without completedAt', () => {
      const raw = {
        identifier: 'MAR-456',
        startedAt: '2026-01-19T12:00:00.000Z',
        status: 'in-progress',
        iterations: 2,
        totalDurationMs: 60000,
      };

      const result = parseHistoryRun(raw);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.completedAt).toBeUndefined();
        expect(result.data.status).toBe('in-progress');
      }
    });

    it('should reject invalid status values', () => {
      const raw = {
        identifier: 'MAR-789',
        startedAt: '2026-01-19T12:00:00.000Z',
        status: 'invalid-status',
        iterations: 1,
        totalDurationMs: 1000,
      };

      const result = parseHistoryRun(raw);

      expect(result.success).toBe(false);
    });

    it('should reject missing required fields', () => {
      const raw = {
        identifier: 'MAR-999',
        status: 'completed',
      };

      const result = parseHistoryRun(raw);

      expect(result.success).toBe(false);
    });
  });

  describe('calculateHistorySummary', () => {
    const createRun = (
      id: string,
      status: 'completed' | 'failed' | 'in-progress',
      startedAt: string,
      durationMs: number = 60000
    ): HistoryRun => ({
      identifier: id,
      startedAt,
      completedAt: status !== 'in-progress' ? startedAt : undefined,
      status,
      iterations: 1,
      totalDurationMs: durationMs,
    });

    it('should calculate summary for empty runs', () => {
      const summary = calculateHistorySummary([]);

      expect(summary.totalRuns).toBe(0);
      expect(summary.completedRuns).toBe(0);
      expect(summary.failedRuns).toBe(0);
      expect(summary.inProgressRuns).toBe(0);
      expect(summary.completionRate).toBe(0);
      expect(summary.recentRuns).toHaveLength(0);
    });

    it('should calculate summary for multiple runs', () => {
      const runs: HistoryRun[] = [
        createRun('MAR-1', 'completed', '2026-01-19T12:00:00.000Z'),
        createRun('MAR-2', 'completed', '2026-01-19T13:00:00.000Z'),
        createRun('MAR-3', 'failed', '2026-01-19T14:00:00.000Z'),
        createRun('MAR-4', 'in-progress', '2026-01-19T15:00:00.000Z'),
      ];

      const summary = calculateHistorySummary(runs);

      expect(summary.totalRuns).toBe(4);
      expect(summary.completedRuns).toBe(2);
      expect(summary.failedRuns).toBe(1);
      expect(summary.inProgressRuns).toBe(1);
      expect(summary.completionRate).toBe(50);
    });

    it('should return runs sorted by startedAt descending', () => {
      const runs: HistoryRun[] = [
        createRun('MAR-1', 'completed', '2026-01-19T10:00:00.000Z'),
        createRun('MAR-3', 'completed', '2026-01-19T14:00:00.000Z'),
        createRun('MAR-2', 'completed', '2026-01-19T12:00:00.000Z'),
      ];

      const summary = calculateHistorySummary(runs);

      expect(summary.recentRuns[0].identifier).toBe('MAR-3');
      expect(summary.recentRuns[1].identifier).toBe('MAR-2');
      expect(summary.recentRuns[2].identifier).toBe('MAR-1');
    });

    it('should limit recent runs to specified limit', () => {
      const runs: HistoryRun[] = [
        createRun('MAR-1', 'completed', '2026-01-19T10:00:00.000Z'),
        createRun('MAR-2', 'completed', '2026-01-19T11:00:00.000Z'),
        createRun('MAR-3', 'completed', '2026-01-19T12:00:00.000Z'),
        createRun('MAR-4', 'completed', '2026-01-19T13:00:00.000Z'),
        createRun('MAR-5', 'completed', '2026-01-19T14:00:00.000Z'),
        createRun('MAR-6', 'completed', '2026-01-19T15:00:00.000Z'),
      ];

      const summary = calculateHistorySummary(runs, 3);

      expect(summary.recentRuns).toHaveLength(3);
      expect(summary.recentRuns[0].identifier).toBe('MAR-6');
    });

    it('should calculate 100% completion rate for all completed', () => {
      const runs: HistoryRun[] = [
        createRun('MAR-1', 'completed', '2026-01-19T12:00:00.000Z'),
        createRun('MAR-2', 'completed', '2026-01-19T13:00:00.000Z'),
      ];

      const summary = calculateHistorySummary(runs);

      expect(summary.completionRate).toBe(100);
    });
  });

  describe('extractConfigStatus', () => {
    it('should extract Linear config status', () => {
      const config: RalphyConfigV2 = {
        version: 2,
        provider: {
          type: 'linear',
          config: {
            apiKey: 'lin_api_key',
            projectId: 'proj-123',
            projectName: 'My Project',
            teamId: 'team-456',
          },
        },
        labels: {
          candidate: 'ralph-candidate',
          ready: 'ralph-ready',
          enriched: 'ralph-enriched',
        },
        claude: {
          maxIterations: 20,
          timeout: 300000,
          model: 'sonnet',
        },
      };

      const status = extractConfigStatus(config);

      expect(status.initialized).toBe(true);
      expect(status.providerType).toBe('linear');
      expect(status.projectName).toBe('My Project');
      expect(status.teamId).toBe('team-456');
      expect(status.labels).toEqual({
        candidate: 'ralph-candidate',
        ready: 'ralph-ready',
        enriched: 'ralph-enriched',
      });
      expect(status.claude).toEqual({
        maxIterations: 20,
        timeout: 300000,
        model: 'sonnet',
      });
    });

    it('should extract Jira config status', () => {
      const config: RalphyConfigV2 = {
        version: 2,
        provider: {
          type: 'jira',
          config: {
            host: 'https://mycompany.atlassian.net',
            email: 'user@company.com',
            apiToken: 'jira_token',
            projectKey: 'PROJ',
            projectId: 'jira-proj-123',
            projectName: 'Jira Project',
          },
        },
        labels: {
          candidate: 'ralph-candidate',
          ready: 'ralph-ready',
          enriched: 'ralph-enriched',
        },
        claude: {
          maxIterations: 15,
          timeout: 600000,
          model: 'opus',
        },
      };

      const status = extractConfigStatus(config);

      expect(status.initialized).toBe(true);
      expect(status.providerType).toBe('jira');
      expect(status.projectName).toBe('Jira Project');
      expect(status.teamId).toBe('PROJ');
    });
  });

  describe('formatDuration', () => {
    it('should format seconds', () => {
      expect(formatDuration(5000)).toBe('5s');
      expect(formatDuration(45000)).toBe('45s');
    });

    it('should format minutes and seconds', () => {
      expect(formatDuration(60000)).toBe('1m 0s');
      expect(formatDuration(90000)).toBe('1m 30s');
      expect(formatDuration(300000)).toBe('5m 0s');
      expect(formatDuration(365000)).toBe('6m 5s');
    });

    it('should format hours and minutes', () => {
      expect(formatDuration(3600000)).toBe('1h 0m');
      expect(formatDuration(5400000)).toBe('1h 30m');
      expect(formatDuration(7200000)).toBe('2h 0m');
    });

    it('should handle zero duration', () => {
      expect(formatDuration(0)).toBe('0s');
    });
  });

  describe('formatRelativeTime', () => {
    it('should format "just now" for recent times', () => {
      const now = new Date();
      const result = formatRelativeTime(now.toISOString());
      expect(result).toBe('just now');
    });

    it('should format minutes ago', () => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const result = formatRelativeTime(fiveMinutesAgo.toISOString());
      expect(result).toBe('5 minutes ago');
    });

    it('should format "1 minute ago" correctly', () => {
      const oneMinuteAgo = new Date(Date.now() - 1 * 60 * 1000);
      const result = formatRelativeTime(oneMinuteAgo.toISOString());
      expect(result).toBe('1 minute ago');
    });

    it('should format hours ago', () => {
      const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
      const result = formatRelativeTime(threeHoursAgo.toISOString());
      expect(result).toBe('3 hours ago');
    });

    it('should format "1 hour ago" correctly', () => {
      const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000);
      const result = formatRelativeTime(oneHourAgo.toISOString());
      expect(result).toBe('1 hour ago');
    });

    it('should format days ago', () => {
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      const result = formatRelativeTime(twoDaysAgo.toISOString());
      expect(result).toBe('2 days ago');
    });

    it('should format "1 day ago" correctly', () => {
      const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
      const result = formatRelativeTime(oneDayAgo.toISOString());
      expect(result).toBe('1 day ago');
    });
  });

  describe('formatStatusSymbol', () => {
    it('should return check for completed', () => {
      expect(formatStatusSymbol('completed')).toBe('✓');
    });

    it('should return X for failed', () => {
      expect(formatStatusSymbol('failed')).toBe('✗');
    });

    it('should return ellipsis for in-progress', () => {
      expect(formatStatusSymbol('in-progress')).toBe('⋯');
    });

    it('should return question mark for unknown', () => {
      expect(formatStatusSymbol('unknown')).toBe('?');
    });
  });
});
