/**
 * SVG generation for keyboard layout visualization.
 *
 * Generates standalone SVG files from keyboard layout data with:
 * - Light/dark mode support via CSS media queries
 * - Key index labels (bold monospace)
 * - Part name labels for split keyboards
 */

import type { Keyboard } from "../../typedef";
import {
  getKeysBoundingBox,
  keyCenter,
  keyToSvgPath,
  type KeyGeometry,
  type KeySvgOptions,
} from "../geometry";

/**
 * Key with geometry and metadata for SVG rendering.
 */
interface SvgKey extends KeyGeometry {
  index: number;
  partIndex: number;
  partName: string;
}

/**
 * Options for SVG generation.
 */
export interface SvgGenerationOptions {
  /** Size in pixels per 1U (default: 70) */
  keySize?: number;
  /** Padding between keys in pixels (default: 4) */
  padding?: number;
  /** Border radius for keys (default: 4) */
  borderRadius?: number;
  /** Margin around the keyboard in pixels (default: 20) */
  margin?: number;
}

const DEFAULT_KEY_SIZE = 70;
const DEFAULT_PADDING = 4;
const DEFAULT_BORDER_RADIUS = 4;
const DEFAULT_MARGIN = 20;

/**
 * Color definitions for light and dark modes.
 */
const COLORS = {
  light: {
    background: "#ffffff",
    keyFill: "#f5f5f5",
    keyStroke: "#d4d4d4",
    textPrimary: "#171717",
    textSecondary: "#737373",
  },
  dark: {
    background: "#1c1c1c",
    keyFill: "#2a2a2a",
    keyStroke: "#404040",
    textPrimary: "#e5e5e5",
    textSecondary: "#a3a3a3",
  },
} as const;

/**
 * Part colors for split keyboards.
 */
const PART_COLORS = [
  { light: "#3b82f6", dark: "#60a5fa" }, // blue
  { light: "#22c55e", dark: "#4ade80" }, // green
  { light: "#f59e0b", dark: "#fbbf24" }, // amber
  { light: "#ef4444", dark: "#f87171" }, // red
  { light: "#8b5cf6", dark: "#a78bfa" }, // violet
  { light: "#ec4899", dark: "#f472b6" }, // pink
];

/**
 * Determine if the keyboard is a split keyboard (multiple parts).
 */
function isSplitKeyboard(partNames: string[]): boolean {
  return partNames.length > 1;
}

/**
 * Get color for a specific part index.
 */
function getPartColor(partIndex: number, mode: "light" | "dark"): string {
  const color = PART_COLORS[partIndex % PART_COLORS.length];
  return color[mode];
}

/**
 * Convert keyboard layout to SvgKey array.
 */
function layoutToSvgKeys(keyboard: Keyboard): SvgKey[] {
  const partNames = keyboard.parts.map((p) => p.name);

  return keyboard.layout.map((key, index) => ({
    x: key.x,
    y: key.y,
    w: key.w,
    h: key.h,
    r: key.r,
    rx: key.rx,
    ry: key.ry,
    index,
    partIndex: key.part,
    partName: partNames[key.part] ?? `part${key.part}`,
  }));
}

/**
 * Generate SVG path for a key with proper offset.
 */
function generateKeyPath(
  key: SvgKey,
  options: KeySvgOptions
): string {
  return keyToSvgPath(key, options);
}

/**
 * Calculate the center position of a key for text placement.
 */
function getKeyCenterForText(
  key: SvgKey,
  options: { keySize: number; offsetX: number; offsetY: number }
): { x: number; y: number } {
  const center = keyCenter(key, { keySize: options.keySize });
  return {
    x: center.x - options.offsetX,
    y: center.y - options.offsetY,
  };
}

/**
 * Escape special XML characters.
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Generate CSS styles with light/dark mode support.
 */
function generateStyles(isSplit: boolean, partCount: number): string {
  let styles = `
    .key-bg { fill: ${COLORS.light.keyFill}; stroke: ${COLORS.light.keyStroke}; stroke-width: 1; }
    .key-index { fill: ${COLORS.light.textPrimary}; font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace; font-weight: 700; text-anchor: middle; dominant-baseline: central; }
    .key-part { fill: ${COLORS.light.textSecondary}; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 10px; text-anchor: middle; dominant-baseline: central; }
    @media (prefers-color-scheme: dark) {
      .key-bg { fill: ${COLORS.dark.keyFill}; stroke: ${COLORS.dark.keyStroke}; }
      .key-index { fill: ${COLORS.dark.textPrimary}; }
      .key-part { fill: ${COLORS.dark.textSecondary}; }
    }`;

  // Add part-specific colors for split keyboards
  if (isSplit) {
    for (let i = 0; i < partCount; i++) {
      styles += `
    .part-${i} { stroke: ${getPartColor(i, "light")}; }
    @media (prefers-color-scheme: dark) { .part-${i} { stroke: ${getPartColor(i, "dark")}; } }`;
    }
  }

  return styles;
}

/**
 * Generate the SVG content for a keyboard layout.
 *
 * @param keyboard - The keyboard configuration
 * @param options - SVG generation options
 * @returns SVG string content
 */
export function generateKeyboardSvg(
  keyboard: Keyboard,
  options: SvgGenerationOptions = {}
): string {
  const {
    keySize = DEFAULT_KEY_SIZE,
    padding = DEFAULT_PADDING,
    borderRadius = DEFAULT_BORDER_RADIUS,
    margin = DEFAULT_MARGIN,
  } = options;

  const keys = layoutToSvgKeys(keyboard);
  if (keys.length === 0) {
    // Return an empty SVG for keyboards with no keys
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"></svg>`;
  }

  // Calculate bounding box
  const bbox = getKeysBoundingBox(keys, { keySize, padding });
  const width = bbox.max.x - bbox.min.x + margin * 2;
  const height = bbox.max.y - bbox.min.y + margin * 2;

  // Offset to translate coordinates so keys start at (margin, margin)
  const offsetX = bbox.min.x - margin;
  const offsetY = bbox.min.y - margin;

  const pathOptions: KeySvgOptions = {
    keySize,
    padding,
    borderRadius,
    offsetX,
    offsetY,
  };

  const partNames = keyboard.parts.map((p) => p.name);
  const isSplit = isSplitKeyboard(partNames);

  // Generate key paths
  const keyPaths = keys.map((key) => {
    const path = generateKeyPath(key, pathOptions);
    const partClass = isSplit ? ` part-${key.partIndex}` : "";
    return `    <path class="key-bg${partClass}" d="${path}" />`;
  });

  // Generate text labels
  const textLabels = keys.map((key) => {
    const center = getKeyCenterForText(key, {
      keySize,
      offsetX,
      offsetY,
    });

    // Font size based on key size
    const keyWidth = key.w * keySize - padding;
    const keyHeight = key.h * keySize - padding;
    const minDim = Math.min(keyWidth, keyHeight);
    const fontSize = Math.max(10, Math.min(20, Math.floor(minDim * 0.35)));

    if (isSplit) {
      // Two-line layout: index on top, part name below
      const lineHeight = fontSize * 1.2;
      const indexY = center.y - lineHeight * 0.3;
      const partY = center.y + lineHeight * 0.5;

      return `    <text class="key-index" x="${center.x.toFixed(2)}" y="${indexY.toFixed(2)}" font-size="${fontSize}">${key.index}</text>
    <text class="key-part" x="${center.x.toFixed(2)}" y="${partY.toFixed(2)}">${escapeXml(key.partName)}</text>`;
    } else {
      // Single-line layout: just the index
      return `    <text class="key-index" x="${center.x.toFixed(2)}" y="${center.y.toFixed(2)}" font-size="${fontSize}">${key.index}</text>`;
    }
  });

  // Build the complete SVG
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
