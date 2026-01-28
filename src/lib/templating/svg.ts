/**
 * SVG generation for keyboard layout visualization.
 *
 * Generates standalone SVG files from keyboard layout data with:
 * - Light/dark mode support via CSS media queries
 * - Key index labels (bold monospace)
 * - Part name labels for split keyboards
 * - Text rotated to follow key orientation
 */

import type { Keyboard } from "../../typedef";
import { getKeysBoundingBox, keyCenter, keyToSvgPath, type KeySvgOptions } from "../geometry";

/** Key with geometry and metadata for SVG rendering. */
interface SvgKey {
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
  rx: number;
  ry: number;
  index: number;
  partIndex: number;
  partName: string;
}

const DEFAULT_KEY_SIZE = 70;
const DEFAULT_PADDING = 4;
const DEFAULT_BORDER_RADIUS = 4;
const DEFAULT_MARGIN = 20;

/** Color definitions for light and dark modes. */
const COLORS = {
  light: { keyFill: "#f5f5f5", keyStroke: "#d4d4d4", textPrimary: "#171717", textSecondary: "#525252" },
  dark: { keyFill: "#2a2a2a", keyStroke: "#404040", textPrimary: "#e5e5e5", textSecondary: "#a3a3a3" },
} as const;

/**
 * Part colors matching UI components (from global.css):
 * swp0: amber-500, swp1: teal-500, swp2: fuchsia-500, swp3: lime-500, swp4: blue-500
 */
const PART_COLORS = [
  "#f59e0b", // amber-500 (swp0)
  "#14b8a6", // teal-500 (swp1)
  "#d946ef", // fuchsia-500 (swp2)
  "#84cc16", // lime-500 (swp3)
  "#3b82f6", // blue-500 (swp4)
];

/** Generate the SVG content for a keyboard layout. */
export function generateKeyboardSvg(
  keyboard: Keyboard,
  options: { keySize?: number; padding?: number; borderRadius?: number; margin?: number } = {}
): string {
  const {
    keySize = DEFAULT_KEY_SIZE,
    padding = DEFAULT_PADDING,
    borderRadius = DEFAULT_BORDER_RADIUS,
    margin = DEFAULT_MARGIN,
  } = options;

  if (keyboard.layout.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"></svg>`;
  }

  // Normalize key positions - make a copy and subtract min x/y
  const minX = Math.min(...keyboard.layout.map((k) => k.x));
  const minY = Math.min(...keyboard.layout.map((k) => k.y));
  const partNames = keyboard.parts.map((p) => p.name);

  const keys: SvgKey[] = keyboard.layout.map((key, index) => ({
    x: key.x - minX,
    y: key.y - minY,
    w: key.w,
    h: key.h,
    r: key.r,
    rx: key.rx - minX,
    ry: key.ry - minY,
    index,
    partIndex: key.part,
    partName: partNames[key.part] ?? `part${key.part}`,
  }));

  const isSplit = keyboard.parts.length > 1;

  // Calculate bounding box and SVG dimensions
  const bbox = getKeysBoundingBox(keys, { keySize, padding });
  const width = bbox.max.x - bbox.min.x + margin * 2;
  const height = bbox.max.y - bbox.min.y + margin * 2;
  const offsetX = bbox.min.x - margin;
  const offsetY = bbox.min.y - margin;

  const pathOptions: KeySvgOptions = { keySize, padding, borderRadius, offsetX, offsetY };

  // Generate key paths
  const keyPaths = keys.map((key) => {
    const path = keyToSvgPath(key, pathOptions);
    const partClass = isSplit ? ` part-${key.partIndex}` : "";
    return `    <path class="key-bg${partClass}" d="${path}" />`;
  });

  // Generate text labels with rotation
  const textLabels = keys.map((key) => {
    const center = keyCenter(key, { keySize });
    const cx = center.x - offsetX;
    const cy = center.y - offsetY;
    const rotation = key.r;

    // Calculate font size: text should take ~70-80% of key height
    const keyHeight = key.h * keySize - padding;
    const keyWidth = key.w * keySize - padding;
    const minDim = Math.min(keyWidth, keyHeight);

    if (isSplit) {
      // Two lines: index (larger) + part name (smaller), total ~75% of key height
      const indexFontSize = Math.round(minDim * 0.40);
      const partFontSize = Math.round(minDim * 0.28);
      const lineGap = minDim * 0.08;
      const totalTextHeight = indexFontSize + partFontSize + lineGap;
      const indexY = cy - totalTextHeight / 2 + indexFontSize / 2;
      const partY = cy + totalTextHeight / 2 - partFontSize / 2;

      const transform = rotation !== 0 ? ` transform="rotate(${rotation} ${cx.toFixed(2)} ${cy.toFixed(2)})"` : "";
      return `    <text class="key-index" x="${cx.toFixed(2)}" y="${indexY.toFixed(2)}" font-size="${indexFontSize}"${transform}>${key.index}</text>
    <text class="key-part part-${key.partIndex}" x="${cx.toFixed(2)}" y="${partY.toFixed(2)}" font-size="${partFontSize}"${transform}>${key.partName}</text>`;
    } else {
      // Single line: index takes ~70% of key height
      const fontSize = Math.round(minDim * 0.55);
      const transform = rotation !== 0 ? ` transform="rotate(${rotation} ${cx.toFixed(2)} ${cy.toFixed(2)})"` : "";
      return `    <text class="key-index" x="${cx.toFixed(2)}" y="${cy.toFixed(2)}" font-size="${fontSize}"${transform}>${key.index}</text>`;
    }
  });

  // Generate CSS styles
  const styles = generateStyles(isSplit, keyboard.parts.length);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width.toFixed(2)} ${height.toFixed(2)}">
  <style>${styles}
  </style>
  <g>
${keyPaths.join("\n")}
  </g>
  <g>
${textLabels.join("\n")}
  </g>
</svg>
`;
}

/** Generate CSS styles with light/dark mode support. */
function generateStyles(isSplit: boolean, partCount: number): string {
  let styles = `
    .key-bg { fill: ${COLORS.light.keyFill}; stroke: ${COLORS.light.keyStroke}; stroke-width: 1; }
    .key-index { fill: ${COLORS.light.textPrimary}; font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace; font-weight: 700; text-anchor: middle; dominant-baseline: central; }
    .key-part { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; text-anchor: middle; dominant-baseline: central; }
    @media (prefers-color-scheme: dark) {
      .key-bg { fill: ${COLORS.dark.keyFill}; stroke: ${COLORS.dark.keyStroke}; }
      .key-index { fill: ${COLORS.dark.textPrimary}; }
    }`;

  // Add part-specific colors for split keyboards (same in light/dark mode)
  if (isSplit) {
    for (let i = 0; i < partCount; i++) {
      const color = PART_COLORS[i % PART_COLORS.length];
      styles += `
    .key-bg.part-${i} { stroke: ${color}; }
    .key-part.part-${i} { fill: ${color}; }`;
    }
  }

  return styles;
}
