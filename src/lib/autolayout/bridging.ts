import Delaunator from 'delaunator';
import type { NeighborOutput, ObjId, Rect, Relation } from './types';

// Internal type: a point from an object with its connected-component set id attached.
type GroupedPoint = Pick<Rect, 'id' | 'x' | 'y'> & { setId: number };

/**
 * A candidate edge produced by {@link connectSets} that bridges two distinct
 * connected-component sets via a pair of representative points.
 *
 * After {@link bridgeSets} processes this edge, it becomes either a horizontal
 * or vertical {@link Relation} depending on which axis has the greater
 * absolute distance between the two centers.
 */
export interface BridgingEdge {
  /** Set id of {@link pointA}. */
  setA: number;
  /** Set id of {@link pointB}. */
  setB: number;
  /** The representative point from set {@link setA}. */
  pointA: Pick<Rect, 'id' | 'x' | 'y'>;
  /** The representative point from set {@link setB}. */
  pointB: Pick<Rect, 'id' | 'x' | 'y'>;
  /** Euclidean distance between {@link pointA} and {@link pointB}. */
  distance: number;
}

/**
 * Numeric-indexed Union-Find (disjoint-set) used internally to track which
 * point indices belong to the same connected component during MST construction
 * in {@link connectSets}.  Uses union by rank and path compression.
 */
class UnionFind {
  private readonly parent: number[];
  private readonly rank: number[];

  constructor(size: number) {
    this.parent = new Array(size);
    this.rank = new Array(size).fill(0);
    for (let i = 0; i < size; i++) this.parent[i] = i;
  }

  find(x: number): number {
    if (this.parent[x] !== x) {
      this.parent[x] = this.find(this.parent[x]);
    }
    return this.parent[x];
  }

  /**
   * Unite the sets containing `x` and `y`.
   * @returns `true` if the two elements were in different sets and have now
   *   been merged; `false` if they were already in the same set.
   */
  union(x: number, y: number): boolean {
    const rootX = this.find(x);
    const rootY = this.find(y);
    if (rootX === rootY) return false;

    if (this.rank[rootX] < this.rank[rootY]) {
      this.parent[rootX] = rootY;
    } else if (this.rank[rootX] > this.rank[rootY]) {
      this.parent[rootY] = rootX;
    } else {
      this.parent[rootY] = rootX;
      this.rank[rootX]++;
    }
    return true;
  }
}

/**
 * Add an undirected edge between `a` and `b` in an adjacency map.
 * Creates missing entries as empty sets.
 */
function addUndirectedEdge(
  adjacency: Map<ObjId, Set<ObjId>>,
  a: ObjId,
  b: ObjId
): void {
  if (!adjacency.has(a)) adjacency.set(a, new Set());
  if (!adjacency.has(b)) adjacency.set(b, new Set());
  adjacency.get(a)!.add(b);
  adjacency.get(b)!.add(a);
}

/**
 * Add all relations from `relations` to the adjacency map as undirected edges.
 * Direction is discarded — this is used for connected-component analysis only.
 */
function addRelations(
  adjacency: Map<ObjId, Set<ObjId>>,
  relations: Relation[]
): void {
  for (const [a, b] of relations) {
    addUndirectedEdge(adjacency, a, b);
  }
}

/**
 * Assign each node in a {@link NeighborOutput} to a connected-component id.
 *
 * Both `horizontal` and `vertical` relations are treated as undirected edges.
 * The result is a `Map<ObjId, number>` where all nodes in the same connected
 * component share the same integer id (starting at 0).
 *
 * Isolated nodes (no relations) each form their own component.  The component
 * ids are assigned in BFS discovery order, but their specific values have no
 * guaranteed meaning beyond being equal for same-component nodes and different
 * for different-component nodes.
 *
 * @param input - The neighbor output to analyze.
 * @returns A map from every node id to its component id.
 */
export function groupSets(input: NeighborOutput): Map<ObjId, number> {
  const adjacency = new Map<ObjId, Set<ObjId>>();

  for (const node of input.nodes) {
    adjacency.set(node, new Set());
  }

  addRelations(adjacency, input.horizontal);
  addRelations(adjacency, input.vertical);

  const componentOf = new Map<ObjId, number>();
  let componentId = 0;

  for (const node of adjacency.keys()) {
    if (componentOf.has(node)) continue;

    const queue: ObjId[] = [node];
    componentOf.set(node, componentId);

    for (let i = 0; i < queue.length; i++) {
      const current = queue[i];
      const neighbors = adjacency.get(current);
      if (!neighbors) continue;

      for (const next of neighbors) {
        if (componentOf.has(next)) continue;
        componentOf.set(next, componentId);
        queue.push(next);
      }
    }

    componentId++;
  }

  return componentOf;
}

/**
 * Find the minimum set of cross-component edges that spans all `k` connected
 * components — equivalently, the minimum spanning tree over a graph whose
 * nodes are the component sets.
 *
 * ### Algorithm
 *
 * 1. **Candidate edges** are obtained from the Delaunay triangulation of the
 *    object centers.  The Delaunay triangulation is the natural structure for
 *    nearest-neighbor queries and guarantees that the closest pair of points
 *    from different components always appears as a triangle edge, keeping the
 *    candidate count at O(n) rather than O(n²).
 * 2. **Degenerate fallback**: if the triangulation produces no edges (e.g. all
 *    points are collinear), every pair of points is considered instead.
 * 3. Only edges that **cross** component boundaries are kept as candidates.
 * 4. Kruskal's algorithm (distance-sorted edges + Union-Find) picks exactly
 *    `k - 1` edges, producing a minimum spanning tree over the components.
 *
 * All objects within the same component are pre-unioned before Kruskal runs,
 * so the algorithm automatically ignores intra-component edges.
 *
 * @param objects  - All objects, each carrying a center coordinate.
 * @param setById  - Component-id map from {@link groupSets}.
 * @returns Exactly `k - 1` {@link BridgingEdge} values, or an empty array
 *   when all objects already belong to a single component.
 *
 * @throws If any object id in `objects` is missing from `setById`.
 */
export function connectSets(
  objects: ReadonlyArray<Rect>,
  setById: ReadonlyMap<ObjId, number>
): BridgingEdge[] {
  const points: GroupedPoint[] = objects.map((o) => {
    const setId = setById.get(o.id);
    if (setId === undefined) {
      throw new Error(`Missing set id for object: ${o.id}`);
    }
    return { id: o.id, x: o.x, y: o.y, setId };
  });

  if (points.length === 0) return [];

  const setIdToIndices = new Map<number, number[]>();
  for (let i = 0; i < points.length; i++) {
    const setId = points[i].setId;
    if (!setIdToIndices.has(setId)) setIdToIndices.set(setId, []);
    setIdToIndices.get(setId)!.push(i);
  }

  const totalSets = setIdToIndices.size;
  if (totalSets <= 1) return [];

  const edgeMap = new Map<string, { i: number; j: number }>();
  const delaunay = Delaunator.from(points, (p) => p.x, (p) => p.y);

  for (let t = 0; t < delaunay.triangles.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      const i = delaunay.triangles[t + k];
      const j = delaunay.triangles[t + ((k + 1) % 3)];
      const min = Math.min(i, j);
      const max = Math.max(i, j);
      const key = `${min}_${max}`;
      if (!edgeMap.has(key)) edgeMap.set(key, { i: min, j: max });
    }
  }

  if (edgeMap.size === 0) {
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const key = `${i}_${j}`;
        edgeMap.set(key, { i, j });
      }
    }
  }

  type CandidateEdge = { u: number; v: number; dist: number };
  const candidates: CandidateEdge[] = [];

  for (const { i, j } of edgeMap.values()) {
    const p1 = points[i];
    const p2 = points[j];
    if (p1.setId === p2.setId) continue;
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    const dist = Math.hypot(dx, dy);
    candidates.push({ u: i, v: j, dist });
  }

  candidates.sort((a, b) => a.dist - b.dist);

  const uf = new UnionFind(points.length);
  for (const indices of setIdToIndices.values()) {
    for (let k = 1; k < indices.length; k++) {
      uf.union(indices[0], indices[k]);
    }
  }

  const result: BridgingEdge[] = [];
  let edgesAccepted = 0;

  for (const { u, v, dist } of candidates) {
    if (edgesAccepted === totalSets - 1) break;
    if (!uf.union(u, v)) continue;

    const pA = points[u];
    const pB = points[v];
    result.push({
      setA: pA.setId,
      setB: pB.setId,
      pointA: { id: pA.id, x: pA.x, y: pA.y },
      pointB: { id: pB.id, x: pB.x, y: pB.y },
      distance: dist,
    });
    edgesAccepted++;
  }

  return result;
}

/**
 * Synthesize the minimum set of extra {@link Relation}s needed to connect all
 * disconnected components of a {@link NeighborOutput} into a single graph
 * suitable for {@link layout}.
 *
 * {@link layout} requires a fully connected constraint graph — nodes that are
 * not reachable from each other would receive independent topological ranks
 * starting at 0 and collide on the same grid cells.  This function handles
 * that by stitching components together with the shortest possible bridging
 * edges.
 *
 * ### Steps
 *
 * 1. {@link groupSets} — BFS over existing horizontal/vertical edges to assign
 *    each node a component id.
 * 2. {@link connectSets} — Delaunay-based MST finds the minimum number of
 *    cross-component edges (`k - 1` edges for `k` components) connecting the
 *    nearest objects between each pair of components.
 * 3. Each edge is classified as **horizontal** or **vertical** by comparing
 *    `|dx|` vs `|dy|` between the two center points:
 *    - `|dx| >= |dy|` → horizontal (`[left, right]` ordered by ascending x)
 *    - `|dx| < |dy|`  → vertical   (`[top, bottom]` ordered by ascending y)
 *
 * The returned relations can be spread into an existing {@link NeighborOutput}
 * before passing it to {@link layout}.
 *
 * @param neighborOutput - Existing neighbor relations and node list.
 * @param objects        - Full object array (needed for center coordinates).
 * @returns Additional horizontal and vertical relations that bridge all
 *   components; both arrays are empty when the graph is already connected.
 */
export function bridgeSets(
  neighborOutput: NeighborOutput,
  objects: ReadonlyArray<Rect>
): { horizontal: Relation[]; vertical: Relation[] } {
  const setById = groupSets(neighborOutput);
  const edges = connectSets(objects, setById);

  const horizontal: Relation[] = [];
  const vertical: Relation[] = [];

  for (const edge of edges) {
    const dx = edge.pointB.x - edge.pointA.x;
    const dy = edge.pointB.y - edge.pointA.y;

    if (Math.abs(dx) >= Math.abs(dy)) {
      // Horizontal relation: [left, right] — smaller x is left.
      // Ties (|dx| === |dy|) and the degenerate dx === 0 case (same x) both
      // default to horizontal; the pair is ordered by pointA/pointB assignment.
      if (dx >= 0) {
        horizontal.push([edge.pointA.id, edge.pointB.id]);
      } else {
        horizontal.push([edge.pointB.id, edge.pointA.id]);
      }
    } else {
      // Vertical relation: [top, bottom] — smaller y is top (screen coordinates).
      if (dy >= 0) {
        vertical.push([edge.pointA.id, edge.pointB.id]);
      } else {
        vertical.push([edge.pointB.id, edge.pointA.id]);
      }
    }
  }

  return { horizontal, vertical };
}
