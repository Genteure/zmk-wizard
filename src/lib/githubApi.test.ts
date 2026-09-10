import { afterEach, describe, expect, test, vi } from 'vitest';

import { markRepositoriesWithShieldConfig, listInstallationRepositories, type GithubRepository } from './githubApi';

function repo(overrides: Partial<GithubRepository> = {}): GithubRepository {
  return {
    id: 1,
    name: 'repo',
    fullName: 'owner/repo',
    private: false,
    description: null,
    htmlUrl: 'https://github.com/owner/repo',
    defaultBranch: 'main',
    pushedAt: null,
    updatedAt: '2026-01-01T00:00:00Z',
    owner: { login: 'owner', avatarUrl: 'https://avatars.example/owner' },
    ...overrides,
  };
}

describe('markRepositoriesWithShieldConfig', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test('batches a whole page into one GraphQL query and maps object presence', async () => {
    const repos = [
      repo({ id: 1, name: 'with-config', owner: { login: 'o', avatarUrl: 'a' } }),
      repo({
        id: 2,
        name: 'without-config',
        defaultBranch: 'dev',
        owner: { login: 'o', avatarUrl: 'a' },
      }),
    ];
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          r0: { object: { oid: 'abc123' } },
          r1: { object: null },
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await markRepositoriesWithShieldConfig('token', repos);

    // One round trip for the whole page, not one per repository.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.github.com/graphql');

    const body = JSON.parse(init.body as string) as {
      query: string;
      variables: Record<string, string>;
    };
    expect(body.query).toContain('query(');
    expect(body.query).toContain('$owner0: String!');
    expect(body.query).toContain('$expr0: String!');
    expect(body.query).toContain('r0: repository(owner: $owner0, name: $name0)');
    expect(body.query).toContain('r1: repository(owner: $owner1, name: $name1)');
    expect(body.variables).toEqual({
      owner0: 'o',
      name0: 'with-config',
      expr0: 'refs/heads/main:.shield-wizard.json',
      owner1: 'o',
      name1: 'without-config',
      expr1: 'refs/heads/dev:.shield-wizard.json',
    });

    // A Blob means the file exists; a null object means it does not.
    expect(result.map(r => r.hasShieldWizardConfig)).toEqual([true, false]);
    expect(result[0]).toMatchObject({ id: 1, name: 'with-config' });
  });

  test('returns an empty array for an empty page without calling GitHub', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await markRepositoriesWithShieldConfig('token', []);

    expect(result).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('throws when the GraphQL response carries no data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ errors: [{ message: 'Invalid query' }] }),
    }));

    await expect(
      markRepositoriesWithShieldConfig('token', [repo({ name: 'x' })]),
    ).rejects.toThrow('Invalid query');
  });

  test('throws a 401 GithubApiError when GitHub rejects the request', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ message: 'Bad credentials' }),
    }));

    await expect(
      markRepositoriesWithShieldConfig('token', [repo({ name: 'x' })]),
    ).rejects.toMatchObject({ status: 401 });
  });
});

describe('listInstallationRepositories pagination', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const apiRepo = {
    id: 1,
    name: 'r',
    full_name: 'o/r',
    private: false,
    description: null,
    html_url: 'https://github.com/o/r',
    default_branch: 'main',
    pushed_at: null,
    updated_at: '2026-01-01T00:00:00Z',
    owner: { login: 'o', avatar_url: 'a' },
  };

  function mockPage(repositories: unknown[], totalCount: number): void {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ total_count: totalCount, repositories }),
    }));
  }

  test('stops paging on a short page even when the reported total is higher', async () => {
    mockPage([apiRepo], 50);

    const { repos, hasMore } = await listInstallationRepositories('token', 1, 1, 100);

    expect(repos).toHaveLength(1);
    expect(hasMore).toBe(false);
  });

  test('does not offer another page when the total is zero', async () => {
    mockPage([], 0);

    const { repos, hasMore } = await listInstallationRepositories('token', 1, 1, 100);

    expect(repos).toHaveLength(0);
    expect(hasMore).toBe(false);
  });

  test('offers another page only for a full page with repositories remaining', async () => {
    mockPage(
      Array.from({ length: 100 }, (_, index) => ({ ...apiRepo, id: index + 1, name: `r${index}` })),
      150,
    );

    const { hasMore } = await listInstallationRepositories('token', 1, 1, 100);

    expect(hasMore).toBe(true);
  });
});
