import { describe, test, expect } from 'vitest';
import type { NeighborInput, ObjId, Rect, Relation } from '~/lib/autolayout/types';
import { findNeighbors } from '~/lib/autolayout/neighbor';

// helper functions to create test data
const R = (overrides: { id: ObjId } & Partial<Omit<Rect, 'id'>>): Rect => ({
  x: 0,
  y: 0,
  width: 1,
  height: 1,
  degree: 0,
  ...overrides,
});

const input = (threshold: number, objects: Rect[]): NeighborInput => ({
  objects,
  threshold,
});

// format relation pairs as A->B, then sort so they have consistent order for testing
const formatRelations = (arr: Relation[]): string[] =>
  arr.map(pair => `${pair[0]}->${pair[1]}`).sort();

describe('basics', () => {
  test('no objects', () => {
    const result = findNeighbors(input(10, []));
    expect(result.nodes).toEqual([]);
    expect(result.horizontal).toEqual([]);
    expect(result.vertical).toEqual([]);
  });
  test('three objects', () => {
    // AC
    // B
    const result = findNeighbors(input(10, [
      R({ id: 'A', x: 0, y: 0 }),
      R({ id: 'B', x: 0, y: 5 }),
      R({ id: 'C', x: 5, y: 0 }),
    ]));
    expect(result.nodes).toEqual(['A', 'B', 'C']);
    expect(formatRelations(result.vertical)).toEqual(['A->B']);
    expect(formatRelations(result.horizontal)).toEqual(['A->C']);
  });
  test('rotated 180', () => {
    // AC
    // B
    const result = findNeighbors(input(10, [
      R({ id: 'A', x: 0, y: 0, degree: 180 }),
      R({ id: 'B', x: 0, y: 5, degree: 180 }),
      R({ id: 'C', x: 5, y: 0, degree: 180 }),
    ]));
    expect(result.nodes).toEqual(['A', 'B', 'C']);
    expect(formatRelations(result.vertical)).toEqual(['B->A']);
    expect(formatRelations(result.horizontal)).toEqual(['C->A']);
  });
  test('wide', () => {
    // AA
    // BC
    const result = findNeighbors(input(1, [
      // note x,y here is the center
      R({ id: 'A', x: 0.5, y: 0, width: 2 }),
      R({ id: 'B', x: 0, y: 1, width: 1 }),
      R({ id: 'C', x: 1, y: 1, width: 1 }),
    ]));
    expect(result.nodes).toEqual(['A', 'B', 'C']);
    expect(formatRelations(result.vertical)).toEqual(['A->B', 'A->C']);
    expect(formatRelations(result.horizontal)).toEqual(['B->C']);
  });
  test('wide gap', () => {
    // AAA
    // B_C
    const result = findNeighbors(input(1, [
      // note: x,y here is the center
      R({ id: 'A', x: 1, y: 0, width: 3 }),
      R({ id: 'B', x: 0, y: 1, width: 1 }),
      R({ id: 'C', x: 2, y: 1, width: 1 }),
    ]));
    expect(result.nodes).toEqual(['A', 'B', 'C']);
    expect(formatRelations(result.vertical)).toEqual(['A->B', 'A->C']);
    expect(formatRelations(result.horizontal)).toEqual([]);
  });
  test('direction mismatch', () => {
    // AB
    // C
    // but A is rotated 90 degrees so it's facing the wrong way, so no neighbors should be detected
    const result = findNeighbors(input(10, [
      R({ id: 'A', x: 0, y: 0, degree: 90 }),
      R({ id: 'B', x: 1, y: 0 }),
      R({ id: 'C', x: 0, y: 2 }),
    ]));
    expect(result.nodes).toEqual(['A', 'B', 'C']);
    expect(formatRelations(result.vertical)).toEqual([]);
    expect(formatRelations(result.horizontal)).toEqual([]);
  });
});

describe('rotations', () => {
  // lookup table
  // 12 1x1 rectangles forming a circle around 0,0
  // screen space coordinates, so y increases downwards

  //  clock | x      | y      | degree
  // -------|--------|--------|--------
  //    0   |  0.000 | -2.366 | 0
  //    1   |  1.183 | -2.049 | 30
  //    2   |  2.049 | -1.183 | 60
  //    3   |  2.366 |  0.000 | 90
  //    4   |  2.049 |  1.183 | 120
  //    5   |  1.183 |  2.049 | 150
  //    6   |  0.000 |  2.366 | 180
  //    7   | -1.183 |  2.049 | 210
  //    8   | -2.049 |  1.183 | 240
  //    9   | -2.366 |  0.000 | 270
  //   10   | -2.049 | -1.183 | 300
  //   11   | -1.183 | -2.049 | 330

  const clockRects = [
    R({ id: '0', x: 0, y: -2.366, degree: 0 }),
    R({ id: '1', x: 1.183, y: -2.049, degree: 30 }),
    R({ id: '2', x: 2.049, y: -1.183, degree: 60 }),
    R({ id: '3', x: 2.366, y: 0, degree: 90 }),
    R({ id: '4', x: 2.049, y: 1.183, degree: 120 }),
    R({ id: '5', x: 1.183, y: 2.049, degree: 150 }),
    R({ id: '6', x: 0, y: 2.366, degree: 180 }),
    R({ id: '7', x: -1.183, y: 2.049, degree: 210 }),
    R({ id: '8', x: -2.049, y: 1.183, degree: 240 }),
    R({ id: '9', x: -2.366, y: 0, degree: 270 }),
    R({ id: '10', x: -2.049, y: -1.183, degree: 300 }),
    R({ id: '11', x: -1.183, y: -2.049, degree: 330 }),
  ];

  test('full circle', () => {
    const result = findNeighbors(input(1, clockRects));
    expect(result.nodes).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11']);
    expect(formatRelations(result.vertical)).toEqual([]);
    expect(formatRelations(result.horizontal)).toEqual([
      '0->1',
      '1->2',
      '10->11',
      '11->0',
      '2->3',
      '3->4',
      '4->5',
      '5->6',
      '6->7',
      '7->8',
      '8->9',
      '9->10',
    ]);
  });

  test('full circle rotated 90', () => {
    const localRects = clockRects.map(r => ({ ...r, degree: (r.degree - 90) % 360 }));
    const result = findNeighbors(input(1, localRects));
    expect(result.nodes).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11']);
    expect(formatRelations(result.horizontal)).toEqual([]);
    expect(formatRelations(result.vertical)).toEqual([
      '0->1',
      '1->2',
      '10->11',
      '11->0',
      '2->3',
      '3->4',
      '4->5',
      '5->6',
      '6->7',
      '7->8',
      '8->9',
      '9->10',
    ]);
  });
});
