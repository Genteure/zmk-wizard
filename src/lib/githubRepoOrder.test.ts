import { describe, expect, test } from 'vitest';

import { compareGithubRepos, type GithubRepoOrderFields } from './githubRepoOrder';

function repo(overrides: Partial<GithubRepoOrderFields> = {}): GithubRepoOrderFields {
  return {
    fullName: 'owner/repo',
    hasShieldWizardConfig: true,
    pushedAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-01T00:00:00Z',
    ...overrides,
  };
}

describe('compareGithubRepos', () => {
  test('sorts Shield Wizard repositories first', () => {
    const supported = repo({ fullName: 'a/supported', hasShieldWizardConfig: true });
    const unsupported = repo({ fullName: 'b/unsupported', hasShieldWizardConfig: false, pushedAt: '2030-01-01T00:00:00Z' });
    expect(compareGithubRepos(supported, unsupported)).toBeLessThan(0);
    expect(compareGithubRepos(unsupported, supported)).toBeGreaterThan(0);
  });

  test('sorts most recently pushed repositories first', () => {
    const recent = repo({ fullName: 'a/recent', pushedAt: '2026-08-10T00:00:00Z' });
    const older = repo({ fullName: 'b/older', pushedAt: '2026-08-01T00:00:00Z' });
    expect(compareGithubRepos(recent, older)).toBeLessThan(0);
    expect(compareGithubRepos(older, recent)).toBeGreaterThan(0);
  });

  test('falls back to updatedAt when the repository was never pushed', () => {
    const updated = repo({ fullName: 'a/updated', pushedAt: null, updatedAt: '2026-08-10T00:00:00Z' });
    const stale = repo({ fullName: 'b/stale', pushedAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z' });
    expect(compareGithubRepos(updated, stale)).toBeLessThan(0);
  });

  test('breaks recency ties by full name', () => {
    const a = repo({ fullName: 'a/repo', pushedAt: '2026-08-01T00:00:00Z' });
    const b = repo({ fullName: 'b/repo', pushedAt: '2026-08-01T00:00:00Z' });
    expect(compareGithubRepos(a, b)).toBeLessThan(0);
  });
});
