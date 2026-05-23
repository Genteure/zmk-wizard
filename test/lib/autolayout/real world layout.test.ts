import { describe, expect, it } from "vitest";
import { physicalToLogical } from "~/components/layouthelper";
import { layouts } from "~/lib/physicalLayouts";
import type { Key } from "~/typedef";

const consistantIdFactory = () => {
  let counter = 0;
  return () => `keyId${(counter++).toString().padStart(3, '0')}AA`;
}

describe("real-world layouts", () => {
  it("handles ferris", () => {
    const generateId = consistantIdFactory();
    const ferrisLayoutKeys: Key[] = layouts["Popular Layouts"]
      .find(l => l.name === "Ferris")!.keys
      .map((k) => ({
        ...k,
        id: generateId(),
        row: -1,
        col: -1,
      }));

    physicalToLogical(ferrisLayoutKeys, true);

    expect(ferrisLayoutKeys.map((k) => [k.row, k.col])).toEqual([
      [0, 1], [0, 2], [0, 3], [0, 4],
      [0, 7], [0, 8], [0, 9], [0, 10],

      [1, 0],
      [1, 1], [1, 2], [1, 3], [1, 4],
      [1, 7], [1, 8], [1, 9], [1, 10],
      [1, 11],

      [2, 0],
      [2, 1], [2, 2], [2, 3], [2, 4],
      [2, 7], [2, 8], [2, 9], [2, 10],
      [2, 11],

      [3, 0],
      [3, 4], [3, 5],
      [3, 6], [3, 7],
      [3, 11],
    ]);

  });
  it("handles corne5col", () => {
    const generateId = consistantIdFactory();
    const ferrisLayoutKeys: Key[] = layouts["Corne"]
      .find(l => l.name === "5 Column")!.keys
      .map((k) => ({
        ...k,
        id: generateId(),
        row: -1,
        col: -1,
      }));

    physicalToLogical(ferrisLayoutKeys, true);

    expect(ferrisLayoutKeys.map((k) => [k.row, k.col])).toEqual([
      [0, 0], [0, 1], [0, 2], [0, 3], [0, 4],
      [0, 7], [0, 8], [0, 9], [0, 10], [0, 11],

      [1, 0], [1, 1], [1, 2], [1, 3], [1, 4],
      [1, 7], [1, 8], [1, 9], [1, 10], [1, 11],

      [2, 0], [2, 1], [2, 2], [2, 3], [2, 4],
      [2, 7], [2, 8], [2, 9], [2, 10], [2, 11],

      [3, 3], [3, 4], [3, 5],
      [3, 6], [3, 7], [3, 8],
    ]);
  });
  it("handles 60%ISO", () => {
    const generateId = consistantIdFactory();
    const layoutKeys: Key[] = layouts["60%"]
      .find(l => l.name === "60% ISO")!.keys
      .map((k) => ({
        ...k,
        id: generateId(),
        row: -1,
        col: -1,
      }));

    physicalToLogical(layoutKeys, true);

    expect(Math.max(...layoutKeys.map(k => k.row))).toBe(4); // 5 rows: 0-4
    expect(Math.max(...layoutKeys.map(k => k.col))).toBe(13); // 14 cols: 0-13
  });
});
