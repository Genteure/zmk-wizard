// auto generated, not trustworthy, disregard as necessary
// fail could mean either a real bug or just an incorrect test.
// pass also doesn't necessarily mean the implementation is correct, it's possible the test is incomplete or just match the incorrect implementation. So review carefully before making any conclusions.

import { describe, it, expect } from 'vitest';
import { findNeighbors } from '~/lib/autolayout/neighbor';
import type { Rect, NeighborInput, ObjId, Relation } from '~/lib/autolayout/types';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const R = (overrides: { id: ObjId } & Partial<Omit<Rect, 'id'>>): Rect => ({
  x: 0,
  y: 0,
  width: 2,
  height: 2,
  degree: 0,
  ...overrides,
});

const input = (objects: Rect[], threshold: number): NeighborInput => ({
  objects,
  threshold,
});

/**
 * Rotate a point clockwise by `degree` degrees around the origin.
 * Used to place objects in rotated configurations.
 */
const rotateCw = (
  x: number,
  y: number,
  degree: number,
): { x: number; y: number } => {
  const rad = (degree * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: x * cos - y * sin,
    y: x * sin + y * cos,
  };
};

/** Collect pairs from relation arrays for easy set-based comparison */
const pairsOf = (relations: Relation[]): Set<string> =>
  new Set(relations.map(([u, v]) => `${u}->${v}`));


// ---------------------------------------------------------------------------
// findNeighbors
// ---------------------------------------------------------------------------

describe('findNeighbors', () => {
  // -------------------------------------------------------------------------
  // 1. output structure invariants
  // -------------------------------------------------------------------------
  describe('output invariants', () => {
    it('output.objects contains all input IDs in order', () => {
      const objects = [R({ id: 'a', x: 0, y: 0 }), R({ id: 'b', x: 10, y: 10 })];
      const result = findNeighbors(input(objects, 1));
      expect(result.nodes).toEqual(['a', 'b']);
    });

    it('single-object output has no relations', () => {
      const result = findNeighbors(input([R({ id: 'x' })], 1));
      expect(result.nodes).toEqual(['x']);
      expect(result.horizontal).toEqual([]);
      expect(result.vertical).toEqual([]);
    });

    it('relations contain no self-loops', () => {
      const result = findNeighbors(input([R({ id: 'a' })], 5));
      for (const [u, v] of [...result.horizontal, ...result.vertical]) {
        expect(u).not.toBe(v);
      }
    });

    it('relations contain no duplicates', () => {
      const objects = [R({ id: 'a', x: 0, y: 0 }), R({ id: 'b', x: 1.5, y: 0 })];
      const result = findNeighbors(input(objects, 1));
      const hSet = pairsOf(result.horizontal);
      const vSet = pairsOf(result.vertical);
      expect(result.horizontal.length).toBe(hSet.size);
      expect(result.vertical.length).toBe(vSet.size);
    });
  });

  // -------------------------------------------------------------------------
  // 2. empty & isolated inputs
  // -------------------------------------------------------------------------
  describe('empty & isolated', () => {
    it('empty input returns empty output', () => {
      const result = findNeighbors(input([], 1));
      expect(result.nodes).toEqual([]);
      expect(result.horizontal).toEqual([]);
      expect(result.vertical).toEqual([]);
    });

    it('two far-apart objects have no relations', () => {
      const objects = [R({ id: 'a', x: 0, y: 0 }), R({ id: 'b', x: 100, y: 100 })];
      const result = findNeighbors(input(objects, 1));
      expect(result.horizontal).toEqual([]);
      expect(result.vertical).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // 3. basic horizontal neighbors (degree = 0)
  // -------------------------------------------------------------------------
  describe('basic horizontal', () => {
    it('detects side-by-side objects within threshold', () => {
      // A: 2x2 at (0,0), B: 2x2 at (3,0), threshold=2
      // A right zone center=(2,0) halfW=1 → x=[1,3]; B body x=[2,4] → overlap ✓
      // B left zone center=(1,0) halfW=1 → x=[0,2]; A body x=[-1,1] → overlap ✓
      const objects = [
        R({ id: 'a', x: 0, y: 0, width: 2, height: 2 }),
        R({ id: 'b', x: 3, y: 0, width: 2, height: 2 }),
      ];
      const result = findNeighbors(input(objects, 2));
      expect(pairsOf(result.horizontal)).toEqual(new Set(['a->b']));
      expect(result.vertical).toEqual([]);
    });

    it('detects horizontal chain (three in a row)', () => {
      const objects = [
        R({ id: 'a', x: 0, y: 0, width: 2, height: 2 }),
        R({ id: 'b', x: 3, y: 0, width: 2, height: 2 }),
        R({ id: 'c', x: 6, y: 0, width: 2, height: 2 }),
      ];
      const result = findNeighbors(input(objects, 2));
      expect(pairsOf(result.horizontal)).toEqual(new Set(['a->b', 'b->c']));
      expect(result.vertical).toEqual([]);
    });

    it('no horizontal relation when gap exceeds threshold', () => {
      const objects = [
        R({ id: 'a', x: 0, y: 0, width: 2, height: 2 }),
        R({ id: 'b', x: 10, y: 0, width: 2, height: 2 }),
      ];
      expect(findNeighbors(input(objects, 1)).horizontal).toEqual([]);
    });

    it('relation is directional: left->right only', () => {
      const objects = [
        R({ id: 'left', x: 0, y: 0, width: 2, height: 2 }),
        R({ id: 'right', x: 3, y: 0, width: 2, height: 2 }),
      ];
      expect(pairsOf(findNeighbors(input(objects, 2)).horizontal)).toEqual(
        new Set(['left->right']),
      );
    });
  });

  // -------------------------------------------------------------------------
  // 4. basic vertical neighbors (degree = 0)
  // -------------------------------------------------------------------------
  describe('basic vertical', () => {
    it('detects stacked objects within threshold', () => {
      // A: 2x2 at (0,0), B: 2x2 at (0,3), threshold=2
      // A down zone y=[1,3]; B body y=[2,4] → overlap y=[2,3] area>0 ✓
      const objects = [
        R({ id: 'a', x: 0, y: 0, width: 2, height: 2 }),
        R({ id: 'b', x: 0, y: 3, width: 2, height: 2 }),
      ];
      const result = findNeighbors(input(objects, 2));
      expect(pairsOf(result.vertical)).toEqual(new Set(['a->b']));
      expect(result.horizontal).toEqual([]);
    });

    it('detects vertical chain (three stacked)', () => {
      const objects = [
        R({ id: 'a', x: 0, y: 0, width: 2, height: 2 }),
        R({ id: 'b', x: 0, y: 3, width: 2, height: 2 }),
        R({ id: 'c', x: 0, y: 6, width: 2, height: 2 }),
      ];
      const result = findNeighbors(input(objects, 2));
      expect(pairsOf(result.vertical)).toEqual(new Set(['a->b', 'b->c']));
      expect(result.horizontal).toEqual([]);
    });

    it('no vertical relation when gap exceeds threshold', () => {
      const objects = [
        R({ id: 'a', x: 0, y: 0, width: 2, height: 2 }),
        R({ id: 'b', x: 0, y: 10, width: 2, height: 2 }),
      ];
      expect(findNeighbors(input(objects, 1)).vertical).toEqual([]);
    });

    it('relation is directional: top->bottom only', () => {
      const objects = [
        R({ id: 'top', x: 0, y: 0, width: 2, height: 2 }),
        R({ id: 'bottom', x: 0, y: 3, width: 2, height: 2 }),
      ];
      expect(pairsOf(findNeighbors(input(objects, 2)).vertical)).toEqual(
        new Set(['top->bottom']),
      );
    });
  });

  // -------------------------------------------------------------------------
  // 5. diagonal placement — no relation
  // -------------------------------------------------------------------------
  describe('diagonal placement', () => {
    it('diagonally placed objects produce no relation', () => {
      const objects = [
        R({ id: 'a', x: 0, y: 0, width: 2, height: 2 }),
        R({ id: 'b', x: 4, y: 4, width: 2, height: 2 }),
      ];
      const result = findNeighbors(input(objects, 2));
      expect(result.horizontal).toEqual([]);
      expect(result.vertical).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // 6. mixed horizontal + vertical
  // -------------------------------------------------------------------------
  describe('mixed relations', () => {
    it('one object can have both horizontal and vertical neighbors', () => {
      const objects = [
        R({ id: 'a', x: 0, y: 0, width: 2, height: 2 }),
        R({ id: 'b', x: 3, y: 0, width: 2, height: 2 }), // to the right of a
        R({ id: 'c', x: 0, y: 3, width: 2, height: 2 }), // below a
      ];
      const result = findNeighbors(input(objects, 2));
      expect(pairsOf(result.horizontal)).toEqual(new Set(['a->b']));
      expect(pairsOf(result.vertical)).toEqual(new Set(['a->c']));
    });

    it('same pair can have both horizontal and vertical relation', () => {
      // A: 4x4 at (0,0), B: 2x2 at (2.5,2.5), threshold=2
      // A right zone: x=[2,4] y=[-2,2]; B body: x=[1.5,3.5] y=[1.5,3.5] → overlap ✓
      // B left zone center=(0.5,2.5): x=[-0.5,1.5] y=[1.5,3.5]; A body x=[-2,2] y=[-2,2] → overlap ✓
      // A down zone: x=[-2,2] y=[2,4]; B body x=[1.5,3.5] y=[1.5,3.5] → overlap ✓
      // B up zone center=(2.5,0.5): x=[1.5,3.5] y=[-0.5,1.5]; A body x=[-2,2] y=[-2,2] → overlap ✓
      const objects = [
        R({ id: 'a', x: 0, y: 0, width: 4, height: 4 }),
        R({ id: 'b', x: 2.5, y: 2.5, width: 2, height: 2 }),
      ];
      const result = findNeighbors(input(objects, 2));
      expect(pairsOf(result.horizontal)).toEqual(new Set(['a->b']));
      expect(pairsOf(result.vertical)).toEqual(new Set(['a->b']));
    });
  });

  // -------------------------------------------------------------------------
  // 7. boundary contact — epsilon filtering
  // -------------------------------------------------------------------------
  describe('boundary contact', () => {
    it('objects touching only at boundary are not neighbors', () => {
      // A: 2x2 at (0,0), B: 2x2 at (3,0), threshold=1
      // A right zone x=[1,2]; B body x=[2,4] → touch at x=2 only → area=0 → not neighbor
      const objects = [
        R({ id: 'a', x: 0, y: 0, width: 2, height: 2 }),
        R({ id: 'b', x: 3, y: 0, width: 2, height: 2 }),
      ];
      const result = findNeighbors(input(objects, 1));
      expect(result.horizontal).toEqual([]);
      expect(result.vertical).toEqual([]);
    });

    it('barely overlapping objects are neighbors', () => {
      // A: 2x2 at (0,0), B: 2x2 at (2.99,0), threshold=1
      // A right zone x=[1,2]; B x=[1.99,3.99] → overlap x=[1.99,2] area≈0.02 > 0 ✓
      const objects = [
        R({ id: 'a', x: 0, y: 0, width: 2, height: 2 }),
        R({ id: 'b', x: 2.99, y: 0, width: 2, height: 2 }),
      ];
      const result = findNeighbors(input(objects, 1));
      expect(pairsOf(result.horizontal)).toEqual(new Set(['a->b']));
    });
  });

  // -------------------------------------------------------------------------
  // 8. rotation
  // -------------------------------------------------------------------------
  describe('rotation', () => {
    it('90° CW rotation: local "right" becomes global "down"', () => {
      // A at (0,0) degree=90: global body AABB x=[-1,1] y=[-1,1]
      // A local-right zone lx=1.5 → global center (0,1.5), zone 1×2 at 90°
      //   AABB: x=[-1,1] y=[1,2]
      // B at (0,2) degree=90: body AABB x=[-1,1] y=[1,3] → overlaps A's right zone ✓
      // B local-left zone lx=-1.5 → global center (0,0.5), AABB x=[-1,1] y=[0,1]
      //   A body AABB x=[-1,1] y=[-1,1] → overlap y=[0,1] area>0 ✓ → horizontal a->b
      const objects = [
        R({ id: 'a', x: 0, y: 0, width: 2, height: 2, degree: 90 }),
        R({ id: 'b', x: 0, y: 2, width: 2, height: 2, degree: 90 }),
      ];
      const result = findNeighbors(input(objects, 1));
      expect(pairsOf(result.horizontal)).toEqual(new Set(['a->b']));
      expect(result.vertical).toEqual([]);
    });

    it('uniform 30° rotation preserves horizontal relation', () => {
      // Rotate both centers and local frames by 30°; same relative geometry → same result.
      const angle = 30;
      const a = rotateCw(0, 0, angle);
      const b = rotateCw(3, 0, angle);
      const objects = [
        R({ id: 'a', x: a.x, y: a.y, width: 2, height: 2, degree: angle }),
        R({ id: 'b', x: b.x, y: b.y, width: 2, height: 2, degree: angle }),
      ];
      const result = findNeighbors(input(objects, 2));
      expect(pairsOf(result.horizontal)).toEqual(new Set(['a->b']));
      expect(result.vertical).toEqual([]);
    });

    it('uniform 30° rotation preserves boundary-contact non-relation', () => {
      const angle = 30;
      const a = rotateCw(0, 0, angle);
      const b = rotateCw(3, 0, angle);
      const objects = [
        R({ id: 'a', x: a.x, y: a.y, width: 2, height: 2, degree: angle }),
        R({ id: 'b', x: b.x, y: b.y, width: 2, height: 2, degree: angle }),
      ];
      const result = findNeighbors(input(objects, 1));
      expect(result.horizontal).toEqual([]);
      expect(result.vertical).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // 9. non-uniform sizes
  // -------------------------------------------------------------------------
  describe('non-uniform sizes', () => {
    it('wide object spans two horizontal neighbors', () => {
      const objects = [
        R({ id: 'wide', x: 0, y: 0, width: 4, height: 2 }),
        R({ id: 'right', x: 3, y: 0, width: 2, height: 2 }),
        R({ id: 'left', x: -3, y: 0, width: 2, height: 2 }),
      ];
      const result = findNeighbors(input(objects, 1));
      expect(pairsOf(result.horizontal)).toEqual(new Set(['left->wide', 'wide->right']));
    });

    it('tall object has vertical neighbors of different widths', () => {
      const objects = [
        R({ id: 'tall', x: 0, y: 0, width: 2, height: 4 }),
        R({ id: 'below', x: 0, y: 3, width: 2, height: 2 }),
        R({ id: 'above', x: 0, y: -3, width: 4, height: 2 }),
      ];
      const result = findNeighbors(input(objects, 1));
      expect(pairsOf(result.vertical)).toEqual(new Set(['above->tall', 'tall->below']));
    });
  });

  // -------------------------------------------------------------------------
  // 10. one-way overlap does NOT produce a relation
  // -------------------------------------------------------------------------
  describe('one-way overlap', () => {
    it('zone hits body but reverse does not → no relation', () => {
      // A: 2x2 at (0,0), B: 10x2 at (3,0), threshold=1
      // A right zone x=[1,2]: B body x=[-2,8] overlaps → A sees B as right one-way ✓
      // B left zone x=[-3,-2]: A body x=[-1,1] does NOT overlap → reverse fails → no relation
      const objects = [
        R({ id: 'a', x: 0, y: 0, width: 2, height: 2 }),
        R({ id: 'b', x: 3, y: 0, width: 10, height: 2 }),
      ];
      const result = findNeighbors(input(objects, 1));
      expect(result.horizontal).toEqual([]);
      expect(result.vertical).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // 11. grid-like 2D layouts
  // -------------------------------------------------------------------------
  describe('grid-like layouts', () => {
    it('2×2 grid — four edge relations', () => {
      // a b
      // c d   (2×2 objects at spacing 2, threshold 1)
      const objects = [
        R({ id: 'a', x: 0, y: 0 }),
        R({ id: 'b', x: 2, y: 0 }),
        R({ id: 'c', x: 0, y: 2 }),
        R({ id: 'd', x: 2, y: 2 }),
      ];
      const result = findNeighbors(input(objects, 1));
      expect(pairsOf(result.horizontal)).toEqual(new Set(['a->b', 'c->d']));
      expect(pairsOf(result.vertical)).toEqual(new Set(['a->c', 'b->d']));
    });

    it('3×3 full grid — exactly 6 horizontal and 6 vertical relations', () => {
      const objects: Rect[] = [];
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
          objects.push(R({ id: `${row}${col}`, x: col * 2, y: row * 2 }));
        }
      }
      const result = findNeighbors(input(objects, 1));
      expect(result.horizontal.length).toBe(6);
      expect(result.vertical.length).toBe(6);
      expect(pairsOf(result.horizontal)).toEqual(
        new Set(['00->01', '01->02', '10->11', '11->12', '20->21', '21->22']),
      );
      expect(pairsOf(result.vertical)).toEqual(
        new Set(['00->10', '10->20', '01->11', '11->21', '02->12', '12->22']),
      );
    });
  });

  // -------------------------------------------------------------------------
  // 12. translation invariance
  // -------------------------------------------------------------------------
  describe('translation invariance', () => {
    it('translating all objects preserves relations', () => {
      const dx = 1.2142, dy = 0.5432;
      const at = (ox: number, oy: number) => [
        R({ id: 'a', x: ox, y: oy, width: 2, height: 2 }),
        R({ id: 'b', x: ox + 3, y: oy, width: 2, height: 2 }),
      ];
      const r1 = pairsOf(findNeighbors(input(at(0, 0), 2)).horizontal);
      const r2 = pairsOf(findNeighbors(input(at(dx, dy), 2)).horizontal);
      expect(r2).toEqual(r1);
    });
  });

  // -------------------------------------------------------------------------
  // 13. threshold sensitivity
  // -------------------------------------------------------------------------
  describe('threshold sensitivity', () => {
    it('small threshold detects very close objects', () => {
      // A: 2x2 at (0,0), B: 2x2 at (2.01,0), T=0.1
      // A right zone x=[1,1.1]; B x=[1.01,3.01] → overlap ≈ 0.09 wide > 0 ✓
      const objects = [
        R({ id: 'a', x: 0, y: 0, width: 2, height: 2 }),
        R({ id: 'b', x: 2.01, y: 0, width: 2, height: 2 }),
      ];
      expect(pairsOf(findNeighbors(input(objects, 0.1)).horizontal)).toEqual(
        new Set(['a->b']),
      );
    });

    it('increasing threshold connects previously disconnected objects', () => {
      const objects = [
        R({ id: 'a', x: 0, y: 0, width: 2, height: 2 }),
        R({ id: 'b', x: 5, y: 0, width: 2, height: 2 }), // gap = 2
      ];
      // T=1: zone spans only 1 unit; A right edge at 1, B left edge at 4 → not connected
      expect(findNeighbors(input(objects, 1)).horizontal).toEqual([]);
      // T=3: A right zone reaches x=4; B starts at 4... boundary only?
      // A right zone halfW=1.5, center=2.5 → x=[1,4]; B x=[4,6] → touch only → still no
      // T=3.1: A right zone x=[1,4.1]; B x=[4,6] → overlap x=[4,4.1] area>0 ✓
      expect(pairsOf(findNeighbors(input(objects, 3.1)).horizontal)).toEqual(
        new Set(['a->b']),
      );
    });
  });

  // -------------------------------------------------------------------------
  // 14. extreme aspect ratios
  // -------------------------------------------------------------------------
  describe('extreme aspect ratios', () => {
    it('very thin horizontal object finds vertical neighbor', () => {
      // thin: 10×0.5 at (0,0); normal: 2×2 at (0,1.25); T=1
      // thin down zone: center y=0.25+0.5=0.75, halfH=0.5 → y=[0.25,1.25]
      // normal body y=[0.25,2.25] → overlap y=[0.25,1.25] area>0 ✓
      // normal up zone center y=1.25-1.5=-0.25, halfH=0.5 → y=[-0.75,0.25]
      // thin body y=[-0.25,0.25] → overlap y=[-0.25,0.25] area>0 ✓ → vertical thin->normal
      const objects = [
        R({ id: 'thin', x: 0, y: 0, width: 10, height: 0.5 }),
        R({ id: 'normal', x: 0, y: 1.25, width: 2, height: 2 }),
      ];
      expect(pairsOf(findNeighbors(input(objects, 1)).vertical)).toEqual(
        new Set(['thin->normal']),
      );
    });
  });
});
