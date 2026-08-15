/**
 * Screen coordinate system:
 * - x-axis points right, y-axis points down
 * - Rotation angle r (radians) is positive clockwise
 *   Local coords (lx, ly) → global coords (gx, gy):
 *     gx = x + lx*cos(r) - ly*sin(r)
 *     gy = y + lx*sin(r) + ly*cos(r)
 */

import type { NeighborInput, NeighborOutput } from './types';

// ---------- Internal types ----------

type RectId = string;

/**
 * Rotatable rectangle used internally (angles stored in radians).
 * Fields mirror the public {@link NeighborInput} `Rect` type but use
 * `w`/`h`/`r` shorthands.
 */
interface Rect {
  id: RectId;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Clockwise rotation in radians. */
  r: number;
}

/**
 * Axis-aligned bounding box used for the broad-phase overlap prefilter.
 * Computed from an {@link OBBData} by projecting all four OBB corners.
 */
interface AABB {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Precomputed oriented-bounding-box data derived from a {@link Rect}.
 *
 * Rather than recomputing `cos`/`sin` per test, the rotation is baked into
 * two unit vectors (`axisX`, `axisY`) that represent the rectangle's local
 * coordinate axes in global space. Projecting onto these axes is then a
 * simple dot product.
 */
interface OBBData {
  /** Center x in global space. */
  cx: number;
  /** Center y in global space. */
  cy: number;
  halfW: number;
  halfH: number;
  /** Local x-axis (width direction) expressed in global coords. */
  axisX: { x: number; y: number };
  /** Local y-axis (height direction) expressed in global coords. */
  axisY: { x: number; y: number };
}

/**
 * A neighbor-detection zone rectangle attached to one side of a source rect.
 * Inherits all {@link Rect} fields (with the same rotation as the source) and
 * adds `srcId` (which source rectangle generated it) and `direction` (which
 * side the zone is on).
 */
interface ExtendedRect extends Rect {
  /** Id of the source rectangle that owns this detection zone. */
  srcId: RectId;
  /** Which side of the source rectangle this zone is attached to. */
  direction: 'up' | 'down' | 'left' | 'right';
}

/**
 * Per-rectangle one-way neighbor sets, keyed by the four compass directions.
 *
 * `up.has(B)` means B's body overlapped A's upward detection zone, making B a
 * one-way "up" neighbor of A.  Only when *both* one-way records are confirmed
 * (B is up of A **and** A is down of B) is a bidirectional vertical relation
 * emitted. See {@link findNeighbors}.
 */
type OneWayNeighbors = {
  up: Set<RectId>;
  down: Set<RectId>;
  left: Set<RectId>;
  right: Set<RectId>;
};

/** A 2D point / vector. */
interface Vec2 {
  x: number;
  y: number;
}

/** A line segment represented by two endpoints. */
type Segment = [Vec2, Vec2];

/**
 * Epsilon guard used in overlap tests to exclude boundary-only contacts
 * (tangent edges / single-point touches) from being counted as neighbors.
 * The Lebesgue measure of a line segment or point is zero; this constant
 * ensures that only intersections with positive area are accepted.
 */
const EPS = 1e-9;

// ---------- Weight thresholds ----------

/** Relationships with weight above this are always kept. */
const WEIGHT_HIGH = 0.3;
/** Relationships with weight between LOW and HIGH may be kept (up to 1 per entity per direction, best first). */
const WEIGHT_LOW = 0.1;

// ---------- Geometric utility functions ----------

/**
 * Derive {@link OBBData} from a {@link Rect} by baking the rotation into two
 * normalized axis vectors. Subsequent SAT projections use dot products against
 * these vectors instead of recomputing `cos`/`sin` each time.
 */
function getOBBData(rect: Rect): OBBData {
  const cos = Math.cos(rect.r);
  const sin = Math.sin(rect.r);
  return {
    cx: rect.x,
    cy: rect.y,
    halfW: rect.w / 2,
    halfH: rect.h / 2,
    axisX: { x: cos, y: sin }, // local x-axis (width direction)
    axisY: { x: -sin, y: cos }, // local y-axis (height direction)
  };
}

/**
 * Compute the axis-aligned bounding box of an OBB by projecting all four
 * corners into global coordinates and taking per-axis min/max.
 *
 * The AABB is only used as a cheap broad-phase prefilter before the more
 * expensive SAT test; it may admit false positives but never false negatives.
 */
function getAABBFromOBB(obb: OBBData): AABB {
  // Project all four corners into the global coordinate system
  const corners = [
    { x: obb.cx - obb.halfW * obb.axisX.x - obb.halfH * obb.axisY.x, y: obb.cy - obb.halfW * obb.axisX.y - obb.halfH * obb.axisY.y },
    { x: obb.cx + obb.halfW * obb.axisX.x - obb.halfH * obb.axisY.x, y: obb.cy + obb.halfW * obb.axisX.y - obb.halfH * obb.axisY.y },
    { x: obb.cx + obb.halfW * obb.axisX.x + obb.halfH * obb.axisY.x, y: obb.cy + obb.halfW * obb.axisX.y + obb.halfH * obb.axisY.y },
    { x: obb.cx - obb.halfW * obb.axisX.x + obb.halfH * obb.axisY.x, y: obb.cy - obb.halfW * obb.axisX.y + obb.halfH * obb.axisY.y },
  ];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of corners) {
    if (c.x < minX) minX = c.x;
    if (c.y < minY) minY = c.y;
    if (c.x > maxX) maxX = c.x;
    if (c.y > maxY) maxY = c.y;
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Fast broad-phase AABB overlap test.
 *
 * Returns `true` only when the boxes strictly overlap (positive shared area).
 * The {@link EPS} guard ensures that touching edges — where the boxes meet at
 * a single line — are treated as non-overlapping.
 */
function aabbOverlap(a: AABB, b: AABB): boolean {
  return (a.minX < b.maxX - EPS) && (a.maxX > b.minX + EPS)
    && (a.minY < b.maxY - EPS) && (a.maxY > b.minY + EPS);
}

/**
 * Project an OBB onto a 1-D separation axis and return the resulting interval.
 *
 * The projection of a rotated rectangle onto an axis is a segment
 * `[center − radius, center + radius]`, where `radius` is the sum of the
 * half-extents of each local dimension projected onto the axis.
 *
 * @param obb  - The oriented bounding box to project.
 * @param axis - Unit vector defining the projection axis.
 */
function projectOBBOnAxis(obb: OBBData, axis: { x: number; y: number }): { min: number; max: number } {
  const centerProj = obb.cx * axis.x + obb.cy * axis.y;
  const radius
    = obb.halfW * Math.abs(obb.axisX.x * axis.x + obb.axisX.y * axis.y)
      + obb.halfH * Math.abs(obb.axisY.x * axis.x + obb.axisY.y * axis.y);
  return { min: centerProj - radius, max: centerProj + radius };
}

/**
 * Narrow-phase OBB vs. OBB overlap test using the Separating Axis Theorem (SAT).
 *
 * SAT states that two convex shapes do **not** overlap if and only if there
 * exists a separating axis on which their projections are disjoint. For two
 * OBBs in 2-D, the four candidate axes are the two local axis directions of
 * each box (four axes total). The {@link EPS} guard excludes boundary-only
 * contact (zero-width intersection) so that only intersections with positive
 * area return `true`.
 *
 * @returns `true` if the two OBBs overlap with intersection area > 0.
 */
function obbOverlap(obbA: OBBData, obbB: OBBData): boolean {
  const axes = [
    obbA.axisX,
    obbA.axisY,
    obbB.axisX,
    obbB.axisY,
  ];
  for (const axis of axes) {
    const pA = projectOBBOnAxis(obbA, axis);
    const pB = projectOBBOnAxis(obbB, axis);
    // If the projection overlap is ≤ epsilon, treat the pair as separated or boundary-touching
    const overlap = Math.min(pA.max, pB.max) - Math.max(pA.min, pB.min);
    if (overlap <= EPS) {
      return false;
    }
  }
  return true;
}

/**
 * Build the four directional detection zones for a rectangle.
 *
 * Each zone is a thin rectangle (thickness = threshold `T`) placed flush
 * against one side of `rect` in local coordinates, then rotated into global
 * space along with `rect`. The zone inherits `rect`'s rotation so that
 * adjacency is always measured relative to the object's own orientation —
 * e.g. the "up" zone of a 45°-rotated object points diagonally, not straight up.
 *
 * @param rect - The source rectangle to generate zones for.
 * @param T    - Thickness of each detection zone (the `threshold` value).
 * @returns Four {@link ExtendedRect} values, one per direction.
 */
function createExtendedRects(rect: Rect, T: number): ExtendedRect[] {
  const { id, w, h } = rect;
  const obb = getOBBData(rect);

  const defs: Array<{
    dir: ExtendedRect['direction'];
    lx: number; ly: number;
    ew: number; eh: number;
  }> = [
    // Upward extension (local negative-y direction)
    { dir: 'up', lx: 0, ly: -h / 2 - T / 2, ew: w, eh: T },
    // Downward extension (local positive-y direction)
    { dir: 'down', lx: 0, ly: h / 2 + T / 2, ew: w, eh: T },
    // Leftward extension (local negative-x direction)
    { dir: 'left', lx: -w / 2 - T / 2, ly: 0, ew: T, eh: h },
    // Rightward extension (local positive-x direction)
    { dir: 'right', lx: w / 2 + T / 2, ly: 0, ew: T, eh: h },
  ];

  return defs.map((d) => {
    // Convert local coords to global center: gx = cx + lx*axisX.x + ly*axisY.x
    //                                        gy = cy + lx*axisX.y + ly*axisY.y
    const gx = obb.cx + d.lx * obb.axisX.x + d.ly * obb.axisY.x;
    const gy = obb.cy + d.lx * obb.axisX.y + d.ly * obb.axisY.y;
    return {
      id: '',
      srcId: id,
      direction: d.dir,
      x: gx,
      y: gy,
      w: d.ew,
      h: d.eh,
      r: rect.r,
    };
  });
}

// ---------- Weight calculation (line-cast overlap) ----------

/**
 * Get the four edges of a rectangle in global coordinates.
 * Returns edges in order: top, bottom, left, right (relative to object's local frame).
 * Each edge is a segment [start, end].
 */
function getRectEdges(rect: Rect): { up: Segment; down: Segment; left: Segment; right: Segment } {
  const cos = Math.cos(rect.r);
  const sin = Math.sin(rect.r);
  const hw = rect.w / 2;
  const hh = rect.h / 2;

  // Local corners (before rotation): TL(-hw,-hh), TR(hw,-hh), BR(hw,hh), BL(-hw,hh)
  // Transform to global: gx = cx + lx*cos - ly*sin, gy = cy + lx*sin + ly*cos
  const tl: Vec2 = { x: rect.x + (-hw) * cos - (-hh) * sin, y: rect.y + (-hw) * sin + (-hh) * cos };
  const tr: Vec2 = { x: rect.x + (hw) * cos - (-hh) * sin, y: rect.y + (hw) * sin + (-hh) * cos };
  const br: Vec2 = { x: rect.x + (hw) * cos - (hh) * sin, y: rect.y + (hw) * sin + (hh) * cos };
  const bl: Vec2 = { x: rect.x + (-hw) * cos - (hh) * sin, y: rect.y + (-hw) * sin + (hh) * cos };

  return {
    up: [tl, tr], // top edge (local -y side)
    down: [bl, br], // bottom edge (local +y side)
    left: [tl, bl], // left edge (local -x side)
    right: [tr, br], // right edge (local +x side)
  };
}

/** Vector subtraction. */
function vecSub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

/** 2D cross product (a × b). */
function vecCross(a: Vec2, b: Vec2): number {
  return a.x * b.y - a.y * b.x;
}

/** Euclidean length of a vector. */
function vecLen(v: Vec2): number {
  return Math.sqrt(v.x * v.x + v.y * v.y);
}

/**
 * Compute the projection overlap length between two line segments.
 * Projects segment A along its normal direction onto segment B,
 * returning the Euclidean length of the overlapping portion on B.
 *
 * Based on the line-cast overlap reference algorithm.
 */
function projectionOverlapLength(A: Segment, B: Segment): number {
  const [P1, P2] = A;
  const [Q1, Q2] = B;

  const vA = vecSub(P2, P1); // A's direction vector
  const vB = vecSub(Q2, Q1); // B's direction vector

  // A's normal vector (rotated 90° CCW, not normalized)
  const n: Vec2 = { x: -vA.y, y: vA.x };

  // Denominator: vB × n
  const denom = vecCross(vB, n);

  // If vB is parallel to n (A perpendicular to B), projection is degenerate
  if (Math.abs(denom) < EPS) {
    return 0;
  }

  // Compute parameter values for where A's endpoints project onto B's line
  const t1 = vecCross(vecSub(P1, Q1), n) / denom;
  const t2 = vecCross(vecSub(P2, Q1), n) / denom;

  const tMin = Math.min(t1, t2);
  const tMax = Math.max(t1, t2);

  // Intersect with B's parameter range [0, 1]
  const start = Math.max(0, tMin);
  const end = Math.min(1, tMax);

  if (start >= end - EPS) {
    return 0;
  }

  return (end - start) * vecLen(vB);
}

/**
 * Compute the bidirectional weight for a neighbor pair.
 * The weight represents how strongly two edges face each other.
 *
 * @param edgeA - The edge of A facing B (e.g., A's right edge for a horizontal pair)
 * @param edgeB - The edge of B facing A (e.g., B's left edge for a horizontal pair)
 * @returns Weight in [0, 1], where 1 = fully aligned, 0 = no overlap
 */
function computeNeighborWeight(edgeA: Segment, edgeB: Segment): number {
  const lenA = vecLen(vecSub(edgeA[1], edgeA[0]));
  const lenB = vecLen(vecSub(edgeB[1], edgeB[0]));
  if (lenA < EPS || lenB < EPS) return 0;

  const overlapAtoB = projectionOverlapLength(edgeA, edgeB);
  const overlapBtoA = projectionOverlapLength(edgeB, edgeA);

  // Normalize by the shorter side length to make weight scale-independent
  const minLen = Math.min(lenA, lenB);
  const weightA = Math.min(overlapAtoB / minLen, 1);
  const weightB = Math.min(overlapBtoA / minLen, 1);

  return weightA * weightB;
}

/**
 * Detect pairwise neighbor relations among a set of rotated rectangles.
 *
 * ### Algorithm overview
 *
 * 1. **Detection zones** — for each rectangle, four thin zone rectangles are
 *    constructed (up / down / left / right), each with the same rotation as
 *    the source object.  A zone has the same width or height as the source and
 *    a thickness equal to `input.threshold`, placed flush against the
 *    corresponding side.
 *
 * 2. **Overlap detection** — every zone is tested against every *other*
 *    rectangle's body using a two-phase approach:
 *    - **Broad phase**: axis-aligned bounding-box (AABB) rejection — skips
 *      pairs that clearly cannot overlap.
 *    - **Narrow phase**: Separating Axis Theorem (SAT) on the oriented bounding
 *      boxes (OBBs) — confirms positive-area overlap (boundary contact is
 *      excluded via {@link EPS}).
 *
 *    A successful test records a *one-way* neighbor: "B is in A's up zone".
 *
 * 3. **Bidirectional confirmation** — a relation is only emitted when *both*
 *    one-way records agree. For a vertical relation `[A, B]`:
 *    - B must be in A's **up** zone *and* A must be in B's **down** zone.
 *    This mutual check prevents spurious relations caused by large objects
 *    that overlap a distant neighbor's zone from one side only.
 *
 * @param input - Rectangles to analyze and the detection threshold distance.
 * @returns {@link NeighborOutput} — structurally identical to {@link LayoutInput} —
 *   with all bidirectionally confirmed horizontal and vertical neighbor pairs.
 *   The result is suitable for direct use as {@link LayoutInput}, optionally
 *   extended by {@link bridgeSets}.
 *
 * @throws Never — invalid or degenerate inputs simply produce no relations.
 */
export function findNeighbors(input: NeighborInput): NeighborOutput {
  // Convert public type fields (width/height/degree) to internal fields (w/h/r in radians)
  const rects: Rect[] = input.objects.map(o => ({
    id: o.id,
    x: o.x,
    y: o.y,
    w: o.width,
    h: o.height,
    r: (o.degree * Math.PI) / 180,
  }));
  const T = input.threshold;
  const n = rects.length;
  if (n === 0) return { nodes: [], horizontal: [], vertical: [] };

  // 1. Precompute OBB data and AABBs for all source rectangles
  const obbData = rects.map(r => getOBBData(r));
  const aabbs = obbData.map(obb => getAABBFromOBB(obb));

  // 2. Generate all extension rectangles and their OBB data and AABBs
  const allExtended: ExtendedRect[] = [];
  const extOBB: OBBData[] = [];
  const extAABBs: AABB[] = [];
  for (const rect of rects) {
    for (const ext of createExtendedRects(rect, T)) {
      allExtended.push(ext);
      const obb = getOBBData(ext);
      extOBB.push(obb);
      extAABBs.push(getAABBFromOBB(obb));
    }
  }

  // 3. Initialize one-way neighbor records for each rectangle
  const oneWay = new Map<RectId, OneWayNeighbors>();
  for (const r of rects) {
    oneWay.set(r.id, { up: new Set(), down: new Set(), left: new Set(), right: new Set() });
  }

  // 4. Detect overlap between each extension rectangle and all source rectangles (excluding self)
  for (let i = 0; i < allExtended.length; i++) {
    const ext = allExtended[i];
    const extAABB = extAABBs[i];
    const extOBBData = extOBB[i];

    for (let j = 0; j < n; j++) {
      const target = rects[j];
      if (target.id === ext.srcId) continue;

      // Broad-phase AABB prefilter (strict overlap)
      if (!aabbOverlap(extAABB, aabbs[j])) continue;

      // Narrow-phase SAT test (strict overlap)
      if (obbOverlap(extOBBData, obbData[j])) {
        oneWay.get(ext.srcId)![ext.direction].add(target.id);
      }
    }
  }

  // 5. Precompute edges for all rectangles (for weight calculation)
  const rectMap = new Map<RectId, Rect>();
  for (const r of rects) rectMap.set(r.id, r);
  const edgesMap = new Map<RectId, { up: Segment; down: Segment; left: Segment; right: Segment }>();
  for (const r of rects) edgesMap.set(r.id, getRectEdges(r));

  // 6. Build the bidirectionally confirmed neighbor table with weight-based filtering.
  //    Only the "up" and "left" directions initiate relation pairs to avoid duplicates.

  // Collect all candidate pairs with their weights
  interface WeightedPair {
    from: RectId;
    to: RectId;
    weight: number;
  }

  const verticalCandidates: WeightedPair[] = [];
  const horizontalCandidates: WeightedPair[] = [];

  for (const [idA, dirsA] of oneWay) {
    const edgesA = edgesMap.get(idA)!;

    // Vertical: idB is above idA (inside idA's up zone) and idA is below idB
    //           → relation [idB, idA] (idB on top, idA below)
    for (const idB of dirsA.up) {
      if (oneWay.get(idB)?.down.has(idA)) {
        const edgesB = edgesMap.get(idB)!;
        // B's bottom edge faces A's top edge
        const weight = computeNeighborWeight(edgesB.down, edgesA.up);
        verticalCandidates.push({ from: idB, to: idA, weight });
      }
    }
    // Horizontal: idB is left of idA (inside idA's left zone) and idA is right of idB
    //             → relation [idB, idA] (idB on left, idA on right)
    for (const idB of dirsA.left) {
      if (oneWay.get(idB)?.right.has(idA)) {
        const edgesB = edgesMap.get(idB)!;
        // B's right edge faces A's left edge
        const weight = computeNeighborWeight(edgesB.right, edgesA.left);
        horizontalCandidates.push({ from: idB, to: idA, weight });
      }
    }
  }

  // 7. Apply weight-based filtering
  //    - weight > WEIGHT_HIGH → always keep
  //    - WEIGHT_LOW ≤ weight ≤ WEIGHT_HIGH → keep up to 1 per entity per direction
  //    - weight < WEIGHT_LOW → drop

  function filterByWeight(candidates: WeightedPair[]): {
    edges: [RectId, RectId][];
    weights: Map<string, number>;
  } {
    const edges: [RectId, RectId][] = [];
    const weights = new Map<string, number>();

    // Track moderate-weight usage per entity per role (as 'from' or 'to')
    const moderateUsedFrom = new Set<RectId>();
    const moderateUsedTo = new Set<RectId>();

    // Sort by weight descending so higher-weight moderates are picked first
    const sorted = candidates.slice().sort((a, b) => b.weight - a.weight);

    for (const { from, to, weight } of sorted) {
      let keep = false;
      if (weight >= WEIGHT_HIGH) {
        keep = true;
      }
      else if (weight >= WEIGHT_LOW) {
        // Allow up to 1 moderate relation per entity per direction
        if (!moderateUsedFrom.has(from) && !moderateUsedTo.has(to)) {
          keep = true;
          moderateUsedFrom.add(from);
          moderateUsedTo.add(to);
        }
      }
      // weight < WEIGHT_LOW → dropped
      if (keep) {
        edges.push([from, to]);
        weights.set(`${from}\0${to}`, weight);
      }
    }

    return { edges, weights };
  }

  const vertical = filterByWeight(verticalCandidates);
  const horizontal = filterByWeight(horizontalCandidates);

  const weights = new Map<string, number>([...vertical.weights, ...horizontal.weights]);

  return {
    nodes: input.objects.map(o => o.id),
    horizontal: horizontal.edges,
    vertical: vertical.edges,
    weights,
  };
}
