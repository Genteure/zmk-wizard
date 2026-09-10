import LZString from 'lz-string';
import type { Key } from '~/types';
import { KLE_HASH_PREFIX } from './layoutHash';
import { parseKleJson, parseKleJsonWithChoice, type ImportedLayout } from './layouthelper';

export { clearLayoutHash } from './layoutHash';

/** Guard against pathological payloads (mirrors kle-ng's 1 MB limit). */
const MAX_DECOMPRESSED_SIZE = 1_000_000;

/**
 * Read and decompress a `#kle=` payload from the URL hash, if present.
 * Returns the decoded KLE JSON string, or null when there is no `#kle=` hash or
 * the payload is empty/invalid.
 */
function readKlePayloadFromHash(): string | null {
  if (typeof window === 'undefined') return null;

  const hash = window.location.hash;
  if (!hash.startsWith(KLE_HASH_PREFIX)) return null;

  const payload = hash.slice(KLE_HASH_PREFIX.length);
  if (!payload) return null;

  const json = LZString.decompressFromEncodedURIComponent(payload);
  if (!json || json.length > MAX_DECOMPRESSED_SIZE) return null;

  return json;
}

/**
 * Read a KLE layout from the current URL hash, if present.
 * Returns the parsed keys, or null when there is no `#kle=` hash or the payload
 * is empty/invalid.
 */
export function extractLayoutFromHash(): Key[] | null {
  const json = readKlePayloadFromHash();
  if (json === null) return null;

  return parseKleJson(json);
}

/**
 * Read a KLE layout from the current URL hash as original/generated row/col
 * candidates, or null when there is no valid `#kle=` payload.
 */
export function extractLayoutChoiceFromHash(): ImportedLayout | null {
  const json = readKlePayloadFromHash();
  if (json === null) return null;

  return parseKleJsonWithChoice(json);
}
