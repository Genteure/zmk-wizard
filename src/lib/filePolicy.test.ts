import { describe, expect, it } from 'vitest';
import {
  computeUserModifiedPaths,
  createFilePolicy,
  planFileChanges,
  shouldTouchPath,
} from './filePolicy';

describe('file policy rules', () => {
  it('defaults to not touching unknown paths', () => {
    const policy = createFilePolicy('my_board');
    expect(shouldTouchPath('README.md', policy)).toBe(false);
    expect(shouldTouchPath('config/my_board.conf', policy)).toBe(false);
    expect(shouldTouchPath('user.txt', policy)).toBe(false);
  });

  it('full-sync directories allow arbitrary writes and deletions', () => {
    const policy = createFilePolicy('my_board');
    expect(shouldTouchPath('boards/shields/my_board/whatever.overlay', policy)).toBe(true);
    expect(shouldTouchPath('boards/shields', policy)).toBe(true);
    expect(shouldTouchPath('snippets/my_board/snippet.yml', policy)).toBe(true);
  });

  it('distinguishes always-updated, conditional, and never-touched paths', () => {
    const policy = createFilePolicy('my_board');
    expect(shouldTouchPath('config/my_board.json', policy)).toBe(true);
    expect(shouldTouchPath('config/my_board.json', policy, new Set(['config/my_board.json']))).toBe(true);
    expect(shouldTouchPath('.github/workflows/build.yml', policy)).toBe(true);
    expect(shouldTouchPath('.github/shield-wizard-layout.svg', policy)).toBe(true);

    expect(shouldTouchPath('config/my_board.keymap', policy)).toBe(true);
    expect(shouldTouchPath('config/my_board.keymap', policy, new Set(['config/my_board.keymap']))).toBe(false);
    expect(shouldTouchPath('build.yaml', policy, new Set(['build.yaml']))).toBe(false);

    expect(shouldTouchPath('README.md', policy, new Set(['README.md']))).toBe(false);
  });
});

describe('plan file changes', () => {
  it('writes the full owned file set and deletes stale full-sync files', () => {
    const policy = createFilePolicy('my_board');
    const plan = planFileChanges(
      {
        '.github/shield-wizard-layout.svg': 'svg',
        '.github/workflows/build.yml': 'workflow',
        '.shield-wizard.json': '{}',
        'boards/shields/my_board/new.overlay': 'new overlay',
        'build.yaml': 'build',
        'config/my_board.json': 'json',
        'config/my_board.keymap': 'keymap',
        'config/west.yml': 'west',
        'config/my_board.conf': 'user conf',
        'README.md': 'readme',
        'user.txt': 'user',
        'zephyr/module.yml': 'module',
      },
      [
        'boards/shields/my_board/stale.overlay',
        'config/my_board.conf',
        'README.md',
        'user.txt',
      ],
      policy,
    );

    expect(plan.additions.map(entry => entry.path).sort()).toEqual([
      '.github/shield-wizard-layout.svg',
      '.github/workflows/build.yml',
      '.shield-wizard.json',
      'boards/shields/my_board/new.overlay',
      'build.yaml',
      'config/my_board.json',
      'config/my_board.keymap',
      'config/west.yml',
      'zephyr/module.yml',
    ]);
    expect(plan.deletions).toEqual([
      { path: 'boards/shields/my_board/stale.overlay' },
    ]);
  });

  it('preserves user-modified conditional paths but still touches owned paths', () => {
    const policy = createFilePolicy('my_board');
    const userModified = new Set(['build.yaml', 'config/my_board.keymap']);

    const plan = planFileChanges(
      {
        '.github/workflows/build.yml': 'workflow',
        'boards/shields/my_board/new.overlay': 'new overlay',
        'build.yaml': 'new build',
        'config/my_board.json': 'json',
        'config/my_board.keymap': 'new keymap',
        'config/west.yml': 'west',
        'zephyr/module.yml': 'module',
      },
      ['build.yaml', 'config/my_board.keymap'],
      policy,
      userModified,
    );

    expect(plan.additions.map(entry => entry.path).sort()).toEqual([
      '.github/workflows/build.yml',
      'boards/shields/my_board/new.overlay',
      'config/my_board.json',
      'config/west.yml',
      'zephyr/module.yml',
    ]);
    expect(plan.deletions).toEqual([]);
  });

  it('does not delete user-modified conditional files when they become stale', () => {
    const policy = createFilePolicy('my_board');
    const plan = planFileChanges(
      {},
      ['build.yaml'],
      policy,
      new Set(['build.yaml']),
    );

    expect(plan.deletions).toEqual([]);
  });

  it('deletes stale conditional files when the user has not modified them', () => {
    const policy = createFilePolicy('my_board');
    const plan = planFileChanges({}, ['build.yaml'], policy);

    expect(plan.deletions).toEqual([
      { path: 'build.yaml' },
    ]);
  });
});

describe('compute user-modified paths', () => {
  it('marks only existing conditional files that differ from baseline', async () => {
    const policy = createFilePolicy('my_board');
    const baseline = {
      'config/my_board.keymap': 'baseline keymap',
      'config/west.yml': 'baseline west',
      'zephyr/module.yml': 'baseline module',
      'build.yaml': 'baseline build',
    };

    const userModified = await computeUserModifiedPaths(
      baseline,
      async (path) => {
        const contents: Record<string, string | null> = {
          'config/my_board.keymap': 'user keymap',
          'config/west.yml': 'baseline west',
          'zephyr/module.yml': null,
          'build.yaml': 'user build',
        };
        return contents[path] ?? null;
      },
      policy,
    );

    expect([...userModified].sort()).toEqual([
      'build.yaml',
      'config/my_board.keymap',
    ]);
  });

  it('creates policy rules for the requested shield name', () => {
    const policy = createFilePolicy('my_board');
    expect(policy.alwaysUpdatePaths.has('config/my_board.json')).toBe(true);
    expect(policy.conditionalUpdatePaths.has('config/my_board.keymap')).toBe(true);
    expect(policy.neverTouchPaths.has('README.md')).toBe(true);
    expect(policy.fullSyncDirectories).toContain('boards/shields/');
  });
});
