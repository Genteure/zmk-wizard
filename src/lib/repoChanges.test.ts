import { describe, expect, it } from 'vitest';
import { computeRepositoryFileChanges } from './repoChanges';
import { createFilePolicy } from './filePolicy';
import type { RepositoryFileChange } from './repoChanges';

const myBoard = createFilePolicy('my_board');

describe('computeRepositoryFileChanges', () => {
  it('reports new files as added', async () => {
    const changes = await computeRepositoryFileChanges({
      existingPaths: ['README.md'],
      newFiles: {
        'README.md': 'readme',
        'boards/shields/my_board/my_board.overlay': 'overlay',
      },
      policy: myBoard,
      readFile: async path => path === 'README.md' ? 'readme' : null,
    });

    expect(changes).toEqual<RepositoryFileChange[]>([
      {
        path: 'boards/shields/my_board/my_board.overlay',
        status: 'added',
        oldContent: '',
        newContent: 'overlay',
      },
    ]);
  });

  it('reports changed existing files as modified and skips unchanged files', async () => {
    const files: Record<string, string> = {
      '.shield-wizard.json': '{"version":2}',
      'build.yaml': 'build: new',
      'boards/shields/my_board/my_board.overlay': 'overlay',
    };

    const changes = await computeRepositoryFileChanges({
      existingPaths: Object.keys(files),
      newFiles: {
        ...files,
        'build.yaml': 'build: old',
      },
      policy: myBoard,
      readFile: async path => files[path] ?? null,
    });

    expect(changes).toEqual<RepositoryFileChange[]>([
      {
        path: 'build.yaml',
        status: 'modified',
        oldContent: 'build: new',
        newContent: 'build: old',
      },
    ]);
  });

  it('reports stale generated files as deleted', async () => {
    const changes = await computeRepositoryFileChanges({
      existingPaths: ['boards/shields/my_board/old.overlay'],
      newFiles: {},
      policy: myBoard,
      readFile: async () => 'old content',
    });

    expect(changes).toEqual<RepositoryFileChange[]>([
      {
        path: 'boards/shields/my_board/old.overlay',
        status: 'deleted',
        oldContent: 'old content',
        newContent: '',
      },
    ]);
  });

  it('does not include user-modified conditional files even when the generated copy changed', async () => {
    const userModifiedPaths = new Set(['config/my_board.keymap']);
    const changes = await computeRepositoryFileChanges({
      existingPaths: ['README.md', 'config/my_board.keymap'],
      newFiles: {
        'README.md': 'new readme',
        'config/my_board.keymap': 'new keymap',
      },
      policy: myBoard,
      userModifiedPaths,
      readFile: async () => 'old content',
    });

    expect(changes).toEqual([]);
  });

  it('sorts changes by path', async () => {
    const changes = await computeRepositoryFileChanges({
      existingPaths: ['build.yaml', '.shield-wizard.json'],
      newFiles: {
        '.shield-wizard.json': 'new data',
        'build.yaml': 'new build',
      },
      policy: myBoard,
      readFile: async () => 'old content',
    });

    expect(changes.map(change => change.path)).toEqual([
      '.shield-wizard.json',
      'build.yaml',
    ]);
  });
});
