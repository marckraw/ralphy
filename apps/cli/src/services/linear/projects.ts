import { getClient } from './client.js';
import type { NormalizedTeam, NormalizedProject, Result } from '@mrck-labs/ralphy-shared';

export async function fetchTeams(): Promise<Result<NormalizedTeam[]>> {
  try {
    const client = getClient();
    const teamsConnection = await client.teams();
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

export async function fetchProjects(teamId?: string): Promise<Result<NormalizedProject[]>> {
  try {
    const client = getClient();
    let projectsConnection;
    if (teamId) {
      const team = await client.team(teamId);
      projectsConnection = await team.projects();
    } else {
      projectsConnection = await client.projects();
    }

    const projects: NormalizedProject[] = projectsConnection.nodes.map((project) => ({
      id: project.id,
      name: project.name,
      description: project.description ?? undefined,
    }));

    return { success: true, data: projects };
  } catch (err) {
    return {
      success: false,
      error: `Failed to fetch projects: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}
