/**
 * GitHub API integration for editing existing repositories.
 * 
 * This module provides functions to:
 * - Exchange OAuth codes for access tokens
 * - List user repositories containing shield-wizard.json
 * - Load keyboard configuration from a repository
 * - Commit and push changes to a repository
 * 
 * Uses the official Octokit library for GitHub API interactions.
 */

import { Octokit } from 'octokit';
import { SHIELD_WIZARD_CONFIG_PATH, PRESERVED_PATHS } from './templating';
import type { Keyboard, VirtualTextFolder } from '../typedef';
import { KeyboardSchema } from '../typedef';

const GITHUB_OAUTH_URL = 'https://github.com/login/oauth/access_token';

export interface GitHubTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  error?: string;
  error_description?: string;
}

export interface GitHubUser {
  login: string;
  id: number;
  avatar_url: string;
  name: string | null;
}

export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  description: string | null;
  html_url: string;
  default_branch: string;
  owner: {
    login: string;
    avatar_url: string;
  };
}

export class GitHubApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public response?: unknown
  ) {
    super(message);
    this.name = 'GitHubApiError';
  }

  static isRateLimited(error: unknown): boolean {
    return error instanceof GitHubApiError && error.status === 403;
  }

  static isUnauthorized(error: unknown): boolean {
    return error instanceof GitHubApiError && error.status === 401;
  }

  static isNotFound(error: unknown): boolean {
    return error instanceof GitHubApiError && error.status === 404;
  }
}

/**
 * Create an Octokit instance with the given access token.
 */
function createOctokit(accessToken: string): Octokit {
  return new Octokit({ auth: accessToken });
}

/**
 * Convert Octokit errors to GitHubApiError for consistent error handling.
 */
function handleOctokitError(error: unknown, defaultMessage: string): never {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status: number }).status;
    const message = 'message' in error ? String((error as { message: string }).message) : defaultMessage;
    throw new GitHubApiError(message, status, error);
  }
  throw new GitHubApiError(defaultMessage, 500, error);
}

/**
 * Exchange an OAuth authorization code for an access token.
 * Note: This uses fetch directly because Octokit's OAuth app authentication
 * is designed for different use cases.
 */
export async function exchangeCodeForToken(
  code: string,
  clientId: string,
  clientSecret: string
): Promise<GitHubTokenResponse> {
  const response = await fetch(GITHUB_OAUTH_URL, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
    }),
  });

  if (!response.ok) {
    throw new GitHubApiError(
      'Failed to exchange OAuth code for token',
      response.status
    );
  }

  const data = await response.json() as GitHubTokenResponse;
  
  if (data.error) {
    throw new GitHubApiError(
      data.error_description || data.error,
      400,
      data
    );
  }

  return data;
}

/**
 * Verify an access token and get the authenticated user.
 */
export async function getAuthenticatedUser(accessToken: string): Promise<GitHubUser> {
  try {
    const octokit = createOctokit(accessToken);
    const { data } = await octokit.rest.users.getAuthenticated();
    
    return {
      login: data.login,
      id: data.id,
      avatar_url: data.avatar_url,
      name: data.name,
    };
  } catch (error) {
    handleOctokitError(error, 'Failed to get authenticated user');
  }
}

/**
 * List all repositories for the authenticated user.
 */
export async function listUserRepositories(
  accessToken: string,
  page = 1,
  perPage = 30
): Promise<{ repos: GitHubRepository[]; hasMore: boolean }> {
  try {
    const octokit = createOctokit(accessToken);
    const { data, headers } = await octokit.rest.repos.listForAuthenticatedUser({
      sort: 'updated',
      per_page: perPage,
      page,
    });

    const repos: GitHubRepository[] = data.map(repo => ({
      id: repo.id,
      name: repo.name,
      full_name: repo.full_name,
      private: repo.private,
      description: repo.description,
      html_url: repo.html_url,
      default_branch: repo.default_branch,
      owner: {
        login: repo.owner.login,
        avatar_url: repo.owner.avatar_url,
      },
    }));

    // Check the Link header for pagination
    const linkHeader = headers.link;
    const hasMore = linkHeader?.includes('rel="next"') ?? false;

    return { repos, hasMore };
  } catch (error) {
    handleOctokitError(error, 'Failed to list repositories');
  }
}

/**
 * Check if a repository contains the shield-wizard.json file.
 */
export async function hasShieldWizardConfig(
  accessToken: string,
  owner: string,
  repo: string
): Promise<boolean> {
  try {
    const octokit = createOctokit(accessToken);
    await octokit.rest.repos.getContent({
      owner,
      repo,
      path: SHIELD_WIZARD_CONFIG_PATH,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Load the keyboard configuration from a repository.
 */
export async function loadKeyboardConfig(
  accessToken: string,
  owner: string,
  repo: string
): Promise<{ keyboard: Keyboard; sha: string }> {
  try {
    const octokit = createOctokit(accessToken);
    const { data } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: SHIELD_WIZARD_CONFIG_PATH,
    });

    // Ensure we got a file, not a directory or other content type
    if (Array.isArray(data)) {
      throw new GitHubApiError('Expected a file, got a directory', 400);
    }
    if (data.type !== 'file') {
      throw new GitHubApiError(`Expected a file, got ${data.type}`, 400);
    }

    if (data.encoding !== 'base64') {
      throw new GitHubApiError('Unexpected file encoding', 400);
    }

    // Note: atob() handles ASCII correctly. Since our JSON config only contains
    // ASCII-safe characters (keyboard names are limited to 16 bytes), this is safe.
    // For arbitrary UTF-8 content, a more robust decoder would be needed.
    const content = atob(data.content);
    const parsed = JSON.parse(content);
    
    // Validate the keyboard data
    const result = KeyboardSchema.safeParse(parsed);
    if (!result.success) {
      throw new GitHubApiError(
        'Invalid keyboard configuration in repository',
        400,
        result.error.issues
      );
    }

    return {
      keyboard: result.data,
      sha: data.sha,
    };
  } catch (error) {
    if (error instanceof GitHubApiError) {
      throw error;
    }
    if (error && typeof error === 'object' && 'status' in error) {
      const status = (error as { status: number }).status;
      if (status === 404) {
        throw new GitHubApiError(
          'Repository does not contain Shield Wizard configuration',
          404
        );
      }
    }
    handleOctokitError(error, 'Failed to load configuration');
  }
}

/**
 * Check if a path should be preserved (not overwritten).
 */
function shouldPreservePath(filePath: string): boolean {
  return PRESERVED_PATHS.some(preserved => 
    filePath === preserved || filePath.startsWith(preserved)
  );
}

/**
 * Push changes to a repository.
 * 
 * This function:
 * 1. Gets the current HEAD commit SHA
 * 2. Gets the current tree SHA
 * 3. Creates a new tree with the updated files
 * 4. Creates a new commit pointing to the new tree
 * 5. Updates the branch reference to point to the new commit
 */
export async function pushChangesToRepository(
  accessToken: string,
  owner: string,
  repo: string,
  branch: string,
  files: VirtualTextFolder,
  commitMessage: string
): Promise<{ commitSha: string; commitUrl: string }> {
  try {
    const octokit = createOctokit(accessToken);

    // 1. Get current HEAD commit SHA
    const { data: refData } = await octokit.rest.git.getRef({
      owner,
      repo,
      ref: `heads/${branch}`,
    });
    const headSha = refData.object.sha;

    // 2. Get current tree SHA
    const { data: commitData } = await octokit.rest.git.getCommit({
      owner,
      repo,
      commit_sha: headSha,
    });
    const baseTreeSha = commitData.tree.sha;

    // 3. Create new tree with updated files (filter out preserved paths)
    const treeItems = Object.entries(files)
      .filter(([path]) => !shouldPreservePath(path))
      .map(([path, content]) => ({
        path,
        mode: '100644' as const,
        type: 'blob' as const,
        content,
      }));

    const { data: treeData } = await octokit.rest.git.createTree({
      owner,
      repo,
      base_tree: baseTreeSha,
      tree: treeItems,
    });
    const newTreeSha = treeData.sha;

    // 4. Create new commit
    const { data: newCommitData } = await octokit.rest.git.createCommit({
      owner,
      repo,
      message: commitMessage,
      tree: newTreeSha,
      parents: [headSha],
    });
    const newCommitSha = newCommitData.sha;

    // 5. Update branch reference
    await octokit.rest.git.updateRef({
      owner,
      repo,
      ref: `heads/${branch}`,
      sha: newCommitSha,
    });

    return {
      commitSha: newCommitSha,
      commitUrl: `https://github.com/${owner}/${repo}/commit/${newCommitSha}`,
    };
  } catch (error) {
    if (error instanceof GitHubApiError) {
      throw error;
    }
    handleOctokitError(error, 'Failed to push changes to repository');
  }
}

/**
 * Get repository information.
 */
export async function getRepository(
  accessToken: string,
  owner: string,
  repo: string
): Promise<GitHubRepository> {
  try {
    const octokit = createOctokit(accessToken);
    const { data } = await octokit.rest.repos.get({
      owner,
      repo,
    });

    return {
      id: data.id,
      name: data.name,
      full_name: data.full_name,
      private: data.private,
      description: data.description,
      html_url: data.html_url,
      default_branch: data.default_branch,
      owner: {
        login: data.owner.login,
        avatar_url: data.owner.avatar_url,
      },
    };
  } catch (error) {
    handleOctokitError(error, 'Failed to get repository');
  }
}
