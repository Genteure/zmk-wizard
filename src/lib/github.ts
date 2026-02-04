/**
 * GitHub API integration for editing existing repositories.
 * 
 * This module provides functions to:
 * - Exchange OAuth codes for access tokens
 * - List user repositories containing shield-wizard.json
 * - Load keyboard configuration from a repository
 * - Commit and push changes to a repository
 */

import { SHIELD_WIZARD_CONFIG_PATH, PRESERVED_PATHS } from './templating';
import type { Keyboard, VirtualTextFolder } from '../typedef';
import { KeyboardSchema } from '../typedef';

const GITHUB_API_BASE = 'https://api.github.com';
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

export interface GitHubFileContent {
  content: string;
  encoding: string;
  sha: string;
}

export interface GitHubTreeItem {
  path: string;
  mode: '100644' | '100755' | '040000' | '160000' | '120000';
  type: 'blob' | 'tree' | 'commit';
  sha?: string;
  content?: string;
}

export interface GitHubCommit {
  sha: string;
  message: string;
  author: {
    name: string;
    email: string;
    date: string;
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
 * Exchange an OAuth authorization code for an access token.
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
  const response = await fetch(`${GITHUB_API_BASE}/user`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!response.ok) {
    throw new GitHubApiError(
      'Failed to get authenticated user',
      response.status,
      await response.json().catch(() => null)
    );
  }

  return response.json() as Promise<GitHubUser>;
}

/**
 * List repositories for the authenticated user that contain shield-wizard.json.
 */
export async function listShieldWizardRepositories(
  accessToken: string,
  page = 1,
  perPage = 30
): Promise<{ repos: GitHubRepository[]; hasMore: boolean }> {
  // First, search for repositories that contain the shield-wizard.json file
  const query = `filename:${SHIELD_WIZARD_CONFIG_PATH.split('/').pop()} path:${SHIELD_WIZARD_CONFIG_PATH.replace(/\/[^/]+$/, '')}`;
  
  const response = await fetch(
    `${GITHUB_API_BASE}/search/code?q=${encodeURIComponent(query)}+user:@me&per_page=${perPage}&page=${page}`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    }
  );

  if (!response.ok) {
    // If search fails, fall back to listing all repos
    // (search may not work for private repos in some cases)
    return listUserRepositories(accessToken, page, perPage);
  }

  const data = await response.json() as { 
    items: Array<{ repository: GitHubRepository }>;
    total_count: number;
  };

  // Deduplicate repositories
  const repoMap = new Map<number, GitHubRepository>();
  for (const item of data.items) {
    if (!repoMap.has(item.repository.id)) {
      repoMap.set(item.repository.id, item.repository);
    }
  }

  return {
    repos: Array.from(repoMap.values()),
    hasMore: data.total_count > page * perPage,
  };
}

/**
 * List all repositories for the authenticated user (fallback method).
 */
export async function listUserRepositories(
  accessToken: string,
  page = 1,
  perPage = 30
): Promise<{ repos: GitHubRepository[]; hasMore: boolean }> {
  const response = await fetch(
    `${GITHUB_API_BASE}/user/repos?sort=updated&per_page=${perPage}&page=${page}`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    }
  );

  if (!response.ok) {
    throw new GitHubApiError(
      'Failed to list repositories',
      response.status,
      await response.json().catch(() => null)
    );
  }

  const repos = await response.json() as GitHubRepository[];
  
  // Check the Link header for pagination
  const linkHeader = response.headers.get('Link');
  const hasMore = linkHeader?.includes('rel="next"') ?? false;

  return { repos, hasMore };
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
    const response = await fetch(
      `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${SHIELD_WIZARD_CONFIG_PATH}`,
      {
        method: 'HEAD',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      }
    );
    return response.ok;
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
  const response = await fetch(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${SHIELD_WIZARD_CONFIG_PATH}`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    }
  );

  if (!response.ok) {
    if (response.status === 404) {
      throw new GitHubApiError(
        'Repository does not contain Shield Wizard configuration',
        404
      );
    }
    throw new GitHubApiError(
      'Failed to load configuration',
      response.status,
      await response.json().catch(() => null)
    );
  }

  const data = await response.json() as GitHubFileContent;
  
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
}

/**
 * Get the default branch ref SHA for a repository.
 */
async function getDefaultBranchSha(
  accessToken: string,
  owner: string,
  repo: string,
  branch: string
): Promise<string> {
  const response = await fetch(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/git/ref/heads/${branch}`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    }
  );

  if (!response.ok) {
    throw new GitHubApiError(
      'Failed to get branch reference',
      response.status,
      await response.json().catch(() => null)
    );
  }

  const data = await response.json() as { object: { sha: string } };
  return data.object.sha;
}

/**
 * Get the tree SHA for a commit.
 */
async function getCommitTreeSha(
  accessToken: string,
  owner: string,
  repo: string,
  commitSha: string
): Promise<string> {
  const response = await fetch(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/git/commits/${commitSha}`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    }
  );

  if (!response.ok) {
    throw new GitHubApiError(
      'Failed to get commit',
      response.status,
      await response.json().catch(() => null)
    );
  }

  const data = await response.json() as { tree: { sha: string } };
  return data.tree.sha;
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
 * Create a new tree with updated files.
 */
async function createTree(
  accessToken: string,
  owner: string,
  repo: string,
  baseTreeSha: string,
  files: VirtualTextFolder
): Promise<string> {
  // Filter out preserved paths
  const treeItems: GitHubTreeItem[] = Object.entries(files)
    .filter(([path]) => !shouldPreservePath(path))
    .map(([path, content]) => ({
      path,
      mode: '100644' as const,
      type: 'blob' as const,
      content,
    }));

  const response = await fetch(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/git/trees`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        base_tree: baseTreeSha,
        tree: treeItems,
      }),
    }
  );

  if (!response.ok) {
    throw new GitHubApiError(
      'Failed to create tree',
      response.status,
      await response.json().catch(() => null)
    );
  }

  const data = await response.json() as { sha: string };
  return data.sha;
}

/**
 * Create a new commit.
 */
async function createCommit(
  accessToken: string,
  owner: string,
  repo: string,
  message: string,
  treeSha: string,
  parentSha: string
): Promise<string> {
  const response = await fetch(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/git/commits`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message,
        tree: treeSha,
        parents: [parentSha],
      }),
    }
  );

  if (!response.ok) {
    throw new GitHubApiError(
      'Failed to create commit',
      response.status,
      await response.json().catch(() => null)
    );
  }

  const data = await response.json() as { sha: string };
  return data.sha;
}

/**
 * Update a branch reference to point to a new commit.
 */
async function updateBranchRef(
  accessToken: string,
  owner: string,
  repo: string,
  branch: string,
  commitSha: string
): Promise<void> {
  const response = await fetch(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/git/refs/heads/${branch}`,
    {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sha: commitSha,
      }),
    }
  );

  if (!response.ok) {
    throw new GitHubApiError(
      'Failed to update branch reference',
      response.status,
      await response.json().catch(() => null)
    );
  }
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
  // 1. Get current HEAD commit SHA
  const headSha = await getDefaultBranchSha(accessToken, owner, repo, branch);
  
  // 2. Get current tree SHA
  const baseTreeSha = await getCommitTreeSha(accessToken, owner, repo, headSha);
  
  // 3. Create new tree
  const newTreeSha = await createTree(accessToken, owner, repo, baseTreeSha, files);
  
  // 4. Create new commit
  const newCommitSha = await createCommit(
    accessToken,
    owner,
    repo,
    commitMessage,
    newTreeSha,
    headSha
  );
  
  // 5. Update branch reference
  await updateBranchRef(accessToken, owner, repo, branch, newCommitSha);

  return {
    commitSha: newCommitSha,
    commitUrl: `https://github.com/${owner}/${repo}/commit/${newCommitSha}`,
  };
}

/**
 * Get repository information.
 */
export async function getRepository(
  accessToken: string,
  owner: string,
  repo: string
): Promise<GitHubRepository> {
  const response = await fetch(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    }
  );

  if (!response.ok) {
    throw new GitHubApiError(
      'Failed to get repository',
      response.status,
      await response.json().catch(() => null)
    );
  }

  return response.json() as Promise<GitHubRepository>;
}
