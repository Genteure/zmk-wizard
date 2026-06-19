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

  // Rotate around the rotation origin
  const dx = cx - key.rx;
  const dy = cy - key.ry;

  return {
    x: key.rx + dx * cos - dy * sin,
    y: key.ry + dx * sin + dy * cos,
  };
}
