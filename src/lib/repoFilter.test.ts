import { describe, expect, test } from 'vitest';

import { filterReposByQuery, matchesRepoQuery, normalizeRepoQuery } from './repoFilter';

const repos = [
  { fullName: 'octocat/zmk-config', description: 'My split keyboard' },
  { fullName: 'octocat/notes', description: null },
  { fullName: 'acme/corne-config', description: 'Corne shield' },
];

describe('normalizeRepoQuery', () => {
  test('trims and lowercases', () => {
    expect(normalizeRepoQuery('  ZMK-Config ')).toBe('zmk-config');
  });

  test('whitespace-only queries normalize to empty', () => {
    expect(normalizeRepoQuery('   ')).toBe('');
  });
});

describe('matchesRepoQuery', () => {
  test('an empty query matches everything', () => {
    expect(matchesRepoQuery(repos[0], '')).toBe(true);
  });

  test('matches the full name case-insensitively', () => {
    expect(matchesRepoQuery(repos[0], 'octocat')).toBe(true);
    expect(matchesRepoQuery(repos[0], normalizeRepoQuery('OCTOCAT/ZMK'))).toBe(true);
  });

  test('matches the description', () => {
    expect(matchesRepoQuery(repos[0], 'split')).toBe(true);
    expect(matchesRepoQuery(repos[2], 'corne')).toBe(true);
  });

  test('handles a null description', () => {
    expect(matchesRepoQuery(repos[1], 'notes')).toBe(true);
    expect(matchesRepoQuery(repos[1], 'keyboard')).toBe(false);
  });
});

describe('filterReposByQuery', () => {
  test('returns a copy of every repository for an empty query', () => {
    const result = filterReposByQuery(repos, '');
    expect(result).toEqual(repos);
    expect(result).not.toBe(repos);
  });

  test('narrows by name and description and preserves order', () => {
    expect(filterReposByQuery(repos, 'config').map(repo => repo.fullName)).toEqual([
      'octocat/zmk-config',
      'acme/corne-config',
    ]);
  });

  test('returns nothing when there is no match', () => {
    expect(filterReposByQuery(repos, 'does-not-exist')).toEqual([]);
  });
});
