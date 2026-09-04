import { describe, expect, it } from 'vitest';
import {
  DIFF_CONTEXT_LINES,
  buildCommitDiffGroups,
} from './diffPreview';
import type { DiffPreviewGroup } from './diffPreview';

function line(value: string, type: 'add' | 'remove' | 'context' = 'context'): DiffPreviewGroup {
  return { kind: 'change', type, value };
}

describe('buildCommitDiffGroups', () => {
  it('unfolds up to 3 context lines on each side of an isolated change', () => {
    const groups = buildCommitDiffGroups(
      '1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n',
      '1\n2\n3\nCHANGED\n5\n6\n7\n8\n9\n10\n',
    );

    expect(groups).toEqual<DiffPreviewGroup[]>([
      line('1'),
      line('2'),
      line('3'),
      line('4', 'remove'),
      line('CHANGED', 'add'),
      line('5'),
      line('6'),
      line('7'),
      { kind: 'fold', count: 3 },
    ]);
  });

  it('does not fold context between adjacent changes when it is within 3 lines of either change', () => {
    // Two changes separated by exactly the context width.
    const groups = buildCommitDiffGroups(
      'a\nb\nc\nd\ne\n',
      'A\nb\nc\nd\nE\n',
    );

    expect(groups).toEqual<DiffPreviewGroup[]>([
      line('a', 'remove'),
      line('A', 'add'),
      line('b'),
      line('c'),
      line('d'),
      line('e', 'remove'),
      line('E', 'add'),
    ]);
  });

  it('folds only the middle of a longer unchanged gap', () => {
    // Two changes with 9 unchanged lines between them: keep 3 on each
    // side and fold the 3 lines that are farther than 3 from both changes.
    const groups = buildCommitDiffGroups(
      '1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\n',
      'CHANGED1\n2\n3\n4\n5\n6\n7\n8\n9\n10\nCHANGED11\n',
    );

    expect(groups).toEqual<DiffPreviewGroup[]>([
      line('1', 'remove'),
      line('CHANGED1', 'add'),
      line('2'),
      line('3'),
      line('4'),
      { kind: 'fold', count: 3 },
      line('8'),
      line('9'),
      line('10'),
      line('11', 'remove'),
      line('CHANGED11', 'add'),
    ]);
  });

  it('keeps longer context visible when every line is within the context window', () => {
    // Two changes with 6 unchanged lines: each unchanged line is within
    // 3 rows of at least one change, so nothing is folded.
    const groups = buildCommitDiffGroups(
      'a\nb\nc\nd\ne\nf\ng\nh\n',
      'A\nb\nc\nd\ne\nf\ng\nH\n',
    );

    expect(groups.some(group => group.kind === 'fold')).toBe(false);
    expect(groups.filter(group => group.kind === 'change' && group.type === 'context')).toHaveLength(6);
  });

  it('uses the configured context width when deciding what to unfold', () => {
    const groups = buildCommitDiffGroups(
      '1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n',
      'CHANGED1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n',
    );

    // Exactly DIFF_CONTEXT_LINES following lines are unfolded.
    const visibleContextCount = groups.filter(
      group => group.kind === 'change' && group.type === 'context',
    ).length;
    expect(visibleContextCount).toBe(DIFF_CONTEXT_LINES);
  });
});
