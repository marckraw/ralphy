import { describe, it, expect } from 'vitest';
import {
  parseIssue,
  parseIssues,
  parseProject,
  parseProjects,
  parseTeam,
  parseTeams,
  getPriorityLabel,
  PRIORITY_LABELS,
} from '../../src/types/linear.js';

describe('Linear Types', () => {
  describe('parseIssue', () => {
    const validIssue = {
      id: 'issue-123',
      identifier: 'PROJ-42',
      title: 'Fix the bug',
      description: 'A detailed description',
      priority: 2,
      state: {
        id: 'state-1',
        name: 'In Progress',
        type: 'started',
      },
      labels: [
        { id: 'label-1', name: 'ralph-ready' },
      ],
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-02T00:00:00.000Z',
    };

    it('should parse a valid issue', () => {
      const result = parseIssue(validIssue);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe('issue-123');
        expect(result.data.identifier).toBe('PROJ-42');
        expect(result.data.title).toBe('Fix the bug');
        expect(result.data.priority).toBe(2);
        expect(result.data.state.name).toBe('In Progress');
      }
    });

    it('should handle issue without description', () => {
      const issueWithoutDesc = { ...validIssue, description: undefined };
      const result = parseIssue(issueWithoutDesc);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.description).toBeUndefined();
      }
    });

    it('should reject issue missing required fields', () => {
      const invalidIssue = { id: 'issue-123' };
      const result = parseIssue(invalidIssue);
      expect(result.success).toBe(false);
    });

    it('should coerce date strings to Date objects', () => {
      const result = parseIssue(validIssue);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.createdAt).toBeInstanceOf(Date);
        expect(result.data.updatedAt).toBeInstanceOf(Date);
      }
    });
  });

  describe('parseIssues', () => {
    it('should parse an array of valid issues', () => {
      const issues = [
        {
          id: 'issue-1',
          identifier: 'PROJ-1',
          title: 'First',
          priority: 1,
          state: { id: 's1', name: 'Open', type: 'unstarted' },
          labels: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'issue-2',
          identifier: 'PROJ-2',
          title: 'Second',
          priority: 2,
          state: { id: 's2', name: 'Done', type: 'completed' },
          labels: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const result = parseIssues(issues);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(2);
      }
    });

    it('should reject non-array input', () => {
      const result = parseIssues('not an array');
      expect(result.success).toBe(false);
    });

    it('should reject if any issue is invalid', () => {
      const issues = [
        {
          id: 'issue-1',
          identifier: 'PROJ-1',
          title: 'Valid',
          priority: 1,
          state: { id: 's1', name: 'Open', type: 'unstarted' },
          labels: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        { id: 'invalid' }, // Missing required fields
      ];

      const result = parseIssues(issues);
      expect(result.success).toBe(false);
    });
  });

  describe('parseProject', () => {
    it('should parse a valid project', () => {
      const project = {
        id: 'proj-123',
        name: 'My Project',
        description: 'A great project',
        state: 'started',
      };

      const result = parseProject(project);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe('proj-123');
        expect(result.data.name).toBe('My Project');
        expect(result.data.state).toBe('started');
      }
    });

    it('should handle project without description', () => {
      const project = {
        id: 'proj-123',
        name: 'My Project',
        state: 'started',
      };

      const result = parseProject(project);
      expect(result.success).toBe(true);
    });
  });

  describe('parseProjects', () => {
    it('should parse an array of valid projects', () => {
      const projects = [
        { id: 'p1', name: 'Project 1', state: 'started' },
        { id: 'p2', name: 'Project 2', state: 'completed' },
      ];

      const result = parseProjects(projects);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(2);
      }
    });
  });

  describe('parseTeam', () => {
    it('should parse a valid team', () => {
      const team = {
        id: 'team-123',
        name: 'Engineering',
        key: 'ENG',
      };

      const result = parseTeam(team);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe('team-123');
        expect(result.data.name).toBe('Engineering');
        expect(result.data.key).toBe('ENG');
      }
    });
  });

  describe('parseTeams', () => {
    it('should parse an array of valid teams', () => {
      const teams = [
        { id: 't1', name: 'Team 1', key: 'T1' },
        { id: 't2', name: 'Team 2', key: 'T2' },
      ];

      const result = parseTeams(teams);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(2);
      }
    });
  });

  describe('getPriorityLabel', () => {
    it('should return correct labels for known priorities', () => {
      expect(getPriorityLabel(0)).toBe('No priority');
      expect(getPriorityLabel(1)).toBe('Urgent');
      expect(getPriorityLabel(2)).toBe('High');
      expect(getPriorityLabel(3)).toBe('Medium');
      expect(getPriorityLabel(4)).toBe('Low');
    });

    it('should return Unknown for invalid priorities', () => {
      expect(getPriorityLabel(5)).toBe('Unknown');
      expect(getPriorityLabel(-1)).toBe('Unknown');
      expect(getPriorityLabel(100)).toBe('Unknown');
    });
  });

  describe('PRIORITY_LABELS', () => {
    it('should have all priority levels defined', () => {
      expect(PRIORITY_LABELS[0]).toBe('No priority');
      expect(PRIORITY_LABELS[1]).toBe('Urgent');
      expect(PRIORITY_LABELS[2]).toBe('High');
      expect(PRIORITY_LABELS[3]).toBe('Medium');
      expect(PRIORITY_LABELS[4]).toBe('Low');
    });
  });
});
