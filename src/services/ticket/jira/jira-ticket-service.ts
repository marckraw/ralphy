import { Version3Client } from 'jira.js';
import type {
  LabelsConfig,
  JiraProviderConfig,
} from '../../../types/config.js';
import type {
  FetchIssuesByLabelOptions,
  NormalizedIssue,
  NormalizedProject,
  NormalizedTeam,
  Result,
  SwapResult,
  TicketService,
} from '../../../types/ticket-service.js';
import { normalizeJiraPriority } from '../../../types/ticket-service.js';
import { logger } from '../../../utils/logger.js';

/**
 * TicketService implementation for Jira Cloud.
 */
export class JiraTicketService implements TicketService {
  readonly provider = 'jira' as const;

  private client: Version3Client;
  private config: JiraProviderConfig;

  constructor(config: JiraProviderConfig, _labels: LabelsConfig) {
    this.config = config;
    this.client = new Version3Client({
      host: config.host,
      authentication: {
        basic: {
          email: config.email,
          apiToken: config.apiToken,
        },
      },
    });
  }

  async validateConnection(): Promise<Result<boolean>> {
    try {
      const myself = await this.client.myself.getCurrentUser();
      return { success: true, data: myself.accountId !== undefined };
    } catch (err) {
      return {
        success: false,
        error: `Failed to validate connection: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  }

  async fetchTeams(): Promise<Result<NormalizedTeam[]>> {
    // Jira doesn't have teams in the same way as Linear
    // We'll return the project as a "team" for compatibility
    try {
      const project = await this.client.projects.getProject({
        projectIdOrKey: this.config.projectKey,
      });

      const teams: NormalizedTeam[] = [
        {
          id: project.id ?? this.config.projectId,
          name: project.name ?? this.config.projectName,
          key: project.key ?? this.config.projectKey,
        },
      ];

      return { success: true, data: teams };
    } catch (err) {
      return {
        success: false,
        error: `Failed to fetch teams: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  }

  async fetchProjects(_teamId?: string): Promise<Result<NormalizedProject[]>> {
    try {
      const projects = await this.client.projects.searchProjects();
      const normalizedProjects: NormalizedProject[] = (
        projects.values ?? []
      ).map((project) => ({
        id: project.id ?? '',
        name: project.name ?? '',
        description: project.description ?? undefined,
        key: project.key ?? undefined,
      }));

      return { success: true, data: normalizedProjects };
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
    const { labelName, projectId } = options;
    const projectKey = projectId ?? this.config.projectKey;

    logger.debug(`[JiraTicketService] fetchIssuesByLabel called`);
    logger.debug(`[JiraTicketService] Host: ${this.config.host}`);
    logger.debug(`[JiraTicketService] Project key: ${projectKey}`);
    logger.debug(`[JiraTicketService] Label name: ${labelName}`);

    try {
      // Use JQL to query issues with the specific label
      const jql = `project = "${projectKey}" AND labels = "${labelName}" ORDER BY updated DESC`;
      logger.debug(`[JiraTicketService] JQL: ${jql}`);

      // Use the new enhanced search API (/rest/api/3/search/jql) as the old endpoints are deprecated (410)
      logger.debug(`[JiraTicketService] Calling searchForIssuesUsingJqlEnhancedSearchPost...`);
      const searchResult = await this.client.issueSearch.searchForIssuesUsingJqlEnhancedSearchPost(
        {
          jql,
          fields: [
            'summary',
            'description',
            'priority',
            'status',
            'labels',
            'created',
            'updated',
          ],
        }
      );

      logger.debug(`[JiraTicketService] Search completed, found ${searchResult.issues?.length ?? 0} issues`);

      const issues: NormalizedIssue[] = (searchResult.issues ?? []).map(
        (issue) => this.normalizeIssue(issue)
      );

      return { success: true, data: issues };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.debug(`[JiraTicketService] Error: ${errorMessage}`);
      if (err instanceof Error && 'response' in err) {
        const response = (err as { response?: { status?: number; data?: unknown } }).response;
        logger.debug(`[JiraTicketService] Response status: ${response?.status}`);
        logger.debug(`[JiraTicketService] Response data: ${JSON.stringify(response?.data)}`);
      }
      return {
        success: false,
        error: `Failed to fetch issues: ${errorMessage}`,
      };
    }
  }

  async fetchIssueById(issueId: string): Promise<Result<NormalizedIssue>> {
    try {
      const issue = await this.client.issues.getIssue({
        issueIdOrKey: issueId,
        fields: [
          'summary',
          'description',
          'priority',
          'status',
          'labels',
          'created',
          'updated',
        ],
      });

      return { success: true, data: this.normalizeIssue(issue) };
    } catch (err) {
      return {
        success: false,
        error: `Failed to fetch issue: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  }

  async updateIssueDescription(
    issueId: string,
    description: string
  ): Promise<Result<void>> {
    try {
      // Convert markdown to Atlassian Document Format (ADF)
      const adfDescription = this.markdownToAdf(description);

      await this.client.issues.editIssue({
        issueIdOrKey: issueId,
        fields: {
          description: adfDescription,
        },
      });

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
    try {
      // Get current labels
      const issueResult = await this.fetchIssueById(issueId);
      if (!issueResult.success) {
        return issueResult;
      }

      const currentLabels = issueResult.data.labels.map((l) => l.name);

      // Check if already has the label
      if (currentLabels.includes(labelName)) {
        return { success: true, data: undefined };
      }

      // Add the label using the update endpoint
      await this.client.issues.editIssue({
        issueIdOrKey: issueId,
        update: {
          labels: [{ add: labelName }],
        },
      });

      return { success: true, data: undefined };
    } catch (err) {
      return {
        success: false,
        error: `Failed to add label: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  }

  async removeLabelFromIssue(
    issueId: string,
    labelName: string
  ): Promise<Result<void>> {
    try {
      // Get current labels
      const issueResult = await this.fetchIssueById(issueId);
      if (!issueResult.success) {
        return issueResult;
      }

      const currentLabels = issueResult.data.labels.map((l) => l.name);

      // Check if has the label
      if (!currentLabels.includes(labelName)) {
        return { success: true, data: undefined }; // Idempotent
      }

      // Remove the label using the update endpoint
      await this.client.issues.editIssue({
        issueIdOrKey: issueId,
        update: {
          labels: [{ remove: labelName }],
        },
      });

      return { success: true, data: undefined };
    } catch (err) {
      return {
        success: false,
        error: `Failed to remove label: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  }

  async swapLabels(
    issueId: string,
    removeLabel: string,
    addLabel: string
  ): Promise<Result<SwapResult>> {
    try {
      // Get current labels
      const issueResult = await this.fetchIssueById(issueId);
      if (!issueResult.success) {
        return issueResult;
      }

      const currentLabels = issueResult.data.labels.map((l) => l.name);
      const hasRemoveLabel = currentLabels.includes(removeLabel);
      const hasAddLabel = currentLabels.includes(addLabel);

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

      // Build update operations
      const labelOperations: Array<{ add?: string; remove?: string }> = [];

      if (hasRemoveLabel) {
        labelOperations.push({ remove: removeLabel });
      }
      if (!hasAddLabel) {
        labelOperations.push({ add: addLabel });
      }

      if (labelOperations.length > 0) {
        await this.client.issues.editIssue({
          issueIdOrKey: issueId,
          update: {
            labels: labelOperations,
          },
        });
      }

      return {
        success: true,
        data: {
          removed: hasRemoveLabel ? removeLabel : null,
          added: !hasAddLabel ? addLabel : null,
          alreadyHadTarget: false,
        },
      };
    } catch (err) {
      return {
        success: false,
        error: `Failed to swap labels: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  }

  // ============ Private Helper Methods ============

  private normalizeIssue(issue: {
    id?: string;
    key?: string;
    fields?: {
      summary?: string;
      description?: unknown;
      priority?: { id?: string; name?: string };
      status?: { id?: string; name?: string; statusCategory?: { key?: string } };
      labels?: string[];
      created?: string;
      updated?: string;
    };
    self?: string;
  }): NormalizedIssue {
    const fields = issue.fields ?? {};

    // Extract description text from ADF or plain text
    const description = this.extractDescriptionText(fields.description);

    // Map status category to state type
    const stateType = this.mapStatusCategoryToStateType(
      fields.status?.statusCategory?.key
    );

    return {
      id: issue.id ?? '',
      identifier: issue.key ?? '',
      title: fields.summary ?? '',
      description,
      priority: normalizeJiraPriority(fields.priority?.name),
      state: {
        id: fields.status?.id ?? '',
        name: fields.status?.name ?? 'Unknown',
        type: stateType,
      },
      labels: (fields.labels ?? []).map((label) => ({
        id: label, // Jira labels don't have IDs, use name
        name: label,
      })),
      createdAt: fields.created ? new Date(fields.created) : new Date(),
      updatedAt: fields.updated ? new Date(fields.updated) : new Date(),
      url: issue.self
        ? `${this.config.host}/browse/${issue.key}`
        : undefined,
    };
  }

  private extractDescriptionText(description: unknown): string | undefined {
    if (!description) return undefined;

    // If it's a string, return as-is
    if (typeof description === 'string') {
      return description;
    }

    // If it's ADF, try to extract text content
    if (typeof description === 'object' && description !== null) {
      const adf = description as {
        type?: string;
        content?: unknown[];
      };

      if (adf.type === 'doc' && Array.isArray(adf.content)) {
        return this.extractTextFromAdf(adf.content);
      }
    }

    return undefined;
  }

  private extractTextFromAdf(content: unknown[]): string {
    const textParts: string[] = [];

    const extractFromNode = (node: unknown): void => {
      if (!node || typeof node !== 'object') return;

      const typedNode = node as {
        type?: string;
        text?: string;
        content?: unknown[];
      };

      if (typedNode.type === 'text' && typedNode.text) {
        textParts.push(typedNode.text);
      }

      if (Array.isArray(typedNode.content)) {
        for (const child of typedNode.content) {
          extractFromNode(child);
        }
      }
    };

    for (const node of content) {
      extractFromNode(node);
      textParts.push('\n');
    }

    return textParts.join('').trim();
  }

  private mapStatusCategoryToStateType(
    categoryKey: string | undefined
  ): string {
    switch (categoryKey) {
      case 'new':
        return 'backlog';
      case 'indeterminate':
        return 'started';
      case 'done':
        return 'completed';
      default:
        return 'unknown';
    }
  }

  private markdownToAdf(markdown: string): object {
    // Convert markdown to basic ADF
    // This is a simplified conversion - a full implementation would use a proper parser
    const lines = markdown.split('\n');
    const content: object[] = [];

    let i = 0;
    while (i < lines.length) {
      const line = lines[i] ?? '';

      // Handle headers
      const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (headerMatch) {
        const level = headerMatch[1]?.length ?? 1;
        content.push({
          type: 'heading',
          attrs: { level },
          content: [{ type: 'text', text: headerMatch[2] ?? '' }],
        });
        i++;
        continue;
      }

      // Handle bullet lists
      if (line.match(/^[-*]\s+/)) {
        const listItems: object[] = [];
        while (i < lines.length) {
          const currentLine = lines[i] ?? '';
          if (!currentLine.match(/^[-*]\s+/)) break;

          const itemText = currentLine.replace(/^[-*]\s+/, '');
          // Handle checkbox items
          const checkboxMatch = itemText.match(/^\[([x ])\]\s*(.*)$/i);
          if (checkboxMatch) {
            const isChecked = (checkboxMatch[1] ?? '').toLowerCase() === 'x';
            listItems.push({
              type: 'listItem',
              content: [
                {
                  type: 'taskList',
                  attrs: { localId: '' },
                  content: [
                    {
                      type: 'taskItem',
                      attrs: {
                        localId: '',
                        state: isChecked ? 'DONE' : 'TODO',
                      },
                      content: [{ type: 'text', text: checkboxMatch[2] ?? '' }],
                    },
                  ],
                },
              ],
            });
          } else {
            listItems.push({
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: itemText }],
                },
              ],
            });
          }
          i++;
        }
        content.push({
          type: 'bulletList',
          content: listItems,
        });
        continue;
      }

      // Handle numbered lists
      if (line.match(/^\d+\.\s+/)) {
        const listItems: object[] = [];
        while (i < lines.length) {
          const currentLine = lines[i] ?? '';
          if (!currentLine.match(/^\d+\.\s+/)) break;

          const itemText = currentLine.replace(/^\d+\.\s+/, '');
          listItems.push({
            type: 'listItem',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: itemText }],
              },
            ],
          });
          i++;
        }
        content.push({
          type: 'orderedList',
          content: listItems,
        });
        continue;
      }

      // Handle empty lines
      if (line.trim() === '') {
        i++;
        continue;
      }

      // Handle regular paragraphs
      content.push({
        type: 'paragraph',
        content: [{ type: 'text', text: line }],
      });
      i++;
    }

    return {
      type: 'doc',
      version: 1,
      content,
    };
  }
}
