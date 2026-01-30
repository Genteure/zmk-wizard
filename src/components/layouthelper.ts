import { ulid } from "ulidx";
import { keyCenter, keyToPolygon, type Point } from "~/lib/geometry";
import type { Key } from "../typedef";
import { Serial } from "./kle-serial";
import { Keyboard as KLEKeyboard, Key as KLEKey } from "./kle-serial";

/**
 * Convert physical layout positions to logical row/column grid.
 * Uses ray-casting and clustering to determine key relationships.
 *
 * @param keys - Array of keys with physical layout data (x, y, w, h, r, rx, ry)
 * @param _allowReorder - Currently unused, kept for API compatibility
 */
export function physicalToLogical(keys: Key[], _allowReorder = false): void {
  if (keys.length === 0) return;

  // Get transformed centers for each key (accounting for rotation)
  const keyData = keys.map((key, index) => {
    const center = keyCenter(key, { keySize: 1 });
    const polygon = keyToPolygon(key, { keySize: 1 });

    // Compute bounding box from polygon
    const xValues = polygon.map(p => p.x);
    const yValues = polygon.map(p => p.y);
    const minX = Math.min(...xValues);
    const maxX = Math.max(...xValues);
    const minY = Math.min(...yValues);
    const maxY = Math.max(...yValues);

    return {
      index,
      key,
      center,
      minX,
      maxX,
      minY,
      maxY,
      // Effective width/height after rotation
      effectiveWidth: maxX - minX,
      effectiveHeight: maxY - minY,
    };
  });

  // Find row clusters using horizontal ray-casting
  const rowClusters = findRowClusters(keyData);

  // Assign row indices first
  const sortedRowClusters = [...rowClusters].sort((a, b) => {
    const avgYA = average(a.map(k => k.center.y));
    const avgYB = average(b.map(k => k.center.y));
    return avgYA - avgYB;
  });

  const keyToRow = new Map<number, number>();
  sortedRowClusters.forEach((cluster, rowIndex) => {
    for (const k of cluster) {
      keyToRow.set(k.index, rowIndex);
    }
  });

  // Assign columns within each row based on X position
  // This ensures staggered keyboards get proper column assignments
  const keyToCol = new Map<number, number>();

  for (const rowCluster of sortedRowClusters) {
    // Sort keys in this row by X position
    const sortedInRow = [...rowCluster].sort((a, b) => a.center.x - b.center.x);

    // Assign columns based on sorted order within the row
    sortedInRow.forEach((k, colIndex) => {
      keyToCol.set(k.index, colIndex);
    });
  }

  // Apply row and column assignments
  for (let i = 0; i < keys.length; i++) {
    keys[i].row = keyToRow.get(i) ?? 0;
    keys[i].col = keyToCol.get(i) ?? 0;
  }

  // Sort keys by row then column
  keys.sort((a, b) => (a.row - b.row) || (a.col - b.col));
}

interface KeyData {
  index: number;
  key: Key;
  center: Point;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  effectiveWidth: number;
  effectiveHeight: number;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Find row clusters by ray-casting horizontally.
 * Keys that can be connected by a horizontal line through their centers belong to the same row.
 */
function findRowClusters(keyData: KeyData[]): KeyData[][] {
  if (keyData.length === 0) return [];

  // Sort keys by Y center
  const sortedByY = [...keyData].sort((a, b) => a.center.y - b.center.y);

  // Use Union-Find for clustering
  const parent = new Map<number, number>();
  for (const k of keyData) {
    parent.set(k.index, k.index);
  }

  function find(x: number): number {
    if (parent.get(x) !== x) {
      parent.set(x, find(parent.get(x)!));
    }
    return parent.get(x)!;
  }

  function union(x: number, y: number): void {
    const rootX = find(x);
    const rootY = find(y);
    if (rootX !== rootY) {
      parent.set(rootX, rootY);
    }
  }

  // Group keys that have overlapping Y ranges (within tolerance)
  // This implements horizontal ray-casting: if a horizontal ray can pass through both keys,
  // they are potentially in the same row
  for (let i = 0; i < sortedByY.length; i++) {
    const ki = sortedByY[i];
    for (let j = i + 1; j < sortedByY.length; j++) {
      const kj = sortedByY[j];

      // Check if their Y ranges overlap
      // Use center-based approach with tolerance based on key height
      const tolerance = Math.min(ki.effectiveHeight, kj.effectiveHeight) * 0.4;
      if (Math.abs(ki.center.y - kj.center.y) <= tolerance) {
        union(ki.index, kj.index);
      }
    }
  }

  // Build clusters
  const clusters = new Map<number, KeyData[]>();
  for (const k of keyData) {
    const root = find(k.index);
    if (!clusters.has(root)) {
      clusters.set(root, []);
    }
    clusters.get(root)!.push(k);
  }

  return Array.from(clusters.values());
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
