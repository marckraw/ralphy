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

/**
 * Updates an issue's description in Linear.
 *
 * @param issueId - The issue ID or identifier (e.g., "PROJ-42")
 * @param description - The new description content
 * @returns Result indicating success or failure
 */
export async function updateIssueDescription(
  issueId: string,
  description: string
): Promise<Result<void>> {
  try {
    const client = getClient();

    // First fetch the issue to get its internal ID
    const issue = await client.issue(issueId);

    // Update the issue description
    await issue.update({ description });

    return { success: true, data: undefined };
  } catch (err) {
    return {
      success: false,
      error: `Failed to update issue: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}

/**
 * Fetches a label ID by its name.
 *
 * @param labelName - The name of the label to find
 * @returns Result containing the label ID or an error
 */
export async function getLabelIdByName(labelName: string): Promise<Result<string>> {
  try {
    const client = getClient();
    const labelsConnection = await client.issueLabels({
      filter: { name: { eq: labelName } },
    });

    const label = labelsConnection.nodes[0];
    if (!label) {
      return {
        success: false,
        error: `Label "${labelName}" not found`,
      };
    }

    return { success: true, data: label.id };
  } catch (err) {
    return {
      success: false,
      error: `Failed to fetch label: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}

/**
 * Pure function that computes the new set of label IDs after removing one label and adding another.
 *
 * @param currentLabelIds - Array of current label IDs
 * @param removeLabelId - ID of the label to remove
 * @param addLabelId - ID of the label to add
 * @returns New array of label IDs with the swap applied
 */
export function computeLabelSwap(
  currentLabelIds: string[],
  removeLabelId: string,
  addLabelId: string
): string[] {
  const filtered = currentLabelIds.filter((id) => id !== removeLabelId);
  if (!filtered.includes(addLabelId)) {
    filtered.push(addLabelId);
  }
  return filtered;
}

/**
 * Checks if a label exists in the given array of labels by name.
 *
 * @param labels - Array of labels with id and name
 * @param labelName - The name of the label to check
 * @returns True if the label exists, false otherwise
 */
export function hasLabelByName(
  labels: Array<{ id: string; name: string }>,
  labelName: string
): boolean {
  return labels.some((label) => label.name === labelName);
}

/**
 * Updates an issue's labels in Linear.
 *
 * @param issueId - The issue ID or identifier (e.g., "PROJ-42")
 * @param labelIds - The new array of label IDs
 * @returns Result indicating success or failure
 */
export async function updateIssueLabels(
  issueId: string,
  labelIds: string[]
): Promise<Result<void>> {
  try {
    const client = getClient();
    const issue = await client.issue(issueId);
    await issue.update({ labelIds });

    return { success: true, data: undefined };
  } catch (err) {
    return {
      success: false,
      error: `Failed to update issue labels: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}

/**
 * Adds a label to an issue if it doesn't already have it.
 *
 * @param issueId - The issue ID or identifier (e.g., "PROJ-42")
 * @param labelName - The name of the label to add
 * @returns Result indicating success or failure
 */
export async function addLabelToIssue(
  issueId: string,
  labelName: string
): Promise<Result<void>> {
  // First fetch the issue to get current labels
  const issueResult = await fetchIssueById(issueId);
  if (!issueResult.success) {
    return issueResult;
  }

  const issue = issueResult.data;

  // Check if issue already has the label
  if (hasLabelByName(issue.labels, labelName)) {
    return { success: true, data: undefined };
  }

  // Get the label ID
  const labelIdResult = await getLabelIdByName(labelName);
  if (!labelIdResult.success) {
    return labelIdResult;
  }

  // Add the new label to existing labels
  const currentLabelIds = issue.labels.map((l) => l.id);
  const newLabelIds = [...currentLabelIds, labelIdResult.data];

  return updateIssueLabels(issueId, newLabelIds);
}

/**
 * Filters issues to only those that don't have a specific label.
 *
 * @param issues - Array of LinearIssue objects
 * @param labelName - The name of the label to filter out
 * @returns Array of issues that don't have the specified label
 */
export function filterUnenrichedIssues(
  issues: LinearIssue[],
  labelName: string
): LinearIssue[] {
  return issues.filter((issue) => !hasLabelByName(issue.labels, labelName));
}

interface PromoteResult {
  previousLabels: string[];
  newLabels: string[];
}

/**
 * Promotes an issue from candidate to ready by swapping labels.
 * Removes the candidate label and adds the ready label.
 *
 * @param issueId - The issue ID or identifier (e.g., "PROJ-42")
 * @param candidateLabelName - Name of the candidate label to remove
 * @param readyLabelName - Name of the ready label to add
 * @returns Result containing the label change information or an error
 */
export async function promoteToReady(
  issueId: string,
  candidateLabelName: string,
  readyLabelName: string
): Promise<Result<PromoteResult>> {
  // First, fetch the issue to verify it exists and get current labels
  const issueResult = await fetchIssueById(issueId);
  if (!issueResult.success) {
    return issueResult;
  }

  const issue = issueResult.data;

  // Check if issue has the candidate label
  if (!hasLabelByName(issue.labels, candidateLabelName)) {
    return {
      success: false,
      error: `Issue ${issue.identifier} does not have the "${candidateLabelName}" label`,
    };
  }

  // Fetch the label IDs for both labels
  const [candidateLabelResult, readyLabelResult] = await Promise.all([
    getLabelIdByName(candidateLabelName),
    getLabelIdByName(readyLabelName),
  ]);

  if (!candidateLabelResult.success) {
    return candidateLabelResult;
  }
  if (!readyLabelResult.success) {
    return readyLabelResult;
  }

  const candidateLabelId = candidateLabelResult.data;
  const readyLabelId = readyLabelResult.data;

  // Compute the new label set
  const currentLabelIds = issue.labels.map((l) => l.id);
  const newLabelIds = computeLabelSwap(currentLabelIds, candidateLabelId, readyLabelId);

  // Update the issue
  const updateResult = await updateIssueLabels(issueId, newLabelIds);
  if (!updateResult.success) {
    return updateResult;
  }

  return {
    success: true,
    data: {
      previousLabels: issue.labels.map((l) => l.name),
      newLabels: newLabelIds.map((id) => {
        if (id === readyLabelId) return readyLabelName;
        const existingLabel = issue.labels.find((l) => l.id === id);
        return existingLabel?.name ?? id;
      }),
    },
  };
}
