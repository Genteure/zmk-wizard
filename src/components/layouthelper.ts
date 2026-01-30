import { ulid } from "ulidx";
import { keyCenter, type Point } from "~/lib/geometry";
import type { Key } from "../typedef";
import { Serial } from "./kle-serial";
import { Keyboard as KLEKeyboard, Key as KLEKey } from "./kle-serial";

/**
 * Configuration for the physical to logical layout conversion algorithm.
 */
interface PhysicalToLogicalConfig {
  /**
   * Tolerance for considering two keys to be in the same row.
   * Keys with y-coordinates within this tolerance are considered row candidates.
   * Default: 0.5 (half a key unit)
   */
  rowTolerance: number;

  /**
   * Tolerance for considering two keys to be in the same column.
   * Keys with x-coordinates within this tolerance may share a column.
   * Default: 0.4 (slightly less than half a key unit)
   */
  colTolerance: number;
}

const DEFAULT_CONFIG: PhysicalToLogicalConfig = {
  rowTolerance: 0.5,
  colTolerance: 0.4,
};

/**
 * Convert physical key positions to logical row/col grid positions.
 *
 * This algorithm handles various keyboard layouts including:
 * - Standard row-staggered layouts (QWERTY style)
 * - Column-staggered layouts (ergo keyboards)
 * - Rotated layouts (thumb clusters, split keyboards)
 * - Mixed key sizes (spacebars, modifiers)
 *
 * The algorithm works in three phases:
 * 1. Cluster keys into logical rows based on Y-coordinate proximity
 * 2. Assign columns by sweeping left-to-right, grouping keys vertically
 * 3. Sort keys by (row, col) and assign final positions
 *
 * @param keys Array of keys to convert (modified in place)
 * @param ignoreOrder If true, sorts keys before processing to find optimal layout.
 *                    If false, preserves the original key order as much as possible.
 */
export function physicalToLogical(keys: Key[], ignoreOrder: boolean): void {
  if (keys.length === 0) return;

  const config = DEFAULT_CONFIG;

  // Calculate center point for each key (accounting for rotation)
  // Normalize y coordinates to start from 0
  const posList = keys.map(k => keyCenter(k, { keySize: 1 }));
  const minPosY = Math.min(...posList.map(p => p.y));
  posList.forEach(p => p.y -= minPosY);
  const posMap = new Map<Key, Point>(keys.map((k, i) => [k, posList[i]]));

  // Phase 1: Cluster keys into logical rows
  const rows = clusterIntoRows(keys, posMap, config, ignoreOrder);

  // Phase 2: Assign columns using sweep-line algorithm
  const cols = assignColumns(rows, posMap, config);

  // Phase 3: Assign row/col values and sort
  for (let c = 0; c < cols.length; c++) {
    for (let r = 0; r < cols[c].length; r++) {
      const key = cols[c][r];
      if (key) {
        key.row = r;
        key.col = c;
      }
    }
  }
  keys.sort((a, b) => (a.row - b.row) || (a.col - b.col));
}

/**
 * Cluster keys into logical rows based on Y-coordinate proximity.
 *
 * Uses different strategies based on ignoreOrder:
 * - ignoreOrder=true: Statistical clustering based on Y-coordinate gaps
 * - ignoreOrder=false: X-coordinate break detection (for pre-ordered keys)
 *
 * The algorithm handles both:
 * - Perfect 1U grids where rows are exactly 1 unit apart
 * - Staggered/rotated layouts where keys in the same row have varying Y
 */
function clusterIntoRows(
  keys: Key[],
  posMap: Map<Key, Point>,
  config: PhysicalToLogicalConfig,
  ignoreOrder: boolean
): Key[][] {
  if (keys.length <= 1) {
    return keys.length === 0 ? [] : [[keys[0]]];
  }

  if (!ignoreOrder) {
    // Use X-coordinate break detection for pre-ordered keys
    // This works well when keys are already in row-major order
    return clusterByXBreaks(keys, posMap, config);
  }

  // For ignoreOrder=true, use Y-coordinate clustering
  return clusterByYGaps(keys, posMap, config);
}

/**
 * Cluster keys by detecting X-coordinate breaks.
 * A new row starts when the X coordinate decreases significantly.
 * This works well for keyboards where keys are listed in row-major order.
 */
function clusterByXBreaks(
  keys: Key[],
  posMap: Map<Key, Point>,
  config: PhysicalToLogicalConfig
): Key[][] {
  const rows: Key[][] = [[keys[0]]];

  for (let i = 1; i < keys.length; i++) {
    const current = keys[i];
    const currentPos = posMap.get(current)!;
    const prevPos = posMap.get(keys[i - 1])!;

    // A key starts a new row if its X is significantly less than the previous key
    // (meaning we've "wrapped" to a new row)
    if (currentPos.x < prevPos.x + config.colTolerance) {
      rows.push([current]);
    } else {
      rows[rows.length - 1].push(current);
    }
  }

  // Sort keys within each row by X coordinate
  for (const row of rows) {
    row.sort((a, b) => posMap.get(a)!.x - posMap.get(b)!.x);
  }

  // Sort rows by average Y coordinate
  rows.sort((a, b) => {
    const avgYA = a.reduce((sum, k) => sum + posMap.get(k)!.y, 0) / a.length;
    const avgYB = b.reduce((sum, k) => sum + posMap.get(k)!.y, 0) / b.length;
    return avgYA - avgYB;
  });

  return rows;
}

/**
 * Cluster keys by detecting significant gaps in Y coordinates.
 * Uses statistical analysis to find natural row boundaries.
 */
function clusterByYGaps(
  keys: Key[],
  posMap: Map<Key, Point>,
  config: PhysicalToLogicalConfig
): Key[][] {
  // Create array of keys with positions for sorting
  const keysWithPos = keys.map(k => ({
    key: k,
    pos: posMap.get(k)!,
  }));

  // Sort by Y, then by X
  const sorted = [...keysWithPos].sort((a, b) =>
    (a.pos.y - b.pos.y) || (a.pos.x - b.pos.x)
  );

  // Calculate gaps between consecutive keys (Y-axis only)
  const gaps: { index: number; gap: number }[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].pos.y - sorted[i - 1].pos.y;
    gaps.push({ index: i, gap });
  }

  // Analyze gap distribution to determine row boundaries
  const rowBreaks: number[] = [0]; // Always start at index 0

  // Filter out very small gaps (noise within a row)
  const significantGaps = gaps.filter(g => g.gap > config.colTolerance);

  if (significantGaps.length === 0) {
    // All keys are in roughly the same row (within tolerance)
    rowBreaks.push(sorted.length);
  } else {
    // Determine row boundary threshold based on gap distribution
    const sortedGapValues = significantGaps.map(g => g.gap).sort((a, b) => a - b);

    // Check if gaps are uniform (perfect grid) or varied
    const minGap = sortedGapValues[0];
    const maxGap = sortedGapValues[sortedGapValues.length - 1];
    const gapRange = maxGap - minGap;

    let rowGapThreshold: number;

    if (gapRange < config.colTolerance) {
      // Gaps are uniform - this is likely a perfect grid or uniform stagger
      // All significant gaps are row boundaries
      rowGapThreshold = minGap - 0.001;
    } else {
      // Gaps vary - find the natural break point
      // Look for the largest jump in gap values
      let maxJump = 0;
      let jumpIndex = 0;
      for (let i = 1; i < sortedGapValues.length; i++) {
        const jump = sortedGapValues[i] - sortedGapValues[i - 1];
        if (jump > maxJump) {
          maxJump = jump;
          jumpIndex = i;
        }
      }

      // If there's a significant jump, use the midpoint as threshold
      // Otherwise, use the overall median
      if (maxJump > config.rowTolerance) {
        rowGapThreshold = (sortedGapValues[jumpIndex - 1] + sortedGapValues[jumpIndex]) / 2;
      } else {
        // Use median gap as threshold
        const medianIndex = Math.floor(sortedGapValues.length / 2);
        rowGapThreshold = sortedGapValues[medianIndex];
      }
    }

    // Mark row boundaries where gap exceeds threshold
    for (const g of gaps) {
      if (g.gap >= rowGapThreshold) {
        rowBreaks.push(g.index);
      }
    }
    rowBreaks.push(sorted.length);
  }

  // Split into rows based on breaks
  const rows: Key[][] = [];
  for (let i = 0; i < rowBreaks.length - 1; i++) {
    const start = rowBreaks[i];
    const end = rowBreaks[i + 1];
    const row = sorted.slice(start, end).map(item => item.key);
    if (row.length > 0) {
      rows.push(row);
    }
  }

  // Sort keys within each row by X coordinate
  for (const row of rows) {
    row.sort((a, b) => posMap.get(a)!.x - posMap.get(b)!.x);
  }

  return rows;
}

/**
 * Assign columns to keys using a sweep-line algorithm.
 *
 * The algorithm sweeps from left to right:
 * 1. Find the next key (smallest X) among all rows
 * 2. If it can fit in the current column (no overlap), add it
 * 3. Otherwise, start a new column
 *
 * This produces a minimal grid that respects the physical layout.
 */
function assignColumns(
  rows: Key[][],
  posMap: Map<Key, Point>,
  config: PhysicalToLogicalConfig
): (Key | undefined)[][] {
  const numRows = rows.length;
  const cols: (Key | undefined)[][] = [];
  const rowCursors: number[] = new Array(numRows).fill(0);

  while (true) {
    // Find the key with smallest X among all row cursors
    let minKey: Key | null = null;
    let minRowIndex = -1;
    let minX = Infinity;

    for (let r = 0; r < numRows; r++) {
      const cursor = rowCursors[r];
      if (cursor < rows[r].length) {
        const key = rows[r][cursor];
        const x = posMap.get(key)!.x;
        if (x < minX) {
          minX = x;
          minKey = key;
          minRowIndex = r;
        }
      }
    }

    if (minKey === null) {
      // All keys processed
      break;
    }

    rowCursors[minRowIndex]++;

    // Try to fit this key into the last column
    if (cols.length === 0 || cols[cols.length - 1][minRowIndex] !== undefined) {
      // Need a new column - either first key or row already has a key in last column
      const newCol: (Key | undefined)[] = new Array(numRows).fill(undefined);
      newCol[minRowIndex] = minKey;
      cols.push(newCol);
    } else {
      // Can fit into the last column
      cols[cols.length - 1][minRowIndex] = minKey;
    }
  }

  return cols;
}

export function parsePhysicalLayoutDts(dts: string): Key[] | null {
  const layoutRegex = /\{[^\}]*?compatible *?= *?\"zmk,physical-layout\";.+?\}/s;
  const keyRegex = /&key_physical_attrs\s*\(?(-?\d+)\)?\s*\(?(-?\d+)\)?\s*\(?(-?\d+)\)?\s*\(?(-?\d+)\)?\s*\(?(-?\d+)\)?\s*\(?(-?\d+)\)?\s*\(?(-?\d+)\)?\s*/g;
  const keys: Key[] = [];
  let match;

  if (!dts.includes('zmk,physical-layout')) {
    return null;
  }
  // Prefer extracting the physical layout block first, then falling back
  // to scanning the entire DTS if no keys are found in the block.
  const layoutMatch = layoutRegex.exec(dts);
  const searchTarget = layoutMatch ? layoutMatch[0] : dts;

  keyRegex.lastIndex = 0;
  while ((match = keyRegex.exec(searchTarget)) !== null) {
    const [w, h, x, y, r, rx, ry] = match.slice(1).map(Number);
    keys.push({
      id: ulid(),
      w: w / 100,
      h: h / 100,
      x: x / 100,
      y: y / 100,
      r: r / 100,
      rx: rx / 100,
      ry: ry / 100,
      part: 0,
      row: 0,
      col: 0,
    });
  }

  // If we searched a matched block but found no keys, fallback to scanning full DTS
  if (keys.length === 0 && searchTarget !== dts) {
    keyRegex.lastIndex = 0;
    while ((match = keyRegex.exec(dts)) !== null) {
      const [w, h, x, y, r, rx, ry] = match.slice(1).map(Number);
      keys.push({
        id: ulid(),
        w: w / 100,
        h: h / 100,
        x: x / 100,
        y: y / 100,
        r: r / 100,
        rx: rx / 100,
        ry: ry / 100,
        part: 0,
        row: 0,
        col: 0,
      });
    }
  }

  if (keys.length === 0) {
    return null;
  }

  physicalToLogical(keys, false);
  return keys;
}

export function parseLayoutJson(json: string): Key[] | null {
  try {
    const root = JSON.parse(json);
    if (!root) return null;
    if (!root.layouts) return null;
    console.log(root);
    const firstLayout = Object.values(root.layouts)[0] as any[];
    if (!firstLayout) return null;
    console.log("firstLayout", firstLayout);
    if (!('layout' in firstLayout)) return null;
    const layout = firstLayout['layout'];
    if (!layout || !Array.isArray(layout)) return null;
    if (layout.length === 0) return null;
    console.log("layout", layout);

    const keys: Key[] = [];

    for (const item of layout) {
      const key: Key = {
        id: ulid(),
        part: 0,
        row: ('row' in item && typeof item.row === 'number') ? item.row : -1,
        col: ('col' in item && typeof item.col === 'number') ? item.col : -1,
        w: ('w' in item && typeof item.w === 'number') ? item.w : 1,
        h: ('h' in item && typeof item.h === 'number') ? item.h : 1,
        x: ('x' in item && typeof item.x === 'number') ? item.x : NaN,
        y: ('y' in item && typeof item.y === 'number') ? item.y : NaN,
        r: ('r' in item && typeof item.r === 'number') ? item.r : 0,
        rx: ('rx' in item && typeof item.rx === 'number') ? item.rx : 0,
        ry: ('ry' in item && typeof item.ry === 'number') ? item.ry : 0,
      };

      if (isNaN(key.x) || isNaN(key.y)) {
        // x or y is missing or invalid, cannot use this layout
        console.log("invalid x or y", key.x, key.y);
        return null;
      }

      if (key.w <= 0 || key.h <= 0) {
        // invalid size
        console.log("invalid w or h", key.w, key.h);
        return null;
      }

      if (key.row < 0 || key.col < 0) {
        if ('matrix' in item && Array.isArray(item.matrix) && item.matrix.length === 2
          && typeof item.matrix[0] === 'number' && typeof item.matrix[1] === 'number') {
          key.row = item.matrix[0];
          key.col = item.matrix[1];
        }
      }

      keys.push(key);
    }

    if (keys.length === 0) return null;

    if (keys.some(k => k.row < 0 || k.col < 0)) {
      // key is missing row or col
      console.log("some keys are missing row or col, running physicalToLogical");
      physicalToLogical(keys, false);
    } else {
      for (let i = 1; i < keys.length; i++) {
        // ensure keys are sorted by row then col
        if ((keys[i].row < keys[i - 1].row) || (keys[i].row === keys[i - 1].row && keys[i].col <= keys[i - 1].col)) {
          // row is smaller than previous key's row
          // or row is the same but col is smaller but col is not greater
          console.log("keys are not properly ordered, running physicalToLogical");
          physicalToLogical(keys, false);
          break;
        }
      }
    }

    return keys;
  } catch (e) {
    return null;
  }
}

export function parseKLE(json: string): Key[] | null {
  try {
    const root = JSON.parse(json);

    const kle = ((): any[] | null => {
      if (Array.isArray(root)) {
        if (root.length === 0) return null;
        // raw KLE array
        return root;
      }

      if (typeof root === 'object' && root !== null
        && 'layouts' in root && typeof root.layouts === 'object' && root.layouts !== null
        && 'keymap' in root.layouts && Array.isArray(root.layouts.keymap) && root.layouts.keymap.length > 0) {
        // VIA/VIAL format
        return root.layouts.keymap;
      }

      return null;
    })();


    if (!kle) return null;
    const parsed = Serial.deserialize(kle);

    if (!parsed || !parsed.keys || parsed.keys.length === 0) {
      return null;
    }

    // Build keys, attempt best-effort row/col parsing from label text
    const keys = parsed.keys.map(k => {
      let row = -1;
      let col = -1;

      // Try to find a label like "r,c" or "r/c" or "r x c"
      const sepRegex = /\s*(-?\d+)\s*[,/x]\s*(-?\d+)\s*$/i;
      const labelCandidate = (k.labels || []).find(l => typeof l === 'string' && l.trim().length > 0);
      if (labelCandidate) {
        const m = labelCandidate.trim().match(sepRegex);
        if (m) {
          row = parseInt(m[1], 10);
          col = parseInt(m[2], 10);
        }
      }

      return {
        id: ulid(),
        part: 0,
        row,
        col,
        w: k.width,
        h: k.height,
        x: k.x,
        y: k.y,
        r: k.rotation_angle,
        rx: k.rotation_x,
        ry: k.rotation_y,
      } as Key;
    });

    // If any rows/cols are missing, infer from physical positions
    if (keys.some(k => k.row < 0 || k.col < 0)) {
      physicalToLogical(keys, false);
    } else {
      // sort by row/col to ensure ordering
      keys.sort((a, b) => (a.row - b.row) || (a.col - b.col));
    }

    // Sanity check: too many rows vs physical height -> allow reordering
    const totalHeightPhysical = Math.max(...keys.map(k => k.y + k.h)) - Math.min(...keys.map(k => k.y));
    const totalRows = Math.max(...keys.map(k => k.row)) + 1;
    if (totalRows > (totalHeightPhysical * 2)) {
      // Likely garbage; recompute allowing reordering
      physicalToLogical(keys, true);
    }

    return keys;
  } catch (e) {
    return null;
  }
}

export function toKLE(keys: Key[]): string {
  if (!keys.length) return "[]";

  const kle = new KLEKeyboard();

  keys.forEach(k => {
    const key = new KLEKey();
    key.width = k.w;
    key.height = k.h;
    key.x = k.x;
    key.y = k.y;
    key.rotation_angle = k.r;
    key.rotation_x = k.rx;
    key.rotation_y = k.ry;
    key.labels[0] = k.row + "," + k.col;
    kle.keys.push(key);
  });

  return JSON.stringify(Serial.serialize(kle));
}
