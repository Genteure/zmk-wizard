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
    const ox = key.rx * keySize;
    const oy = key.ry * keySize;
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
