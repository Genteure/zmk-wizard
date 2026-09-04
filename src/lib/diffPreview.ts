// ─────────────────────────────────────────────────────────────
// Line-level diff preview grouping
//
// Renders a unified-diff-style preview from the raw `diff` package
// output. Changed lines are shown one row per line. Unchanged
// context is unfolded only when it is within a small distance of a
// change; everything else is collapsed into "N unchanged lines"
// fold entries.
//
// Adjacent changes with only a few unchanged lines between them are
// kept visible because the same context line can be close to both
// changes.
// ─────────────────────────────────────────────────────────────

import { diffLines } from 'diff';

export type DiffLineType = 'add' | 'remove' | 'context';

export interface DiffPreviewLine {
  type: DiffLineType;
  value: string;
}

export type DiffPreviewGroup
  = | { kind: 'change'; type: DiffLineType; value: string }
    | { kind: 'fold'; count: number };

/** Number of context lines to unfold on each side of a change. */
export const DIFF_CONTEXT_LINES = 3;

/**
 * Build the collapsed/expanded groups shown in the commit diff preview.
 *
 * A context line is visible when it is within `DIFF_CONTEXT_LINES`
 * display rows of any added or removed line. Consecutive invisible
 * context lines are merged into a single fold group.
 */
export function buildCommitDiffGroups(
  oldContent: string,
  newContent: string,
): DiffPreviewGroup[] {
  const lines: DiffPreviewLine[] = [];

  for (const part of diffLines(oldContent, newContent)) {
    const type: DiffLineType = part.added ? 'add' : part.removed ? 'remove' : 'context';
    const values = part.value.split('\n');
    if (part.value.endsWith('\n')) values.pop();

    for (const rawValue of values) {
      lines.push({ type, value: rawValue.replace(/\r$/, '') });
    }
  }

  const lineCount = lines.length;
  const changedPrefix = new Array<number>(lineCount + 1).fill(0);
  for (let i = 0; i < lineCount; i++) {
    changedPrefix[i + 1] = changedPrefix[i] + (lines[i].type !== 'context' ? 1 : 0);
  }

  const hasChangeNear = (index: number): boolean => {
    const start = Math.max(0, index - DIFF_CONTEXT_LINES);
    const end = Math.min(lineCount, index + DIFF_CONTEXT_LINES + 1);
    return changedPrefix[end] - changedPrefix[start] > 0;
  };

  const groups: DiffPreviewGroup[] = [];
  let hiddenCount = 0;

  const flushHidden = () => {
    if (hiddenCount === 0) return;
    groups.push({ kind: 'fold', count: hiddenCount });
    hiddenCount = 0;
  };

  for (let i = 0; i < lineCount; i++) {
    const line = lines[i];

    if (line.type !== 'context') {
      flushHidden();
      groups.push({ kind: 'change', type: line.type, value: line.value });
      continue;
    }

    if (hasChangeNear(i)) {
      flushHidden();
      groups.push({ kind: 'change', type: 'context', value: line.value });
    }
    else {
      hiddenCount += 1;
    }
  }

  flushHidden();

  return groups;
}
