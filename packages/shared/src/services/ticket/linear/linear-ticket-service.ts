import { LinearClient, PaginationOrderBy } from '@linear/sdk';
import type {
  LabelsConfig,
  LinearProviderConfig,
} from '../../../types/config.js';
import type {
  CreateIssueOptions,
  CreatedIssue,
  FetchIssuesByLabelOptions,
  NormalizedIssue,
  NormalizedLabel,
  NormalizedProject,
  NormalizedTeam,
  ProjectContext,
  Result,
  SwapResult,
  TicketService,
} from '../../../types/ticket-service.js';
import {
  normalizeLinearPriority,
  normalizedToLinearPriority,
} from '../../../types/ticket-service.js';

/**
 * TicketService implementation for Linear.
 */
export class LinearTicketService implements TicketService {
  readonly provider = 'linear' as const;

  private client: LinearClient;

  constructor(_config: LinearProviderConfig, _labels: LabelsConfig) {
    this.client = new LinearClient({ apiKey: _config.apiKey });
  }

  async validateConnection(): Promise<Result<boolean>> {
    try {
      const viewer = await this.client.viewer;
      return { success: true, data: viewer.id !== undefined };
    } catch (err) {
      return {
        success: false,
        error: `Failed to validate connection: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  }

  async fetchTeams(): Promise<Result<NormalizedTeam[]>> {
    try {
      const teamsConnection = await this.client.teams();
      const teams: NormalizedTeam[] = teamsConnection.nodes.map((team) => ({
        id: team.id,
        name: team.name,
        key: team.key,
      }));

      return { success: true, data: teams };
    } catch (err) {
      return {
        success: false,
        error: `Failed to fetch teams: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  }

  async fetchProjects(teamId?: string): Promise<Result<NormalizedProject[]>> {
    try {
      let projectsConnection;
      if (teamId) {
        const team = await this.client.team(teamId);
        projectsConnection = await team.projects();
      } else {
        projectsConnection = await this.client.projects();
      }

      const projects: NormalizedProject[] = projectsConnection.nodes.map(
        (project) => ({
          id: project.id,
          name: project.name,
          description: project.description ?? undefined,
        })
      );

      return { success: true, data: projects };
    } catch (err) {
      return {
        success: false,
        error: `Failed to fetch projects: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  }

  async fetchIssuesByLabel(
    options: FetchIssuesByLabelOptions
  ): Promise<Result<NormalizedIssue[]>> {
    const { teamId, labelName, projectId } = options;

    try {
      const issues: NormalizedIssue[] = [];
      let hasNextPage = true;
      let endCursor: string | null = null;

      // Paginate through all results
      while (hasNextPage) {
        const issuesConnection = await this.client.issues({
          filter: {
            team: { id: { eq: teamId } },
            labels: { name: { eq: labelName } },
            ...(projectId ? { project: { id: { eq: projectId } } } : {}),
          },
          orderBy: PaginationOrderBy.UpdatedAt,
          first: 100, // Fetch 100 at a time
          ...(endCursor ? { after: endCursor } : {}),
        });

        for (const issue of issuesConnection.nodes) {
          const state = await issue.state;
          const labelsConnection = await issue.labels();

          const labels = labelsConnection.nodes.map((label) => ({
            id: label.id,
            name: label.name,
          }));

          issues.push({
            id: issue.id,
            identifier: issue.identifier,
            title: issue.title,
            description: issue.description ?? undefined,
            priority: normalizeLinearPriority(issue.priority),
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
            url: issue.url,
          });
        }

        hasNextPage = issuesConnection.pageInfo.hasNextPage;
        endCursor = issuesConnection.pageInfo.endCursor ?? null;
      }

      return { success: true, data: issues };
    } catch (err) {
      return {
        success: false,
        error: `Failed to fetch issues: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  }

  async fetchIssueById(issueId: string): Promise<Result<NormalizedIssue>> {
    try {
      const issue = await this.client.issue(issueId);

      const state = await issue.state;
      const labelsConnection = await issue.labels();

      const labels = labelsConnection.nodes.map((label) => ({
        id: label.id,
        name: label.name,
      }));

      const normalizedIssue: NormalizedIssue = {
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        description: issue.description ?? undefined,
        priority: normalizeLinearPriority(issue.priority),
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
        url: issue.url,
      };

      return { success: true, data: normalizedIssue };
    } catch (err) {
      return {
        success: false,
        error: `Failed to fetch issue: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  }

  async fetchProjectContext(projectId: string): Promise<Result<ProjectContext>> {
    try {
      const project = await this.client.project(projectId);

      // Fetch external links from the project
      const externalLinksConnection = await project.externalLinks();
      const externalLinks = externalLinksConnection.nodes.map((link) => ({
        label: link.label,
        url: link.url,
      }));

      const projectContext: ProjectContext = {
        id: project.id,
        name: project.name,
        description: project.description ?? undefined,
        content: project.content ?? undefined,
        externalLinks,
      };

      return { success: true, data: projectContext };
    } catch (err) {
      return {
        success: false,
        error: `Failed to fetch project context: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  }

  async updateIssueDescription(
    issueId: string,
    description: string
  ): Promise<Result<void>> {
    try {
      const issue = await this.client.issue(issueId);
      await issue.update({ description });

      return { success: true, data: undefined };
    } catch (err) {
      return {
        success: false,
        error: `Failed to update issue: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  }

  async addLabelToIssue(
    issueId: string,
    labelName: string
  ): Promise<Result<void>> {
    const issueResult = await this.fetchIssueById(issueId);
    if (!issueResult.success) {
      return issueResult;
    }

    const issue = issueResult.data;

    // Check if issue already has the label
    if (this.hasLabelByName(issue.labels, labelName)) {
      return { success: true, data: undefined };
    }

    // Get team ID for label lookup
    const teamIdResult = await this.getTeamIdForIssue(issueId);
    if (!teamIdResult.success) {
      return teamIdResult;
    }

    // Get the label ID (filtered by team)
    const labelIdResult = await this.getLabelIdByName(labelName, teamIdResult.data);
    if (!labelIdResult.success) {
      return labelIdResult;
    }

    // Add the new label to existing labels
    const currentLabelIds = issue.labels.map((l: NormalizedLabel) => l.id);
    const newLabelIds = [...currentLabelIds, labelIdResult.data];

    return this.updateIssueLabels(issueId, newLabelIds);
  }

  async removeLabelFromIssue(
    issueId: string,
    labelName: string
  ): Promise<Result<void>> {
    const issueResult = await this.fetchIssueById(issueId);
    if (!issueResult.success) {
      return issueResult;
    }

    const issue = issueResult.data;

    // Check if issue has the label
    const labelToRemove = issue.labels.find((l: NormalizedLabel) => l.name === labelName);
    if (!labelToRemove) {
      return { success: true, data: undefined }; // Idempotent - already doesn't have it
    }

    // Remove the label
    const newLabelIds = issue.labels
      .filter((l: NormalizedLabel) => l.id !== labelToRemove.id)
      .map((l: NormalizedLabel) => l.id);

    return this.updateIssueLabels(issueId, newLabelIds);
  }

  async swapLabels(
    issueId: string,
    removeLabel: string,
    addLabel: string
  ): Promise<Result<SwapResult>> {
    const issueResult = await this.fetchIssueById(issueId);
    if (!issueResult.success) {
      return issueResult;
    }

    const issue = issueResult.data;

    // Check current state
    const hasRemoveLabel = this.hasLabelByName(issue.labels, removeLabel);
    const hasAddLabel = this.hasLabelByName(issue.labels, addLabel);

    if (!hasRemoveLabel && hasAddLabel) {
      // Already in target state
      return {
        success: true,
        data: {
          removed: null,
          added: null,
          alreadyHadTarget: true,
        },
      };
    }

    // Get team ID for label lookup
    const teamIdResult = await this.getTeamIdForIssue(issueId);
    if (!teamIdResult.success) {
      return teamIdResult;
    }
    const teamId = teamIdResult.data;

    // Get label IDs (filtered by team)
    const [removeLabelResult, addLabelResult] = await Promise.all([
      this.getLabelIdByName(removeLabel, teamId),
      this.getLabelIdByName(addLabel, teamId),
    ]);

    if (!removeLabelResult.success) {
      return removeLabelResult;
    }
    if (!addLabelResult.success) {
      return addLabelResult;
    }

    const removeLabelId = removeLabelResult.data;
    const addLabelId = addLabelResult.data;

    // Compute new label set
    const currentLabelIds = issue.labels.map((l: NormalizedLabel) => l.id);
    const newLabelIds = this.computeLabelSwap(
      currentLabelIds,
      removeLabelId,
      addLabelId
    );

    // Update issue
    const updateResult = await this.updateIssueLabels(issueId, newLabelIds);
    if (!updateResult.success) {
      return updateResult;
    }

    return {
      success: true,
      data: {
        removed: hasRemoveLabel ? removeLabel : null,
        added: !hasAddLabel ? addLabel : null,
        alreadyHadTarget: false,
      },
    };
  }

  async createIssue(options: CreateIssueOptions): Promise<Result<CreatedIssue>> {
    const { teamId, projectId, title, description, priority, labelNames, stateName } =
      options;

    try {
      // Resolve label names to IDs (filter by team to avoid cross-team label conflicts)
      const labelIds: string[] = [];
      if (labelNames && labelNames.length > 0) {
        for (const labelName of labelNames) {
          const labelIdResult = await this.getLabelIdByName(labelName, teamId);
          if (!labelIdResult.success) {
            return labelIdResult;
          }
          labelIds.push(labelIdResult.data);
        }
      }

      // Resolve state name to ID if provided
      let stateId: string | undefined;
      if (stateName) {
        const stateIdResult = await this.getStateIdByName(teamId, stateName);
        if (!stateIdResult.success) {
          return stateIdResult;
        }
        stateId = stateIdResult.data;
      }

      // Create the issue - only include optional fields if they have values
      // to satisfy exactOptionalPropertyTypes
      const issuePayload = await this.client.createIssue({
        teamId,
        title,
        ...(description !== undefined && { description }),
        ...(priority !== undefined && { priority: normalizedToLinearPriority(priority) }),
        ...(projectId !== undefined && { projectId }),
        ...(labelIds.length > 0 && { labelIds }),
        ...(stateId !== undefined && { stateId }),
      });

      const issue = await issuePayload.issue;
      if (!issue) {
        return {
          success: false,
          error: 'Failed to create issue: no issue returned',
        };
      }

      return {
        success: true,
        data: {
          id: issue.id,
          identifier: issue.identifier,
          title: issue.title,
          url: issue.url,
        },
      };
    } catch (err) {
      return {
        success: false,
        error: `Failed to create issue: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  }

  async addComment(issueId: string, body: string): Promise<Result<void>> {
    try {
      const issue = await this.client.issue(issueId);
      await this.client.createComment({
        issueId: issue.id,
        body,
      });

      return { success: true, data: undefined };
    } catch (err) {
      return {
        success: false,
        error: `Failed to add comment: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  }

  async updateIssueState(issueId: string, stateName: string): Promise<Result<void>> {
    try {
      const issue = await this.client.issue(issueId);
      const team = await issue.team;

      if (!team) {
        return {
          success: false,
          error: 'Could not determine team for issue',
        };
      }

      const stateIdResult = await this.getStateIdByName(team.id, stateName);
      if (!stateIdResult.success) {
        return stateIdResult;
      }

      await issue.update({ stateId: stateIdResult.data });

      return { success: true, data: undefined };
    } catch (err) {
      return {
        success: false,
        error: `Failed to update issue state: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  }

  // ============ Private Helper Methods ============

  private async getLabelIdByName(labelName: string, teamId?: string): Promise<Result<string>> {
    try {
      const labelsConnection = await this.client.issueLabels({
        filter: {
          name: { eq: labelName },
          ...(teamId ? { team: { id: { eq: teamId } } } : {}),
        },
      });

      const label = labelsConnection.nodes[0];
      if (!label) {
        return {
          success: false,
          error: `Label "${labelName}" not found${teamId ? ' for this team' : ''}`,
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

  private async getTeamIdForIssue(issueId: string): Promise<Result<string>> {
    try {
      const issue = await this.client.issue(issueId);
      const team = await issue.team;

      if (!team) {
        return {
          success: false,
          error: 'Could not determine team for issue',
        };
      }

      return { success: true, data: team.id };
    } catch (err) {
      return {
        success: false,
        error: `Failed to fetch issue team: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  }

  private async getStateIdByName(teamId: string, stateName: string): Promise<Result<string>> {
    try {
      const team = await this.client.team(teamId);
      const statesConnection = await team.states();

      // Case-insensitive search for the state
      const state = statesConnection.nodes.find(
        (s) => s.name.toLowerCase() === stateName.toLowerCase()
      );

      if (!state) {
        const availableStates = statesConnection.nodes.map((s) => s.name).join(', ');
        return {
          success: false,
          error: `State "${stateName}" not found. Available states: ${availableStates}`,
        };
      }

      return { success: true, data: state.id };
    } catch (err) {
      return {
        success: false,
        error: `Failed to fetch state: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  }

  private hasLabelByName(
    labels: Array<{ id: string; name: string }>,
    labelName: string
  ): boolean {
    return labels.some((label) => label.name === labelName);
  }

  private computeLabelSwap(
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

  private async updateIssueLabels(
    issueId: string,
    labelIds: string[]
  ): Promise<Result<void>> {
    try {
      const issue = await this.client.issue(issueId);
      await issue.update({ labelIds });

      return { success: true, data: undefined };
    } catch (err) {
      return {
        success: false,
        error: `Failed to update issue labels: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  }
}
