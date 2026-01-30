import { ulid } from "ulidx";
import { keyCenter, type Point } from "~/lib/geometry";
import type { Key } from "../typedef";
import { Serial } from "./kle-serial";
import { Keyboard as KLEKeyboard, Key as KLEKey } from "./kle-serial";

/**
 * Interface for a key with its computed center position.
 */
interface KeyWithCenter {
  key: Key;
  center: Point;
}

/**
 * Cluster values using a tolerance threshold.
 * Uses the cluster's maximum value for distance comparison to prevent cluster drift.
 * Returns array of cluster representative values (mean of each cluster).
 */
function clusterValues(values: number[], tolerance: number): number[] {
  if (values.length === 0) return [];

  const sorted = [...values].sort((a, b) => a - b);
  const clusters: number[][] = [[sorted[0]]];

  for (let i = 1; i < sorted.length; i++) {
    const lastCluster = clusters[clusters.length - 1];
    // Use cluster max to prevent drift as cluster grows
    const clusterMax = Math.max(...lastCluster);

    if (sorted[i] - clusterMax <= tolerance) {
      lastCluster.push(sorted[i]);
    } else {
      clusters.push([sorted[i]]);
    }
  }

  // Return the mean of each cluster
  return clusters.map(cluster => cluster.reduce((a, b) => a + b, 0) / cluster.length);
}

/**
 * Find the closest cluster index for a given value.
 */
function findClosestCluster(value: number, clusterCenters: number[]): number {
  let minDist = Infinity;
  let minIndex = 0;
  for (let i = 0; i < clusterCenters.length; i++) {
    const dist = Math.abs(value - clusterCenters[i]);
    if (dist < minDist) {
      minDist = dist;
      minIndex = i;
    }
  }
  return minIndex;
}

/**
 * Convert physical layout positions to logical row/col grid positions.
 *
 * Algorithm overview:
 * 1. Compute the center point of each key (accounting for rotation).
 * 2. Cluster Y-coordinates to identify logical rows.
 * 3. Group keys by row and sort by X within each row.
 * 4. Cluster X-coordinates globally to identify logical columns.
 * 5. Assign keys to grid columns, resolving conflicts by finding nearest available.
 * 6. Compact grid by removing empty columns.
 * 7. Assign row/col to each key and sort.
 *
 * @param keys - Array of keys to convert (modified in place)
 * @param _ignoreOrder - Kept for API compatibility; this algorithm is position-based
 *                       and produces the same result regardless of input order
 */
export function physicalToLogical(keys: Key[], _ignoreOrder: boolean): void {
  if (keys.length === 0) return;

  // Step 1: Compute center points for all keys
  const keysWithCenters: KeyWithCenter[] = keys.map(k => ({
    key: k,
    center: keyCenter(k, { keySize: 1 }),
  }));

  // Normalize coordinates to start from 0
  const minX = Math.min(...keysWithCenters.map(k => k.center.x));
  const minY = Math.min(...keysWithCenters.map(k => k.center.y));
  keysWithCenters.forEach(k => {
    k.center.x -= minX;
    k.center.y -= minY;
  });

  // Step 2: Cluster Y-coordinates to identify logical rows
  // Use a tolerance of 0.5 units (half a standard key) for row clustering
  const yValues = keysWithCenters.map(k => k.center.y);
  const rowCenters = clusterValues(yValues, 0.5);

  // Map each key to its row
  const keyToRow = new Map<Key, number>();
  for (const kwc of keysWithCenters) {
    const rowIndex = findClosestCluster(kwc.center.y, rowCenters);
    keyToRow.set(kwc.key, rowIndex);
  }

  // Step 3: Group keys by row and sort by X within each row
  const rowGroups: KeyWithCenter[][] = rowCenters.map(() => []);
  for (const kwc of keysWithCenters) {
    const rowIndex = keyToRow.get(kwc.key)!;
    rowGroups[rowIndex].push(kwc);
  }

  // Sort keys within each row by X coordinate
  for (const group of rowGroups) {
    group.sort((a, b) => a.center.x - b.center.x);
  }

  // Step 4: Cluster X coordinates globally
  const xCoords = rowGroups.flatMap(group => group.map(kwc => kwc.center.x));
  const colCenters = clusterValues(xCoords, 0.5);

  // Step 5: Assign columns to keys
  // For each row, assign each key to the closest column cluster
  // Ensure no two keys in the same row get the same column
  const grid: (Key | undefined)[][] = colCenters.map(() =>
    new Array(rowGroups.length).fill(undefined)
  );

  for (let r = 0; r < rowGroups.length; r++) {
    const rowKeys = rowGroups[r];
    const usedCols = new Set<number>();

    for (const kwc of rowKeys) {
      let colIndex = findClosestCluster(kwc.center.x, colCenters);

      // If this column is already used in this row, find the nearest available column
      if (usedCols.has(colIndex)) {
        // Search for nearest available column (alternating left/right)
        let offset = 1;
        while (true) {
          // Try right first
          const rightIdx = colIndex + offset;
          if (rightIdx < grid.length && !usedCols.has(rightIdx)) {
            colIndex = rightIdx;
            break;
          }
          // Try left
          const leftIdx = colIndex - offset;
          if (leftIdx >= 0 && !usedCols.has(leftIdx)) {
            colIndex = leftIdx;
            break;
          }
          // If we've exceeded grid bounds on both sides, extend the grid
          if (rightIdx >= grid.length && leftIdx < 0) {
            grid.push(new Array(rowGroups.length).fill(undefined));
            colIndex = grid.length - 1;
            break;
          }
          offset++;
        }
      }

      grid[colIndex][r] = kwc.key;
      usedCols.add(colIndex);
    }
  }

  // Step 6: Remove empty columns and compact the grid
  const compactGrid: (Key | undefined)[][] = [];
  for (let c = 0; c < grid.length; c++) {
    if (grid[c].some(k => k !== undefined)) {
      compactGrid.push(grid[c]);
    }
  }

  // Step 7: Assign row and col to each key
  for (let c = 0; c < compactGrid.length; c++) {
    for (let r = 0; r < compactGrid[c].length; r++) {
      const key = compactGrid[c][r];
      if (key) {
        key.row = r;
        key.col = c;
      }
    }
  }

  // Sort keys by row then col
  keys.sort((a, b) => (a.row - b.row) || (a.col - b.col));
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
