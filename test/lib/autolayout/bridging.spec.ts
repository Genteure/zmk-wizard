import { describe, expect, test } from 'vitest';
import { bridgeSets, connectSets, groupSets } from '~/lib/autolayout/bridging';

describe('group sets', () => {
  test('returns one component for a fully connected graph', () => {
    const result = groupSets({
      nodes: ['A', 'B', 'C', 'D'],
      horizontal: [['A', 'B'], ['B', 'C']],
      vertical: [['C', 'D']],
    });

    expect(result).toEqual(new Map([
      ['A', 0],
      ['B', 0],
      ['C', 0],
      ['D', 0],
    ]));
  });

  test('groups disconnected nodes into separate components', () => {
    const result = groupSets({
      nodes: ['A', 'B', 'C', 'D', 'E'],
      horizontal: [['A', 'B'], ['C', 'D']],
      vertical: [],
    });

    expect(result).toEqual(new Map([
      ['A', 0],
      ['B', 0],
      ['C', 1],
      ['D', 1],
      ['E', 2],
    ]));
  });
});

describe('connect sets', () => {
  test('returns k - 1 edges to connect k sets', () => {
    const objects = [
      { id: 'A', x: 0, y: 0, width: 1, height: 1, degree: 0 },
      { id: 'B', x: 1, y: 0, width: 1, height: 1, degree: 0 },
      { id: 'C', x: 10, y: 0, width: 1, height: 1, degree: 0 },
      { id: 'D', x: 20, y: 0, width: 1, height: 1, degree: 0 },
    ];

    const setById = new Map([
      ['A', 0],
      ['B', 0],
      ['C', 1],
      ['D', 2],
    ]);

    const result = connectSets(objects, setById);

    expect(result).toHaveLength(2);
    for (const edge of result) {
      expect(edge.setA).not.toBe(edge.setB);
      expect(edge.distance).toBeGreaterThan(0);
    }
  });

  test('returns empty when there is only one set', () => {
    const objects = [
      { id: 'A', x: 0, y: 0, width: 1, height: 1, degree: 0 },
      { id: 'B', x: 2, y: 0, width: 1, height: 1, degree: 0 },
    ];

    const setById = new Map([
      ['A', 0],
      ['B', 0],
    ]);

    expect(connectSets(objects, setById)).toEqual([]);
  });

  test('throws if object id has no set assignment', () => {
    const objects = [
      { id: 'A', x: 0, y: 0, width: 1, height: 1, degree: 0 },
    ];

    expect(() => connectSets(objects, new Map())).toThrow('Missing set id for object: A');
  });
});

describe('bridge sets', () => {
  const makeObj = (id: string, x: number, y: number) =>
    ({ id, x, y, width: 1, height: 1, degree: 0 });

  test('returns empty arrays when all objects are in one set', () => {
    const objects = [makeObj('A', 0, 0), makeObj('B', 5, 0)];
    const neighborOutput = {
      nodes: ['A', 'B'],
      horizontal: [['A', 'B']] as [string, string][],
      vertical: [],
    };

    const result = bridgeSets(neighborOutput, objects);

    expect(result.horizontal).toEqual([]);
    expect(result.vertical).toEqual([]);
  });

  test('produces a horizontal relation when sets are separated horizontally', () => {
    // A and B are already connected; C is isolated far to the right.
    const objects = [makeObj('A', 0, 0), makeObj('B', 1, 0), makeObj('C', 100, 0)];
    const neighborOutput = {
      nodes: ['A', 'B', 'C'],
      horizontal: [['A', 'B']] as [string, string][],
      vertical: [],
    };

    const { horizontal, vertical } = bridgeSets(neighborOutput, objects);

    expect(vertical).toEqual([]);
    expect(horizontal).toHaveLength(1);
    // B is closer to C than A is; left id should have smaller x
    const [left, right] = horizontal[0];
    const leftObj = objects.find(o => o.id === left)!;
    const rightObj = objects.find(o => o.id === right)!;
    expect(leftObj.x).toBeLessThanOrEqual(rightObj.x);
  });

  test('produces a vertical relation when sets are separated vertically', () => {
    const objects = [makeObj('A', 0, 0), makeObj('B', 0, 100)];
    const neighborOutput = {
      nodes: ['A', 'B'],
      horizontal: [],
      vertical: [],
    };

    const { horizontal, vertical } = bridgeSets(neighborOutput, objects);

    expect(horizontal).toEqual([]);
    expect(vertical).toHaveLength(1);
    // A.y=0 < B.y=100, so A is top, B is bottom
    expect(vertical[0]).toEqual(['A', 'B']);
  });

  test('bridges three sets with two relations', () => {
    // Three isolated objects forming three separate sets.
    const objects = [makeObj('A', 0, 0), makeObj('B', 10, 0), makeObj('C', 20, 0)];
    const neighborOutput = {
      nodes: ['A', 'B', 'C'],
      horizontal: [],
      vertical: [],
    };

    const { horizontal, vertical } = bridgeSets(neighborOutput, objects);

    const totalEdges = horizontal.length + vertical.length;
    expect(totalEdges).toBe(2);
    // All edges must be horizontal (same y=0)
    expect(vertical).toEqual([]);
    expect(horizontal).toHaveLength(2);
  });

  test('left id has smaller x in a horizontal bridging relation', () => {
    const objects = [makeObj('Far', 50, 0), makeObj('Near', 5, 0)];
    const neighborOutput = {
      nodes: ['Far', 'Near'],
      horizontal: [],
      vertical: [],
    };

    const { horizontal } = bridgeSets(neighborOutput, objects);

    expect(horizontal).toHaveLength(1);
    expect(horizontal[0]).toEqual(['Near', 'Far']);
  });

  test('top id has smaller y in a vertical bridging relation', () => {
    const objects = [makeObj('Low', 0, 20), makeObj('High', 0, 0)];
    const neighborOutput = {
      nodes: ['Low', 'High'],
      horizontal: [],
      vertical: [],
    };

    const { vertical } = bridgeSets(neighborOutput, objects);

    expect(vertical).toHaveLength(1);
    expect(vertical[0]).toEqual(['High', 'Low']);
  });
});
