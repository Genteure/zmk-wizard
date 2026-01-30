import { describe, expect, it } from "vitest";
import { physicalToLogical } from "../../src/components/layouthelper";
import type { Key } from "../../src/typedef";

/**
 * Helper to create a key with specified physical and default logical positions.
 */
function makeKey(
  id: string,
  x: number,
  y: number,
  w = 1,
  h = 1,
  r = 0,
  rx = 0,
  ry = 0
): Key {
  return {
    id,
    part: 0,
    row: -1, // To be assigned by physicalToLogical
    col: -1, // To be assigned by physicalToLogical
    x,
    y,
    w,
    h,
    r,
    rx,
    ry,
  };
}

/**
 * Helper to extract logical positions from keys for easy comparison.
 */
function getLogicalPositions(keys: Key[]): { id: string; row: number; col: number }[] {
  return keys.map(k => ({ id: k.id, row: k.row, col: k.col }));
}

describe("physicalToLogical", () => {
  describe("simple 1U grid layouts", () => {
    it("should correctly convert a 1x1 grid", () => {
      const keys = [makeKey("k0", 0, 0)];
      physicalToLogical(keys, false);

      expect(keys[0].row).toBe(0);
      expect(keys[0].col).toBe(0);
    });

    it("should correctly convert a 1x3 horizontal row", () => {
      const keys = [
        makeKey("k0", 0, 0),
        makeKey("k1", 1, 0),
        makeKey("k2", 2, 0),
      ];
      physicalToLogical(keys, false);

      expect(getLogicalPositions(keys)).toEqual([
        { id: "k0", row: 0, col: 0 },
        { id: "k1", row: 0, col: 1 },
        { id: "k2", row: 0, col: 2 },
      ]);
    });

    it("should correctly convert a 3x1 vertical column", () => {
      const keys = [
        makeKey("k0", 0, 0),
        makeKey("k1", 0, 1),
        makeKey("k2", 0, 2),
      ];
      physicalToLogical(keys, false);

      expect(getLogicalPositions(keys)).toEqual([
        { id: "k0", row: 0, col: 0 },
        { id: "k1", row: 1, col: 0 },
        { id: "k2", row: 2, col: 0 },
      ]);
    });

    it("should correctly convert a 2x2 grid", () => {
      const keys = [
        makeKey("k00", 0, 0),
        makeKey("k01", 1, 0),
        makeKey("k10", 0, 1),
        makeKey("k11", 1, 1),
      ];
      physicalToLogical(keys, false);

      expect(getLogicalPositions(keys)).toEqual([
        { id: "k00", row: 0, col: 0 },
        { id: "k01", row: 0, col: 1 },
        { id: "k10", row: 1, col: 0 },
        { id: "k11", row: 1, col: 1 },
      ]);
    });

    it("should correctly convert a 3x3 grid", () => {
      const keys = [
        makeKey("k00", 0, 0), makeKey("k01", 1, 0), makeKey("k02", 2, 0),
        makeKey("k10", 0, 1), makeKey("k11", 1, 1), makeKey("k12", 2, 1),
        makeKey("k20", 0, 2), makeKey("k21", 1, 2), makeKey("k22", 2, 2),
      ];
      physicalToLogical(keys, false);

      expect(getLogicalPositions(keys)).toEqual([
        { id: "k00", row: 0, col: 0 },
        { id: "k01", row: 0, col: 1 },
        { id: "k02", row: 0, col: 2 },
        { id: "k10", row: 1, col: 0 },
        { id: "k11", row: 1, col: 1 },
        { id: "k12", row: 1, col: 2 },
        { id: "k20", row: 2, col: 0 },
        { id: "k21", row: 2, col: 1 },
        { id: "k22", row: 2, col: 2 },
      ]);
    });

    it("should correctly convert a 4x12 ortholinear grid", () => {
      const keys: Key[] = [];
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 12; col++) {
          keys.push(makeKey(`k${row}_${col}`, col, row));
        }
      }
      physicalToLogical(keys, false);

      // Verify all keys have correct positions
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 12; col++) {
          const key = keys.find(k => k.id === `k${row}_${col}`);
          expect(key).toBeDefined();
          expect(key!.row).toBe(row);
          expect(key!.col).toBe(col);
        }
      }
    });

    it("should handle keys in random order when ignoreOrder is true", () => {
      // Keys provided in random order
      const keys = [
        makeKey("k11", 1, 1),
        makeKey("k00", 0, 0),
        makeKey("k10", 0, 1),
        makeKey("k01", 1, 0),
      ];
      physicalToLogical(keys, true);

      // After sorting by row then col:
      expect(keys[0].id).toBe("k00");
      expect(keys[0].row).toBe(0);
      expect(keys[0].col).toBe(0);

      expect(keys[1].id).toBe("k01");
      expect(keys[1].row).toBe(0);
      expect(keys[1].col).toBe(1);

      expect(keys[2].id).toBe("k10");
      expect(keys[2].row).toBe(1);
      expect(keys[2].col).toBe(0);

      expect(keys[3].id).toBe("k11");
      expect(keys[3].row).toBe(1);
      expect(keys[3].col).toBe(1);
    });
  });

  describe("staggered layouts", () => {
    it("should handle row-staggered layout (like a standard keyboard)", () => {
      // Simulating a row-staggered layout:
      // Row 0: x=0, 1, 2, 3
      // Row 1: x=0.25, 1.25, 2.25 (0.25U offset)
      // Row 2: x=0.5, 1.5, 2.5 (0.5U offset)
      const keys = [
        makeKey("r0c0", 0, 0), makeKey("r0c1", 1, 0), makeKey("r0c2", 2, 0), makeKey("r0c3", 3, 0),
        makeKey("r1c0", 0.25, 1), makeKey("r1c1", 1.25, 1), makeKey("r1c2", 2.25, 1),
        makeKey("r2c0", 0.5, 2), makeKey("r2c1", 1.5, 2), makeKey("r2c2", 2.5, 2),
      ];
      physicalToLogical(keys, false);

      // Should identify 3 rows
      const rows = new Set(keys.map(k => k.row));
      expect(rows.size).toBe(3);

      // Keys in same physical row should be in same logical row
      expect(keys.filter(k => k.id.startsWith("r0")).every(k => k.row === 0)).toBe(true);
      expect(keys.filter(k => k.id.startsWith("r1")).every(k => k.row === 1)).toBe(true);
      expect(keys.filter(k => k.id.startsWith("r2")).every(k => k.row === 2)).toBe(true);
    });

    it("should handle column-staggered layout (like an ergo keyboard)", () => {
      // Simulating a column-staggered layout:
      // Col 0: keys at y=0.5, 1.5, 2.5
      // Col 1: keys at y=0.25, 1.25, 2.25
      // Col 2: keys at y=0, 1, 2
      const keys = [
        makeKey("c0r0", 0, 0.5), makeKey("c0r1", 0, 1.5), makeKey("c0r2", 0, 2.5),
        makeKey("c1r0", 1, 0.25), makeKey("c1r1", 1, 1.25), makeKey("c1r2", 1, 2.25),
        makeKey("c2r0", 2, 0), makeKey("c2r1", 2, 1), makeKey("c2r2", 2, 2),
      ];
      physicalToLogical(keys, false);

      // Should identify 3 rows (clustered by Y with tolerance)
      const rows = new Set(keys.map(k => k.row));
      expect(rows.size).toBe(3);

      // Keys should be assigned to columns correctly
      const cols = new Set(keys.map(k => k.col));
      expect(cols.size).toBe(3);
    });
  });

  describe("edge cases", () => {
    it("should handle empty array", () => {
      const keys: Key[] = [];
      physicalToLogical(keys, false);
      expect(keys).toEqual([]);
    });

    it("should handle single key", () => {
      const keys = [makeKey("single", 5, 5)];
      physicalToLogical(keys, false);
      expect(keys[0].row).toBe(0);
      expect(keys[0].col).toBe(0);
    });

    it("should handle non-unit sized keys", () => {
      // 1.5U and 2U keys
      const keys = [
        makeKey("k0", 0, 0, 1.5, 1),    // 1.5U wide
        makeKey("k1", 1.5, 0, 1, 1),    // 1U
        makeKey("k2", 0, 1, 2, 1),      // 2U wide
        makeKey("k3", 2, 1, 1, 1),      // 1U
      ];
      physicalToLogical(keys, false);

      // Should have 2 rows
      const rows = new Set(keys.map(k => k.row));
      expect(rows.size).toBe(2);
    });

    it("should handle keys with rotation but same center alignment", () => {
      // Two keys that are rotated but have aligned centers
      const keys = [
        makeKey("k0", 0, 0, 1, 1, 0, 0, 0),
        makeKey("k1", 1, 0, 1, 1, 15, 1, 0), // Rotated 15 degrees
        makeKey("k2", 0, 1, 1, 1, -15, 0, 1), // Rotated -15 degrees
        makeKey("k3", 1, 1, 1, 1, 0, 0, 0),
      ];
      physicalToLogical(keys, false);

      // Should identify 2 rows and 2 columns
      const rows = new Set(keys.map(k => k.row));
      const cols = new Set(keys.map(k => k.col));
      expect(rows.size).toBe(2);
      expect(cols.size).toBe(2);
    });
  });

  describe("preserves original array", () => {
    it("should modify keys in place and sort them", () => {
      const keys = [
        makeKey("k10", 0, 1),
        makeKey("k00", 0, 0),
        makeKey("k01", 1, 0),
        makeKey("k11", 1, 1),
      ];
      const originalLength = keys.length;
      physicalToLogical(keys, false);

      // Array length should not change
      expect(keys.length).toBe(originalLength);

      // Keys should be sorted by row then col
      for (let i = 1; i < keys.length; i++) {
        const prev = keys[i - 1];
        const curr = keys[i];
        const prevOrder = prev.row * 1000 + prev.col;
        const currOrder = curr.row * 1000 + curr.col;
        expect(currOrder).toBeGreaterThanOrEqual(prevOrder);
      }
    });
  });
});
