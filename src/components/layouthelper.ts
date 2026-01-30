import { ulid } from "ulidx";
import type { Key } from "../typedef";
import { Serial } from "./kle-serial";
import { Keyboard as KLEKeyboard, Key as KLEKey } from "./kle-serial";

// Re-export from the dedicated module
export { physicalToLogical } from "~/lib/physicalToLogical";

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
