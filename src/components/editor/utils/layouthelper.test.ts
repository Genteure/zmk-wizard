import { ulid } from 'ulidx';
import { describe, expect, test } from 'vitest';
import type { Key, KeyId } from '~/types';
import {
  parseCsvWithChoice,
  parseKleJsonWithChoice,
  parseLayoutJsonWithChoice,
  parsePhysicalLayoutDtsWithChoice,
} from './layouthelper';

function makeKey(overrides: Partial<Key>): Key {
  return {
    id: ulid() as KeyId,
    part: 0,
    row: 0,
    col: 0,
    x: 0,
    y: 0,
    w: 1,
    h: 1,
    r: 0,
    rx: 0,
    ry: 0,
    ...overrides,
  };
}

describe('layout import row/col candidates', () => {
  test('QMK layout with row/col exposes original and generated candidates', () => {
    const json = JSON.stringify({
      layouts: {
        test: {
          layout: [
            { row: 1, col: 1, x: 0, y: 0 },
            { row: 1, col: 0, x: 1, y: 0 },
            { row: 0, col: 1, x: 0, y: 1 },
            { row: 0, col: 0, x: 1, y: 1 },
          ],
        },
      },
    });

    const parsed = parseLayoutJsonWithChoice(json);
    expect(parsed).not.toBeNull();
    expect(parsed!.hasRowCol).toBe(true);

    // Imported row/col values are preserved and sorted by them.
    expect(parsed!.original!.map(k => [k.row, k.col])).toEqual([
      [0, 0], [0, 1], [1, 0], [1, 1],
    ]);
    expect(parsed!.original![0].x).toBe(1);
    expect(parsed!.original![0].y).toBe(1);

    // Generated candidate follows physical top-left → bottom-right order.
    expect(parsed!.generated.map(k => [k.x, k.y])).toEqual([
      [0, 0], [1, 0], [0, 1], [1, 1],
    ]);
    expect(parsed!.generated.map(k => [k.row, k.col])).toEqual([
      [0, 0], [0, 1], [1, 0], [1, 1],
    ]);
  });

  test('QMK layout without row/col falls back to generated only', () => {
    const json = JSON.stringify({
      layouts: {
        test: {
          layout: [
            { x: 1, y: 0 },
            { x: 0, y: 0 },
          ],
        },
      },
    });

    const parsed = parseLayoutJsonWithChoice(json);
    expect(parsed).not.toBeNull();
    expect(parsed!.hasRowCol).toBe(false);
    expect(parsed!.original).toBeNull();
    expect(parsed!.generated.map(k => [k.x, k.y])).toEqual([
      [0, 0], [1, 0],
    ]);
  });

  test('KLE layout with row/col labels exposes both candidates', () => {
    const parsed = parseKleJsonWithChoice(JSON.stringify([['0,0', '0,1']]));
    expect(parsed).not.toBeNull();
    expect(parsed!.hasRowCol).toBe(true);
    expect(parsed!.original!.map(k => [k.row, k.col])).toEqual([
      [0, 0], [0, 1],
    ]);
    expect(parsed!.generated).toHaveLength(2);
  });

  test('KLE layout without row/col labels uses generated only', () => {
    const parsed = parseKleJsonWithChoice(JSON.stringify([['', '']]));
    expect(parsed).not.toBeNull();
    expect(parsed!.hasRowCol).toBe(false);
    expect(parsed!.original).toBeNull();
    expect(parsed!.generated.map(k => k.x)).toEqual([0, 1]);
  });

  test('CSV always carries row/col, so it exposes both candidates', () => {
    const csv = [
      'row,col,x,y,w,h',
      '1,0,1,0,1,1',
      '0,0,0,0,1,1',
    ].join('\n');

    const parsed = parseCsvWithChoice(csv);
    expect(parsed).not.toBeNull();
    expect(parsed!.hasRowCol).toBe(true);
    expect(parsed!.original!.map(k => [k.row, k.col])).toEqual([
      [0, 0], [1, 0],
    ]);
    expect(parsed!.generated.map(k => [k.x, k.y])).toEqual([
      [0, 0], [1, 0],
    ]);
  });

  test('Physical layout DTS has no row/col and uses generated only', () => {
    const dts = `layout {
      compatible = "zmk,physical-layout";
      keys {
        &key_physical_attrs 100 100 0 0 0 0 0
        &key_physical_attrs 100 100 100 0 0 100 0
      };
    };`;

    const parsed = parsePhysicalLayoutDtsWithChoice(dts);
    expect(parsed).not.toBeNull();
    expect(parsed!.hasRowCol).toBe(false);
    expect(parsed!.original).toBeNull();
    expect(parsed!.generated).toHaveLength(2);
    expect(parsed!.generated.map(k => k.x)).toEqual([0, 1]);
  });

  test('original and generated candidates are independent', () => {
    const keys = [
      makeKey({ row: 1, col: 1, x: 0, y: 0 }),
      makeKey({ row: 1, col: 0, x: 1, y: 0 }),
    ];
    const json = JSON.stringify({
      layouts: { test: { layout: keys.map(k => ({ ...k })) } },
    });

    const parsed = parseLayoutJsonWithChoice(json);
    expect(parsed).not.toBeNull();
    // Candidates reorder keys independently, so compare the same key by id.
    const originalIds = new Set(parsed!.original!.map(k => k.id));
    const generatedIds = new Set(parsed!.generated.map(k => k.id));
    expect(originalIds).toEqual(generatedIds);

    const mutated = parsed!.original![0];
    mutated.row = 99;
    const generatedCopy = parsed!.generated.find(k => k.id === mutated.id)!;
    expect(generatedCopy.row).not.toBe(99);
  });
});
