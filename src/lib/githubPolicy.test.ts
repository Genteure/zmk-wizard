import { describe, expect, it } from 'vitest';
import {
  githubFileAdditions,
  githubFileDeletions,
  shouldPreserveGithubPath,
} from './githubPolicy';

describe('github preserved path policy', () => {
  it('always preserves the whole config directory', () => {
    expect(shouldPreserveGithubPath('config/west.yml')).toBe(true);
    expect(shouldPreserveGithubPath('config/my_board.keymap')).toBe(true);
    expect(shouldPreserveGithubPath('config')).toBe(true);
  });

  it('does not preserve wizard-owned files by default', () => {
    expect(shouldPreserveGithubPath('.shield-wizard.json')).toBe(false);
    expect(shouldPreserveGithubPath('.github/workflows/build.yml')).toBe(false);
    expect(shouldPreserveGithubPath('boards/shields/my_board/my_board.overlay')).toBe(false);
  });

  it('honors extra preserved paths computed from user modifications', () => {
    const extra = new Set(['build.yaml', 'README.md']);
    expect(shouldPreserveGithubPath('build.yaml', extra)).toBe(true);
    expect(shouldPreserveGithubPath('README.md', extra)).toBe(true);
    expect(shouldPreserveGithubPath('config/my_board.keymap', extra)).toBe(true);
  });

  it('filters preserved paths out of additions but keeps wizard files', () => {
    const extra = new Set(['README.md']);
    const additions = githubFileAdditions({
      'boards/shields/my_board/my_board.overlay': 'overlay',
      'config/my_board.keymap': 'user owned',
      'README.md': 'user modified',
      '.shield-wizard.json': '{}',
    }, extra);

    expect(additions.map(entry => entry.path).sort()).toEqual([
      '.shield-wizard.json',
      'boards/shields/my_board/my_board.overlay',
    ]);
  });

  it('deletes only stale non-preserved files', () => {
    const existing = [
      'boards/shields/my_board/old.overlay',
      'config/my_board.keymap',
      'README.md',
      '.github/workflows/build.yml',
      '.shield-wizard.json',
    ];
    const next = new Set([
      'boards/shields/my_board/new.overlay',
      'config/my_board.keymap',
      'README.md',
      '.github/workflows/build.yml',
      '.shield-wizard.json',
    ]);
    const extra = new Set(['README.md']);

    expect(githubFileDeletions(existing, next, extra)).toEqual([
      { path: 'boards/shields/my_board/old.overlay' },
    ]);
  });
});
