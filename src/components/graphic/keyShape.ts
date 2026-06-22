import type { BoundingBox, Point } from '~/types/geometry';
import type { Key } from '~/types/keyboard';

export const DEFAULT_KEY_SIZE = 70;
export const DEFAULT_PADDING = 4;
export const DEFAULT_BORDER_RADIUS = 4;

interface KeyShapeOptions {
  keySize?: number;
  padding?: number;
  borderRadius?: number;
}

/**
 * Generate an SVG path for an unrotated rounded rectangle representing a key.
 *
 * The path is in local coordinates (origin at the key's top-left corner).
 * Rotation and translation are handled by the parent SVG `<g>` transform.
 *
 * The visible rectangle is inset by `padding / 2` from the key edges.
 */
export function keyToSvgPath(
  key: { w: number; h: number },
  options?: KeyShapeOptions,
): string {
  const keySize = options?.keySize ?? DEFAULT_KEY_SIZE;
  const padding = options?.padding ?? DEFAULT_PADDING;
  const borderRadius = options?.borderRadius ?? DEFAULT_BORDER_RADIUS;

  const w = key.w * keySize;
  const h = key.h * keySize;
  const p = padding / 2;
  const rw = w - padding;
  const rh = h - padding;
  const r = Math.min(borderRadius, rw / 2, rh / 2);

  // Rounded rect inset by padding, starting at top-left
  return [
    `M ${p + r},${p}`,
    `L ${p + rw - r},${p}`,
    `Q ${p + rw},${p} ${p + rw},${p + r}`,
    `L ${p + rw},${p + rh - r}`,
    `Q ${p + rw},${p + rh} ${p + rw - r},${p + rh}`,
    `L ${p + r},${p + rh}`,
    `Q ${p},${p + rh} ${p},${p + rh - r}`,
    `L ${p},${p + r}`,
    `Q ${p},${p} ${p + r},${p}`,
    'Z',
  ].join(' ');
}

/**
 * Rotate a point around an origin by the given angle (degrees, clockwise).
 */
function rotatePoint(px: number, py: number, ox: number, oy: number, angleDeg: number): Point {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = px - ox;
  const dy = py - oy;
  return {
    x: ox + dx * cos - dy * sin,
    y: oy + dx * sin + dy * cos,
  };
}

/**
 * Compute the axis-aligned bounding box of a single key in pixel coordinates,
 * accounting for rotation.
 *
 * Returns the tightest AABB that contains the key's 4 corners after rotation.
 */
export function keyBoundingBox(
  key: Pick<Key, 'x' | 'y' | 'w' | 'h' | 'r' | 'rx' | 'ry'>,
  keySize: number = DEFAULT_KEY_SIZE,
): BoundingBox {
  const x = key.x * keySize;
  const y = key.y * keySize;
  const w = key.w * keySize;
  const h = key.h * keySize;

  const corners: Point[] = [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];

  if (key.r !== 0) {
    // Apply rx/ry fallback: when rx=0, effective rx = x (same for ry)
    const effRx = key.rx === 0 ? key.x : key.rx;
    const effRy = key.ry === 0 ? key.y : key.ry;
    const ox = effRx * keySize;
    const oy = effRy * keySize;
    for (let i = 0; i < corners.length; i++) {
      corners[i] = rotatePoint(corners[i].x, corners[i].y, ox, oy, key.r);
    }
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of corners) {
    if (c.x < minX) minX = c.x;
    if (c.y < minY) minY = c.y;
    if (c.x > maxX) maxX = c.x;
    if (c.y > maxY) maxY = c.y;
  }

  return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } };
}

/**
 * Compute the union bounding box of all keys.
 * Returns null if the array is empty.
 */
export function keysBoundingBox(
  keys: Pick<Key, 'x' | 'y' | 'w' | 'h' | 'r' | 'rx' | 'ry'>[],
  keySize: number = DEFAULT_KEY_SIZE,
): BoundingBox | null {
  if (keys.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const key of keys) {
    const bb = keyBoundingBox(key, keySize);
    if (bb.min.x < minX) minX = bb.min.x;
    if (bb.min.y < minY) minY = bb.min.y;
    if (bb.max.x > maxX) maxX = bb.max.x;
    if (bb.max.y > maxY) maxY = bb.max.y;
  }

  return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } };
}

/**
 * Compute the union bounding box for logical/keymap layout.
 * Keys are positioned by (col, row) with uniform 1×1 size, no rotation.
 * Returns null if the array is empty.
 */
export function logicalKeysBoundingBox(
  keys: Pick<Key, 'col' | 'row'>[],
  keySize: number = DEFAULT_KEY_SIZE,
): BoundingBox | null {
  if (keys.length === 0) return null;

  let minCol = Infinity;
  let minRow = Infinity;
  let maxCol = -Infinity;
  let maxRow = -Infinity;

  for (const key of keys) {
    if (key.col < minCol) minCol = key.col;
    if (key.row < minRow) minRow = key.row;
    if (key.col + 1 > maxCol) maxCol = key.col + 1;
    if (key.row + 1 > maxRow) maxRow = key.row + 1;
  }

  return {
    min: { x: minCol * keySize, y: minRow * keySize },
    max: { x: maxCol * keySize, y: maxRow * keySize },
  };
}

/**
 * Bounding box for a single key in logical/keymap layout (col, row, 1×1).
 */
export function logicalKeyBoundingBox(
  key: Pick<Key, 'col' | 'row'>,
  keySize: number = DEFAULT_KEY_SIZE,
): BoundingBox {
  return {
    min: { x: key.col * keySize, y: key.row * keySize },
    max: { x: (key.col + 1) * keySize, y: (key.row + 1) * keySize },
  };
}

/**
 * Normalize rotation origin to (0, 0) — meaning "rotate around the key's own
 * top-left corner". Adjusts x, y to keep the key's final visual position and
 * rotation unchanged.
 *
 * Per the algo doc §"Normalize rotation origin to (0, 0)".
 *
 * The fallback rule: when rx === 0, effective rx = x (same for ry).
 * After normalization, rx=0, ry=0, and x,y are recomputed so the key's
 * on-screen appearance is identical.
 */
export function normalizeRotationOrigin(key: { x: number; y: number; w: number; h: number; r: number; rx: number; ry: number }): { x: number; y: number; rx: number; ry: number } {
  // Resolve fallback for current rx, ry
  const ox = key.rx === 0 ? key.x : key.rx;
  const oy = key.ry === 0 ? key.y : key.ry;

  // If already normalized (effective origin is the key's top-left), nothing to do
  if (ox === key.x && oy === key.y) {
    return { x: key.x, y: key.y, rx: 0, ry: 0 };
  }

  const rad = (key.r * Math.PI) / 180;
  const cosR = Math.cos(rad);
  const sinR = Math.sin(rad);

  // Current unrotated centre
  const cx0 = key.x + key.w / 2;
  const cy0 = key.y + key.h / 2;

  // Current final centre after rotation (clockwise in screen coordinates)
  const fx = ox + (cx0 - ox) * cosR - (cy0 - oy) * sinR;
  const fy = oy + (cx0 - ox) * sinR + (cy0 - oy) * cosR;

  // New top-left: rotation about itself, so origin = (x', y')
  // fx = x' + (w/2)*cos(r) - (h/2)*sin(r)
  // fy = y' + (w/2)*sin(r) + (h/2)*cos(r)
  // Solve for x', y':
  const newX = fx - (key.w / 2) * cosR + (key.h / 2) * sinR;
  const newY = fy - (key.w / 2) * sinR - (key.h / 2) * cosR;

  return { x: newX, y: newY, rx: 0, ry: 0 };
}

/**
 * Rotate a key around a pivot point by delta degrees, using the correct
 * center-based rotation algorithm from the algo doc §"Rotate keys around a point",
 * then normalize rx, ry to (0, 0) preserving visual position.
 *
 * Returns { x, y, r } — the new position with r updated, rx=ry=0 implied.
 */
export function rotateAndNormalizeKey(
  key: { x: number; y: number; w: number; h: number; r: number; rx: number; ry: number },
  pivotX: number, pivotY: number,
  deltaDeg: number,
): { x: number; y: number; r: number } {
  // 1. Resolve fallback for current rotation origin
  const ox = key.rx === 0 ? key.x : key.rx;
  const oy = key.ry === 0 ? key.y : key.ry;

  const rRad = (key.r * Math.PI) / 180;
  const dRad = (deltaDeg * Math.PI) / 180;
  const cosD = Math.cos(dRad), sinD = Math.sin(dRad);

  // 2. Current unrotated centre, then final centre after clockwise rotation
  const cx0 = key.x + key.w / 2;
  const cy0 = key.y + key.h / 2;
  const Cx = ox + (cx0 - ox) * Math.cos(rRad) - (cy0 - oy) * Math.sin(rRad);
  const Cy = oy + (cx0 - ox) * Math.sin(rRad) + (cy0 - oy) * Math.cos(rRad);

  // 3. Rotate centre and effective origin around pivot (clockwise)
  const Cx2 = pivotX + (Cx - pivotX) * cosD - (Cy - pivotY) * sinD;
  const Cy2 = pivotY + (Cx - pivotX) * sinD + (Cy - pivotY) * cosD;
  const Ox2 = pivotX + (ox - pivotX) * cosD - (oy - pivotY) * sinD;
  const Oy2 = pivotY + (ox - pivotX) * sinD + (oy - pivotY) * cosD;

  // 4. New rotation
  const newR = ((key.r + deltaDeg) % 360 + 360) % 360;

  // 5-6. Solve for new top-left from new centre and new explicit origin
  const newRRad = (newR * Math.PI) / 180;
  const cosR2 = Math.cos(newRRad), sinR2 = Math.sin(newRRad);
  const A = Cx2 - Ox2;
  const B = Cy2 - Oy2;
  const u = A * cosR2 + B * sinR2;
  const v = -A * sinR2 + B * cosR2;
  const newCx0 = Ox2 + u;
  const newCy0 = Oy2 + v;
  const newX = newCx0 - key.w / 2;
  const newY = newCy0 - key.h / 2;

  // 7. Normalize: set rx=0, ry=0, adjust x,y to preserve visual position
  const norm = normalizeRotationOrigin({
    x: newX, y: newY, w: key.w, h: key.h, r: newR, rx: Ox2, ry: Oy2,
  });

  return { x: norm.x, y: norm.y, r: newR };
}
/**
 * Rotate a key around its own center point by delta degrees.
 * The key's center (in world coordinates, accounting for current rotation)
 * stays fixed; the rotation angle changes and rx,ry are normalized to (0,0).
 *
 * Returns { x, y, r } — the new position with r updated, rx=ry=0 implied.
 */
export function rotateKeyAroundCenter(
  key: { x: number; y: number; w: number; h: number; r: number; rx: number; ry: number },
  deltaDeg: number,
): { x: number; y: number; r: number } {
  // 1. Resolve fallback for current rotation origin
  const ox = key.rx === 0 ? key.x : key.rx;
  const oy = key.ry === 0 ? key.y : key.ry;

  // 2. Current unrotated centre
  const cx0 = key.x + key.w / 2;
  const cy0 = key.y + key.h / 2;

  // 3. Current final centre after rotation (clockwise in screen coordinates)
  const rad = (key.r * Math.PI) / 180;
  const cosR = Math.cos(rad), sinR = Math.sin(rad);
  const finalCx = ox + (cx0 - ox) * cosR - (cy0 - oy) * sinR;
  const finalCy = oy + (cx0 - ox) * sinR + (cy0 - oy) * cosR;

  // 4. New rotation, normalized to [0, 360)
  const newR = ((key.r + deltaDeg) % 360 + 360) % 360;

  // 5. Solve for new top-left (normalized, rx=0, ry=0) preserving the original center
  const newRad = (newR * Math.PI) / 180;
  const cosNewR = Math.cos(newRad), sinNewR = Math.sin(newRad);
  const newX = finalCx - (key.w / 2) * cosNewR + (key.h / 2) * sinNewR;
  const newY = finalCy - (key.w / 2) * sinNewR - (key.h / 2) * cosNewR;

  return { x: newX, y: newY, r: newR };
}
