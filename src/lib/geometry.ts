// This file was based on geometry.js from keyboard-layout-tools
// https://github.com/nickcoutsos/keymap-layout-tools/blob/16ea47d8da5b89095747086548cf7e29fa51fb71/keymap-layout-tools/lib/geometry.js

import type { JSX } from "solid-js/jsx-runtime";
import type { BoundingBox, Key, Point } from "./types";

export interface Options {
  keySize?: number;
  padding?: number;
}

const DEFAULT_KEY_SIZE = 70;
const DEFAULT_PADDING = 4;

function scaleToPixel(key: Key, keySize = DEFAULT_KEY_SIZE) {
  const left = key.x * keySize;
  const top = key.y * keySize;
  const width = key.width * keySize;
  const height = key.height * keySize;

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

export function getKeyStyles(keyLayout: Key, options: Options = {}): JSX.CSSProperties {
  const { keySize = DEFAULT_KEY_SIZE, padding = DEFAULT_PADDING } = options;
  const pixelValues = scaleToPixel(keyLayout, keySize);

  const width = pixelValues.width - padding;
  const height = pixelValues.height - padding;

  let transform = `translate(${padding / 2}px, ${padding / 2}px)`;
  let transformOrigin = undefined;

  if (pixelValues.rotation) {
    transform = `rotate(${pixelValues.rotation}deg) ${transform}`;
    transformOrigin = `${pixelValues.transformOriginX}px ${pixelValues.transformOriginY}px`;
  }

  return {
    top: `${pixelValues.top}px`,
    left: `${pixelValues.left}px`,
    width: `${width}px`,
    height: `${height}px`,
    'transform-origin': transformOrigin,
    transform
  };
}

export function keyToPolygon(key: Key, options: Options = {}): Point[] {
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

export function keyCenter(key: Key, options: Options = {}): Point {
  const polygon = keyToPolygon(key, options);
  const xValues = polygon.map(point => point.x);
  const yValues = polygon.map(point => point.y);
  return {
    x: (Math.min(...xValues) + Math.max(...xValues)) / 2,
    y: (Math.min(...yValues) + Math.max(...yValues)) / 2,
  };
}

export function getKeysBoundingBox(keys: Key[], options: Options = {}): BoundingBox {
  return bbox(keys.map(key => keyToPolygon(key, options)).flat());
}

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

export function bboxCenter(bbox: BoundingBox): Point {
  return {
    x: (bbox.min.x + bbox.max.x) / 2,
    y: (bbox.min.y + bbox.max.y) / 2,
  };
}
