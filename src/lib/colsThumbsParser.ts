/**
 * Cols+Thumbs notation parser and layout generator.
 *
 * Parses a notation string and returns two layout representations:
 *   - physical: decimal coordinates representing actual key positions
 *   - keymap:   integer coordinates for firmware key assignment (collision-free)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface KeyEntry {
  count: number;       // 1–9
  modifiers: string[]; // normalized lowercase: v d ^ u > r < l
}

interface PlacedKey {
  origX: number;       // structural position before normalization
  origY: number;       // (preserved for keymap computation)
  offsetX: number;     // modifier displacement
  offsetY: number;
  physBaseX: number;   // structural position after normalization + section offset
  physBaseY: number;
}

interface Section {
  columnPart: KeyEntry[] | null;
  leftThumbs: KeyEntry[];
  rightThumbs: KeyEntry[];
}

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const VALID_CHARS = new Set("123456789vVdD^uUrRlL<>+ _");
const SEPARATOR = /[ _]+/;

function isVerticalMod(ch: string): boolean {
  return ch === "v" || ch === "d" || ch === "^" || ch === "u";
}

function isHorizontalMod(ch: string): boolean {
  return ch === ">" || ch === "r" || ch === "<" || ch === "l";
}

function netVerticalShift(mods: string[]): number {
  let delta = 0;
  for (const m of mods) {
    if (m === "v" || m === "d") delta++;
    else if (m === "^" || m === "u") delta--;
  }
  return delta * 0.5;
}

function netHorizontalShift(mods: string[]): number {
  let delta = 0;
  for (const m of mods) {
    if (m === ">" || m === "r") delta++;
    else if (m === "<" || m === "l") delta--;
  }
  return delta * 0.5;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/** Parse a chunk string into entries. Each digit (1–9) starts a new entry. */
function parseChunk(raw: string): KeyEntry[] {
  if (raw.length === 0) throw new Error("Empty chunk");
  if (!(raw[0] >= "1" && raw[0] <= "9")) {
    throw new Error(`Chunk must start with a digit (1–9): "${raw}"`);
  }

  const entries: KeyEntry[] = [];
  let i = 0;

  while (i < raw.length) {
    entries.push({ count: parseInt(raw[i], 10), modifiers: [] });
    i++;
    while (i < raw.length) {
      const m = raw[i].toLowerCase();
      if (isVerticalMod(m) || isHorizontalMod(m)) {
        entries[entries.length - 1].modifiers.push(m);
        i++;
      } else {
        break;
      }
    }
  }

  return entries;
}

/** Tokenize, classify, and validate the notation into sections. */
function parseSections(notation: string): Section[] {
  // Character validation
  for (const ch of notation) {
    if (!VALID_CHARS.has(ch)) {
      throw new Error(`Invalid character: '${ch}'`);
    }
  }

  const sectionStrs = notation.split(SEPARATOR).filter(s => s.length > 0);
  if (sectionStrs.length === 0) {
    throw new Error("Empty notation");
  }

  const sections: Section[] = [];

  for (const secStr of sectionStrs) {
    const chunkStrs = secStr.split("+");
    if (chunkStrs.some(c => c.length === 0)) {
      throw new Error(
        `Empty chunk in "${secStr}" (leading, trailing, or consecutive '+' sign)`
      );
    }

    const chunks = chunkStrs.map(parseChunk);

    // Find multi-entry chunks (column part candidates)
    const multiIdx = chunks
      .map((c, i) => (c.length >= 2 ? i : -1))
      .filter(i => i >= 0);

    if (multiIdx.length >= 2) {
      throw new Error(
        `Section "${secStr}" has ${multiIdx.length} multi-entry chunks; at most 1 allowed`
      );
    }

    let columnPart: KeyEntry[] | null = null;
    let leftThumbs: KeyEntry[] = [];
    let rightThumbs: KeyEntry[] = [];

    if (chunks.length === 1) {
      columnPart = chunks[0];
    } else if (multiIdx.length === 1) {
      const colIdx = multiIdx[0];
      columnPart = chunks[colIdx];
      leftThumbs = chunks.slice(0, colIdx).map(c => c[0]);
      rightThumbs = chunks.slice(colIdx + 1).map(c => c[0]);
    } else {
      // All single-entry chunks → thumbs only, all left-aligned
      leftThumbs = chunks.map(c => c[0]);
    }

    // Modifier validation
    if (columnPart) {
      for (const entry of columnPart) {
        for (const m of entry.modifiers) {
          if (isHorizontalMod(m)) {
            throw new Error(`Column entry has horizontal modifier '${m}'`);
          }
        }
      }
    }
    for (const entry of [...leftThumbs, ...rightThumbs]) {
      for (const m of entry.modifiers) {
        if (isVerticalMod(m)) {
          throw new Error(`Thumb entry has vertical modifier '${m}'`);
        }
      }
    }

    sections.push({ columnPart, leftThumbs, rightThumbs });
  }

  return sections;
}

// ---------------------------------------------------------------------------
// Layout generation
// ---------------------------------------------------------------------------

/** Place keys for one section and apply per-section normalization (§5.3–5.5). */
function placeSection(section: Section): { keys: PlacedKey[]; maxXPhys: number } {
  const keys: PlacedKey[] = [];
  let numCols = 0;
  let sectionBottom = -1;

  // Columns
  if (section.columnPart) {
    const entries = section.columnPart;
    numCols = entries.length;
    const heights = entries.map(e => e.count);
    const shifts = entries.map(e => netVerticalShift(e.modifiers));
    const maxH = Math.max(...heights);

    for (let i = 0; i < numCols; i++) {
      const baseY = (maxH - heights[i]) / 2;
      for (let j = 0; j < heights[i]; j++) {
        keys.push({
          origX: i, origY: baseY + j,
          offsetX: 0, offsetY: shifts[i],
          physBaseX: i, physBaseY: baseY + j,
        });
      }
    }

    sectionBottom = Math.max(...keys.map(k => k.origY + k.offsetY));
  }

  // Thumbs
  let thumbY = sectionBottom + 1;

  for (const entry of section.leftThumbs) {
    const shift = netHorizontalShift(entry.modifiers);
    for (let p = 0; p < entry.count; p++) {
      keys.push({
        origX: p, origY: thumbY,
        offsetX: shift, offsetY: 0,
        physBaseX: p, physBaseY: thumbY,
      });
    }
    thumbY++;
  }

  for (const entry of section.rightThumbs) {
    const shift = netHorizontalShift(entry.modifiers);
    const xStart = numCols - entry.count;
    for (let p = 0; p < entry.count; p++) {
      keys.push({
        origX: xStart + p, origY: thumbY,
        offsetX: shift, offsetY: 0,
        physBaseX: xStart + p, physBaseY: thumbY,
      });
    }
    thumbY++;
  }

  // Per-section negative-coordinate normalization
  if (keys.length === 0) {
    return { keys: [], maxXPhys: 0 };
  }

  const minX = Math.min(...keys.map(k => k.physBaseX + k.offsetX));
  const minY = Math.min(...keys.map(k => k.physBaseY + k.offsetY));
  const dx = Math.max(0, -minX);
  const dy = Math.max(0, -minY);

  if (dx !== 0 || dy !== 0) {
    for (const key of keys) {
      key.physBaseX += dx;
      key.physBaseY += dy;
    }
  }

  const maxXPhys = Math.max(...keys.map(k => k.physBaseX + k.offsetX));

  return { keys, maxXPhys };
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export function parseNotation(
  notation: string
): { keymap: { x: number; y: number }[]; physical: { x: number; y: number }[] } {
  // 1. Parse notation into classified sections
  const sections = parseSections(notation);

  // 2. Place keys for each section (includes per-section normalization)
  const placed = sections.map(placeSection);

  // 3. Global section arrangement (§5.6)
  const sectionOffsets: number[] = [0];
  for (let i = 1; i < placed.length; i++) {
    sectionOffsets[i] = sectionOffsets[i - 1] + placed[i - 1].maxXPhys + 2;
  }

  // 4. Apply section offsets and build output
  const physical: { x: number; y: number }[] = [];
  const keymapRaw: { x: number; y: number }[] = [];

  for (let i = 0; i < placed.length; i++) {
    const off = sectionOffsets[i];
    for (const key of placed[i].keys) {
      key.physBaseX += off;
      physical.push({
        x: key.physBaseX + key.offsetX,
        y: key.physBaseY + key.offsetY,
      });
      keymapRaw.push({
        x: Math.round(key.origX + off) + Math.trunc(key.offsetX),
        y: Math.round(key.origY) + Math.trunc(key.offsetY),
      });
    }
  }

  // 5. Keymap global non-negative normalization (§6.3)
  if (keymapRaw.length > 0) {
    const minKx = Math.min(...keymapRaw.map(k => k.x));
    const minKy = Math.min(...keymapRaw.map(k => k.y));
    const kDx = Math.max(0, -minKx);
    const kDy = Math.max(0, -minKy);
    if (kDx !== 0 || kDy !== 0) {
      for (const k of keymapRaw) {
        k.x += kDx;
        k.y += kDy;
      }
    }
  }

  return { keymap: keymapRaw, physical };
}
