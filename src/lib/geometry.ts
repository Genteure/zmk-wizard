// Parts of this file was based on geometry.js from keyboard-layout-tools
// https://github.com/nickcoutsos/keymap-layout-tools/blob/16ea47d8da5b89095747086548cf7e29fa51fb71/keymap-layout-tools/lib/geometry.js

import type { JSX } from "solid-js/jsx-runtime";
import type { Point, BoundingBox, Options } from "../typedef";
export type { Point, BoundingBox, Options } from "../typedef";

export interface KeySize {
  w: number;
  h: number;
}

export interface KeyPosition {
  x: number;
  y: number;
}

export interface KeyRotation {
  r: number;
  rx: number;
  ry: number;
}

export type KeyGeometry = KeySize & KeyPosition & KeyRotation;

const DEFAULT_KEY_SIZE = 70;
const DEFAULT_PADDING = 4;

/**
 * Convert a key geometry object expressed in units (U) into pixel values.
 * The key's x/y/w/h are multiplied by keySize to compute left/top/width/height.
 * If rotation origin (rx/ry) is provided it is converted into pixel offsets
 * relative to the key origin and returned as transformOriginX/transformOriginY.
 *
 * @param key - Key geometry (w,h,x,y and optional r,rx,ry)
 * @param keySize - Size in pixels that corresponds to 1U
 * @returns An object with left, top, width, height, rotation (deg) and transform origin offsets
 */
function scaleToPixel(key: KeyGeometry, keySize = DEFAULT_KEY_SIZE) {
  const left = key.x * keySize;
  const top = key.y * keySize;
  const width = key.w * keySize;
  const height = key.h * keySize;

  let transformOriginX = 0;
  let transformOriginY = 0;

  if (key.rx !== undefined || key.ry !== undefined) {
    const rotationX = key.rx ?? key.x;
    const rotationY = key.ry ?? key.y;
    transformOriginX = (rotationX - key.x) * keySize;
    transformOriginY = (rotationY - key.y) * keySize;
  }

  return {
    left,
    top,
    width,
    height,
    rotation: key.r,
    transformOriginX,
    transformOriginY,
  };
}

/**
 * Build inline CSS styles for rendering a key element in the UI.
 *
 * @param keyLayout - Key geometry
 * @param options - rendering options
 * @returns A JSX.CSSProperties object for SolidJS `style` prop
 */
export function getKeyStyles(keyLayout: KeyGeometry, options: Options = {}): JSX.CSSProperties {
  const { keySize = DEFAULT_KEY_SIZE, padding = DEFAULT_PADDING } = options;
  const pixelValues = scaleToPixel(keyLayout, keySize);

  const width = pixelValues.width - padding;
  const height = pixelValues.height - padding;

  let transform = `translate(${padding / 2}px, ${padding / 2}px)`;
  let transformOrigin = undefined;

  // TODO scale down content if key is too small?

  if (pixelValues.rotation) {
    transform = `rotate(${pixelValues.rotation}deg) ${transform}`;
    transformOrigin = `${pixelValues.transformOriginX}px ${pixelValues.transformOriginY}px`;
  }

  return {
    position: 'absolute',
    top: `${pixelValues.top}px`,
    left: `${pixelValues.left}px`,
    width: `${width}px`,
    height: `${height}px`,
    'transform-origin': transformOrigin,
    transform
  };
}

/**
 * Convert a key geometry into an array of polygon points (in pixels).
 * The polygon is defined as the 4 corners of the key rectangle, rotated
 * around the key's transform origin (if any) and translated to absolute
 * pixel coordinates.
 *
 * @param key - Key geometry
 * @param options - Optional rendering options: keySize (px per unit) and padding (not used here)
 * @returns Array of 4 points representing the key polygon in pixel coordinates
 */
export function keyToPolygon(key: KeyGeometry, options: Options = {}): Point[] {
  const {
    left,
    top,
    width,
    height,
    rotation,
    transformOriginX,
    transformOriginY,
  } = scaleToPixel(key, options.keySize);

  const points: Point[] = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height }
  ];

  return points.map(point => {
    const x = point.x - transformOriginX;
    const y = point.y - transformOriginY;
    const angle = rotation * Math.PI / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
      x: transformOriginX + x * cos - y * sin,
      y: transformOriginY + y * cos + x * sin,
    };
  }).map(point => {
    return {
      x: point.x + left,
      y: point.y + top
    };
  });
}

/**
 * Compute the center point of a key by converting it to a polygon and
 * returning the midpoint of its bounding box.
 *
 * @param key - Key geometry
 * @param options - rendering options
 * @returns The center point of the key in pixel coordinates
 */
export function keyCenter(key: KeyGeometry, options: Options = {}): Point {
  const polygon = keyToPolygon(key, options);
  const xValues = polygon.map(point => point.x);
  const yValues = polygon.map(point => point.y);
  return {
    x: (Math.min(...xValues) + Math.max(...xValues)) / 2,
    y: (Math.min(...yValues) + Math.max(...yValues)) / 2,
  };
}

/**
 * Compute a bounding box that encloses an array of keys.
 * Each key is converted to a polygon and the union of their points is
 * used to compute the min/max coordinates.
 *
 * @param keys - Array of key geometries
 * @param options - rendering options
 * @returns BoundingBox in pixel coordinates
 */
export function getKeysBoundingBox(keys: KeyGeometry[], options: Options = {}): BoundingBox {
  return bbox(keys.map(key => keyToPolygon(key, options)).flat());
}

/**
 * Compute a bounding box that encloses a polygon (array of points).
 *
 * @param polygon - Array of points
 * @returns BoundingBox containing min and max x/y values
 */
export function bbox(polygon: Point[]): BoundingBox {
  const xValues = polygon.map(point => point.x)
  const yValues = polygon.map(point => point.y)
  return {
    min: {
      x: Math.min(...xValues),
      y: Math.min(...yValues),
    },
    max: {
      x: Math.max(...xValues),
      y: Math.max(...yValues),
    },
  }
}

/**
 * Compute the center point of a bounding box.
 *
 * @param bbox - Bounding box with min and max points
 * @returns Center point of the bounding box
 */
export function bboxCenter(bbox: BoundingBox): Point {
  return {
    x: (bbox.min.x + bbox.max.x) / 2,
    y: (bbox.min.y + bbox.max.y) / 2,
  };
}

/**
 * Project a polygon onto an axis and return the min/max scalar values.
 *
 * @param polygon - Array of points representing the polygon
 * @param axis - The axis vector to project onto (does not need to be normalized)
 * @returns Min/max projection scalar values
 */
function projectPolygon(polygon: Point[], axis: Point): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;

  for (const point of polygon) {
    const proj = point.x * axis.x + point.y * axis.y;
    if (proj < min) min = proj;
    if (proj > max) max = proj;
  }

  return { min, max };
}

/**
 * Checks if two convex polygons intersect.
 *
 * @param polyA - First polygon as array of Points
 * @param polyB - Second polygon as array of Points
 * @returns True if polygons overlap/intersect, false if they don't touch
 */
export function polygonsIntersectSAT(polyA: Point[], polyB: Point[]): boolean {
  for (let i = 0; i < polyA.length; i++) {
    const p1 = polyA[i];
    const p2 = polyA[(i + 1) % polyA.length];
    const normal = { x: -(p2.y - p1.y), y: p2.x - p1.x };
    const projA = projectPolygon(polyA, normal);
    const projB = projectPolygon(polyB, normal);

    if (projA.max < projB.min || projB.max < projA.min) {
      return false;
    }
  }

  for (let i = 0; i < polyB.length; i++) {
    const p1 = polyB[i];
    const p2 = polyB[(i + 1) % polyB.length];
    const normal = { x: -(p2.y - p1.y), y: p2.x - p1.x };
    const projA = projectPolygon(polyA, normal);
    const projB = projectPolygon(polyB, normal);

    if (projA.max < projB.min || projB.max < projA.min) {
      return false;
    }
  }

  return true;
}

/**
 * Point-in-polygon test.
 *
 * @param polygon - Array of points defining the polygon
 * @param x - X coordinate of the test point
 * @param y - Y coordinate of the test point
 * @returns True if the point (x, y) lies inside the polygon
 */
export function pointInPolygon(polygon: Point[], x: number, y: number): boolean {
  let isInside = false;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    if (((a.y > y) !== (b.y > y)) && (x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x)) {
      isInside = !isInside;
    }
  }
  return isInside;
}
