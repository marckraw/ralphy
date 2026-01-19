import { getClient } from './client.js';
import {
  type LinearIssue,
  type Result,
  LinearIssueSchema,
} from '../../types/linear.js';
import { PaginationOrderBy } from '@linear/sdk';

interface FetchIssuesOptions {
  teamId: string;
  labelName: string;
  projectId?: string | undefined;
}

export async function fetchIssuesByLabel(options: FetchIssuesOptions): Promise<Result<LinearIssue[]>> {
  const { teamId, labelName, projectId } = options;

  try {
    const client = getClient();

    const issuesConnection = await client.issues({
      filter: {
        team: { id: { eq: teamId } },
        labels: { name: { eq: labelName } },
        ...(projectId ? { project: { id: { eq: projectId } } } : {}),
      },
      orderBy: PaginationOrderBy.UpdatedAt,
    });

    const issues: LinearIssue[] = [];

    for (const issue of issuesConnection.nodes) {
      const state = await issue.state;
      const labelsConnection = await issue.labels();

      const labels = labelsConnection.nodes.map((label) => ({
        id: label.id,
        name: label.name,
      }));

      const issueData = {
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        description: issue.description,
        priority: issue.priority,
        state: state
          ? {
              id: state.id,
              name: state.name,
              type: state.type,
            }
          : { id: '', name: 'Unknown', type: 'unknown' },
        labels,
        createdAt: issue.createdAt,
        updatedAt: issue.updatedAt,
      };

      const parsed = LinearIssueSchema.safeParse(issueData);

      if (parsed.success) {
        issues.push(parsed.data);
      }
    }

    return { success: true, data: issues };
  } catch (err) {
    return {
      success: false,
      error: `Failed to fetch issues: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}

export async function fetchCandidateIssues(
  teamId: string,
  labelName: string,
  projectId?: string
): Promise<Result<LinearIssue[]>> {
  return fetchIssuesByLabel({ teamId, labelName, projectId });
}

export async function fetchReadyIssues(
  teamId: string,
  labelName: string,
  projectId?: string
): Promise<Result<LinearIssue[]>> {
  return fetchIssuesByLabel({ teamId, labelName, projectId });
}

export async function fetchIssueById(issueId: string): Promise<Result<LinearIssue>> {
  try {
    const client = getClient();
    const issue = await client.issue(issueId);

    const state = await issue.state;
    const labelsConnection = await issue.labels();

    const labels = labelsConnection.nodes.map((label) => ({
      id: label.id,
      name: label.name,
    }));

    const issueData = {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description,
      priority: issue.priority,
      state: state
        ? {
            id: state.id,
            name: state.name,
            type: state.type,
          }
        : { id: '', name: 'Unknown', type: 'unknown' },
      labels,
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
    };

    const parsed = LinearIssueSchema.safeParse(issueData);

    if (!parsed.success) {
      return {
        success: false,
        error: 'Failed to parse issue data',
        details: parsed.error,
      };
    }

    return { success: true, data: parsed.data };
  } catch (err) {
    return {
      success: false,
      error: `Failed to fetch issue: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}
