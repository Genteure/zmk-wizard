import { describe, expect, test } from 'vitest';
import { gridfit } from '~/lib/autolayout/gridfit';
import type { Rect } from '~/lib/autolayout/types';

const makeObj = (id: string, x: number, y: number, w = 10, h = 10): Rect =>
  ({ id, x, y, width: w, height: h, degree: 0 });

describe('gridfit', () => {
  test('returns all objects in the grid when they are already connected', () => {
    // A─B arranged horizontally, touching at threshold=1
    const objects = [
      makeObj('A', 0, 0),
      makeObj('B', 10, 0),
    ];

    const { grid, positions } = gridfit({ objects, threshold: 1 });

    expect(positions.has('A')).toBe(true);
    expect(positions.has('B')).toBe(true);

    const posA = positions.get('A')!;
    const posB = positions.get('B')!;

    // They share the same row; B is to the right of A.
    expect(posA.row).toBe(posB.row);
    expect(posA.col).toBeLessThan(posB.col);

    // Grid contains both ids.
    const flat = grid.flat();
    expect(flat).toContain('A');
    expect(flat).toContain('B');
  });

  test('handles a single object', () => {
    const objects = [makeObj('X', 5, 5)];

    const { grid, positions } = gridfit({ objects, threshold: 1 });

    expect(positions.size).toBe(1);
    expect(positions.has('X')).toBe(true);
    expect(grid.flat()).toContain('X');
  });

  test('handles empty input', () => {
    const { grid, positions } = gridfit({ objects: [], threshold: 1 });

    expect(positions.size).toBe(0);
    // gridfit returns a minimal grid structure even for empty input; no objects are placed.
    const flat = grid.flat().filter(v => v !== null);
    expect(flat).toHaveLength(0);
  });

  test('bridges disconnected components and places all objects', () => {
    // Two isolated pairs far apart — bridging must connect them.
    const objects = [
      makeObj('A', 0,   0),
      makeObj('B', 10,  0),
      makeObj('C', 100, 0),
      makeObj('D', 110, 0),
    ];

    const { positions } = gridfit({ objects, threshold: 1 });

    expect(positions.size).toBe(4);
    for (const id of ['A', 'B', 'C', 'D']) {
      expect(positions.has(id)).toBe(true);
    }

    // All objects share the same row (they are collinear on y=0).
    const rows = [...positions.values()].map(p => p.row);
    expect(new Set(rows).size).toBe(1);

    // Columns are all distinct.
    const cols = [...positions.values()].map(p => p.col);
    expect(new Set(cols).size).toBe(4);
  });

  test('all positions are unique', () => {
    const objects = [
      makeObj('A',  0,  0),
      makeObj('B', 10,  0),
      makeObj('C',  0, 10),
      makeObj('D', 10, 10),
    ];

    const { positions } = gridfit({ objects, threshold: 1 });

    const seen = new Set<string>();
    for (const { row, col } of positions.values()) {
      const key = `${row},${col}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  test('layoutPreference is forwarded to the layout step', () => {
    // Two objects; we tell the layoutPreference to prefer top-left for 'A'.
    // This is a smoke test to ensure the option is wired through.
    const objects = [makeObj('A', 0, 0), makeObj('B', 10, 0)];

    expect(() =>
      gridfit({
        objects,
        threshold: 1,
        layoutPreference: (id) => id === 'A' ? ['top', 'left'] : null,
      })
    ).not.toThrow();
  });
});
