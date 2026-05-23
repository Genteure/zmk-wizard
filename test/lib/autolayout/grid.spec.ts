import { describe, expect, it, test } from "vitest";
import { layout } from "~/lib/autolayout/grid";
import type { Relation } from "~/lib/autolayout/types";

function formatResult(result: ReturnType<typeof layout>): string[] {
  const lines: string[] = [];
  const { grid } = result;
  for (const row of grid) {
    lines.push(row.map((c) => c ?? '_').join(''));
  }
  return lines;
}

describe('one to one relations', () => {
  test('simple examples', () => {
    const nodes = ['A', 'B', 'C', 'D'];
    const dir1: Relation[] = [['A', 'B'], ['C', 'D']];
    const dir2: Relation[] = [['B', 'C']];

    expect(formatResult(layout({
      nodes,
      horizontal: dir1,
      vertical: dir2,
    }))).toEqual([
      'AB_',
      '_CD',
    ]);

    expect(formatResult(layout({
      nodes,
      horizontal: dir2,
      vertical: dir1,
    }))).toEqual([
      'A_',
      'BC',
      '_D',
    ]);

  });

  test('three by four', () => {
    const nodes = ['A', 'B', 'C', 'D', 'E', 'F'];
    const dir1: Relation[] = [['A', 'B'], ['C', 'D'], ['E', 'F']];
    const dir2: Relation[] = [['B', 'C'], ['D', 'E']];

    expect(formatResult(layout({
      nodes,
      horizontal: dir1,
      vertical: dir2,
    }))).toEqual([
      'AB__',
      '_CD_',
      '__EF',
    ]);

    expect(formatResult(layout({
      nodes,
      horizontal: dir2,
      vertical: dir1,
    }))).toEqual([
      'A__',
      'BC_',
      '_DE',
      '__F',
    ]);
  });

  test('with gap in middle', () => {
    const nodes = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
    const dir1: Relation[] = [['A', 'B'], ['B', 'C'], ['F', 'G']];
    const dir2: Relation[] = [['A', 'D'], ['C', 'E'], ['E', 'G'], ['B', 'F']];

    expect(formatResult(layout({
      nodes,
      horizontal: dir1,
      vertical: dir2,
    }))).toEqual([
      'ABC',
      'D_E',
      '_FG',
    ]);

    expect(formatResult(layout({
      nodes,
      horizontal: dir2,
      vertical: dir1,
    }))).toEqual([
      'AD_',
      'B_F',
      'CEG',
    ]);
  });
});

describe('one to many relations', () => {
  test('classic case', () => {
    const nodes = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
    const dir1: Relation[] = [['A', 'B'], ['B', 'C'], ['C', 'D'], ['E', 'F'], ['G', 'H'], ['I', 'J'], ['J', 'K'], ['K', 'L']];
    const dir2: Relation[] = [['A', 'E'], ['B', 'E'], ['C', 'E'], ['D', 'F'], ['E', 'G'], ['E', 'H'], ['F', 'H'], ['G', 'I'], ['H', 'J'], ['H', 'K'], ['H', 'L']];

    expect(formatResult(layout({
      nodes,
      horizontal: dir1,
      vertical: dir2,
    }))).toEqual([
      'ABCD',
      '_E_F',
      'G_H_',
      'IJKL',
    ]);

    expect(formatResult(layout({
      nodes,
      horizontal: dir2,
      vertical: dir1,
    }))).toEqual([
      'A_GI',
      'BE_J',
      'C_HK',
      'DF_L',
    ]);
  });

  test('big chunky Z', () => {
    // conceptually, this is a 5x5 grid with a 3x3 "Z" in the middle
    const nodes = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Z'];

    // left-right in the first case
    const dir1: Relation[] = [
      ['A', 'B'], ['B', 'C'], ['C', 'D'], ['D', 'E'],
      ['F', 'Z'], ['Z', 'G'],
      ['H', 'Z'], ['Z', 'I'],
      ['J', 'Z'], ['Z', 'K'],
      ['L', 'M'], ['M', 'N'], ['N', 'O'], ['O', 'P'],
    ];

    // top-down in the first case
    const dir2: Relation[] = [
      ['A', 'F'], ['F', 'H'], ['H', 'J'], ['J', 'L'],
      ['B', 'Z'], ['Z', 'M'],
      ['C', 'Z'], ['Z', 'N'],
      ['D', 'Z'], ['Z', 'O'],
      ['E', 'G'], ['G', 'I'], ['I', 'K'], ['K', 'P'],
    ];

    expect(formatResult(layout({
      nodes,
      horizontal: dir1,
      vertical: dir2,
    }))).toEqual([
      'ABCDE',
      'F___G',
      'H_Z_I',
      'J___K',
      'LMNOP',
    ]);

    expect(formatResult(layout({
      nodes,
      horizontal: dir2,
      vertical: dir1,
    }))).toEqual([
      'AFHJL',
      'B___M',
      'C_Z_N',
      'D___O',
      'EGIKP',
    ]);
  });

  test('shifted relations', () => {
    // conceptually, there are two 2x2 nodes not perfectly aligned, with 1x1 nodes around them
    // the two 2x2 nodes # and @, alphabets are 1x1 nodes, and _ are empty cells.
    // The following relations are given:
    /*
    ABCD_
    E##F_
    G##HI
    JK@@L
    _O@@P
    _QRST
    */

    const nodes = [
      'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K',
      'L', 'O', 'P', 'Q', 'R', 'S', 'T', '#', '@',
    ];

    // left-right in the first case, top-down in the second case
    const dir1: Relation[] = [
      ['A', 'B'], ['B', 'C'], ['C', 'D'],
      ['E', '#'], ['#', 'F'],
      ['G', '#'], ['#', 'H'], ['H', 'I'],
      ['J', 'K'], ['K', '@'], ['@', 'L'],
      ['O', '@'], ['@', 'P'],
      ['Q', 'R'], ['R', 'S'], ['S', 'T'],
    ];

    // top-down in the first case, left-right in the second case
    const dir2: Relation[] = [
      ['A', 'E'], ['E', 'G'], ['G', 'J'],
      ['B', '#'], ['#', 'K'], ['K', 'O'], ['O', 'Q'],
      ['C', '#'], ['#', '@'], ['@', 'R'],
      ['D', 'F'], ['F', 'H'], ['H', '@'], ['@', 'S'],
      ['I', 'L'], ['L', 'P'], ['P', 'T'],
    ];

    // Note the output only have one # and one @,
    // because each entity can only appear once in the grid.
    // This is a consequence of the definition of the problem, not a bug in the test.

    expect(formatResult(layout({
      nodes,
      horizontal: dir1,
      vertical: dir2,
    }))).toEqual([
      'ABCD_',
      'E#_F_',
      'G__HI',
      'JK@_L',
      '_O__P',
      '_QRST',
    ]);

    expect(formatResult(layout({
      nodes,
      horizontal: dir2,
      vertical: dir1,
    }))).toEqual([
      'AEGJ__',
      'B#_KOQ',
      'C__@_R',
      'DFH__S',
      '__ILPT',
    ]);
  });
});

describe('placement preference', () => {
  // For Entities with multiple possible positions, the algorithm should prefer positions closer to the center.
  // But for Entities with even number of possible positions, there are two "centers".
  test('2x2', () => {
    // ABCD
    // E##F
    // G##H
    // IJKL
    const nodes = [
      'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', '#',
    ];

    const dir1: Relation[] = [
      ['A', 'B'], ['B', 'C'], ['C', 'D'],
      ['E', '#'], ['#', 'F'],
      ['G', '#'], ['#', 'H'],
      ['I', 'J'], ['J', 'K'], ['K', 'L'],
    ];

    const dir2: Relation[] = [
      ['A', 'E'], ['E', 'G'], ['G', 'I'],
      ['B', '#'], ['#', 'J'],
      ['C', '#'], ['#', 'K'],
      ['D', 'F'], ['F', 'H'], ['H', 'L'],
    ];

    expect(formatResult(layout({
      nodes,
      horizontal: dir1,
      vertical: dir2,
      layoutPreference: undefined, // default to top-left
    }))).toEqual([
      'ABCD',
      'E#_F',
      'G__H',
      'IJKL',
    ]);

    expect(formatResult(layout({
      nodes,
      horizontal: dir1,
      vertical: dir2,
      layoutPreference: (_entity) => ['top', 'left']
    }))).toEqual([
      'ABCD',
      'E#_F',
      'G__H',
      'IJKL',
    ]);

    expect(formatResult(layout({
      nodes,
      horizontal: dir1,
      vertical: dir2,
      layoutPreference: (_entity) => ['top', 'right']
    }))).toEqual([
      'ABCD',
      'E_#F',
      'G__H',
      'IJKL',
    ]);

    expect(formatResult(layout({
      nodes,
      horizontal: dir1,
      vertical: dir2,
      layoutPreference: (_entity) => ['bottom', 'left']
    }))).toEqual([
      'ABCD',
      'E__F',
      'G#_H',
      'IJKL',
    ]);

    expect(formatResult(layout({
      nodes,
      horizontal: dir1,
      vertical: dir2,
      layoutPreference: (_entity) => ['bottom', 'right']
    }))).toEqual([
      'ABCD',
      'E__F',
      'G_#H',
      'IJKL',
    ]);
  });

  test('4x4', () => {
    // ABCDEF
    // G####H
    // I####J
    // K####L
    // M####N
    // OPQRST
    const nodes = [
      'A', 'B', 'C', 'D', 'E', 'F',
      'G', 'H',
      'I', 'J',
      'K', 'L',
      'M', 'N',
      'O', 'P', 'Q', 'R', 'S', 'T',
      '#',
    ];

    const dir1: Relation[] = [
      ['A', 'B'], ['B', 'C'], ['C', 'D'], ['D', 'E'], ['E', 'F'],
      ['G', '#'], ['#', 'H'],
      ['I', '#'], ['#', 'J'],
      ['K', '#'], ['#', 'L'],
      ['M', '#'], ['#', 'N'],
      ['O', 'P'], ['P', 'Q'], ['Q', 'R'], ['R', 'S'], ['S', 'T'],
    ];

    const dir2: Relation[] = [
      ['A', 'G'], ['G', 'I'], ['I', 'K'], ['K', 'M'], ['M', 'O'],
      ['B', '#'], ['#', 'P'],
      ['C', '#'], ['#', 'Q'],
      ['D', '#'], ['#', 'R'],
      ['E', '#'], ['#', 'S'],
      ['F', 'H'], ['H', 'J'], ['J', 'L'], ['L', 'N'], ['N', 'T'],
    ];

    expect(formatResult(layout({
      nodes,
      horizontal: dir1,
      vertical: dir2,
      layoutPreference: undefined, // default to top-left
    }))).toEqual([
      'ABCDEF',
      'G____H',
      'I_#__J',
      'K____L',
      'M____N',
      'OPQRST',
    ]);

    expect(formatResult(layout({
      nodes,
      horizontal: dir1,
      vertical: dir2,
      layoutPreference: (_entity) => ['top', 'left']
    }))).toEqual([
      'ABCDEF',
      'G____H',
      'I_#__J',
      'K____L',
      'M____N',
      'OPQRST',
    ]);

    expect(formatResult(layout({
      nodes,
      horizontal: dir1,
      vertical: dir2,
      layoutPreference: (_entity) => ['top', 'right']
    }))).toEqual([
      'ABCDEF',
      'G____H',
      'I__#_J',
      'K____L',
      'M____N',
      'OPQRST',
    ]);
    expect(formatResult(layout({
      nodes,
      horizontal: dir1,
      vertical: dir2,
      layoutPreference: (_entity) => ['bottom', 'left']
    }))).toEqual([
      'ABCDEF',
      'G____H',
      'I____J',
      'K_#__L',
      'M____N',
      'OPQRST',
    ]);

    expect(formatResult(layout({
      nodes,
      horizontal: dir1,
      vertical: dir2,
      layoutPreference: (_entity) => ['bottom', 'right']
    }))).toEqual([
      'ABCDEF',
      'G____H',
      'I____J',
      'K__#_L',
      'M____N',
      'OPQRST',
    ]);

  });

  test('preference per entity', () => {
    // ABCDEF
    // G##@@H
    // I##@@J
    // KLMNOP

    const nodes = [
      'A', 'B', 'C', 'D', 'E', 'F',
      'G', 'H',
      'I', 'J',
      'K', 'L', 'M', 'N', 'O', 'P',
      '#', '@',
    ];

    const dir1: Relation[] = [
      ['A', 'B'], ['B', 'C'], ['C', 'D'], ['D', 'E'], ['E', 'F'],
      ['G', '#'], ['@', 'H'],
      ['I', '#'], ['@', 'J'],
      ['#', '@'],
      ['K', 'L'], ['L', 'M'], ['M', 'N'], ['N', 'O'], ['O', 'P'],
    ];

    const dir2: Relation[] = [
      ['A', 'G'], ['G', 'I'], ['I', 'K'],
      ['B', '#'], ['#', 'L'],
      ['C', '#'], ['#', 'M'],
      ['D', '@'], ['@', 'N'],
      ['E', '@'], ['@', 'O'],
      ['F', 'H'], ['H', 'J'], ['J', 'P'],
    ];

    expect(formatResult(layout({
      nodes,
      horizontal: dir1,
      vertical: dir2,
      layoutPreference: (entity) => {
        if (entity === '#') return ['top', 'left'];
        if (entity === '@') return ['bottom', 'left'];
        return null;
      }
    }))).toEqual([
      'ABCDEF',
      'G#___H',
      'I__@_J',
      'KLMNOP',
    ]);

    expect(formatResult(layout({
      nodes,
      horizontal: dir1,
      vertical: dir2,
      layoutPreference: (entity) => {
        if (entity === '#') return ['bottom', 'left'];
        if (entity === '@') return ['top', 'right'];
        return null;
      }
    }))).toEqual([
      'ABCDEF',
      'G___@H',
      'I#___J',
      'KLMNOP',
    ]);
  });
});
