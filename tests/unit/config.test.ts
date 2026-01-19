import { describe, it, expect } from 'vitest';
import {
  parseConfig,
  createDefaultConfig,
  RalphyConfigV1Schema,
  DEFAULT_LABELS,
  DEFAULT_CLAUDE_CONFIG,
} from '../../src/types/config.js';

describe('Config Types', () => {
  describe('parseConfig', () => {
    it('should parse a valid config', () => {
      const validConfig = {
        version: 1,
        linear: {
          apiKey: 'lin_api_xxx',
          projectId: 'proj-123',
          projectName: 'Test Project',
          teamId: 'team-456',
          labels: {
            ready: 'ralph-ready',
            candidate: 'ralph-candidate',
          },
        },
        claude: {
          maxIterations: 20,
          timeout: 300000,
        },
      };

      const result = parseConfig(validConfig);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.version).toBe(1);
        expect(result.data.linear.apiKey).toBe('lin_api_xxx');
        expect(result.data.linear.projectId).toBe('proj-123');
        expect(result.data.linear.projectName).toBe('Test Project');
        expect(result.data.linear.teamId).toBe('team-456');
      }
    });

    it('should reject config with wrong version', () => {
      const invalidConfig = {
        version: 2,
        linear: {
          apiKey: 'lin_api_xxx',
          projectId: 'proj-123',
          projectName: 'Test Project',
          teamId: 'team-456',
          labels: {
            ready: 'ralph-ready',
            candidate: 'ralph-candidate',
          },
        },
        claude: {
          maxIterations: 20,
          timeout: 300000,
        },
      };

      const result = parseConfig(invalidConfig);
      expect(result.success).toBe(false);
    });

    it('should reject config missing required fields', () => {
      const invalidConfig = {
        version: 1,
        linear: {
          apiKey: 'lin_api_xxx',
          projectId: '',
          projectName: 'Test',
          teamId: 'team-456',
          labels: {
            ready: 'ralph-ready',
            candidate: 'ralph-candidate',
          },
        },
        claude: {
          maxIterations: 20,
          timeout: 300000,
        },
      };

      const result = parseConfig(invalidConfig);
      expect(result.success).toBe(false);
    });

    it('should reject non-object input', () => {
      const result = parseConfig('not an object');
      expect(result.success).toBe(false);
    });

    it('should reject null input', () => {
      const result = parseConfig(null);
      expect(result.success).toBe(false);
    });
  });

  describe('createDefaultConfig', () => {
    it('should create config with default values', () => {
      const config = createDefaultConfig('lin_api_xxx', 'proj-123', 'My Project', 'team-456');

      expect(config.version).toBe(1);
      expect(config.linear.apiKey).toBe('lin_api_xxx');
      expect(config.linear.projectId).toBe('proj-123');
      expect(config.linear.projectName).toBe('My Project');
      expect(config.linear.teamId).toBe('team-456');
      expect(config.linear.labels).toEqual(DEFAULT_LABELS);
      expect(config.claude).toEqual(DEFAULT_CLAUDE_CONFIG);
    });

    it('should create valid config that passes schema validation', () => {
      const config = createDefaultConfig('lin_api_xxx', 'proj-123', 'My Project', 'team-456');
      const result = RalphyConfigV1Schema.safeParse(config);

      expect(result.success).toBe(true);
    });
  });

  describe('DEFAULT_LABELS', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_LABELS.ready).toBe('ralph-ready');
      expect(DEFAULT_LABELS.candidate).toBe('ralph-candidate');
    });
  });

  describe('DEFAULT_CLAUDE_CONFIG', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_CLAUDE_CONFIG.maxIterations).toBe(20);
      expect(DEFAULT_CLAUDE_CONFIG.timeout).toBe(300000);
    });
  });
});
