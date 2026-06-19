// ─────────────────────────────────────────────────────────────
// Layout SVG — Keyboard visualization for the generated repo
// ─────────────────────────────────────────────────────────────

import type { Key } from "~/types";
import {
  keyToSvgPath,
  DEFAULT_KEY_SIZE,
  DEFAULT_PADDING,
  DEFAULT_BORDER_RADIUS,
} from "~/components/graphic/keyShape";

/** Part color hex values matching the Nuxt UI theme (Tailwind 400 shades). */
const PART_COLORS = [
  "#fb923c", // orange-400  (part0)
  "#38bdf8", // sky-400     (part1)
  "#f472b6", // pink-400    (part2)
  "#a78bfa", // violet-400  (part3)
  "#22d3ee", // cyan-400    (part4)
];

/**
 * Generate an SVG visualization of the keyboard layout.
 * Pure SVG — no foreignObject.
 */
export function generateLayoutSvg(keyboard: { layout: Key[] }): string {
  const KS = DEFAULT_KEY_SIZE;
  const PAD = DEFAULT_PADDING;
  const FOOTER_HEIGHT = 28;
  const MARGIN = 24;
  const FONT = "system-ui, -apple-system, sans-serif";

  const keys = keyboard.layout;

  if (keys.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 80">
  <rect x="10" y="10" width="180" height="60" rx="8" fill="#f5f5f5" stroke="#d4d4d4" stroke-width="1"/>
  <text x="100" y="38" text-anchor="middle" font-family="${FONT}" font-size="12" fill="#525252">Keyboard Layout</text>
  <text x="100" y="56" text-anchor="middle" font-family="${FONT}" font-size="10" fill="#a3a3a3">Empty — add keys to generate visualization</text>
</svg>`;
  }

  // Compute rendered extent in raw viewport space (before margin offset).
  // SVG applies transforms right-to-left: rotate FIRST, then translate.
  // Shadow offset (0.5,1) is on the path itself so it's applied BEFORE the group's rotate.
  const P = PAD / 2; // path inset from key edge
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  function extend(px: number, py: number): void {
    if (px < minX) minX = px; if (px > maxX) maxX = px;
    if (py < minY) minY = py; if (py > maxY) maxY = py;
  }

  function deg2rad(d: number): number { return d * Math.PI / 180; }

  for (const k of keys) {
    const rw = k.w * KS - PAD;
    const rh = k.h * KS - PAD;
    const cx = (k.rx - k.x) * KS; // rotation center in group-local space
    const cy = (k.ry - k.y) * KS;
    // 4 path corners in key-local space (before any transform)
    const corners = [[P, P], [P + rw, P], [P + rw, P + rh], [P, P + rh]];

    for (const [lx, ly] of corners) {
      // Body corner
      let vx = k.x * KS + lx;
      let vy = k.y * KS + ly;
      // Shadow corner — path's own translate(0.5, 1) applied first
      let sx = k.x * KS + lx + 0.5;
      let sy = k.y * KS + ly + 1;

      if (k.r !== 0) {
        const rad = deg2rad(k.r);
        const c = Math.cos(rad);
        const s = Math.sin(rad);
        // SVG group: rotate(cx, cy, r) first, then translate(k.x*KS, k.y*KS)
        const dx = lx - cx;
        const dy = ly - cy;
        vx = k.x * KS + cx + dx * c - dy * s;
        vy = k.y * KS + cy + dx * s + dy * c;
        // Shadow offset (0.5, 1) is on the path — applied before rotation
        const sdx = lx + 0.5 - cx;
        const sdy = ly + 1 - cy;
        sx = k.x * KS + cx + sdx * c - sdy * s;
        sy = k.y * KS + cy + sdx * s + sdy * c;
      }
      extend(vx, vy);
      extend(sx, sy);
    }
  }

  const offsetX = MARGIN - Math.floor(minX);
  const offsetY = MARGIN - Math.floor(minY);
  const vw = Math.ceil(maxX + offsetX + MARGIN);
  const vh = Math.ceil(maxY + offsetY + MARGIN + FOOTER_HEIGHT);
  const elements: string[] = [
    `<style>
  .bg { fill: #fafafa; }
  .key-body { fill: #ffffff; }
  .key-shadow { fill: rgba(0,0,0,0.04); }
  .key-label { fill: #525252; font-weight: 600; }
  .footer { fill: #a3a3a3; }
  @media (prefers-color-scheme: dark) {
    .bg { fill: #171717; }
    .key-body { fill: #2a2a2a; }
    .key-shadow { fill: rgba(0,0,0,0.15); }
    .key-label { fill: #d4d4d4; }
    .footer { fill: #525252; }
  }
</style>`,
    `<rect class="bg" width="${vw}" height="${vh}"/>`,
  ];

  // Render each key
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const partIdx = key.part % PART_COLORS.length;
    const partColor = PART_COLORS[partIdx];
    const tx = key.x * KS + offsetX;
    const ty = key.y * KS + offsetY;
    const pw = key.w * KS;
    const ph = key.h * KS;

    const path = keyToSvgPath(
      { w: key.w, h: key.h },
      {
        keySize: KS,
        padding: PAD,
        borderRadius: DEFAULT_BORDER_RADIUS,
      },
    );
    // Group transform: translate + optional rotation (shared by shadow and body)
    const groupTransform =
      key.r === 0
        ? `translate(${tx},${ty})`
        : `translate(${tx},${ty}) rotate(${key.r},${(key.rx - key.x) * KS},${(key.ry - key.y) * KS})`;

    const textEl = key.w >= 1 && key.h >= 0.6
      ? `<text x="${pw / 2}" y="${ph / 2 + 1}" text-anchor="middle" dominant-baseline="central" font-family="${FONT}" font-size="${Math.min(14, pw * 0.28)}" class="key-label">${i}</text>`
      : "";

    elements.push(
      `<g transform="${groupTransform}">`,
      // Key shadow (offset within the group's coordinate space)
      `  <path class="key-shadow" d="${path}" transform="translate(0.5,1)"/>`,
      // Key body
      `  <path class="key-body" d="${path}" stroke="${partColor}" stroke-width="1.5"/>`,
      // Key index (local coords — rotates with the key)
      textEl ? `  ${textEl}` : "",
      `</g>`,
    );
  }

  // Footer credit
  elements.push(
    `<text x="${vw / 2}" y="${vh - FOOTER_HEIGHT / 2}" text-anchor="middle" dominant-baseline="central" font-family="${FONT}" font-size="11" class="footer">Built with Shield Wizard for ZMK</text>`,
  );

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vw} ${vh}">
${elements.filter(Boolean).join("\n")}
</svg>`;
}
