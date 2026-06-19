import type { Key, SingleKeyWiring } from "~/types";

// ─────────────────────────────────────────────────────────────
// Wiring Mapping — copy key wiring between parts with transforms
//
// This is ported from the old main branch. The logic maps keys
// between source and target parts by normalized row/col coordinates,
// then applies the specified transform before pairing.
// ─────────────────────────────────────────────────────────────

export type WiringTransform = "none" | "flip-vert" | "flip-horiz" | "flip-both";

interface PartKey {
  id: string;
  row: number;
  col: number;
  wiring?: SingleKeyWiring;
}

interface NormalizedKey extends PartKey {
  normRow: number;
  normCol: number;
}

type BoundingBox = {
  minRow: number;
  maxRow: number;
  minCol: number;
  maxCol: number;
};

function toPartKeys(layout: Key[], partIndex: number, keys: Record<string, SingleKeyWiring | undefined>): PartKey[] {
  return layout
    .filter((k) => k.part === partIndex)
    .map((k) => ({
      id: k.id,
      row: k.row,
      col: k.col,
      wiring: keys[k.id],
    }));
}

function computeBoundingBox(keys: PartKey[]): BoundingBox {
  if (keys.length === 0) {
    return { minRow: 0, maxRow: 0, minCol: 0, maxCol: 0 };
  }

  return keys.reduce<BoundingBox>(
    (acc, k) => ({
      minRow: Math.min(acc.minRow, k.row),
      maxRow: Math.max(acc.maxRow, k.row),
      minCol: Math.min(acc.minCol, k.col),
      maxCol: Math.max(acc.maxCol, k.col),
    }),
    {
      minRow: keys[0].row,
      maxRow: keys[0].row,
      minCol: keys[0].col,
      maxCol: keys[0].col,
    },
  );
}

function transformKeys(keys: PartKey[], transform: WiringTransform): PartKey[] {
  if (transform === "none") return keys.map((k) => ({ ...k }));

  const box = computeBoundingBox(keys);
  const flipHoriz = transform === "flip-horiz" || transform === "flip-both";
  const flipVert = transform === "flip-vert" || transform === "flip-both";

  return keys.map((k) => ({
    ...k,
    row: flipVert ? box.minRow + (box.maxRow - k.row) : k.row,
    col: flipHoriz ? box.minCol + (box.maxCol - k.col) : k.col,
  }));
}

function normalizeKeys(keys: PartKey[]): NormalizedKey[] {
  if (keys.length === 0) return [];

  const box = computeBoundingBox(keys);
  return keys.map((k) => ({
    ...k,
    normRow: k.row - box.minRow,
    normCol: k.col - box.minCol,
  }));
}

function pairKeys(source: PartKey[], target: PartKey[]): Map<string, PartKey> {
  const normalizedSource = normalizeKeys(source);
  const normalizedTarget = normalizeKeys(target);

  const usedSource = new Set<string>();
  const mapping = new Map<string, PartKey>();

  // Exact coordinate matches first
  for (const targetKey of normalizedTarget) {
    const match = normalizedSource.find(
      (s) =>
        !usedSource.has(s.id) &&
        s.normRow === targetKey.normRow &&
        s.normCol === targetKey.normCol,
    );
    if (match) {
      usedSource.add(match.id);
      mapping.set(targetKey.id, match);
    }
  }

  // Best-effort pairing for remaining keys
  const remainingTargets = normalizedTarget
    .filter((t) => !mapping.has(t.id))
    .sort((a, b) => a.normRow - b.normRow || a.normCol - b.normCol);
  const remainingSources = normalizedSource
    .filter((s) => !usedSource.has(s.id))
    .sort((a, b) => a.normRow - b.normRow || a.normCol - b.normCol);

  const pairCount = Math.min(remainingTargets.length, remainingSources.length);
  for (let i = 0; i < pairCount; i++) {
    usedSource.add(remainingSources[i].id);
    mapping.set(remainingTargets[i].id, remainingSources[i]);
  }

  return mapping;
}

/**
 * Result from mapping key wirings between two parts.
 * `keyWirings` maps target key IDs to the wiring they should receive.
 */
export interface WiringMapResult {
  /** targetKeyId → wiring from the matched source key */
  keyWirings: Record<string, SingleKeyWiring>;
  /** Number of target keys that received a wiring */
  mapped: number;
  /** Total target keys in the part */
  totalTargets: number;
}

/**
 * Map key wirings from source part to target part.
 *
 * For each target key, finds a matching source key by (row, col) position
 * (with optional transform applied to source coordinates), then copies
 * the wiring (input/output pin IDs) from the matched source key.
 */
export function mapKeyWirings(
  layout: Key[],
  sourcePartIndex: number,
  targetPartIndex: number,
  sourceKeys: Record<string, SingleKeyWiring | undefined>,
  transform: WiringTransform,
): WiringMapResult {
  const sourceKeysList = toPartKeys(layout, sourcePartIndex, sourceKeys);
  const transformedSource = transformKeys(sourceKeysList, transform);
  const targetKeysList = toPartKeys(layout, targetPartIndex, sourceKeys); // only need id/row/col from target layout

  const mapping = pairKeys(transformedSource, targetKeysList);

  const keyWirings: Record<string, SingleKeyWiring> = {};
  let mapped = 0;

  for (const target of targetKeysList) {
    const match = mapping.get(target.id);
    if (!match || !match.wiring) continue;

    const wiring: SingleKeyWiring = {};
    if (match.wiring.input) wiring.input = match.wiring.input;
    if (match.wiring.output) wiring.output = match.wiring.output;

    if (wiring.input || wiring.output) {
      keyWirings[target.id] = wiring;
      mapped += 1;
    }
  }

  return {
    keyWirings,
    mapped,
    totalTargets: targetKeysList.length,
  };
}
