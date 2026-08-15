/**
 * 2-D layout algorithm.
 *
 * The algorithm assigns each entity a unique `(row, col)` cell satisfying every
 * horizontal `col(u) < col(v)` and vertical `row(u) < row(v)` constraint. When
 * center coordinates are supplied (the `gridfit` pipeline), they are used as a
 * *seed* so that physical columns/rows are reconstructed — essential for
 * staggered and split keyboards where the constraint graph alone is not enough:
 *
 *   - the minimum column is seeded by the x-coordinate cluster (so the two
 *     halves of a split board are offset correctly), and
 *   - the minimum row is seeded by the vertical rank, with keys that have no
 *     vertical edge (inner thumb keys) inheriting their row from horizontal
 *     neighbours.
 *
 * The seeds are only floors: the actual placement still enforces every
 * constraint via predecessor positions and guarantees uniqueness via a
 * free-cell search, so the result is correct for arbitrary inputs.
 */

import type {
  ObjId,
  Relation,
  LayoutInput,
  LayoutOutput,
} from './types';

// ======================== Types ========================

type Entity = ObjId;

interface Pt {
  x: number; // column
  y: number; // row
}

// ======================== Cycle breaking ========================

/**
 * Remove back-edges from a directed graph to make it acyclic (a DAG).
 * Uses DFS-based cycle detection.
 */
function breakCycles(
  nodes: Iterable<string>,
  edges: [string, string][],
): [string, string][] {
  const allNodes = new Set(nodes);
  for (const [u, v] of edges) {
    allNodes.add(u);
    allNodes.add(v);
  }

  const adj = new Map<string, { target: string; idx: number }[]>();
  for (const n of allNodes) adj.set(n, []);
  for (let i = 0; i < edges.length; i++) {
    const [u, v] = edges[i];
    adj.get(u)!.push({ target: v, idx: i });
  }

  const state = new Map<string, number>();
  for (const n of allNodes) state.set(n, 0);
  const backEdgeIndices = new Set<number>();

  function dfs(u: string): void {
    state.set(u, 1);
    for (const { target: v, idx } of adj.get(u)!) {
      const vs = state.get(v)!;
      if (vs === 1) {
        backEdgeIndices.add(idx);
      }
      else if (vs === 0) {
        dfs(v);
      }
    }
    state.set(u, 2);
  }

  for (const n of allNodes) {
    if (state.get(n) === 0) dfs(n);
  }

  return edges.filter((_, i) => !backEdgeIndices.has(i));
}

// ======================== Geometry seeds ========================

/**
 * Cluster keys into columns by their **left edge** (`x - width/2`). Using the
 * left edge rather than the centre means wide keys (1.5U/2U modifiers) align
 * with the column they start in, and staggered rows whose wide keys offset the
 * centres still group together. A new column starts when a left edge is more
 * than `tolerance` to the right of the first one in the current column.
 */
function clusterColumnsByX(
  entities: Entity[],
  coords: ReadonlyMap<string, { x: number; y: number; width: number; height: number }>,
  tolerance: number,
): Map<string, number> {
  const leftEdge = (id: string): number => {
    const c = coords.get(id);
    return c ? c.x - c.width / 2 : 0;
  };
  const sorted = [...entities].sort((a, b) => leftEdge(a) - leftEdge(b));
  const colOf = new Map<string, number>();
  let col = -1;
  let firstX = -Infinity;
  for (const id of sorted) {
    const x = leftEdge(id);
    if (col === -1 || x - firstX > tolerance) {
      col++;
      firstX = x;
    }
    colOf.set(id, col);
  }
  return colOf;
}

/**
 * Row seed: rank keys within each physical column by their y-coordinate. This
 * handles both staggered columns (keys in a column are ordered top-to-bottom by
 * y) and row gaps (where the neighbour threshold misses a vertical edge, e.g.
 * the 1.25U-spaced numpads). Keys with no vertical edge at all (isolated, e.g.
 * inner thumb keys of a split board) inherit the max row of their horizontal
 * neighbours, iterated to convergence. The greedy placement still enforces
 * vertical constraints via predecessor positions.
 */
function rankWithinColumnByY(
  entities: Entity[],
  coords: ReadonlyMap<string, { x: number; y: number; width: number; height: number }>,
  colCluster: Map<string, number>,
  vEdges: Relation[],
  hEdges: Relation[],
): Map<string, number> {
  const groups = new Map<number, string[]>();
  for (const id of entities) {
    const c = colCluster.get(id)!;
    if (!groups.has(c)) groups.set(c, []);
    groups.get(c)!.push(id);
  }
  const rowOf = new Map<string, number>();
  for (const ids of groups.values()) {
    ids.sort((a, b) => (coords.get(a)?.y ?? 0) - (coords.get(b)?.y ?? 0));
    ids.forEach((id, i) => rowOf.set(id, i));
  }

  // Propagate rows to isolated keys (no vertical edge) via horizontal neighbours.
  const inVertical = new Set<string>();
  for (const [u, v] of vEdges) {
    inVertical.add(u);
    inVertical.add(v);
  }
  const hAdj = new Map<string, string[]>();
  for (const n of entities) hAdj.set(n, []);
  for (const [u, v] of hEdges) {
    hAdj.get(u)!.push(v);
    hAdj.get(v)!.push(u);
  }
  for (let iter = 0; iter < entities.length; iter++) {
    let changed = false;
    for (const id of entities) {
      if (inVertical.has(id)) continue;
      let maxRow = rowOf.get(id)!;
      for (const nb of hAdj.get(id)!) {
        if (rowOf.get(nb)! > maxRow) maxRow = rowOf.get(nb)!;
      }
      if (maxRow > rowOf.get(id)!) {
        rowOf.set(id, maxRow);
        changed = true;
      }
    }
    if (!changed) break;
  }

  return rowOf;
}

/**
 * Detect a "detached block": a whole row of keys (>= 5, all at nearly the same
 * y) with no vertical edge at all, separated from the main block by a gap
 * larger than the neighbour threshold (canonically a TKL function row). Split
 * boards have only a few isolated thumb keys spread over a y-range, so they are
 * not flagged.
 */
function hasDetachedBlock(
  entities: Entity[],
  vEdges: Relation[],
  coords: ReadonlyMap<string, { x: number; y: number; width: number; height: number }>,
): boolean {
  const inVertical = new Set<string>();
  for (const [u, v] of vEdges) {
    inVertical.add(u);
    inVertical.add(v);
  }
  // Group isolated keys into 0.25-unit y-bands; a band with >= 5 keys is a
  // whole detached row (e.g. a TKL function row), not a split board's thumbs.
  const bands = new Map<number, number>();
  for (const n of entities) {
    if (inVertical.has(n)) continue;
    const y = coords.get(n)?.y ?? 0;
    const band = Math.round(y * 4);
    bands.set(band, (bands.get(band) ?? 0) + 1);
  }
  for (const count of bands.values()) {
    if (count >= 5) return true;
  }
  return false;
}

/**
 * Global row seed: cluster keys by y-coordinate (top to bottom). Used only when
 * a detached block is present ({@link hasDetachedBlock}), where the sparse
 * vertical graph under-counts rows.
 */
function clusterByY(
  entities: Entity[],
  coords: ReadonlyMap<string, { x: number; y: number; width: number; height: number }>,
  tolerance: number,
): Map<string, number> {
  const sorted = [...entities].sort(
    (a, b) => (coords.get(a)?.y ?? 0) - (coords.get(b)?.y ?? 0),
  );
  const rowOf = new Map<string, number>();
  let row = -1;
  let firstY = -Infinity;
  for (const id of sorted) {
    const y = coords.get(id)?.y ?? 0;
    if (row === -1 || y - firstY > tolerance) {
      row++;
      firstY = y;
    }
    rowOf.set(id, row);
  }
  return rowOf;
}

// ======================== Position finding ========================

/**
 * Find the free cell `(col, row)` with `col >= minCol` and `row >= minRow`
 * minimising the resulting bounding-box area (ties broken by smaller row+col).
 */
function findFreeCell(
  minCol: number,
  minRow: number,
  maxCol: number,
  maxRow: number,
  occupied: Set<string>,
): Pt {
  let best: Pt = { x: minCol, y: minRow };
  let bestArea = Infinity;
  let bestSum = Infinity;

  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      if (occupied.has(`${col},${row}`)) continue;
      const area = Math.max(maxCol, col + 1) * Math.max(maxRow, row + 1);
      const sum = col + row;
      if (area < bestArea || (area === bestArea && sum < bestSum)) {
        bestArea = area;
        bestSum = sum;
        best = { x: col, y: row };
      }
    }
  }

  return best;
}

// ======================== Main function ========================

/**
 * Arrange a set of nodes into a 2-D grid that satisfies every directional
 * ordering constraint (`col(u) < col(v)` horizontally, `row(u) < row(v)`
 * vertically) with unique positions.
 *
 * When `input.coords` is provided, physical coordinates seed the minimum
 * column/row so the output reproduces the keyboard's shape.
 *
 * @param input - Nodes, directional constraints, optional coordinates, weights,
 *   and placement preference.
 * @returns A {@link LayoutOutput}.
 */
export function layout(input: LayoutInput): LayoutOutput {
  const { nodes, horizontal, vertical, coords } = input;

  const nodeSet = new Set<Entity>(nodes);
  for (const [a, b] of horizontal) {
    nodeSet.add(a);
    nodeSet.add(b);
  }
  for (const [a, b] of vertical) {
    nodeSet.add(a);
    nodeSet.add(b);
  }
  const allEntities = [...nodeSet];

  if (allEntities.length === 0) {
    return { grid: [[]], positions: new Map() };
  }

  const hEdges = breakCycles(allEntities, horizontal as [string, string][]);
  const vEdges = breakCycles(allEntities, vertical as [string, string][]);

  // Geometry seeds (only when coordinates are available).
  const colSeed = input.coords && input.coords.size > 0
    ? clusterColumnsByX(allEntities, input.coords, 0.75)
    : null;
  const rowSeed = colSeed
    ? (hasDetachedBlock(allEntities, vEdges, coords!)
        ? clusterByY(allEntities, coords!, 0.5)
        : rankWithinColumnByY(allEntities, coords!, colSeed, vEdges, hEdges))
    : null;

  // Combined topological order over H ∪ V.
  const adj = new Map<string, string[]>();
  const inDeg = new Map<string, number>();
  for (const n of allEntities) {
    adj.set(n, []);
    inDeg.set(n, 0);
  }
  const seen = new Set<string>();
  const addEdge = (u: string, v: string) => {
    const key = `${u}\0${v}`;
    if (seen.has(key)) return;
    seen.add(key);
    adj.get(u)!.push(v);
    inDeg.set(v, inDeg.get(v)! + 1);
  };
  for (const [u, v] of hEdges) addEdge(u, v);
  for (const [u, v] of vEdges) addEdge(u, v);

  const queue: string[] = [];
  for (const n of allEntities) if (inDeg.get(n) === 0) queue.push(n);

  const hPred = new Map<string, string[]>();
  const vPred = new Map<string, string[]>();
  const hSucc = new Map<string, string[]>();
  for (const n of allEntities) {
    hPred.set(n, []);
    vPred.set(n, []);
    hSucc.set(n, []);
  }
  for (const [u, v] of hEdges) {
    hPred.get(v)!.push(u);
    hSucc.get(u)!.push(v);
  }
  for (const [u, v] of vEdges) vPred.get(v)!.push(u);

  const positions = new Map<Entity, Pt>();
  const occupied = new Set<string>();
  let maxCol = 0;
  let maxRow = 0;

  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const v of adj.get(id)!) {
      const d = inDeg.get(v)! - 1;
      inDeg.set(v, d);
      if (d === 0) queue.push(v);
    }

    // Seed only horizontal sources (keys with no left-of constraint) with their
    // left-edge cluster column, so disconnected parts of a split board are
    // offset correctly.
    let minCol = 0;
    if (colSeed && hPred.get(id)!.length === 0) {
      minCol = colSeed.get(id)!;
    }
    for (const pred of hPred.get(id)!) {
      // A wide predecessor occupies more than one column: place this key
      // `floor(width)` columns to its right (2U -> +2, 1.5U -> +1 compact).
      const pw = coords?.get(pred)?.width ?? 1;
      minCol = Math.max(minCol, positions.get(pred)!.x + Math.floor(pw));
    }
    let minRow = rowSeed ? rowSeed.get(id)! : 0;
    for (const pred of vPred.get(id)!) {
      // A tall predecessor occupies more than one row: place this key
      // `floor(height)` rows below it (2U-tall -> +2, 1U -> +1).
      const ph = coords?.get(pred)?.height ?? 1;
      minRow = Math.max(minRow, positions.get(pred)!.y + Math.floor(ph));
    }

    const p = findFreeCell(minCol, minRow, maxCol, maxRow, occupied);
    positions.set(id, p);
    occupied.add(`${p.x},${p.y}`);
    maxCol = Math.max(maxCol, p.x + 1);
    maxRow = Math.max(maxRow, p.y + 1);
  }

  // Align exact-flush vertical chains to a single column. A wide predecessor
  // can push different keys of one physical column to different logical columns
  // (e.g. a 65% nav column where Backspace pushes the top key right). Collapse
  // each such chain to the smallest column that satisfies every horizontal
  // constraint of its keys (shifting both left and right as needed).
  if (coords) {
    const FLUSH_X_TOL = 0.05;
    const flushAdj = new Map<string, string[]>();
    for (const n of allEntities) flushAdj.set(n, []);
    for (const [u, v] of vEdges) {
      const cu = coords.get(u);
      const cv = coords.get(v);
      if (cu && cv && Math.abs(cu.x - cv.x) < FLUSH_X_TOL) {
        flushAdj.get(u)!.push(v);
        flushAdj.get(v)!.push(u);
      }
    }
    const flushSeen = new Set<string>();
    for (const start of allEntities) {
      if (flushSeen.has(start)) continue;
      const comp: string[] = [];
      const q = [start];
      flushSeen.add(start);
      while (q.length > 0) {
        const u = q.shift()!;
        comp.push(u);
        for (const v of flushAdj.get(u)!) {
          if (!flushSeen.has(v)) {
            flushSeen.add(v);
            q.push(v);
          }
        }
      }
      if (comp.length <= 1) continue;

      // Target = the smallest column every key in the chain may occupy, i.e.
      // the maximum over the chain of each key's minimum valid column.
      let target = 0;
      for (const id of comp) {
        let minValid = 0;
        for (const pred of hPred.get(id)!) {
          minValid = Math.max(minValid, positions.get(pred)!.x + 1);
        }
        target = Math.max(target, minValid);
      }

      for (const id of comp) {
        const p = positions.get(id)!;
        if (p.x === target) continue;

        // Check that moving to `target` keeps every horizontal constraint.
        let ok = true;
        if (target < p.x) {
          // Moving left: predecessors must stay strictly left of target.
          for (const pred of hPred.get(id)!) {
            if (positions.get(pred)!.x >= target) { ok = false; break; }
          }
        }
        else {
          // Moving right: successors must stay strictly right of target.
          for (const succ of hSucc.get(id)!) {
            if (positions.get(succ)!.x <= target) { ok = false; break; }
          }
        }
        if (!ok) continue;

        const key = `${target},${p.y}`;
        if (occupied.has(key)) continue;
        occupied.delete(`${p.x},${p.y}`);
        occupied.add(key);
        p.x = target;
      }
    }

    // Recompute bounds after the alignment.
    maxCol = 0;
    maxRow = 0;
    for (const p of positions.values()) {
      maxCol = Math.max(maxCol, p.x + 1);
      maxRow = Math.max(maxRow, p.y + 1);
    }
  }

  // Build the output grid.
  const grid: (Entity | null)[][] = Array.from(
    { length: maxRow },
    () => new Array<Entity | null>(maxCol).fill(null),
  );
  const positionsOutput = new Map<Entity, { row: number; col: number }>();
  for (const [id, p] of positions) {
    positionsOutput.set(id, { row: p.y, col: p.x });
    grid[p.y][p.x] = id;
  }

  return { grid, positions: positionsOutput };
}
