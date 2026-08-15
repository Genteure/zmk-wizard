import { ulid } from 'ulidx';
import { keyCenter } from '~/types/geometry';
import type { Key, KeyId } from '~/types';
import { gridfit, type Rect } from '~/lib/autolayout';
import { Serial, Keyboard as KLEKeyboard, Key as KLEKey } from './kle-serial';

/**
 * Convert physical key positions to logical row/col layout.
 *
 * Uses the gridfit pipeline (`findNeighbors` → `bridgeSets` → `layout`):
 * neighbor relations are derived from the physical geometry of the keys,
 * then every key is assigned a unique `(row, col)` cell such that keys to
 * the left get a smaller col and keys above get a smaller row.
 *
 * The `ignoreOrder` parameter is kept for API compatibility; the algorithm
 * derives ordering from geometry, so the input order does not matter.
 * Mutates the keys array in place and sorts by row then col.
 */
export function physicalToLogical(keys: Key[], _ignoreOrder: boolean): void {
  if (keys.length === 0) return;

  // Normalize each Key into a Rect: centered coordinates (accounting for
  // rotation), unrotated size, and clockwise rotation in degrees.
  const rects: Rect[] = keys.map((k) => {
    const kc = keyCenter(k, { keySize: 1 });
    return { id: k.id, x: kc.x, y: kc.y, width: k.w, height: k.h, degree: k.r };
  });

  const fitted = gridfit({ objects: rects, threshold: 0.1 });

  for (const key of keys) {
    const pos = fitted.positions.get(key.id);
    if (pos) {
      key.row = pos.row;
      key.col = pos.col;
    }
    else {
      key.row = 0;
      key.col = 0;
    }
  }
  keys.sort((a, b) => (a.row - b.row) || (a.col - b.col));
}

/**
 * Result of parsing an imported physical layout, carrying both possible
 * keymap row/col assignments so the caller can let the user choose:
 *
 * - `original`: row/col values that were part of the imported data.
 * - `generated`: row/col values produced from physical geometry by
 *   {@link physicalToLogical}.
 */
export interface ImportedLayout {
  /** Whether the imported data provided row/col for every key. */
  hasRowCol: boolean;
  /** Keys with the imported row/col values, sorted by row then col. `null` when `hasRowCol` is false. */
  original: Key[] | null;
  /** Keys with algorithm-generated row/col values, sorted by row then col. */
  generated: Key[];
}

/** Sort a copy of `keys` by row then col. */
function sortKeysByRowCol(keys: readonly Key[]): Key[] {
  return [...keys].sort((a, b) => (a.row - b.row) || (a.col - b.col));
}

/**
 * Build the original/generated candidate pair for a parsed key array.
 * Never mutates the input array.
 */
function buildImportedLayout(keys: Key[], hasRowCol: boolean): ImportedLayout {
  const generated = structuredClone(keys);
  physicalToLogical(generated, false);

  if (!hasRowCol) {
    return { hasRowCol: false, original: null, generated };
  }

  return {
    hasRowCol: true,
    original: sortKeysByRowCol(keys),
    generated,
  };
}

/** Parse a ZMK Physical Layout DTS without assigning generated row/col yet. */
function parsePhysicalLayoutDtsRaw(dts: string): Key[] | null {
  const layoutRegex = /\{[^}]*?compatible *?= *?"zmk,physical-layout";.+?\}/s;
  const keyRegex = /&key_physical_attrs\s*\(?(-?\d+)\)?\s*\(?(-?\d+)\)?\s*\(?(-?\d+)\)?\s*\(?(-?\d+)\)?\s*\(?(-?\d+)\)?\s*\(?(-?\d+)\)?\s*\(?(-?\d+)\)?\s*/g;
  const keys: Key[] = [];
  let match: RegExpExecArray | null;

  if (!dts.includes('zmk,physical-layout')) {
    return null;
  }

  const layoutMatch = layoutRegex.exec(dts);
  const searchTarget = layoutMatch ? layoutMatch[0] : dts;

  keyRegex.lastIndex = 0;
  while ((match = keyRegex.exec(searchTarget)) !== null) {
    const [w, h, x, y, r, rx, ry] = match.slice(1).map(Number);
    const finalRx = rx === x ? 0 : rx;
    const finalRy = ry === y ? 0 : ry;
    keys.push({
      id: ulid() as KeyId,
      w: w / 100,
      h: h / 100,
      x: x / 100,
      y: y / 100,
      r: r / 100,
      rx: finalRx / 100,
      ry: finalRy / 100,
      part: 0,
      row: 0,
      col: 0,
    });
  }

  if (keys.length === 0 && searchTarget !== dts) {
    keyRegex.lastIndex = 0;
    while ((match = keyRegex.exec(dts)) !== null) {
      const [w, h, x, y, r, rx, ry] = match.slice(1).map(Number);
      keys.push({
        id: ulid() as KeyId,
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

  return keys.length > 0 ? keys : null;
}

/**
 * Parse ZMK Physical Layout DTS text into Key array.
 */
export function parsePhysicalLayoutDts(dts: string): Key[] | null {
  const keys = parsePhysicalLayoutDtsRaw(dts);
  if (!keys) return null;

  physicalToLogical(keys, false);
  return keys;
}

/**
 * Parse ZMK Physical Layout DTS text into import candidates.
 * Physical Layout DTS never carries row/col data, so only the generated
 * candidate exists.
 */
export function parsePhysicalLayoutDtsWithChoice(dts: string): ImportedLayout | null {
  const keys = parsePhysicalLayoutDtsRaw(dts);
  if (!keys) return null;

  return buildImportedLayout(keys, false);
}

/** Guard: check if value is a non-null object */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Guard: check if value is an array */
function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/** Guard: check if value is a number (finite) */
function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

interface ParsedLayoutJson {
  keys: Key[];
  hasRowCol: boolean;
}

/**
 * Parse QMK-like layout JSON without applying a row/col strategy.
 * Expected format: { "layouts": { "name": { "layout": [...] } } }
 */
function parseLayoutJsonRaw(json: string): ParsedLayoutJson | null {
  const root: unknown = JSON.parse(json);
  if (!isRecord(root)) return null;

  const layouts = root.layouts;
  if (!isRecord(layouts)) return null;

  const firstLayoutName = Object.keys(layouts)[0];
  if (!firstLayoutName) return null;

  const firstLayout = layouts[firstLayoutName];
  if (!isRecord(firstLayout)) return null;

  const layout = firstLayout.layout;
  if (!isArray(layout) || layout.length === 0) return null;

  const keys: Key[] = [];
  let hasRowCol = true;

  for (const item of layout) {
    if (!isRecord(item)) return null;

    const row = isNumber(item.row) ? item.row : -1;
    const col = isNumber(item.col) ? item.col : -1;
    const w = isNumber(item.w) && item.w > 0 ? item.w : 1;
    const h = isNumber(item.h) && item.h > 0 ? item.h : 1;
    const x = isNumber(item.x) ? item.x : NaN;
    const y = isNumber(item.y) ? item.y : NaN;
    const r = isNumber(item.r) ? item.r : 0;
    const rx = isNumber(item.rx) ? item.rx : 0;
    const ry = isNumber(item.ry) ? item.ry : 0;

    if (isNaN(x) || isNaN(y)) return null;
    if (w <= 0 || h <= 0) return null;

    let finalRow = row;
    let finalCol = col;

    if (finalRow < 0 || finalCol < 0) {
      const matrix = item.matrix;
      if (isArray(matrix) && matrix.length === 2
        && isNumber(matrix[0]) && isNumber(matrix[1])) {
        finalRow = matrix[0];
        finalCol = matrix[1];
      }
    }

    if (finalRow < 0 || finalCol < 0) {
      hasRowCol = false;
    }

    keys.push({
      id: ulid() as KeyId,
      part: 0,
      row: finalRow,
      col: finalCol,
      w, h, x, y, r, rx, ry,
    });
  }

  if (keys.length === 0) return null;

  return { keys, hasRowCol };
}

/**
 * Parse QMK-like layout JSON into Key array.
 * Expected format: { "layouts": { "name": { "layout": [...] } } }
 */
export function parseLayoutJson(json: string): Key[] | null {
  try {
    const parsed = parseLayoutJsonRaw(json);
    if (!parsed) return null;
    const { keys, hasRowCol } = parsed;

    if (!hasRowCol) {
      physicalToLogical(keys, false);
      return keys;
    }

    for (let i = 1; i < keys.length; i++) {
      if ((keys[i].row < keys[i - 1].row) || (keys[i].row === keys[i - 1].row && keys[i].col <= keys[i - 1].col)) {
        physicalToLogical(keys, false);
        break;
      }
    }

    return keys;
  }
  catch {
    return null;
  }
}

/**
 * Parse QMK-like layout JSON into original/generated import candidates.
 */
export function parseLayoutJsonWithChoice(json: string): ImportedLayout | null {
  try {
    const parsed = parseLayoutJsonRaw(json);
    if (!parsed) return null;

    return buildImportedLayout(parsed.keys, parsed.hasRowCol);
  }
  catch {
    return null;
  }
}

interface ParsedKleJson {
  keys: Key[];
  hasRowCol: boolean;
}

/**
 * Parse KLE / VIA / VIAL JSON without applying a row/col strategy.
 */
function parseKleJsonRaw(json: string): ParsedKleJson | null {
  const root: unknown = JSON.parse(json);

  let kleArray: unknown;
  if (isArray(root)) {
    if (root.length === 0) return null;
    kleArray = root;
  }
  else if (isRecord(root) && 'layouts' in root && isRecord(root.layouts) && 'keymap' in root.layouts && isArray(root.layouts.keymap) && root.layouts.keymap.length > 0) {
    kleArray = root.layouts.keymap;
  }

  if (!kleArray || !isArray(kleArray)) return null;

  const parsed = Serial.deserialize(kleArray as Parameters<typeof Serial.deserialize>[0]);
  if (!parsed || !parsed.keys || parsed.keys.length === 0) return null;

  const sepRegex = /\s*(-?\d+)\s*[,/x]\s*(-?\d+)\s*$/i;

  const keys: Key[] = parsed.keys.map((k) => {
    let row = -1;
    let col = -1;

    const labelCandidate = (k.labels || []).find((l): l is string => typeof l === 'string' && l.trim().length > 0);
    if (labelCandidate) {
      const m = labelCandidate.trim().match(sepRegex);
      if (m) {
        row = parseInt(m[1], 10);
        col = parseInt(m[2], 10);
      }
    }

    return {
      id: ulid() as KeyId,
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
    } satisfies Key;
  });

  return { keys, hasRowCol: keys.every(k => k.row >= 0 && k.col >= 0) };
}

/**
 * Parse KLE / VIA / VIAL JSON into Key array.
 */
export function parseKleJson(json: string): Key[] | null {
  try {
    const parsed = parseKleJsonRaw(json);
    if (!parsed) return null;
    const { keys, hasRowCol } = parsed;

    if (!hasRowCol) {
      physicalToLogical(keys, false);
    }
    else {
      keys.sort((a, b) => (a.row - b.row) || (a.col - b.col));
    }

    const totalHeightPhysical = Math.max(...keys.map(k => k.y + k.h)) - Math.min(...keys.map(k => k.y));
    const totalRows = Math.max(...keys.map(k => k.row)) + 1;
    if (totalRows > (totalHeightPhysical * 2)) {
      physicalToLogical(keys, true);
    }

    return keys;
  }
  catch {
    return null;
  }
}

/**
 * Parse KLE / VIA / VIAL JSON into original/generated import candidates.
 */
export function parseKleJsonWithChoice(json: string): ImportedLayout | null {
  try {
    const parsed = parseKleJsonRaw(json);
    if (!parsed) return null;

    return buildImportedLayout(parsed.keys, parsed.hasRowCol);
  }
  catch {
    return null;
  }
}

/** Parse CSV without applying a row/col strategy. */
function parseCsvRaw(csv: string): Key[] | null {
  const lines = csv.trim().split('\n').filter(line => line.trim().length > 0);
  if (lines.length < 2) return null;

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const required = ['row', 'col', 'x', 'y', 'w', 'h'];
  for (const field of required) {
    if (!headers.includes(field)) return null;
  }

  const ri = headers.indexOf('row');
  const ci = headers.indexOf('col');
  const xi = headers.indexOf('x');
  const yi = headers.indexOf('y');
  const wi = headers.indexOf('w');
  const hi = headers.indexOf('h');
  const rIdx = headers.indexOf('r');
  const rxi = headers.indexOf('rx');
  const ryi = headers.indexOf('ry');
  const partIdx = headers.indexOf('part');

  const keys: Key[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim());
    if (cols.length < headers.length) continue;

    const row = parseInt(cols[ri], 10);
    const col = parseInt(cols[ci], 10);
    const x = parseFloat(cols[xi]);
    const y = parseFloat(cols[yi]);
    const w = parseFloat(cols[wi]) || 1;
    const h = parseFloat(cols[hi]) || 1;

    if (isNaN(row) || isNaN(col) || isNaN(x) || isNaN(y)) return null;
    if (w <= 0 || h <= 0) return null;

    keys.push({
      id: ulid() as KeyId,
      row,
      col,
      x, y, w, h,
      r: rIdx >= 0 ? (parseFloat(cols[rIdx]) || 0) : 0,
      rx: rxi >= 0 ? (parseFloat(cols[rxi]) || 0) : 0,
      ry: ryi >= 0 ? (parseFloat(cols[ryi]) || 0) : 0,
      part: partIdx >= 0 ? (parseInt(cols[partIdx], 10) || 0) : 0,
    });
  }

  return keys.length > 0 ? keys : null;
}

/**
 * Parse CSV text into Key array.
 * Expected headers: row,col,x,y,w,h,r,rx,ry[,part]
 * The `part` column is optional and defaults to 0.
 */
export function parseCsv(csv: string): Key[] | null {
  return parseCsvRaw(csv);
}

/**
 * Parse CSV text into original/generated import candidates.
 * CSV always carries row/col data (they are required headers).
 */
export function parseCsvWithChoice(csv: string): ImportedLayout | null {
  const keys = parseCsvRaw(csv);
  if (!keys) return null;

  return buildImportedLayout(keys, true);
}

// ── Export helpers (counterparts to parse functions above) ──

/**
 * Export keyboard layout to KLE JSON string.
 */
export function exportKleJson(keys: Key[]): string {
  if (!keys.length) return '[]';

  const kle = new KLEKeyboard();

  keys.forEach((k) => {
    const key = new KLEKey();
    key.width = k.w;
    key.height = k.h;
    key.x = k.x;
    key.y = k.y;
    key.rotation_angle = k.r;
    key.rotation_x = k.rx;
    key.rotation_y = k.ry;
    key.labels[0] = k.row + ',' + k.col;
    kle.keys.push(key);
  });

  return JSON.stringify(Serial.serialize(kle));
}

/**
 * Export keyboard layout to CSV string.
 * Includes `part` column only if any key has a non-zero part.
 */
export function exportCsv(keys: Key[]): string {
  if (!keys.length) return '';

  const hasPart = keys.some(k => k.part !== 0);
  const headers = ['row', 'col', 'x', 'y', 'w', 'h', 'r', 'rx', 'ry'];
  if (hasPart) headers.push('part');

  const lines = [headers.join(',')];

  for (const k of keys) {
    const row = [k.row, k.col, k.x, k.y, k.w, k.h, k.r, k.rx, k.ry];
    if (hasPart) row.push(k.part);
    lines.push(row.join(','));
  }

  return lines.join('\n') + '\n';
}
