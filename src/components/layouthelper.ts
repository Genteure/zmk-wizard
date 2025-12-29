import { ulid } from "ulidx";
import { keyCenter, type Point } from "~/lib/geometry";
import type { Key } from "../typedef";
import { Serial } from "./kle-serial";

export function physicalToLogical(keys: Key[], ignoreOrder: boolean): void {
  if (keys.length === 0) return;

  // use center point as key position
  // normalize y to start from 0
  const posList = keys.map(k => keyCenter(k, { keySize: 1 }));
  const minPosY = Math.min(...posList.map(p => p.y));
  posList.forEach(p => p.y -= minPosY);
  const posMap = new Map<Key, Point>(keys.map((k, i) => [k, posList[i]]));

  if (ignoreOrder) {
    // sort keys by y (vertical) grouped to integer, then by x (horizontal)
    // TODO optimize for column staggered layouts
    keys.sort(
      (a, b) =>
        (Math.floor(posMap.get(a)?.y ?? 0) - Math.floor(posMap.get(b)?.y ?? 0)) ||
        ((posMap.get(a)?.x ?? 0) - (posMap.get(b)?.x ?? 0))
    );
  }

  // step 1: group keys into logical rows based on x coordinate breaks

  const rows: Key[][] = [[]];
  rows[0].push(keys[0]);
  for (let i = 1; i < keys.length; i++) {
    const current = keys[i];
    const currentPos = posMap.get(current);
    const prevPos = posMap.get(keys[i - 1]);
    // for a key to be in the same row,
    // its x must be at least 0.4 greater than the previous key's x
    if (!currentPos || !prevPos) continue; // should not happen
    // if (currentPos.y > (prevPos.y + 0.4)) {
    if (currentPos.x < (prevPos.x + 0.4)) {
      // new row
      rows.push([current]);
    } else {
      // same row
      rows[rows.length - 1].push(current);
    }
  }

  // step 2: match cols based on x coordinate
  // TODO somehow make it more symmetric

  /**
   * cols[c] = Array(rows.length)
   * For example, a key from row[r] can only be in cols[any][r]
   */
  const cols: (Key | undefined)[][] = [[]];
  /**
   * cursors for each row to track which key has been assigned to a column
   */
  const rowCursors: number[] = new Array(rows.length).fill(0);

  while (true) {
    // find the next key with the smallest x among the row cursors
    let minKey: Key | null = null;
    let minRowIndex = -1;
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      const cursor = rowCursors[r];
      if (cursor < row.length) {
        const key = row[cursor];
        const keyPos = posMap.get(key);
        if (!keyPos) continue; // should not happen
        if (minKey === null || keyPos.x < (posMap.get(minKey)?.x ?? Infinity)) {
          minKey = key;
          minRowIndex = r;
        }
      }
    }
    if (minKey === null) {
      // all keys are exhausted
      break;
    }

    rowCursors[minRowIndex]++;

    // check if minKey can fit into an existing column
    if (cols[cols.length - 1][minRowIndex]) {
      // last column already has a key from this row
      // need to create a new column
      const newCol: (Key | undefined)[] = [];
      newCol[minRowIndex] = minKey;
      cols.push(newCol);
    } else {
      // can fit into the last column
      cols[cols.length - 1][minRowIndex] = minKey;
    }
  }

  // step 3: assign row and col to each key and sort
  for (let c = 0; c < cols.length; c++) {
    const col = cols[c];
    for (let r = 0; r < col.length; r++) {
      const key = col[r];
      if (key) {
        key.row = r;
        key.col = c;
      }
    }
  }
  keys.sort((a, b) => (a.row - b.row) || (a.col - b.col));
}

const dtsRegex = /&key_physical_attrs\s*\(?(-?\d+)\)?\s*\(?(-?\d+)\)?\s*\(?(-?\d+)\)?\s*\(?(-?\d+)\)?\s*\(?(-?\d+)\)?\s*\(?(-?\d+)\)?\s*\(?(-?\d+)\)?\s*/g;
export function parsePhysicalLayoutDts(dts: string): Key[] | null {
  const keys: Key[] = [];
  let match;

  if (!dts.includes('zmk,physical-layout')) {
    return null;
  }

  while ((match = dtsRegex.exec(dts)) !== null) {
    const [w, h, x, y, r, rx, ry] = match.slice(1).map(Number);
    keys.push({
      id: ulid(),
      // w, h, x, y, r, rx, ry,
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
    if (!Array.isArray(root) || root.length === 0) return null;

    const parsed = Serial.deserialize(root);

    if (!parsed || !parsed.keys || parsed.keys.length === 0) {
      return null;
    }

    const keys = parsed.keys.map(k => ({
      id: ulid(),
      part: 0,
      row: 0,
      col: 0,
      w: k.width,
      h: k.height,
      x: k.x,
      y: k.y,
      r: k.rotation_angle,
      rx: k.rotation_x,
      ry: k.rotation_y,
    }));

    physicalToLogical(keys, false);

    // total height of the entire layout = max y - min y
    const totalHeightPhysical = Math.max(...keys.map(k => k.y + k.h)) - Math.min(...keys.map(k => k.y));
    const totalRows = Math.max(...keys.map(k => k.row)) + 1;

    // if we have wayy too many rows compared to physical height, likely the row/col info is garbage
    if (totalRows > (totalHeightPhysical * 2)) {
      console.log("too many rows compared to physical height, rerunning physicalToLogical");
      physicalToLogical(keys, true); // allow reordering
    }

    return keys;
  } catch (e) {
    return null;
  }
}
