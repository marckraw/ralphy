import { getClient } from './client.js';
import {
  type LinearProject,
  type LinearTeam,
  type Result,
  LinearProjectSchema,
  LinearTeamSchema,
} from '../../types/linear.js';

export async function fetchTeams(): Promise<Result<LinearTeam[]>> {
  try {
    const client = getClient();
    const teamsConnection = await client.teams();
    const teams: LinearTeam[] = [];

    for (const team of teamsConnection.nodes) {
      const parsed = LinearTeamSchema.safeParse({
        id: team.id,
        name: team.name,
        key: team.key,
      });

      if (parsed.success) {
        teams.push(parsed.data);
      }
    }

    return { success: true, data: teams };
  } catch (err) {
    return {
      success: false,
      error: `Failed to fetch teams: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}

export async function fetchProjects(teamId?: string): Promise<Result<LinearProject[]>> {
  try {
    const client = getClient();

    let projectsConnection;
    if (teamId) {
      const team = await client.team(teamId);
      projectsConnection = await team.projects();
    } else {
      projectsConnection = await client.projects();
    }

    const projects: LinearProject[] = [];

    for (const project of projectsConnection.nodes) {
      const parsed = LinearProjectSchema.safeParse({
        id: project.id,
        name: project.name,
        description: project.description,
        state: project.state,
      });

      if (parsed.success) {
        projects.push(parsed.data);
      }
    }

    return { success: true, data: projects };
  } catch (err) {
    return {
      success: false,
      error: `Failed to fetch projects: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}

export async function fetchProjectById(projectId: string): Promise<Result<LinearProject>> {
  try {
    const client = getClient();
    const project = await client.project(projectId);

    const parsed = LinearProjectSchema.safeParse({
      id: project.id,
      name: project.name,
      description: project.description,
      state: project.state,
    });

    if (!parsed.success) {
      return {
        success: false,
        error: 'Failed to parse project data',
        details: parsed.error,
      };
    }

    return { success: true, data: parsed.data };
  } catch (err) {
    return {
      success: false,
      error: `Failed to fetch project: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}
