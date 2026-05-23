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

/**
 * Epsilon guard used in overlap tests to exclude boundary-only contacts
 * (tangent edges / single-point touches) from being counted as neighbors.
 * The Lebesgue measure of a line segment or point is zero; this constant
 * ensures that only intersections with positive area are accepted.
 */
const EPS = 1e-9;

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
    axisX: { x: cos, y: sin },  // local x-axis (width direction)
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
  return (a.minX < b.maxX - EPS) && (a.maxX > b.minX + EPS) &&
         (a.minY < b.maxY - EPS) && (a.maxY > b.minY + EPS);
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
  const radius =
    obb.halfW * Math.abs(obb.axisX.x * axis.x + obb.axisX.y * axis.y) +
    obb.halfH * Math.abs(obb.axisY.x * axis.x + obb.axisY.y * axis.y);
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
    { dir: 'up',    lx: 0,              ly: -h / 2 - T / 2, ew: w, eh: T },
    // Downward extension (local positive-y direction)
    { dir: 'down',  lx: 0,              ly:  h / 2 + T / 2, ew: w, eh: T },
    // Leftward extension (local negative-x direction)
    { dir: 'left',  lx: -w / 2 - T / 2, ly: 0,              ew: T, eh: h },
    // Rightward extension (local positive-x direction)
    { dir: 'right', lx:  w / 2 + T / 2, ly: 0,              ew: T, eh: h },
  ];

  return defs.map(d => {
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
  const vertical: [RectId, RectId][] = [];
  const horizontal: [RectId, RectId][] = [];
  if (n === 0) return { nodes: [], horizontal, vertical };

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

  // 5. Build the bidirectionally confirmed neighbor table from one-way records.
  //    Only the "up" and "left" directions initiate relation pairs to avoid duplicates.
  for (const [idA, dirsA] of oneWay) {
    // Vertical: idB is above idA (inside idA's up zone) and idA is below idB
    //           → relation [idB, idA] (idB on top, idA below)
    for (const idB of dirsA.up) {
      if (oneWay.get(idB)?.down.has(idA)) {
        vertical.push([idB, idA]);
      }
    }
    // Horizontal: idB is left of idA (inside idA's left zone) and idA is right of idB
    //             → relation [idB, idA] (idB on left, idA on right)
    for (const idB of dirsA.left) {
      if (oneWay.get(idB)?.right.has(idA)) {
        horizontal.push([idB, idA]);
      }
    }
  }

  return { nodes: input.objects.map(o => o.id), horizontal, vertical };
}
