/**
 * 2-D layout algorithm based on neighbor relations.
 *
 * Core idea — decouple rows and columns:
 *   column = vertical edges union same-col + horizontal edges DAG topological sort
 *   row    = horizontal edges union same-row + vertical edges DAG topological sort
 * Fan-in / fan-out (one-to-many / many-to-one) → split into sub-entity clone chains
 * so that all relations become one-to-one.
 *
 * Preconditions:
 *   - The input graph is fully connected (guaranteed and validated by the caller).
 *     Disconnected subgraphs would give multiple source nodes the same initial
 *     distance of 0, causing coordinate collisions. This algorithm does not
 *     handle that case.
 *   - Vertical / horizontal edge lists contain no duplicates (deduplicated upstream).
 */

import type {
  EntityLayoutPreferenceCallback,
  LayoutHorizontalPreference,
  LayoutInput,
  LayoutOutput,
  LayoutVerticalPreference,
  ObjId
} from './types';

// ======================== Data types ========================

/** Internal alias — same as the public ObjId type */
type Entity = ObjId;

/**
 * Sub-entity identifier — represents one split clone of an Entity.
 *
 *   [0] entity  — original node name
 *   [1] subRow  — clone index in the row direction (horizontal split)
 *   [2] subCol  — clone index in the column direction (vertical split)
 *
 * Row-direction split: subRow varies, subCol is fixed at 0.
 * Column-direction split: subCol varies, subRow is fixed at 0.
 * Both directions split: subRow and subCol both vary, forming a
 *   numRowClones × numColClones matrix.
 */
type SubEntity = readonly [entity: Entity, subRow: number, subCol: number];

/** Field separator used to serialize composite keys for Map / Set lookups */
const KEY_SEP = '#';

/** Serialize a SubEntity to a string key */
function seKey(se: SubEntity): string {
  return `${se[0]}${KEY_SEP}${se[1]}${KEY_SEP}${se[2]}`;
}

/** Construct a SubEntity (defaults: subRow=0, subCol=0) */
function se(entity: Entity, subRow: number = 0, subCol: number = 0): SubEntity {
  return [entity, subRow, subCol] as const;
}

// ======================== Union-Find ========================

/**
 * String-keyed Union-Find (disjoint-set) data structure with union by rank
 * and path compression.
 *
 * Used in two distinct roles inside the layout algorithm:
 * - **Dimension assignment** ({@link assignDimension}): merges sub-entities
 *   that must share the same row or column coordinate.
 * - **Coordinate estimation** ({@link estimateCoordinate}): groups entities
 *   that are expected to occupy the same position for a rough pre-sort.
 *
 * String keys are used so that the set can be initialized directly from
 * entity ids and serialized {@link SubEntity} keys without a separate
 * index-mapping step.
 */
class UnionFind {
  private parent: Map<string, string>;
  private rank: Map<string, number>;

  constructor(elements: Iterable<string>) {
    this.parent = new Map();
    this.rank = new Map();
    for (const e of elements) {
      this.parent.set(e, e);
      this.rank.set(e, 0);
    }
  }

  /**
   * Return the canonical root element for the set containing `x`.
   * Applies path compression on the way back so future lookups are O(α(n)).
   * @throws If `x` was not registered in the constructor.
   */
  find(x: string): string {
    if (!this.parent.has(x)) {
      throw new Error(`UnionFind: node "${x}" does not exist`);
    }
    const p = this.parent.get(x)!;
    if (p !== x) {
      const root = this.find(p);
      this.parent.set(x, root);
      return root;
    }
    return x;
  }

  /**
   * Merge the sets containing `x` and `y` using union by rank.
   * @returns `true` if the two elements were in different sets and have been
   *   merged; `false` if they were already in the same set.
   */
  union(x: string, y: string): boolean {
    const rx = this.find(x);
    const ry = this.find(y);
    if (rx === ry) return false;
    const px = this.rank.get(rx)!;
    const py = this.rank.get(ry)!;
    if (px < py) {
      this.parent.set(rx, ry);
    } else if (px > py) {
      this.parent.set(ry, rx);
    } else {
      this.parent.set(ry, rx);
      this.rank.set(rx, px + 1);
    }
    return true;
  }
}

// ======================== Topological sort + longest path ========================

/**
 * Kahn's topological sort on a DAG, computing the longest-path distance for each node.
 *
 * **Why longest path?** The layout algorithm needs each node's grid coordinate
 * to be strictly greater than every predecessor's coordinate. A simple
 * topological index would satisfy this but could compress many nodes onto the
 * same coordinate level. The longest-path distance instead spreads nodes
 * across coordinate levels in the most *natural* way: a node's coordinate
 * equals the length of the longest dependency chain that leads to it. This
 * ensures, for example, that a chain A → B → C produces coordinates 0, 1, 2
 * rather than all landing at 0 or being arbitrarily ordered.
 *
 * Distance = the length of the longest path from any source node (in-degree 0)
 * to the given node.
 *
 * Duplicate edges are deduplicated internally before processing.
 *
 * Precondition: the graph is fully connected. For disconnected subgraphs, every
 * source in each component gets the same initial distance 0, which causes coordinate
 * collisions (the caller is responsible for ensuring connectivity).
 *
 * **Cycle handling:** If the graph contains a cycle (which can occur for keyboards
 * whose neighbor graph cannot be perfectly embedded in a rectilinear 2-D grid),
 * the algorithm breaks the deadlock by force-enqueueing the stuck node with the
 * smallest current distance, then continues normally. This produces a best-effort
 * coordinate assignment for the cyclic nodes; some ordering constraints involving
 * the cycle may not be fully respected, but the result remains a valid grid (the
 * collision handler in {@link buildAndFold} resolves any resulting cell conflicts).
 *
 * @param nodes - All nodes in the graph (additional nodes in `edges` are merged in).
 * @param edges - Directed edges `[u, v]` where `u` must precede `v`.
 * @returns Map from node id to its longest-path distance from any source node.
 */
function topoLongestPath(
  nodes: Iterable<string>,
  edges: [string, string][]
): Map<string, number> {
  const allNodes = new Set(nodes);
  for (const [u, v] of edges) {
    allNodes.add(u);
    allNodes.add(v);
  }

  const adj = new Map<string, string[]>();
  const inDeg = new Map<string, number>();
  for (const n of allNodes) {
    adj.set(n, []);
    inDeg.set(n, 0);
  }

  // Deduplicate edges
  const seen = new Set<string>();
  for (const [u, v] of edges) {
    const key = `${u}${KEY_SEP}${v}`;
    if (seen.has(key)) continue;
    seen.add(key);
    adj.get(u)!.push(v);
    inDeg.set(v, inDeg.get(v)! + 1);
  }

  // Kahn's topological sort + longest-path dynamic programming.
  // When the queue drains before all nodes are processed, a cycle is present.
  // Break the deadlock by force-enqueueing the remaining node with the smallest
  // current distance, then continue normally.
  const dist = new Map<string, number>();
  for (const n of allNodes) dist.set(n, 0);

  const queue: string[] = [];
  for (const n of allNodes) {
    if (inDeg.get(n) === 0) queue.push(n);
  }

  let processed = 0;
  while (processed < allNodes.size) {
    if (queue.length === 0) {
      // Cycle detected: find the unprocessed node with the smallest dist and
      // force-enqueue it to break the cycle.
      let cycleNode: string | null = null;
      let minDist = Infinity;
      for (const n of allNodes) {
        if ((inDeg.get(n) ?? 0) > 0) {
          const d = dist.get(n) ?? 0;
          if (d < minDist) {
            minDist = d;
            cycleNode = n;
          }
        }
      }
      if (cycleNode === null) break; // All nodes accounted for; safety exit.
      inDeg.set(cycleNode, 0);
      queue.push(cycleNode);
    }
    const u = queue.shift()!;
    processed++;
    for (const v of adj.get(u)!) {
      const d = dist.get(u)! + 1;
      if (d > dist.get(v)!) dist.set(v, d);
      const newDeg = inDeg.get(v)! - 1;
      inDeg.set(v, newDeg);
      if (newDeg === 0) queue.push(v);
    }
  }

  return dist;
}

// ======================== Steps 1-2: Approximate coordinate estimation ========================

/**
 * Roughly estimate each entity's coordinate in one dimension (row or column),
 * for use as a greedy sort key in the subsequent split phase.
 *
 * Strategy:
 *   1. Union-Find union on samePosEdges whose both endpoints have degree 1
 *      (ensures those endpoints share the same coordinate).
 *   2. Build a grouped DAG from orderEdges.
 *   3. Topological sort + longest path → approximate coordinate.
 *
 * Usage:
 *   estimateCoordinate(nodes, vertical, horizontal)  → approximate column coordinate
 *   estimateCoordinate(nodes, horizontal, vertical)  → approximate row coordinate
 *
 * Note: A cycle in the approximation phase is non-fatal and falls back to all-zero.
 */
function estimateCoordinate(
  nodes: Entity[],
  samePosEdges: [Entity, Entity][],
  orderEdges: [Entity, Entity][]
): Map<Entity, number> {
  // Count in- and out-degrees for samePosEdges
  const inDeg = new Map<Entity, number>();
  const outDeg = new Map<Entity, number>();
  for (const n of nodes) {
    inDeg.set(n, 0);
    outDeg.set(n, 0);
  }
  for (const [a, b] of samePosEdges) {
    outDeg.set(a, (outDeg.get(a) ?? 0) + 1);
    inDeg.set(b, (inDeg.get(b) ?? 0) + 1);
  }

  // Union only edges where both endpoints have degree 1 (same-coordinate constraint)
  const uf = new UnionFind(nodes);
  for (const [a, b] of samePosEdges) {
    if (outDeg.get(a) === 1 && inDeg.get(b) === 1) {
      uf.union(a, b);
    }
  }

  // Build grouped DAG from orderEdges
  const groups = new Set<string>();
  for (const n of nodes) groups.add(uf.find(n));

  const groupEdges: [string, string][] = [];
  const edgeSeen = new Set<string>();
  for (const [a, b] of orderEdges) {
    const ga = uf.find(a);
    const gb = uf.find(b);
    if (ga !== gb) {
      const key = `${ga}${KEY_SEP}${gb}`;
      if (!edgeSeen.has(key)) {
        edgeSeen.add(key);
        groupEdges.push([ga, gb]);
      }
    }
  }

  let groupDist: Map<string, number>;
  try {
    groupDist = topoLongestPath(groups, groupEdges);
  } catch {
    // A cycle in the approximation phase is non-fatal; fall back to all-zero
    groupDist = new Map();
    for (const g of groups) groupDist.set(g, 0);
  }

  const result = new Map<Entity, number>();
  for (const n of nodes) {
    result.set(n, groupDist.get(uf.find(n)) ?? 0);
  }
  return result;
}

// ======================== Step 3: Split fan-in / fan-out nodes ========================

/**
 * Assign split slot indices for entities that have fan-in or fan-out
 * (degree > 1) in one direction (vertical or horizontal).
 * Used in phase B of splitNodes.
 *
 * For each entity n that needs splitting:
 *   - Dominant side (higher degree): sorted by neighbor approximate coordinate,
 *     assigned slot indices 0, 1, 2, …
 *   - Minor side (lower degree): each edge is greedily matched to the nearest
 *     free dominant slot.
 *
 * @param entities  Full list of entities.
 * @param adjIn     In-edge adjacency (each edge formatted as [source, n]).
 * @param adjOut    Out-edge adjacency (each edge formatted as [n, target]).
 * @param approx    Approximate coordinate of each entity in this direction.
 * @param edgeKey   Serializes a directed edge (a, b) to a unique string key.
 * @returns edgeSrc  Slot index lookup for the source end (out-edge direction).
 * @returns edgeTgt  Slot index lookup for the target end (in-edge direction).
 */
function assignSplitIndices(
  entities: Entity[],
  adjIn: Map<Entity, [Entity, Entity][]>,
  adjOut: Map<Entity, [Entity, Entity][]>,
  approx: Map<Entity, number>,
  edgeKey: (a: Entity, b: Entity) => string
): { edgeSrc: Map<string, number>; edgeTgt: Map<string, number> } {
  const edgeSrc = new Map<string, number>();
  const edgeTgt = new Map<string, number>();

  for (const n of entities) {
    const kIn = adjIn.get(n)!.length;
    const kOut = adjOut.get(n)!.length;
    const numClones = Math.max(kIn, kOut);

    if (numClones <= 1) continue;

    // Sort neighbors by approximate coordinate (ascending).
    // In-edges: ascending by source coordinate.
    // Out-edges: ascending by target coordinate.
    // Both use natural spatial order so that slot index 0 corresponds to the
    // smallest coordinate, ensuring clone chains (0 → 1 → 2 → ...) align
    // with the actual spatial ordering of connected neighbors. Sorting by
    // distance (|target - own|) would mis-assign slots when a node is closer
    // to a cross-row/col neighbor than its same-row/col neighbor, creating
    // contradictory ordering constraints (cycles) in the final DAG.
    const sortedIn = adjIn
      .get(n)!
      .slice()
      .sort((a, b) => (approx.get(a[0]) ?? 0) - (approx.get(b[0]) ?? 0));
    const sortedOut = adjOut
      .get(n)!
      .slice()
      .sort((a, b) => (approx.get(a[1]) ?? 0) - (approx.get(b[1]) ?? 0));

    if (kIn >= kOut) {
      // In-edges are dominant: assign slots 0..kIn-1 in order
      for (let i = 0; i < kIn; i++) {
        edgeTgt.set(edgeKey(sortedIn[i][0], n), i);
      }
      // Merge out-edges by sorted target coordinate order (no distance-based matching)
      // so slot assignment remains monotonic and cannot introduce crossing constraints.
      for (let i = 0; i < sortedOut.length; i++) {
        edgeSrc.set(edgeKey(n, sortedOut[i][1]), i);
      }
    } else {
      // Out-edges are dominant: assign slots 0..kOut-1 in order
      for (let i = 0; i < kOut; i++) {
        edgeSrc.set(edgeKey(n, sortedOut[i][1]), i);
      }
      // Greedily merge in-edges into the nearest free dominant slot
      const used = new Set<number>();
      for (const [source] of sortedIn) {
        const sCoord = approx.get(source) ?? 0;
        let bestIdx = -1;
        let bestDist = Infinity;
        for (let i = 0; i < numClones; i++) {
          if (used.has(i)) continue;
          const refCoord = approx.get(sortedOut[i][1]) ?? 0;
          const d = Math.abs(refCoord - sCoord);
          if (d < bestDist) {
            bestDist = d;
            bestIdx = i;
          }
        }
        edgeTgt.set(edgeKey(source, n), bestIdx);
        used.add(bestIdx);
      }
    }
  }

  return { edgeSrc, edgeTgt };
}

/**
 * Split entities that have fan-in or fan-out (degree > 1) in the vertical
 * direction into column-direction clones, and those with fan-in or fan-out
 * in the horizontal direction into row-direction clones, converting every
 * one-to-many / many-to-one relation into a one-to-one relation.
 *
 * Sub-entities are identified by a structured [entity, subRow, subCol] triple:
 *   - Column-only split: subCol varies, subRow is fixed at 0.
 *   - Row-only split:    subRow varies, subCol is fixed at 0.
 *   - Both directions:   creates a numRowClones × numColClones sub-entity matrix.
 *
 * Processing phases:
 *   A. Determine the clone count for each entity and create all SubEntities.
 *   B. Assign split slot indices (subCol for vertical edges, subRow for horizontal).
 *   C. Generate sub-entity vertical edges (row-clone vertical chains + original edge remapping).
 *   D. Generate column-clone horizontal chains (keeps all column clones of an entity in the same row).
 *   E. Remap original horizontal edges to sub-entities (including subRow information).
 */
function splitNodes(
  entities: Entity[],
  horizontal: [Entity, Entity][],
  vertical: [Entity, Entity][],
  approxCols: Map<Entity, number>,
  approxRows: Map<Entity, number>
): {
  subEntities: SubEntity[];
  subVertical: [SubEntity, SubEntity][];
  subHorizontal: [SubEntity, SubEntity][];
  cloneGroups: Map<Entity, SubEntity[]>;
} {
  // --- Build vertical adjacency lists ---
  const vIn = new Map<Entity, [Entity, Entity][]>();
  const vOut = new Map<Entity, [Entity, Entity][]>();
  for (const n of entities) {
    vIn.set(n, []);
    vOut.set(n, []);
  }
  for (const e of vertical) {
    vOut.get(e[0])!.push(e);
    vIn.get(e[1])!.push(e);
  }

  // --- Build horizontal adjacency lists ---
  const hIn = new Map<Entity, [Entity, Entity][]>();
  const hOut = new Map<Entity, [Entity, Entity][]>();
  for (const n of entities) {
    hIn.set(n, []);
    hOut.set(n, []);
  }
  for (const e of horizontal) {
    hOut.get(e[0])!.push(e);
    hIn.get(e[1])!.push(e);
  }

  // Unique key for a vertical edge
  function vertEdgeKey(a: Entity, b: Entity): string {
    return `${a}${KEY_SEP}${b}`;
  }

  // Unique key for a horizontal edge
  function horizEdgeKey(a: Entity, b: Entity): string {
    return `H${KEY_SEP}${a}${KEY_SEP}${b}`;
  }

  const subEntities: SubEntity[] = [];
  const cloneGroups = new Map<Entity, SubEntity[]>();

  // ==================== Phase A: Create sub-entities ====================
  //
  // Every entity gets at least one sub-entity.
  // Column-direction clone count = max(vertical in-degree, vertical out-degree),
  //   subCol = 0..n-1, subRow fixed at 0.
  // Row-direction clone count = max(horizontal in-degree, horizontal out-degree),
  //   subRow = 0..m-1, subCol fixed at 0.
  // When both directions need splitting, create a numRowClones × numColClones matrix.

  for (const n of entities) {
    const kVIn = vIn.get(n)!.length;
    const kVOut = vOut.get(n)!.length;
    const numColClones = Math.max(kVIn, kVOut);

    const kHIn = hIn.get(n)!.length;
    const kHOut = hOut.get(n)!.length;
    const numRowClones = Math.max(kHIn, kHOut);

    const clones: SubEntity[] = [];
    if (numRowClones > 1 && numColClones > 1) {
      // Both directions need splitting: create a numRowClones × numColClones matrix
      for (let r = 0; r < numRowClones; r++) {
        for (let c = 0; c < numColClones; c++) {
          const sub = se(n, r, c);
          clones.push(sub);
          subEntities.push(sub);
        }
      }
    } else if (numRowClones > 1) {
      // Row-direction split only: subRow varies, subCol fixed at 0
      for (let r = 0; r < numRowClones; r++) {
        const sub = se(n, r, 0);
        clones.push(sub);
        subEntities.push(sub);
      }
    } else if (numColClones > 1) {
      // Column-direction split only: subCol varies, subRow fixed at 0
      for (let c = 0; c < numColClones; c++) {
        const sub = se(n, 0, c);
        clones.push(sub);
        subEntities.push(sub);
      }
    } else {
      // No split needed
      const sub = se(n, 0, 0);
      clones.push(sub);
      subEntities.push(sub);
    }
    cloneGroups.set(n, clones);
  }

  // ==================== Phase B: Assign split slot indices ====================
  //
  // B1. Assign subCol for vertical edges:
  //     Each vertical edge's source end gets edgeSrcSubCol,
  //     and its target end gets edgeTgtSubCol.
  // B2. Assign subRow for horizontal edges:
  //     Each horizontal edge's source end gets edgeSrcSubRow,
  //     and its target end gets edgeTgtSubRow.

  const { edgeSrc: edgeSrcSubCol, edgeTgt: edgeTgtSubCol } =
    assignSplitIndices(entities, vIn, vOut, approxCols, vertEdgeKey);

  const { edgeSrc: edgeSrcSubRow, edgeTgt: edgeTgtSubRow } =
    assignSplitIndices(entities, hIn, hOut, approxRows, horizEdgeKey);

  // ==================== Phase C: Generate sub-entity vertical edges ====================
  //
  // C1. Row-split clones form a vertical chain: subRow 0 → 1 → 2 → ...
  //     These vertical edges are unioned into the same column during column assignment,
  //     ensuring all row clones of an entity share the same column.
  //
  // C2. Remap each original vertical edge using edgeSrcSubCol / edgeTgtSubCol to get
  //     the subCol for source and target, then connect the specific sub-entities.
  //     Both source and target use subRow = 0 (the representative / topmost clone).
  //     Using subRow = 0 for the source (rather than the maximum subRow) prevents
  //     shadow clones from creating spurious backward row-ordering edges when the
  //     source's secondary row-clones land in later row groups than the target's
  //     primary clone.

  const subVertical: [SubEntity, SubEntity][] = [];

  // C1: Vertical chain for row-split clones
  for (const [, clones] of cloneGroups) {
    if (clones.length <= 1) continue;
    // Only process row-direction splits (subRow varies, i.e. clones[last][1] > 0)
    if (clones[clones.length - 1][1] === 0) continue;
    const numR = clones[clones.length - 1][1] + 1;
    const numC = clones[clones.length - 1][2] + 1;
    const entity = clones[0][0];
    // For each column c, create the chain (0,c)→(1,c)→...→(R-1,c); degenerates to a
    // single-column chain when numC=1
    for (let c = 0; c < numC; c++) {
      for (let r = 0; r < numR - 1; r++) {
        subVertical.push([se(entity, r, c), se(entity, r + 1, c)]);
      }
    }
  }

  // C2: Remap original vertical edges to sub-entities
  for (const [a, b] of vertical) {
    const srcCol = edgeSrcSubCol.get(vertEdgeKey(a, b)) ?? 0;
    const tgtCol = edgeTgtSubCol.get(vertEdgeKey(a, b)) ?? 0;
    // Both source and target use subRow = 0 (representative clone).
    // Only the representative is placed in the final grid, so the ordering
    // constraint row(src_representative) < row(tgt_representative) is sufficient.
    subVertical.push([se(a, 0, srcCol), se(b, 0, tgtCol)]);
  }

  // ==================== Phase D: Generate column-clone horizontal chains ====================
  //
  // Column-split clones form a horizontal chain: subCol 0 → 1 → 2 → ...
  // These horizontal edges are unioned into the same row during row assignment,
  // ensuring all column clones of an entity share the same row.
  // (Row-split clone chains were already added to subVertical in phase C1.)

  const subHorizontal: [SubEntity, SubEntity][] = [];
  for (const [, clones] of cloneGroups) {
    if (clones.length <= 1) continue;
    // Only process column-direction splits (subCol varies, i.e. clones[last][2] > 0)
    if (clones[clones.length - 1][2] === 0) continue;
    const numR = clones[clones.length - 1][1] + 1;
    const numC = clones[clones.length - 1][2] + 1;
    const entity = clones[0][0];
    // For each row r, create the chain (r,0)→(r,1)→...→(r,C-1); degenerates to a
    // single-row chain when numR=1
    for (let r = 0; r < numR; r++) {
      for (let c = 0; c < numC - 1; c++) {
        subHorizontal.push([se(entity, r, c), se(entity, r, c + 1)]);
      }
    }
  }

  // ==================== Phase E: Remap original horizontal edges ====================
  //
  // Horizontal edge [A, B] (A on left, B on right) is remapped as follows:
  //   - If A is a row-split entity: use the subRow assigned to this edge
  //   - Otherwise: use A's leftmost clone (subCol = 0), which is the representative.
  //     Using leftmost (rather than rightmost) ensures the column ordering constraint
  //     is expressed as col(A_representative) < col(B_representative), avoiding
  //     spurious extra columns from shadow clones.
  //   - If B is a row-split entity: use the subRow assigned to this edge
  //   - Otherwise: use B's leftmost clone (subCol = 0)

  for (const [a, b] of horizontal) {
    const aClones = cloneGroups.get(a)!;
    const bClones = cloneGroups.get(b)!;

    const aIsRowSplit = aClones[aClones.length - 1][1] > 0;
    const bIsRowSplit = bClones[bClones.length - 1][1] > 0;

    let srcSE: SubEntity;
    if (aIsRowSplit) {
      const srcRow = edgeSrcSubRow.get(horizEdgeKey(a, b)) ?? 0;
      const aMaxSubCol = aClones[aClones.length - 1][2];
      srcSE = se(a, srcRow, aMaxSubCol);
    } else {
      srcSE = aClones[0]; // leftmost subCol = representative clone
    }

    let tgtSE: SubEntity;
    if (bIsRowSplit) {
      const tgtRow = edgeTgtSubRow.get(horizEdgeKey(a, b)) ?? 0;
      tgtSE = se(b, tgtRow, 0);
    } else {
      tgtSE = bClones[0]; // leftmost subCol (= 0)
    }

    subHorizontal.push([srcSE, tgtSE]);
  }

  return { subEntities, subVertical, subHorizontal, cloneGroups };
}

// ======================== Steps 4-5: Dimension assignment (generic) ========================

/**
 * Generic dimension assignment used separately for columns and rows:
 *
 *   Column assignment: samePosEdges = vertical edges, orderEdges = horizontal edges
 *     → vertical-edge endpoints are unioned into the same column;
 *       horizontal edges define the left-to-right partial order.
 *
 *   Row assignment: samePosEdges = horizontal edges, orderEdges = vertical edges
 *     → horizontal-edge endpoints are unioned into the same row;
 *       vertical edges define the top-to-bottom partial order.
 *
 * @returns Coordinate value (in the given dimension) for each sub-entity keyed by seKey.
 */
function assignDimension(
  subEntities: SubEntity[],
  samePosEdges: [SubEntity, SubEntity][],
  orderEdges: [SubEntity, SubEntity][]
): Map<string, number> {
  const keys = subEntities.map(seKey);
  const uf = new UnionFind(keys);

  // Union same-position sub-entities
  for (const [a, b] of samePosEdges) {
    uf.union(seKey(a), seKey(b));
  }

  // Collect groups
  const groups = new Set<string>();
  for (const k of keys) groups.add(uf.find(k));

  // Build inter-group DAG (deduplicated)
  const groupEdges: [string, string][] = [];
  const seen = new Set<string>();
  for (const [a, b] of orderEdges) {
    const ga = uf.find(seKey(a));
    const gb = uf.find(seKey(b));
    if (ga !== gb) {
      const key = `${ga}${KEY_SEP}${gb}`;
      if (!seen.has(key)) {
        seen.add(key);
        groupEdges.push([ga, gb]);
      }
    }
  }

  // Topological sort + longest path → dimension coordinates
  const groupDist = topoLongestPath(groups, groupEdges);

  const result = new Map<string, number>();
  for (const k of keys) {
    result.set(k, groupDist.get(uf.find(k)) ?? 0);
  }
  return result;
}

// ======================== Step 6: Build grid + collapse clones ========================

/**
 * Collect unique (deduplicated adjacent) values from a sorted array.
 * Input must already be sorted ascending by getVal.
 */
function collectUnique<T>(sorted: T[], getVal: (item: T) => number): number[] {
  const result: number[] = [];
  for (const item of sorted) {
    const v = getVal(item);
    if (result.length === 0 || result[result.length - 1] !== v) {
      result.push(v);
    }
  }
  return result;
}

/**
 * Collapse sub-entity coordinates back to original entities:
 *   1. For each original entity, select a representative clone (defaults to
 *      top-left preference, or uses the provided preference to pick the median row/col).
 *   2. Place the entity at the representative's coordinate in the grid.
 *   3. Simple collision handling: shift right if the target cell is already occupied.
 */
function buildAndFold(
  originalEntities: Entity[],
  cloneGroups: Map<Entity, SubEntity[]>,
  colMap: Map<string, number>,
  rowMap: Map<string, number>,
  layoutPreference?: EntityLayoutPreferenceCallback
): LayoutOutput {
  // Select a representative clone for each entity
  const representatives = new Map<Entity, SubEntity>();

  for (const entity of originalEntities) {
    const clones = cloneGroups.get(entity)!;
    if (clones.length === 1) {
      representatives.set(entity, clones[0]);
      continue;
    }

    const pref: readonly [LayoutVerticalPreference, LayoutHorizontalPreference] =
      (layoutPreference && layoutPreference(entity)) || ['top', 'left'];

    const [vertPref, horizPref] = pref;

    // Sort clones by row coordinate ascending
    const sortedByRow = clones
      .slice()
      .sort((a, b) => (rowMap.get(seKey(a)) ?? 0) - (rowMap.get(seKey(b)) ?? 0));

    // Collect unique row values (ascending)
    const uniqueRows = collectUnique(sortedByRow, c => rowMap.get(seKey(c)) ?? 0);

    // 'top' picks the lower median, 'bottom' picks the upper median
    const rowIdx = vertPref === 'top'
      ? Math.floor((uniqueRows.length - 1) / 2)
      : Math.floor(uniqueRows.length / 2);
    const targetRow = uniqueRows[rowIdx];

    // Filter clones at the target row and sort by column coordinate ascending
    const clonesAtRow = sortedByRow
      .filter(c => (rowMap.get(seKey(c)) ?? 0) === targetRow)
      .sort((a, b) => (colMap.get(seKey(a)) ?? 0) - (colMap.get(seKey(b)) ?? 0));

    // Collect unique column values (ascending)
    const uniqueCols = collectUnique(clonesAtRow, c => colMap.get(seKey(c)) ?? 0);

    // 'left' picks the lower median, 'right' picks the upper median
    const colIdx = horizPref === 'left'
      ? Math.floor((uniqueCols.length - 1) / 2)
      : Math.floor(uniqueCols.length / 2);
    const targetCol = uniqueCols[colIdx];

    const rep = clonesAtRow.find(c => (colMap.get(seKey(c)) ?? 0) === targetCol) ?? clonesAtRow[0];

    representatives.set(entity, rep);
  }

  // Determine initial grid dimensions
  let maxRow = 0;
  let maxCol = 0;
  for (const [, rep] of representatives) {
    maxRow = Math.max(maxRow, rowMap.get(seKey(rep)) ?? 0);
    maxCol = Math.max(maxCol, colMap.get(seKey(rep)) ?? 0);
  }

  const grid: (Entity | null)[][] = Array.from(
    { length: maxRow + 1 },
    () => new Array<Entity | null>(maxCol + 1).fill(null)
  );

  const positions = new Map<Entity, { row: number; col: number }>();

  for (const [entity, rep] of representatives) {
    const r = rowMap.get(seKey(rep)) ?? 0;
    let c = colMap.get(seKey(rep)) ?? 0;

    // Collision handling: shift right until a free cell is found
    while (c < grid[r].length && grid[r][c] != null) {
      c++;
    }
    // Extend the row if necessary
    while (grid[r].length <= c) {
      grid[r].push(null);
    }

    grid[r][c] = entity;
    positions.set(entity, { row: r, col: c });
  }

  return { grid, positions };
}

// ======================== Main function ========================

// ======================== Debug export ========================

/**
 * Description of one split entity produced by {@link debugLayoutPipeline}.
 * @internal
 */
export interface SplitEntityDebugInfo {
  /** Original entity id. */
  entity: string;
  /** Number of column-direction clones (1 = not column-split). */
  numColClones: number;
  /** Number of row-direction clones (1 = not row-split). */
  numRowClones: number;
  /** Serialised sub-entity keys for every clone, in creation order. */
  cloneKeys: string[];
  /** For each vertical in-edge [src, entity]: which clone index (subCol) was assigned. */
  vInAssignments: Array<{ from: string; tgtSubCol: number }>;
  /** For each vertical out-edge [entity, tgt]: which clone index (subCol) was assigned. */
  vOutAssignments: Array<{ to: string; srcSubCol: number }>;
  /** For each horizontal in-edge [src, entity]: which clone index (subRow) was assigned. */
  hInAssignments: Array<{ from: string; tgtSubRow: number }>;
  /** For each horizontal out-edge [entity, tgt]: which clone index (subRow) was assigned. */
  hOutAssignments: Array<{ to: string; srcSubRow: number }>;
}

/**
 * Complete intermediate-state snapshot returned by {@link debugLayoutPipeline}.
 * @internal
 */
export interface LayoutPipelineDebugInfo {
  /** Approximate column coordinate estimate for every entity. */
  approxCols: Map<string, number>;
  /** Approximate row coordinate estimate for every entity. */
  approxRows: Map<string, number>;
  /** Entities that received more than one sub-entity clone. */
  splitEntities: SplitEntityDebugInfo[];
  /** All sub-entity vertical edges as [fromKey, toKey] pairs. */
  subVertical: [string, string][];
  /** All sub-entity horizontal edges as [fromKey, toKey] pairs. */
  subHorizontal: [string, string][];
  /**
   * Column assignment groups: maps each sub-entity key to the canonical
   * root key of its column group (formed by union-find over subVertical).
   */
  colGroupOf: Map<string, string>;
  /**
   * Column ordering: inter-group DAG edges derived from subHorizontal,
   * after merging groups.  Edges run from the left group to the right group.
   */
  colGroupEdges: [string, string][];
  /** Row assignment groups (symmetric: formed by union-find over subHorizontal). */
  rowGroupOf: Map<string, string>;
  /** Row ordering: inter-group DAG edges derived from subVertical. */
  rowGroupEdges: [string, string][];
}

/**
 * Run the layout pipeline up through the split-nodes phase and return detailed
 * intermediate state, primarily for debugging cycle issues in
 * {@link assignDimension}.
 *
 * This function intentionally exposes internal algorithm state and is
 * **not** part of the public API — it is exported only for use in tests.
 *
 * @internal
 */
export function debugLayoutPipeline(input: LayoutInput): LayoutPipelineDebugInfo {
  const { nodes, horizontal, vertical } = input;

  const nodeSet = new Set<Entity>(nodes);
  for (const [a, b] of horizontal) { nodeSet.add(a); nodeSet.add(b); }
  for (const [a, b] of vertical) { nodeSet.add(a); nodeSet.add(b); }
  const allEntities = [...nodeSet];

  const approxCols = estimateCoordinate(allEntities, vertical, horizontal);
  const approxRows = estimateCoordinate(allEntities, horizontal, vertical);
  const split = splitNodes(allEntities, horizontal, vertical, approxCols, approxRows);

  // --- Build split-entity info ---
  // Re-derive per-edge subCol/subRow assignments by mirroring splitNodes phase B logic.
  // We do this by inspecting the subVertical / subHorizontal edge lists and tracing
  // which clone each original edge maps to.

  // Build lookup: original vertical edge vertEdgeKey(a,b) → [srcSubCol, tgtSubCol]
  const vEdgeColMap = new Map<string, [number, number]>();
  for (const [a, b] of split.subVertical) {
    if (a[0] !== b[0]) { // skip intra-entity chain edges (phase C1)
      const k = `${a[0]}${KEY_SEP}${b[0]}`;
      vEdgeColMap.set(k, [a[2], b[2]]);
    }
  }
  // Build lookup: original horizontal edge → [srcSubRow, tgtSubRow]
  const hEdgeRowMap = new Map<string, [number, number]>();
  for (const [a, b] of split.subHorizontal) {
    if (a[0] !== b[0]) { // skip intra-entity chain edges (phase D)
      const k = `H${KEY_SEP}${a[0]}${KEY_SEP}${b[0]}`;
      hEdgeRowMap.set(k, [a[1], b[1]]);
    }
  }

  const splitEntities: SplitEntityDebugInfo[] = [];
  for (const [entity, clones] of split.cloneGroups) {
    const lastClone = clones[clones.length - 1];
    const numColClones = lastClone[2] + 1;
    const numRowClones = lastClone[1] + 1;
    if (numColClones <= 1 && numRowClones <= 1) continue;

    // Vertical in/out assignments
    const vInAssignments = vertical
      .filter(([, b]) => b === entity)
      .map(([a]) => {
        const cols = vEdgeColMap.get(`${a}${KEY_SEP}${entity}`);
        return { from: a, tgtSubCol: cols?.[1] ?? 0 };
      });
    const vOutAssignments = vertical
      .filter(([a]) => a === entity)
      .map(([, b]) => {
        const cols = vEdgeColMap.get(`${entity}${KEY_SEP}${b}`);
        return { to: b, srcSubCol: cols?.[0] ?? 0 };
      });
    // Horizontal in/out assignments
    const hInAssignments = horizontal
      .filter(([, b]) => b === entity)
      .map(([a]) => {
        const rows = hEdgeRowMap.get(`H${KEY_SEP}${a}${KEY_SEP}${entity}`);
        return { from: a, tgtSubRow: rows?.[1] ?? 0 };
      });
    const hOutAssignments = horizontal
      .filter(([a]) => a === entity)
      .map(([, b]) => {
        const rows = hEdgeRowMap.get(`H${KEY_SEP}${entity}${KEY_SEP}${b}`);
        return { to: b, srcSubRow: rows?.[0] ?? 0 };
      });

    splitEntities.push({
      entity,
      numColClones,
      numRowClones,
      cloneKeys: clones.map(seKey),
      vInAssignments,
      vOutAssignments,
      hInAssignments,
      hOutAssignments,
    });
  }

  // --- Column groups (union-find over subVertical) ---
  const colKeys = split.subEntities.map(seKey);
  const colUF = new UnionFind(colKeys);
  for (const [a, b] of split.subVertical) {
    colUF.union(seKey(a), seKey(b));
  }
  const colGroupOf = new Map<string, string>();
  for (const k of colKeys) colGroupOf.set(k, colUF.find(k));

  const colGroupEdges: [string, string][] = [];
  const colSeen = new Set<string>();
  for (const [a, b] of split.subHorizontal) {
    const ga = colUF.find(seKey(a));
    const gb = colUF.find(seKey(b));
    if (ga !== gb) {
      const edgeKey = `${ga}${KEY_SEP}${gb}`;
      if (!colSeen.has(edgeKey)) { colSeen.add(edgeKey); colGroupEdges.push([ga, gb]); }
    }
  }

  // --- Row groups (union-find over subHorizontal) ---
  const rowUF = new UnionFind(colKeys);
  for (const [a, b] of split.subHorizontal) {
    rowUF.union(seKey(a), seKey(b));
  }
  const rowGroupOf = new Map<string, string>();
  for (const k of colKeys) rowGroupOf.set(k, rowUF.find(k));

  const rowGroupEdges: [string, string][] = [];
  const rowSeen = new Set<string>();
  for (const [a, b] of split.subVertical) {
    const ga = rowUF.find(seKey(a));
    const gb = rowUF.find(seKey(b));
    if (ga !== gb) {
      const edgeKey = `${ga}${KEY_SEP}${gb}`;
      if (!rowSeen.has(edgeKey)) { rowSeen.add(edgeKey); rowGroupEdges.push([ga, gb]); }
    }
  }

  return {
    approxCols,
    approxRows,
    splitEntities,
    subVertical: split.subVertical.map(([a, b]) => [seKey(a), seKey(b)]),
    subHorizontal: split.subHorizontal.map(([a, b]) => [seKey(a), seKey(b)]),
    colGroupOf,
    colGroupEdges,
    rowGroupOf,
    rowGroupEdges,
  };
}

/**
 * Arrange a set of nodes into a compact 2-D grid that respects directional
 * ordering constraints.
 *
 * ### Constraint semantics
 *
 * - `[u, v]` in `horizontal` → `col(u) < col(v)` (u is left of v)
 * - `[u, v]` in `vertical`   → `row(u) < row(v)` (u is above v)
 *
 * ### Algorithm overview (6 steps)
 *
 * 1. **Approximate coordinates** — a quick topological estimate of each
 *    node's row and column, used as a sort key to minimize crossings when
 *    assigning split slots in the next step.
 *
 * 2. **Fan-in / fan-out splitting** ({@link splitNodes}) — any node with
 *    degree > 1 in either direction is *split* into multiple sub-entity
 *    clones so that all relations become strictly one-to-one. Clones are
 *    chained together (vertically for row splits, horizontally for column
 *    splits) to keep them co-located in the final grid.
 *
 * 3. **Column assignment** ({@link assignDimension}) — vertical edges union
 *    sub-entities into the same column; horizontal edges form a DAG whose
 *    longest-path distance becomes the column index.
 *
 * 4. **Row assignment** ({@link assignDimension}) — the symmetric operation:
 *    horizontal edges union sub-entities into the same row; vertical edges
 *    drive the row-index DAG.
 *
 * 5. **Collapse + grid construction** ({@link buildAndFold}) — each original
 *    entity selects one representative clone (guided by `layoutPreference`),
 *    and entities are placed into the 2-D grid. Coordinate collisions are
 *    resolved by shifting the conflicting entity one column to the right.
 *
 * ### Preconditions
 *
 * - The constraint graph must be **acyclic** in both directions; a cycle
 *   causes an immediate `Error` listing the involved nodes.
 * - The graph must be **fully connected** (i.e. every node is reachable from
 *   every other node when edges are treated as undirected). Use
 *   {@link bridgeSets} to handle disconnected inputs.
 *
 * @param input - Nodes, directional constraints, and optional placement preference.
 * @returns A {@link LayoutOutput} with a `grid` array and a `positions` map.
 *
 * @throws When a directed cycle is found in either the horizontal or vertical
 *   constraint graph.
 */
export function layout(input: LayoutInput): LayoutOutput {
  const { nodes, horizontal, vertical } = input;

  // Collect all entities that appear (including those that only appear in edges)
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

  // Step 1: Estimate approximate column coordinates (used as sort keys in the split phase)
  const approxCols = estimateCoordinate(allEntities, vertical, horizontal);

  // Step 2: Estimate approximate row coordinates (used as sort keys in the split phase)
  const approxRows = estimateCoordinate(allEntities, horizontal, vertical);

  // Step 3: Split fan-in / fan-out nodes into sub-entity clone chains
  const split = splitNodes(allEntities, horizontal, vertical, approxCols, approxRows);

  // Step 4: Column assignment
  //   Vertical edges → union same column
  //   Horizontal edges → DAG partial order (left → right)
  const colMap = assignDimension(
    split.subEntities,
    split.subVertical,
    split.subHorizontal
  );

  // Step 5: Row assignment
  //   Horizontal edges → union same row
  //   Vertical edges → DAG partial order (top → bottom)
  const rowMap = assignDimension(
    split.subEntities,
    split.subHorizontal,
    split.subVertical
  );

  // Step 6: Build grid and collapse clones back to original entities
  return buildAndFold(allEntities, split.cloneGroups, colMap, rowMap, input.layoutPreference);
}
