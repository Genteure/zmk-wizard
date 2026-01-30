import { ulid } from "ulidx";
import { describe, expect, it } from "vitest";
import { physicalToLogical } from "~/lib/physicalToLogical";
import type { Key } from "~/typedef";

describe("physicalToLogical", () => {
  describe("raycast primitive", () => {
    it("associate rows", () => {
      // Keys are placed at 0,0, then rotated around the origin point
      // to form basically a curved line going from top (r: 0) of a virtual circle
      // to the right (r: 90) of the virtual circle.
      const associateRowsCommonProps = { x: 0, y: 0, w: 1, h: 1 };
      const rotationOrigin = { rx: 0.5, ry: 2.8 };

      // Layout:
      // x
      //   x
      //     x
      //       x
      const keys: Key[] = [
        // key 0, first key
        key({ ...associateRowsCommonProps, r: 0, ...rotationOrigin }),
        // key 1
        // local axis: directly right of key 0, slightly below key 0
        // global axis: directly right of key 0, slightly below key 0
        key({ ...associateRowsCommonProps, r: 30, ...rotationOrigin }),
        // key 2
        // local axis: directly right of key 1, slightly below key 1
        // global axis: bottom-right of key 1, very much below key 1
        key({ ...associateRowsCommonProps, r: 60, ...rotationOrigin }),
        // key 3
        // local axis: directly right of key 2, slightly below key 2
        // global axis: almost directly below key 2
        key({ ...associateRowsCommonProps, r: 90, ...rotationOrigin }),
      ];

      physicalToLogical(keys);

      // We are raycasting from each key to find its neighbors
      // Keys on the local left-right axis should be considered same row
      // Keys on the local up-down axis should be considered same column

      // Thus all keys should be in the same row (0) because they are
      // all to the left-right of each other on their local axis

      expect(keys[0].row).toBe(0);
      expect(keys[1].row).toBe(0);
      expect(keys[2].row).toBe(0);
      expect(keys[3].row).toBe(0);

      expect(keys[0].col).toBe(0);
      expect(keys[1].col).toBe(1);
      expect(keys[2].col).toBe(2);
      expect(keys[3].col).toBe(3);
    });
    it("associate columns", () => {
      const commonKeyProps = { w: 1, h: 1 };

      // Layout:
      // x
      //   x
      //     x
      //       x
      // The difference here is that the keys are on each other's vertical axis
      const keys: Key[] = [
        // key 0, first key, rotated -90 degrees
        // Its local up axis is pointing globally left
        // Its local right axis is pointing globally up
        key({ x: 0, y: 0, r: 270, rx: 0.5, ry: 0.5, ...commonKeyProps }),
        // key 1
        // From key 0's local axis, key 1 is almost directly below key 0
        // Globally, key 1 is to the right and slightly down from key 0
        key({ x: 1.15, y: 0.308142, r: 300, rx: 1.65, ry: 0.808142, ...commonKeyProps }),
        // key 2
        // From key 1's local axis, key 2 is almost directly below key 1
        // Globally, key 2 is at buttom-right of key 1
        key({ x: 1.991858, y: 1.15, r: 330, rx: 2.491858, ry: 1.65, ...commonKeyProps }),
        // key 3
        // From key 2's local axis, key 3 is almost directly below key 2
        // Globally, key 3 is almost directly below key 2
        key({ x: 2.3, y: 2.3, r: 0, rx: 2.8, ry: 2.8, ...commonKeyProps }),
      ];

      physicalToLogical(keys);

      // Same as above, but now keys are on each other's local vertical axis
      // Thus all keys should be in the same column (0)

      expect(keys[0].col).toBe(0);
      expect(keys[1].col).toBe(0);
      expect(keys[2].col).toBe(0);
      expect(keys[3].col).toBe(0);

      expect(keys[0].row).toBe(0);
      expect(keys[1].row).toBe(1);
      expect(keys[2].row).toBe(2);
      expect(keys[3].row).toBe(3);
    });
    it("prefers closer keys when associating", () => {
      const commonKeyProps = { w: 1, h: 1, r: 0, rx: 0, ry: 0 };
      // Layout:
      //   x
      //  x  x
      //    x

      const keys: Key[] = [
        // row 0
        // key 0,
        key({ x: 0.3, y: 0, ...commonKeyProps }),
        // row 1
        // key 1,
        key({ x: 0, y: 1, ...commonKeyProps }),
        // key 2,
        key({ x: 1, y: 1, ...commonKeyProps }),
        // row 2
        // key 3,
        key({ x: 0.7, y: 2, ...commonKeyProps }),
      ];

      physicalToLogical(keys);

      // key 0 raycasts down, finds key 1 and key 2, but key 1 is closer
      // so key 0 and key 1 are in the same column

      // key 3 raycasts up, finds key 1 and key 2, but key 2 is closer
      // so key 3 and key 2 are in the same column

      expect(keys.map((k) => [k.row, k.col])).toEqual([
        [0, 0],
        [1, 0],
        [1, 1],
        [2, 1],
      ]);

      // This behavior must not depend the actual number values, only their relative positions
      // So let's offset all keys by some amount and verify the same result
      const keysWithOffset = keys.map((k) => ({
        ...k,
        x: k.x + 1.2142,
        y: k.y + 0.5432,
      }));

      physicalToLogical(keysWithOffset);

      expect(keysWithOffset.map((k) => [k.row, k.col])).toEqual([
        [0, 0],
        [1, 0],
        [1, 1],
        [2, 1],
      ]);
    });
  });

  describe("grid layout", () => {
    const gridLayoutTestsCommonProps = { w: 1, h: 1, r: 0, rx: 0, ry: 0 };
    // we use "_" to indicate empty space and "x" to indicate a key
    it("follows simple grid", () => {

      // Layout:
      // x x x
      // x x x
      const keys: Key[] = [
        key({ x: 0, y: 0, ...gridLayoutTestsCommonProps }),
        key({ x: 1, y: 0, ...gridLayoutTestsCommonProps }),
        key({ x: 2, y: 0, ...gridLayoutTestsCommonProps }),
        key({ x: 0, y: 1, ...gridLayoutTestsCommonProps }),
        key({ x: 1, y: 1, ...gridLayoutTestsCommonProps }),
        key({ x: 2, y: 1, ...gridLayoutTestsCommonProps }),
      ];

      physicalToLogical(keys);

      expect(keys.map((k) => [k.row, k.col])).toEqual([
        [0, 0],
        [0, 1],
        [0, 2],
        [1, 0],
        [1, 1],
        [1, 2],
      ]);
    });

    it("handles missing keys in grid", () => {
      // Layout:
      // x x x x x
      // x x _ x x
      // x _ _ _ x
      const keys: Key[] = [
        key({ x: 0, y: 0, ...gridLayoutTestsCommonProps }),
        key({ x: 1, y: 0, ...gridLayoutTestsCommonProps }),
        key({ x: 2, y: 0, ...gridLayoutTestsCommonProps }),
        key({ x: 3, y: 0, ...gridLayoutTestsCommonProps }),
        key({ x: 4, y: 0, ...gridLayoutTestsCommonProps }),

        key({ x: 0, y: 1, ...gridLayoutTestsCommonProps }),
        key({ x: 1, y: 1, ...gridLayoutTestsCommonProps }),
        // missing key at (2,1)
        key({ x: 3, y: 1, ...gridLayoutTestsCommonProps }),
        key({ x: 4, y: 1, ...gridLayoutTestsCommonProps }),

        key({ x: 0, y: 2, ...gridLayoutTestsCommonProps }),
        // missing keys at (1,2), (2,2), (3,2)
        key({ x: 4, y: 2, ...gridLayoutTestsCommonProps }),
      ];

      physicalToLogical(keys);

      expect(keys.map((k) => [k.row, k.col])).toEqual([
        [0, 0],
        [0, 1],
        [0, 2],
        [0, 3],
        [0, 4],

        [1, 0],
        [1, 1],
        [1, 3],
        [1, 4],

        [2, 0],
        [2, 4],
      ]);
    });

    it("small gaps are ignored", () => {
      // Layout:
      // x x _ x x
      // _ _ _ _ _
      // x x _ x x

      // small gaps (<1.5U) are ignored
      const keys: Key[] = [
        key({ x: 0, y: 0, ...gridLayoutTestsCommonProps }),
        key({ x: 1, y: 0, ...gridLayoutTestsCommonProps }),
        key({ x: 3, y: 0, ...gridLayoutTestsCommonProps }),
        key({ x: 4, y: 0, ...gridLayoutTestsCommonProps }),

        key({ x: 0, y: 2, ...gridLayoutTestsCommonProps }),
        key({ x: 1, y: 2, ...gridLayoutTestsCommonProps }),
        key({ x: 3, y: 2, ...gridLayoutTestsCommonProps }),
        key({ x: 4, y: 2, ...gridLayoutTestsCommonProps }),
      ];

      physicalToLogical(keys);

      expect(keys.map((k) => [k.row, k.col])).toEqual([
        [0, 0],
        [0, 1],
        [0, 2],
        [0, 3],

        [1, 0],
        [1, 1],
        [1, 2],
        [1, 3],
      ]);
    });

    it("add spaces when keys are spaced out", () => {
      // Layout:
      // x x _ _ x x
      // x x _ _ x x
      // _ _ _ _ _ _
      // _ _ _ _ _ _
      // x x _ _ x x
      // x x _ _ x x

      // large gaps (>=1.5U) create a single empty column/row
      const keys: Key[] = [
        key({ x: 0, y: 0, ...gridLayoutTestsCommonProps }),
        key({ x: 1, y: 0, ...gridLayoutTestsCommonProps }),
        key({ x: 4, y: 0, ...gridLayoutTestsCommonProps }),
        key({ x: 5, y: 0, ...gridLayoutTestsCommonProps }),

        key({ x: 0, y: 1, ...gridLayoutTestsCommonProps }),
        key({ x: 1, y: 1, ...gridLayoutTestsCommonProps }),
        key({ x: 4, y: 1, ...gridLayoutTestsCommonProps }),
        key({ x: 5, y: 1, ...gridLayoutTestsCommonProps }),

        key({ x: 0, y: 4, ...gridLayoutTestsCommonProps }),
        key({ x: 1, y: 4, ...gridLayoutTestsCommonProps }),
        key({ x: 4, y: 4, ...gridLayoutTestsCommonProps }),
        key({ x: 5, y: 4, ...gridLayoutTestsCommonProps }),

        key({ x: 0, y: 5, ...gridLayoutTestsCommonProps }),
        key({ x: 1, y: 5, ...gridLayoutTestsCommonProps }),
        key({ x: 4, y: 5, ...gridLayoutTestsCommonProps }),
        key({ x: 5, y: 5, ...gridLayoutTestsCommonProps }),
      ];

      physicalToLogical(keys);

      expect(keys.map((k) => [k.row, k.col])).toEqual([
        [0, 0],
        [0, 1],
        [0, 3],
        [0, 4],

        [1, 0],
        [1, 1],
        [1, 3],
        [1, 4],

        [3, 0],
        [3, 1],
        [3, 3],
        [3, 4],

        [4, 0],
        [4, 1],
        [4, 3],
        [4, 4],
      ]);
    });

    it("handles non-uniform key sizes", () => {
      const noRotationProps = { r: 0, rx: 0, ry: 0 };
      // Layout:
      // x xxx xxx
      // x x xxx x
      // xxxxx x ^
      const keys: Key[] = [
        // row 0
        // key 0
        key({ x: 0, y: 0, w: 1, h: 1, ...noRotationProps }),
        // key 1, 2U wide
        key({ x: 1, y: 0, w: 2, h: 1, ...noRotationProps }),
        // key 2, 2U wide
        key({ x: 3, y: 0, w: 2, h: 1, ...noRotationProps }),

        // row 1
        // key 3
        key({ x: 0, y: 1, w: 1, h: 1, ...noRotationProps }),
        // key 4
        key({ x: 1, y: 1, w: 1, h: 1, ...noRotationProps }),
        // key 5, 2U wide
        key({ x: 2, y: 1, w: 2, h: 1, ...noRotationProps }),
        // key 6, 2U tall
        key({ x: 4, y: 1, w: 1, h: 2, ...noRotationProps }),

        // row 2
        // key 7, 3U wide
        key({ x: 0, y: 2, w: 3, h: 1, ...noRotationProps }),
        // key 9
        key({ x: 3, y: 2, w: 1, h: 1, ...noRotationProps }),
      ];

      physicalToLogical(keys);

      expect(keys.map((k) => [k.row, k.col])).toEqual([
        [0, 0],
        [0, 1],
        [0, 3],

        [1, 0],
        [1, 1],
        [1, 2],
        [1, 4],

        [2, 1], // 3U key, aligns at key center
        [2, 3],
      ]);
    });
  });
});

function key(physical: Omit<Key, "id" | "part" | "row" | "col">): Key {
  return {
    id: ulid(),
    part: 0,
    ...physical,
    row: -1,
    col: -1,
  };
}
