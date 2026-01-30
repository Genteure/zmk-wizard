import { describe, expect, it } from "vitest";
import { ulid } from "ulidx";
import type { Key } from "../../src/typedef";
import { physicalToLogical } from "../../src/components/layouthelper";
import { getLayouts } from "../../src/lib/physicalLayouts";

/**
 * Helper to create a key with minimal required properties
 */
function makeKey(x: number, y: number, w = 1, h = 1, r = 0, rx = 0, ry = 0): Key {
  return {
    id: ulid(),
    part: 0,
    row: -1,
    col: -1,
    w,
    h,
    x,
    y,
    r,
    rx,
    ry,
  };
}

/**
 * Helper to verify that all keys have unique (row, col) pairs
 */
function verifyUniquePositions(keys: Key[]): boolean {
  const seen = new Set<string>();
  for (const key of keys) {
    const pos = `${key.row},${key.col}`;
    if (seen.has(pos)) return false;
    seen.add(pos);
  }
  return true;
}

/**
 * Helper to verify that keys are sorted by row then col
 */
function verifySortOrder(keys: Key[]): boolean {
  for (let i = 1; i < keys.length; i++) {
    if (keys[i].row < keys[i - 1].row) return false;
    if (keys[i].row === keys[i - 1].row && keys[i].col <= keys[i - 1].col) return false;
  }
  return true;
}

/**
 * Helper to verify that logical positions match expected grid for perfect 1U layouts
 */
function verifyPerfect1UGrid(keys: Key[], gridWidth: number): boolean {
  // Sort by physical y then x to determine expected order
  const sorted = [...keys].sort((a, b) => (a.y - b.y) || (a.x - b.x));
  
  for (let i = 0; i < sorted.length; i++) {
    const expectedRow = Math.floor(i / gridWidth);
    const expectedCol = i % gridWidth;
    if (sorted[i].row !== expectedRow || sorted[i].col !== expectedCol) {
      return false;
    }
  }
  return true;
}

describe("physicalToLogical", () => {
  describe("basic functionality", () => {
    it("should handle empty array", () => {
      const keys: Key[] = [];
      physicalToLogical(keys, false);
      expect(keys.length).toBe(0);
    });

    it("should handle single key", () => {
      const keys = [makeKey(0, 0)];
      physicalToLogical(keys, true);
      expect(keys[0].row).toBe(0);
      expect(keys[0].col).toBe(0);
    });

    it("should always produce unique positions", () => {
      const keys = [
        makeKey(0, 0), makeKey(1, 0), makeKey(2, 0),
        makeKey(0, 1), makeKey(1, 1), makeKey(2, 1),
      ];
      physicalToLogical(keys, true);
      expect(verifyUniquePositions(keys)).toBe(true);
    });

    it("should sort keys by row then col", () => {
      const keys = [
        makeKey(2, 1), makeKey(0, 0), makeKey(1, 1),
        makeKey(1, 0), makeKey(2, 0), makeKey(0, 1),
      ];
      physicalToLogical(keys, true);
      expect(verifySortOrder(keys)).toBe(true);
    });
  });

  describe("perfect 1U grid layouts", () => {
    it("should correctly handle 3x3 grid", () => {
      const keys: Key[] = [];
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
          keys.push(makeKey(col, row));
        }
      }
      physicalToLogical(keys, true);
      expect(verifyPerfect1UGrid(keys, 3)).toBe(true);
    });

    it("should correctly handle 4x4 grid", () => {
      const keys: Key[] = [];
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 4; col++) {
          keys.push(makeKey(col, row));
        }
      }
      physicalToLogical(keys, true);
      expect(verifyPerfect1UGrid(keys, 4)).toBe(true);
    });

    it("should correctly handle 5x4 grid (5 cols, 4 rows)", () => {
      const keys: Key[] = [];
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 5; col++) {
          keys.push(makeKey(col, row));
        }
      }
      physicalToLogical(keys, true);
      expect(verifyPerfect1UGrid(keys, 5)).toBe(true);
    });

    it("should correctly handle 10x4 grid", () => {
      const keys: Key[] = [];
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 10; col++) {
          keys.push(makeKey(col, row));
        }
      }
      physicalToLogical(keys, true);
      expect(verifyPerfect1UGrid(keys, 10)).toBe(true);
    });
  });

  describe("row-staggered layouts", () => {
    it("should handle typical row stagger (0, 0.25, 0.5)", () => {
      // Row 0: x = 0, 1, 2, 3, 4
      // Row 1: x = 0.25, 1.25, 2.25, 3.25, 4.25
      // Row 2: x = 0.5, 1.5, 2.5, 3.5, 4.5
      const keys: Key[] = [];
      for (let row = 0; row < 3; row++) {
        const offset = row * 0.25;
        for (let col = 0; col < 5; col++) {
          keys.push(makeKey(col + offset, row));
        }
      }
      physicalToLogical(keys, true);
      
      // Should have 3 rows
      const maxRow = Math.max(...keys.map(k => k.row));
      expect(maxRow).toBe(2);
      
      // Each row should have 5 keys
      for (let r = 0; r <= maxRow; r++) {
        const rowKeys = keys.filter(k => k.row === r);
        expect(rowKeys.length).toBe(5);
      }
      
      expect(verifyUniquePositions(keys)).toBe(true);
      expect(verifySortOrder(keys)).toBe(true);
    });
  });

  describe("preset layout validation", () => {
    const layouts = getLayouts();

    it("should produce valid output for Ferris layout", () => {
      const ferrisLayout = layouts["Popular Layouts"]?.find(l => l.name === "Ferris");
      expect(ferrisLayout).toBeDefined();
      
      const keys = ferrisLayout!.keys.map(k => ({ ...k, row: -1, col: -1 }));
      physicalToLogical(keys, true);
      
      expect(verifyUniquePositions(keys)).toBe(true);
      expect(verifySortOrder(keys)).toBe(true);
    });

    it("should produce valid output for 60% All 1U layout", () => {
      const layout = layouts["60%"]?.find(l => l.name === "60% All 1U");
      expect(layout).toBeDefined();
      
      const keys = layout!.keys.map(k => ({ ...k, row: -1, col: -1 }));
      physicalToLogical(keys, true);
      
      expect(verifyUniquePositions(keys)).toBe(true);
      expect(verifySortOrder(keys)).toBe(true);
    });
  });

  describe("column-staggered layouts (ergo)", () => {
    it("should handle keys with slight column offset", () => {
      // Column-staggered layout: columns have different Y offsets
      // Col 0: y=0.5, Col 1: y=0.25, Col 2: y=0, Col 3: y=0.25, Col 4: y=0.5
      const keys: Key[] = [];
      const yOffsets = [0.5, 0.25, 0, 0.25, 0.5];
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 5; col++) {
          keys.push(makeKey(col, row + yOffsets[col]));
        }
      }
      physicalToLogical(keys, true);
      
      // Should have 3 logical rows
      const maxRow = Math.max(...keys.map(k => k.row));
      expect(maxRow).toBe(2);
      
      expect(verifyUniquePositions(keys)).toBe(true);
      expect(verifySortOrder(keys)).toBe(true);
    });
  });

  describe("split layouts", () => {
    it("should handle two halves with gap", () => {
      // Left half at x=0-3, right half at x=5-8 (gap of 2)
      const keys: Key[] = [];
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 4; col++) {
          keys.push(makeKey(col, row));
        }
        for (let col = 0; col < 4; col++) {
          keys.push(makeKey(col + 6, row));
        }
      }
      physicalToLogical(keys, true);
      
      // Should have 3 rows and 8 columns
      const maxRow = Math.max(...keys.map(k => k.row));
      const maxCol = Math.max(...keys.map(k => k.col));
      expect(maxRow).toBe(2);
      expect(maxCol).toBe(7);
      
      expect(verifyUniquePositions(keys)).toBe(true);
      expect(verifySortOrder(keys)).toBe(true);
    });
  });

  describe("rotated layouts", () => {
    it("should handle rotated thumb cluster (like Ferris)", () => {
      // Main keys
      const keys: Key[] = [
        // Row 0
        makeKey(0, 0), makeKey(1, 0), makeKey(2, 0),
        // Row 1
        makeKey(0, 1), makeKey(1, 1), makeKey(2, 1),
        // Thumb cluster - rotated keys at bottom
        makeKey(1.5, 2.3, 1, 1, 15, 2, 2.8),
        makeKey(2.5, 2.5, 1, 1, 30, 3, 3),
      ];
      physicalToLogical(keys, true);
      
      expect(verifyUniquePositions(keys)).toBe(true);
      expect(verifySortOrder(keys)).toBe(true);
      
      // Thumb keys should be in row 2
      const thumbKeys = keys.filter(k => k.r !== 0);
      expect(thumbKeys.length).toBe(2);
      expect(thumbKeys[0].row).toBe(2);
      expect(thumbKeys[1].row).toBe(2);
    });
  });

  describe("varying key sizes", () => {
    it("should handle 2U spacebar", () => {
      const keys: Key[] = [
        // Row 0: normal keys
        makeKey(0, 0), makeKey(1, 0), makeKey(2, 0), makeKey(3, 0),
        // Row 1: normal keys
        makeKey(0, 1), makeKey(1, 1), makeKey(2, 1), makeKey(3, 1),
        // Row 2: 2U spacebar in center
        makeKey(0.5, 2), makeKey(1.5, 2, 2, 1), // 2U wide key
      ];
      physicalToLogical(keys, true);
      
      expect(verifyUniquePositions(keys)).toBe(true);
      expect(verifySortOrder(keys)).toBe(true);
    });

    it("should handle mixed key sizes in row", () => {
      const keys: Key[] = [
        // Row with 1.5U, 1U, 1U, 1.5U keys
        makeKey(0, 0, 1.5, 1),     // 1.5U
        makeKey(1.5, 0, 1, 1),     // 1U
        makeKey(2.5, 0, 1, 1),     // 1U
        makeKey(3.5, 0, 1.5, 1),   // 1.5U
      ];
      physicalToLogical(keys, true);
      
      expect(verifyUniquePositions(keys)).toBe(true);
      expect(verifySortOrder(keys)).toBe(true);
      expect(keys.map(k => k.col)).toEqual([0, 1, 2, 3]);
    });
  });

  describe("algorithm correctness", () => {
    it("should minimize empty grid cells for simple layouts", () => {
      // 3x3 grid should produce 3x3 logical layout (no extra cols)
      const keys: Key[] = [];
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
          keys.push(makeKey(col, row));
        }
      }
      physicalToLogical(keys, true);
      
      const maxRow = Math.max(...keys.map(k => k.row));
      const maxCol = Math.max(...keys.map(k => k.col));
      
      // Should be exactly 3x3, not larger
      expect(maxRow).toBe(2);
      expect(maxCol).toBe(2);
    });

    it("should preserve column alignment for staggered rows", () => {
      // Standard keyboard stagger: keys should stay roughly aligned
      const keys: Key[] = [
        // Row 0: 0, 1, 2, 3, 4
        makeKey(0, 0), makeKey(1, 0), makeKey(2, 0), makeKey(3, 0), makeKey(4, 0),
        // Row 1: 0.25, 1.25, 2.25, 3.25, 4.25 (offset 0.25)
        makeKey(0.25, 1), makeKey(1.25, 1), makeKey(2.25, 1), makeKey(3.25, 1), makeKey(4.25, 1),
      ];
      physicalToLogical(keys, true);
      
      const maxCol = Math.max(...keys.map(k => k.col));
      
      // Should have 5 columns (keys that are close should share columns)
      expect(maxCol).toBeLessThanOrEqual(5);
      
      expect(verifyUniquePositions(keys)).toBe(true);
    });
  });

  describe("rotated/ergo layouts with order preservation", () => {
    it("should correctly handle visorbearer-style layout when order is preserved", () => {
      // Visorbearer-style layout with heavily rotated keys
      // When keys are in row-major order, ignoreOrder=false should work better
      const keys: Key[] = [
        // Row 0 (keys 0-9) - highly rotated
        makeKey(0.30, 0.62, 1, 1, 9, 0.80, 1.12),
        makeKey(1.82, 0.00, 1, 1, 19, 2.32, 0.50),
        makeKey(3.19, 0.15, 1, 1, 27, 3.69, 0.65),
        makeKey(4.20, 0.96, 1, 1, 33, 4.70, 1.46),
        makeKey(4.78, 1.96, 1, 1, 33, 5.28, 2.46),
        makeKey(6.46, 1.96, 1, 1, -33, 6.96, 2.46),
        makeKey(7.04, 0.96, 1, 1, -33, 7.54, 1.46),
        makeKey(8.05, 0.15, 1, 1, -27, 8.55, 0.65),
        makeKey(9.42, 0.00, 1, 1, -19, 9.92, 0.50),
        makeKey(10.94, 0.62, 1, 1, -9, 11.44, 1.12),
        
        // Row 1 (keys 10-19) - similar rotation pattern
        makeKey(0.15, 1.61, 1, 1, 9, 0.65, 2.11),
        makeKey(1.52, 0.94, 1, 1, 19, 2.02, 1.44),
        makeKey(2.76, 1.04, 1, 1, 27, 3.26, 1.54),
        makeKey(3.68, 1.80, 1, 1, 33, 4.18, 2.30),
        makeKey(4.26, 2.80, 1, 1, 33, 4.76, 3.30),
        makeKey(6.98, 2.80, 1, 1, -33, 7.48, 3.30),
        makeKey(7.56, 1.80, 1, 1, -33, 8.06, 2.30),
        makeKey(8.48, 1.04, 1, 1, -27, 8.98, 1.54),
        makeKey(9.72, 0.94, 1, 1, -19, 10.22, 1.44),
        makeKey(11.09, 1.61, 1, 1, -9, 11.59, 2.11),
      ];

      // ignoreOrder=false uses X-break detection, which works for row-major input
      physicalToLogical(keys, false);

      const maxRow = Math.max(...keys.map(k => k.row));
      const maxCol = Math.max(...keys.map(k => k.col));

      // Should produce 2 rows x 10 cols
      expect(maxRow).toBe(1);
      expect(maxCol).toBe(9);
      
      expect(verifyUniquePositions(keys)).toBe(true);
      expect(verifySortOrder(keys)).toBe(true);
    });

    it("should handle rotated layout with ignoreOrder=true (geometry only)", () => {
      // Same layout but with ignoreOrder=true
      // This may produce more rows due to Y-coordinate variation
      const keys: Key[] = [
        makeKey(0.30, 0.62, 1, 1, 9, 0.80, 1.12),
        makeKey(1.82, 0.00, 1, 1, 19, 2.32, 0.50),
        makeKey(3.19, 0.15, 1, 1, 27, 3.69, 0.65),
        makeKey(4.20, 0.96, 1, 1, 33, 4.70, 1.46),
        makeKey(4.78, 1.96, 1, 1, 33, 5.28, 2.46),
        makeKey(6.46, 1.96, 1, 1, -33, 6.96, 2.46),
        makeKey(7.04, 0.96, 1, 1, -33, 7.54, 1.46),
        makeKey(8.05, 0.15, 1, 1, -27, 8.55, 0.65),
        makeKey(9.42, 0.00, 1, 1, -19, 9.92, 0.50),
        makeKey(10.94, 0.62, 1, 1, -9, 11.44, 1.12),
        makeKey(0.15, 1.61, 1, 1, 9, 0.65, 2.11),
        makeKey(1.52, 0.94, 1, 1, 19, 2.02, 1.44),
        makeKey(2.76, 1.04, 1, 1, 27, 3.26, 1.54),
        makeKey(3.68, 1.80, 1, 1, 33, 4.18, 2.30),
        makeKey(4.26, 2.80, 1, 1, 33, 4.76, 3.30),
        makeKey(6.98, 2.80, 1, 1, -33, 7.48, 3.30),
        makeKey(7.56, 1.80, 1, 1, -33, 8.06, 2.30),
        makeKey(8.48, 1.04, 1, 1, -27, 8.98, 1.54),
        makeKey(9.72, 0.94, 1, 1, -19, 10.22, 1.44),
        makeKey(11.09, 1.61, 1, 1, -9, 11.59, 2.11),
      ];

      physicalToLogical(keys, true);

      // Should still produce valid output, even if not optimal
      expect(verifyUniquePositions(keys)).toBe(true);
      expect(verifySortOrder(keys)).toBe(true);
      
      // Total key count preserved
      expect(keys.length).toBe(20);
    });
  });
});
