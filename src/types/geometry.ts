export interface Point {
  x: number;
  y: number;
}

export interface BoundingBox {
  min: Point;
  max: Point;
}

export interface Options {
  keySize?: number;
  padding?: number;
}

export interface KeyCenterOptions {
  keySize?: number;
}

/**
 * Calculate the center point of a key, accounting for rotation.
 * Uses the key's position (x, y), size (w, h), and rotation origin (rx, ry).
 */
export function keyCenter(
  key: { x: number; y: number; w: number; h: number; r: number; rx: number; ry: number },
  options?: KeyCenterOptions,
): Point {
  const size = options?.keySize ?? 1;
  const cx = key.x + (key.w * size) / 2;
  const cy = key.y + (key.h * size) / 2;

  if (!key.r) return { x: cx, y: cy };

  const rad = (key.r * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  // Apply rx/ry fallback: when rx === 0, effective rx = x (same for ry)
  const effRx = key.rx === 0 ? key.x : key.rx;
  const effRy = key.ry === 0 ? key.y : key.ry;

  // Rotate around the rotation origin
  const dx = cx - effRx;
  const dy = cy - effRy;

  return {
    x: effRx + dx * cos - dy * sin,
    y: effRy + dx * sin + dy * cos,
  };
}
