import { describe, expect, it } from "vitest";
import { ulid } from "ulidx";
import type { Key } from "../../src/typedef";
import { physicalToLogical, parsePhysicalLayoutDts } from "../../src/components/layouthelper";
import { getLayouts } from "../../src/lib/physicalLayouts";

/**
 * Helper to create a simple 1U key at a given physical position.
 */
function makeKey(row: number, col: number, x: number, y: number, options: Partial<Key> = {}): Key {
  return {
    id: ulid(),
    part: 0,
    row,
    col,
    w: options.w ?? 1,
    h: options.h ?? 1,
    x,
    y,
    r: options.r ?? 0,
    rx: options.rx ?? 0,
    ry: options.ry ?? 0,
  };
}

/**
 * Helper to generate a perfect grid of 1U keys.
 * @param rows - Number of rows
 * @param cols - Number of columns
 * @param offsetX - X offset (default 0)
 * @param offsetY - Y offset (default 0)
 */
function make1UGrid(rows: number, cols: number, offsetX = 0, offsetY = 0): Key[] {
  const keys: Key[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      keys.push(makeKey(-1, -1, offsetX + c, offsetY + r));
    }
  }
  return keys;
}

describe("physicalToLogical", () => {
  describe("perfect 1U grid layouts", () => {
    it("should handle 3x3 grid", () => {
      const keys = make1UGrid(3, 3);
      physicalToLogical(keys);

      expect(keys).toHaveLength(9);
      // After sorting, keys should be in row-major order
      for (let i = 0; i < 9; i++) {
        expect(keys[i].row).toBe(Math.floor(i / 3));
        expect(keys[i].col).toBe(i % 3);
      }
    });

    it("should handle 4x10 grid (common 40% layout)", () => {
      const keys = make1UGrid(4, 10);
      physicalToLogical(keys);

      expect(keys).toHaveLength(40);
      for (let i = 0; i < 40; i++) {
        expect(keys[i].row).toBe(Math.floor(i / 10));
        expect(keys[i].col).toBe(i % 10);
      }
    });

    it("should handle 5x15 grid (full-size layout)", () => {
      const keys = make1UGrid(5, 15);
      physicalToLogical(keys);

      expect(keys).toHaveLength(75);
      for (let i = 0; i < 75; i++) {
        expect(keys[i].row).toBe(Math.floor(i / 15));
        expect(keys[i].col).toBe(i % 15);
      }
    });

    it("should handle single row", () => {
      const keys = make1UGrid(1, 10);
      physicalToLogical(keys);

      expect(keys).toHaveLength(10);
      for (let i = 0; i < 10; i++) {
        expect(keys[i].row).toBe(0);
        expect(keys[i].col).toBe(i);
      }
    });

    it("should handle single column", () => {
      const keys = make1UGrid(5, 1);
      physicalToLogical(keys);

      expect(keys).toHaveLength(5);
      for (let i = 0; i < 5; i++) {
        expect(keys[i].row).toBe(i);
        expect(keys[i].col).toBe(0);
      }
    });

    it("should handle grid with fractional offset", () => {
      // Keys at X=1.125, 2.125, 3.125... should behave the same as X=0, 1, 2...
      const keys = make1UGrid(3, 5, 1.125, 0.5);
      physicalToLogical(keys);

      expect(keys).toHaveLength(15);
      for (let i = 0; i < 15; i++) {
        expect(keys[i].row).toBe(Math.floor(i / 5));
        expect(keys[i].col).toBe(i % 5);
      }
    });
  });

  describe("layouts with mixed key sizes", () => {
    it("should handle 60% style bottom row with space bar", () => {
      // Simplified 60% bottom row: 1.25U, 1.25U, 1.25U, 6.25U, 1.25U, 1.25U, 1.25U, 1.25U
      const keys: Key[] = [
        makeKey(-1, -1, 0, 0, { w: 1.25 }),
        makeKey(-1, -1, 1.25, 0, { w: 1.25 }),
        makeKey(-1, -1, 2.5, 0, { w: 1.25 }),
        makeKey(-1, -1, 3.75, 0, { w: 6.25 }),
        makeKey(-1, -1, 10, 0, { w: 1.25 }),
        makeKey(-1, -1, 11.25, 0, { w: 1.25 }),
        makeKey(-1, -1, 12.5, 0, { w: 1.25 }),
        makeKey(-1, -1, 13.75, 0, { w: 1.25 }),
      ];

      physicalToLogical(keys);

      // All keys should be in row 0
      for (const key of keys) {
        expect(key.row).toBe(0);
      }
      // Columns should increase from left to right
      const cols = keys.map(k => k.col);
      for (let i = 1; i < cols.length; i++) {
        expect(cols[i]).toBeGreaterThan(cols[i - 1]);
      }
    });

    it("should handle staggered rows like typical keyboard", () => {
      // Row 0: starts at x=0
      // Row 1: starts at x=0.25 (Tab offset)
      // Row 2: starts at x=0.5 (Caps offset)
      // Row 3: starts at x=0.75 (Shift offset)
      const keys: Key[] = [
        // Row 0
        makeKey(-1, -1, 0, 0), makeKey(-1, -1, 1, 0), makeKey(-1, -1, 2, 0),
        // Row 1 (staggered)
        makeKey(-1, -1, 0.25, 1), makeKey(-1, -1, 1.25, 1), makeKey(-1, -1, 2.25, 1),
        // Row 2 (staggered more)
        makeKey(-1, -1, 0.5, 2), makeKey(-1, -1, 1.5, 2), makeKey(-1, -1, 2.5, 2),
        // Row 3 (staggered even more)
        makeKey(-1, -1, 0.75, 3), makeKey(-1, -1, 1.75, 3), makeKey(-1, -1, 2.75, 3),
      ];

      physicalToLogical(keys);

      // Should have 4 rows
      const rowSet = new Set(keys.map(k => k.row));
      expect(rowSet.size).toBe(4);

      // Each row should have 3 keys
      for (let r = 0; r < 4; r++) {
        const rowKeys = keys.filter(k => k.row === r);
        expect(rowKeys).toHaveLength(3);
        // Within each row, columns should increase (keys are sorted left to right)
        const cols = rowKeys.map(k => k.col).sort((a, b) => a - b);
        expect(cols[0]).toBeLessThan(cols[1]);
        expect(cols[1]).toBeLessThan(cols[2]);
      }
    });
  });

  describe("edge cases", () => {
    it("should handle empty array", () => {
      const keys: Key[] = [];
      physicalToLogical(keys);
      expect(keys).toHaveLength(0);
    });

    it("should handle single key", () => {
      const keys = [makeKey(-1, -1, 0, 0)];
      physicalToLogical(keys);

      expect(keys).toHaveLength(1);
      expect(keys[0].row).toBe(0);
      expect(keys[0].col).toBe(0);
    });

    it("should handle two keys horizontally", () => {
      const keys = [
        makeKey(-1, -1, 0, 0),
        makeKey(-1, -1, 2, 0),
      ];
      physicalToLogical(keys);

      expect(keys[0].row).toBe(0);
      expect(keys[1].row).toBe(0);
      expect(keys[0].col).toBeLessThan(keys[1].col);
    });

    it("should handle two keys vertically", () => {
      const keys = [
        makeKey(-1, -1, 0, 0),
        makeKey(-1, -1, 0, 2),
      ];
      physicalToLogical(keys);

      expect(keys[0].col).toBe(0);
      expect(keys[1].col).toBe(0);
      expect(keys[0].row).toBeLessThan(keys[1].row);
    });
  });

  describe("rotated keys", () => {
    it("should handle keys with rotation", () => {
      // Two keys, one rotated 15 degrees
      const keys: Key[] = [
        makeKey(-1, -1, 0, 0),
        makeKey(-1, -1, 1, 0, { r: 15, rx: 1, ry: 0 }),
        makeKey(-1, -1, 2, 0),
      ];

      physicalToLogical(keys);

      // All should be in the same row
      expect(keys[0].row).toBe(keys[1].row);
      expect(keys[1].row).toBe(keys[2].row);
    });

    it("should handle column of rotated keys like ergo thumb cluster", () => {
      // Thumb keys rotated around a common point - like Ferris thumbs
      const keys: Key[] = [
        makeKey(-1, -1, 3.3, 3.55, { r: 15, rx: 4.3, ry: 4.55 }),
        makeKey(-1, -1, 4.3, 3.55, { r: 30, rx: 4.3, ry: 4.55 }),
      ];

      physicalToLogical(keys);

      // Both should be in the same row (they're thumb keys on the same arc)
      expect(keys[0].row).toBe(keys[1].row);
    });
  });

  describe("ordering", () => {
    it("should sort keys by row then column", () => {
      // Create keys out of order
      const keys = [
        makeKey(-1, -1, 2, 1), // Should be row 1, col 2
        makeKey(-1, -1, 0, 0), // Should be row 0, col 0
        makeKey(-1, -1, 1, 1), // Should be row 1, col 1
        makeKey(-1, -1, 1, 0), // Should be row 0, col 1
        makeKey(-1, -1, 0, 1), // Should be row 1, col 0
        makeKey(-1, -1, 2, 0), // Should be row 0, col 2
      ];

      physicalToLogical(keys);

      // Keys should now be in row-major order
      for (let i = 1; i < keys.length; i++) {
        const prev = keys[i - 1];
        const curr = keys[i];
        if (prev.row === curr.row) {
          expect(prev.col).toBeLessThan(curr.col);
        } else {
          expect(prev.row).toBeLessThan(curr.row);
        }
      }
    });
  });

  describe("preset layouts", () => {
    const layouts = getLayouts();

    it("should handle Ferris layout", () => {
      const ferrisLayout = layouts["Popular Layouts"]?.find(l => l.name === "Ferris");
      expect(ferrisLayout).toBeDefined();

      const keys = ferrisLayout!.keys.map(k => ({ ...k }));
      physicalToLogical(keys);

      // Ferris has 34 keys
      expect(keys).toHaveLength(34);

      // Verify all keys have valid row/col
      for (const key of keys) {
        expect(key.row).toBeGreaterThanOrEqual(0);
        expect(key.col).toBeGreaterThanOrEqual(0);
      }

      // Verify keys are sorted by row then column
      for (let i = 1; i < keys.length; i++) {
        const prev = keys[i - 1];
        const curr = keys[i];
        const comp = (prev.row - curr.row) || (prev.col - curr.col);
        expect(comp).toBeLessThanOrEqual(0);
      }
    });

    it("should handle 60% All 1U layout", () => {
      const layout = layouts["60%"]?.find(l => l.name === "60% All 1U");
      expect(layout).toBeDefined();

      const keys = layout!.keys.map(k => ({ ...k }));
      physicalToLogical(keys);

      // 60% All 1U has 66 keys
      expect(keys).toHaveLength(66);

      // Should have 5 rows
      const rows = new Set(keys.map(k => k.row));
      expect(rows.size).toBe(5);

      // Verify keys are sorted
      for (let i = 1; i < keys.length; i++) {
        const prev = keys[i - 1];
        const curr = keys[i];
        const comp = (prev.row - curr.row) || (prev.col - curr.col);
        expect(comp).toBeLessThanOrEqual(0);
      }
    });

    it("should handle Corne 6 Column layout", () => {
      const layout = layouts["Corne"]?.find(l => l.name === "6 Column");
      expect(layout).toBeDefined();

      const keys = layout!.keys.map(k => ({ ...k }));
      physicalToLogical(keys);

      // Corne 6 col has 42 keys
      expect(keys).toHaveLength(42);

      // Verify all keys have valid row/col
      for (const key of keys) {
        expect(key.row).toBeGreaterThanOrEqual(0);
        expect(key.col).toBeGreaterThanOrEqual(0);
      }
    });

    it("should process all preset layouts without errors", () => {
      for (const [_category, presets] of Object.entries(layouts)) {
        for (const preset of presets) {
          const keys = preset.keys.map(k => ({ ...k }));

          // Should not throw
          expect(() => physicalToLogical(keys)).not.toThrow();

          // All keys should have valid assignments
          for (const key of keys) {
            expect(key.row).toBeGreaterThanOrEqual(0);
            expect(key.col).toBeGreaterThanOrEqual(0);
          }
        }
      }
    });
  });

  describe("DTS parsing with complex layouts", () => {
    it("should parse DTS with rotated keys", () => {
      // Sample DTS content from visorbearer (rotated keys with negative angles)
      const dts = `
        visorbearer_33332_layout: visorbearer_33332_layout {
          compatible = "zmk,physical-layout";
          display-name = "Default 32-key 33332";
          keys
            = <&key_physical_attrs 100 100   30   62     900    80   112>
            , <&key_physical_attrs 100 100  182    0    1900   232    50>
            , <&key_physical_attrs 100 100  319   15    2700   369    65>
            , <&key_physical_attrs 100 100  420   96    3300   470   146>
            , <&key_physical_attrs 100 100  478  196    3300   528   246>
            , <&key_physical_attrs 100 100  646  196 (-3300)   696   246>
            , <&key_physical_attrs 100 100  704   96 (-3300)   754   146>
            , <&key_physical_attrs 100 100  805   15 (-2700)   855    65>
            , <&key_physical_attrs 100 100  942    0 (-1900)   992    50>
            , <&key_physical_attrs 100 100 1094   62  (-900)  1144   112>
            , <&key_physical_attrs 100 100   15  161     900    65   211>
            , <&key_physical_attrs 100 100  152   94    1900   202   144>
            ;
        };
      `;

      const keys = parsePhysicalLayoutDts(dts);

      expect(keys).not.toBeNull();
      expect(keys!.length).toBe(12);

      // Verify all keys have valid row/col assignments
      for (const key of keys!) {
        expect(key.row).toBeGreaterThanOrEqual(0);
        expect(key.col).toBeGreaterThanOrEqual(0);
      }

      // Verify keys are sorted
      for (let i = 1; i < keys!.length; i++) {
        const prev = keys![i - 1];
        const curr = keys![i];
        const comp = (prev.row - curr.row) || (prev.col - curr.col);
        expect(comp).toBeLessThanOrEqual(0);
      }
    });
  });
});
