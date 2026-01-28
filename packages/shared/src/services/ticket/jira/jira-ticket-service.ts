import { Version3Client } from 'jira.js';
import type { Document as JiraDocument } from 'jira.js/version3/models/document';
import { Parser } from 'extended-markdown-adf-parser';
import type {
  LabelsConfig,
  JiraProviderConfig,
} from '../../../types/config.js';
import type {
  CreateIssueOptions,
  CreatedIssue,
  FetchIssuesByLabelOptions,
  NormalizedIssue,
  NormalizedLabel,
  NormalizedPriority,
  NormalizedProject,
  NormalizedTeam,
  ProjectContext,
  Result,
  SwapResult,
  TicketService,
} from '../../../types/ticket-service.js';
import {
  normalizeJiraPriority,
  normalizedToJiraPriority,
} from '../../../types/ticket-service.js';
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

  async fetchProjectContext(_projectId: string): Promise<Result<ProjectContext>> {
    // Jira doesn't have a direct equivalent to Linear's project overview/content
    // Return a not implemented error for graceful degradation
    logger.debug('[JiraTicketService] fetchProjectContext: not implemented for Jira');
    return {
      success: false,
      error: 'Project context is not available for Jira provider',
    };
  }

  async updateIssueDescription(
    issueId: string,
    description: string
  ): Promise<Result<void>> {
    logger.debug(`[JiraTicketService] updateIssueDescription called for ${issueId}`);
    logger.debug(`[JiraTicketService] Description length: ${description.length} chars`);

    try {
      // Convert markdown to Atlassian Document Format (ADF)
      const adfDescription = this.convertMarkdownToAdf(description);
      logger.debug(`[JiraTicketService] ADF conversion complete (using extended-markdown-adf-parser)`);
      logger.debug(`[JiraTicketService] ADF preview: ${JSON.stringify(adfDescription).slice(0, 500)}...`);

      await this.client.issues.editIssue({
        issueIdOrKey: issueId,
        fields: {
          description: adfDescription,
        },
      });

      logger.debug(`[JiraTicketService] Issue updated successfully`);
      return { success: true, data: undefined };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.debug(`[JiraTicketService] Update error: ${errorMessage}`);
      if (err instanceof Error && 'response' in err) {
        const response = (err as { response?: { status?: number; data?: unknown } }).response;
        logger.debug(`[JiraTicketService] Response status: ${response?.status}`);
        logger.debug(`[JiraTicketService] Response data: ${JSON.stringify(response?.data)}`);
      }
      return {
        success: false,
        error: `Failed to update issue: ${errorMessage}`,
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

      const currentLabels = issueResult.data.labels.map((l: NormalizedLabel) => l.name);

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

      const currentLabels = issueResult.data.labels.map((l: NormalizedLabel) => l.name);

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

      const currentLabels = issueResult.data.labels.map((l: NormalizedLabel) => l.name);
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

  async createIssue(options: CreateIssueOptions): Promise<Result<CreatedIssue>> {
    logger.debug(`[JiraTicketService] createIssue called`);
    logger.debug(`[JiraTicketService] Title: ${options.title}`);

    try {
      // Build base fields
      const baseFields: Record<string, unknown> = {
        summary: options.title,
        project: { key: this.config.projectKey },
        issuetype: { name: 'Task' },
      };

      if (options.priority) {
        const resolvedPriority = await this.resolveJiraPriority(options.priority);
        if (resolvedPriority) {
          baseFields['priority'] = resolvedPriority;
        } else {
          logger.debug(`[JiraTicketService] Could not resolve priority "${options.priority}", skipping`);
        }
      }

      if (options.labelNames && options.labelNames.length > 0) {
        baseFields['labels'] = options.labelNames;
      }

      if (options.description) {
        baseFields['description'] = this.convertMarkdownToAdf(options.description);
      }

      let created: { id?: string; key?: string };
      try {
        created = await this.client.issues.createIssue({
          fields: baseFields,
        } as unknown as { fields: { summary: string; project: { key: string }; issuetype: { name: string } } });
      } catch (firstErr) {
        if (options.description) {
          // ADF might be rejected — fall back to plain string (jira.js wraps it in basic ADF)
          logger.debug(`[JiraTicketService] ADF rejected, retrying with plain string description`);
          baseFields['description'] = options.description;
          created = await this.client.issues.createIssue({
            fields: baseFields,
          } as unknown as { fields: { summary: string; project: { key: string }; issuetype: { name: string } } });
        } else {
          throw firstErr;
        }
      }

      const key = created.key ?? '';
      const url = `${this.config.host}/browse/${key}`;

      logger.debug(`[JiraTicketService] Issue created: ${key}`);

      return {
        success: true,
        data: {
          id: created.id ?? '',
          identifier: key,
          title: options.title,
          url,
        },
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.debug(`[JiraTicketService] Create error: ${errorMessage}`);
      let detail = '';
      if (err instanceof Error && 'response' in err) {
        const response = (err as { response?: { status?: number; data?: unknown } }).response;
        logger.debug(`[JiraTicketService] Response status: ${response?.status}`);
        logger.debug(`[JiraTicketService] Response data: ${JSON.stringify(response?.data)}`);
        if (response?.data) {
          detail = ` — ${JSON.stringify(response.data)}`;
        }
      }
      return {
        success: false,
        error: `Failed to create issue: ${errorMessage}${detail}`,
      };
    }
  }

  async addComment(issueId: string, body: string): Promise<Result<void>> {
    logger.debug(`[JiraTicketService] addComment called for ${issueId}`);

    try {
      const adfBody = this.convertMarkdownToAdf(body);

      try {
        await this.client.issueComments.addComment({
          issueIdOrKey: issueId,
          comment: adfBody,
        });
      } catch (adfErr) {
        // ADF rejected — fall back to plain string (jira.js wraps it in basic ADF)
        logger.debug(`[JiraTicketService] ADF comment rejected, retrying with plain string`);
        await this.client.issueComments.addComment({
          issueIdOrKey: issueId,
          comment: body,
        });
      }

      logger.debug(`[JiraTicketService] Comment added successfully`);
      return { success: true, data: undefined };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.debug(`[JiraTicketService] Add comment error: ${errorMessage}`);
      return {
        success: false,
        error: `Failed to add comment: ${errorMessage}`,
      };
    }
  }

  async updateIssueState(issueId: string, stateName: string): Promise<Result<void>> {
    logger.debug(`[JiraTicketService] updateIssueState called for ${issueId} -> ${stateName}`);

    try {
      // Fetch available transitions for this issue
      const transitionsResult = await this.client.issues.getTransitions({
        issueIdOrKey: issueId,
      });

      const transitions = transitionsResult.transitions ?? [];
      logger.debug(`[JiraTicketService] Available transitions: ${transitions.map((t) => t.name).join(', ')}`);

      // Find matching transition (case-insensitive match on transition name or target state name)
      const lowerStateName = stateName.toLowerCase();
      const matched = transitions.find(
        (t) =>
          t.name?.toLowerCase() === lowerStateName ||
          (t.to && t.to.name?.toLowerCase() === lowerStateName)
      );

      if (!matched || !matched.id) {
        const availableNames = transitions
          .map((t) => {
            const targetName = t.to?.name;
            return targetName && targetName !== t.name
              ? `${t.name} (-> ${targetName})`
              : t.name;
          })
          .join(', ');

        return {
          success: false,
          error: `No transition found matching "${stateName}". Available transitions: ${availableNames}`,
        };
      }

      await this.client.issues.doTransition({
        issueIdOrKey: issueId,
        transition: { id: matched.id },
      });

      logger.debug(`[JiraTicketService] Transition "${matched.name}" executed successfully`);
      return { success: true, data: undefined };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.debug(`[JiraTicketService] Update state error: ${errorMessage}`);
      return {
        success: false,
        error: `Failed to update issue state: ${errorMessage}`,
      };
    }
  }

  // ============ Private Helper Methods ============

  /**
   * Resolves a normalized priority to a Jira priority by fetching available
   * priorities from the instance and matching by name (case-insensitive).
   * Falls back to closest match: urgent/high → "High", medium/low/none → "Low".
   */
  private async resolveJiraPriority(
    priority: NormalizedPriority,
  ): Promise<{ id: string } | undefined> {
    try {
      const result = await this.client.issuePriorities.searchPriorities({});
      const available = result.values ?? [];
      logger.debug(
        `[JiraTicketService] Available priorities: ${available.map((p) => `${p.name} (${p.id})`).join(', ')}`,
      );

      const desiredName = normalizedToJiraPriority(priority).name.toLowerCase();

      // Exact match first
      const exact = available.find(
        (p) => p.name?.toLowerCase() === desiredName,
      );
      if (exact?.id) return { id: exact.id };

      // Closest match: urgent/high → highest available, medium/low/none → lowest available
      const isHighPriority = priority === 'urgent' || priority === 'high';
      const fallback = isHighPriority ? available[0] : available[available.length - 1];
      if (fallback?.id) {
        logger.debug(
          `[JiraTicketService] No exact match for "${desiredName}", using "${fallback.name}"`,
        );
        return { id: fallback.id };
      }

      return undefined;
    } catch (err) {
      logger.debug(
        `[JiraTicketService] Failed to fetch priorities: ${err instanceof Error ? err.message : 'Unknown'}`,
      );
      return undefined;
    }
  }

  private convertMarkdownToAdf(markdown: string): JiraDocument {
    if (!markdown) {
      return { type: 'doc', version: 1, content: [] } as unknown as JiraDocument;
    }

    try {
      const parser = new Parser();
      const adf = parser.markdownToAdf(markdown);
      // Post-process: Jira requires table cells to contain block-level nodes (paragraph),
      // but the parser may produce inline text nodes directly inside tableCell/tableHeader.
      this.fixAdfTableCells(adf as unknown as Record<string, unknown>);
      return adf as JiraDocument;
    } catch (err) {
      logger.debug(`[JiraTicketService] ADF conversion failed, using plain text fallback: ${err instanceof Error ? err.message : 'Unknown'}`);
      // Fallback: wrap raw markdown in a simple text paragraph (same pattern as ralphy-jira-agent)
      return {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: markdown }],
          },
        ],
      } as unknown as JiraDocument;
    }
  }

  /**
   * Recursively walks the ADF tree and wraps any inline content
   * inside tableCell / tableHeader nodes with a paragraph node.
   */
  private fixAdfTableCells(node: Record<string, unknown>): void {
    const content = node['content'] as Record<string, unknown>[] | undefined;
    if (!Array.isArray(content)) return;

    for (let i = 0; i < content.length; i++) {
      const child = content[i];
      if (!child || typeof child !== 'object') continue;

      const type = child['type'] as string | undefined;

      if (type === 'tableCell' || type === 'tableHeader') {
        const cellContent = child['content'] as Record<string, unknown>[] | undefined;
        if (!Array.isArray(cellContent) || cellContent.length === 0) {
          // Empty cells must have at least one block-level child
          child['content'] = [{ type: 'paragraph', content: [] }];
        } else {
          const hasOnlyInline = cellContent.every(
            (c) => {
              const t = (c as Record<string, unknown>)['type'] as string;
              return t === 'text' || t === 'hardBreak' || t === 'inlineCard' || t === 'emoji' || t === 'mention';
            },
          );
          if (hasOnlyInline) {
            child['content'] = [{ type: 'paragraph', content: cellContent }];
          }
        }
      }

      // Recurse into children
      this.fixAdfTableCells(child);
    }
  }

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

}
