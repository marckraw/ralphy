import inquirer from 'inquirer';
import { initializeClient, validateApiKey } from '../services/linear/client.js';
import { fetchTeams, fetchProjects } from '../services/linear/projects.js';
import { initializeConfig, isInitialized } from '../services/config/manager.js';
import { createRalphyStructure } from '../services/config/paths.js';
import { logger } from '../utils/logger.js';
import { createSpinner } from '../utils/spinner.js';
import type { LinearTeam, LinearProject } from '../types/linear.js';

interface InitOptions {
  force?: boolean | undefined;
}

export async function initCommand(options: InitOptions = {}): Promise<void> {
  const { force = false } = options;

  // Check if already initialized
  const alreadyInitialized = await isInitialized();
  if (alreadyInitialized && !force) {
    logger.warn('Ralphy is already initialized in this directory.');
    const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Do you want to reinitialize? This will overwrite existing configuration.',
        default: false,
      },
    ]);

    if (!confirm) {
      logger.info('Initialization cancelled.');
      return;
    }
  }

  // Get Linear API key
  const apiKey = await getApiKey();
  if (!apiKey) {
    logger.error('Linear API key is required.');
    return;
  }

  // Validate API key
  const validatingSpinner = createSpinner('Validating Linear API key...').start();
  const isValid = await validateApiKey(apiKey);
  if (!isValid) {
    validatingSpinner.fail('Invalid Linear API key');
    return;
  }
  validatingSpinner.succeed('Linear API key validated');

  // Initialize client
  initializeClient(apiKey);

  // Fetch and select team
  const team = await selectTeam();
  if (!team) {
    return;
  }

  // Fetch and select project
  const project = await selectProject(team.id);
  if (!project) {
    return;
  }

  // Create directory structure and save config
  const structureSpinner = createSpinner('Creating Ralphy configuration...').start();
  await createRalphyStructure();

  const result = await initializeConfig(apiKey, project.id, project.name, team.id);
  if (!result.success) {
    structureSpinner.fail('Failed to create configuration');
    logger.error(result.error);
    return;
  }
  structureSpinner.succeed('Ralphy configuration created');

  logger.success('\nRalphy initialized successfully!');
  logger.info(`Project: ${logger.highlight(project.name)}`);
  logger.info(`Team: ${logger.highlight(team.name)}`);
  logger.info('\nNext steps:');
  logger.info(`  1. Add the ${logger.highlight('ralph-candidate')} label to issues you want to consider`);
  logger.info(`  2. Add the ${logger.highlight('ralph-ready')} label to issues ready for automation`);
  logger.info(`  3. Run ${logger.formatCommand('ralphy candidates')} to see candidate issues`);
  logger.info(`  4. Run ${logger.formatCommand('ralphy ready')} to see ready issues`);
}

async function getApiKey(): Promise<string | null> {
  // First check environment variable
  const envKey = process.env['LINEAR_API_KEY'];
  if (envKey) {
    logger.info('Using Linear API key from LINEAR_API_KEY environment variable');
    return envKey;
  }

  // Otherwise prompt for it
  const { apiKey } = await inquirer.prompt<{ apiKey: string }>([
    {
      type: 'password',
      name: 'apiKey',
      message: 'Enter your Linear API key:',
      mask: '*',
      validate: (input: string) => {
        if (!input || input.trim().length === 0) {
          return 'API key is required';
        }
        return true;
      },
    },
  ]);

  return apiKey.trim();
}

async function selectTeam(): Promise<LinearTeam | null> {
  const spinner = createSpinner('Fetching teams...').start();
  const teamsResult = await fetchTeams();

  if (!teamsResult.success) {
    spinner.fail('Failed to fetch teams');
    logger.error(teamsResult.error);
    return null;
  }

  const teams = teamsResult.data;
  if (teams.length === 0) {
    spinner.fail('No teams found');
    logger.error('Your Linear workspace has no teams.');
    return null;
  }

  spinner.succeed(`Found ${teams.length} team(s)`);

  if (teams.length === 1) {
    const team = teams[0];
    if (team) {
      logger.info(`Using team: ${logger.highlight(team.name)}`);
      return team;
    }
  }

  const { teamId } = await inquirer.prompt<{ teamId: string }>([
    {
      type: 'list',
      name: 'teamId',
      message: 'Select a team:',
      choices: teams.map((t) => ({
        name: `${t.name} (${t.key})`,
        value: t.id,
      })),
    },
  ]);

  const selectedTeam = teams.find((t) => t.id === teamId);
  return selectedTeam ?? null;
}

async function selectProject(teamId: string): Promise<LinearProject | null> {
  const spinner = createSpinner('Fetching projects...').start();
  const projectsResult = await fetchProjects(teamId);

  if (!projectsResult.success) {
    spinner.fail('Failed to fetch projects');
    logger.error(projectsResult.error);
    return null;
  }

  const projects = projectsResult.data;
  if (projects.length === 0) {
    spinner.fail('No projects found');
    logger.error('The selected team has no projects. Create a project in Linear first.');
    return null;
  }

  spinner.succeed(`Found ${projects.length} project(s)`);

  const { projectId } = await inquirer.prompt<{ projectId: string }>([
    {
      type: 'list',
      name: 'projectId',
      message: 'Select a project:',
      choices: projects.map((p) => ({
        name: `${p.name} (${p.state})`,
        value: p.id,
      })),
    },
  ]);

  const selectedProject = projects.find((p) => p.id === projectId);
  return selectedProject ?? null;
}
