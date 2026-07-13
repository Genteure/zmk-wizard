import LZString from 'lz-string';
import type { Key } from '~/types';
import { parseKleJson } from './layouthelper';

/**
 * Hash prefix used to pass a KLE layout into the wizard, e.g.
 * `https://shield-wizard.genteure.com/#kle=<lz-compressed>`.
 * The payload is `LZString.compressToEncodedURIComponent(JSON.stringify(kleArray))`,
 * matching the encoding used by kle-ng (editor.keyboard-tools.xyz).
 */
const KLE_HASH_PREFIX = '#kle=';

/** Guard against pathological payloads (mirrors kle-ng's 1 MB limit). */
const MAX_DECOMPRESSED_SIZE = 1_000_000;

/**
 * Read a KLE layout from the current URL hash, if present.
 * Returns the parsed keys, or null when there is no `#kle=` hash or the payload
 * is empty/invalid.
 */
export function extractLayoutFromHash(): Key[] | null {
  if (typeof window === 'undefined') return null;

  const hash = window.location.hash;
  if (!hash.startsWith(KLE_HASH_PREFIX)) return null;

  const payload = hash.slice(KLE_HASH_PREFIX.length);
  if (!payload) return null;

  const json = LZString.decompressFromEncodedURIComponent(payload);
  if (!json || json.length > MAX_DECOMPRESSED_SIZE) return null;

  return parseKleJson(json);
}

/**
 * Remove the `#kle=` hash from the URL without reloading, so a refresh or a
 * later share doesn't re-import the incoming layout.
 */
export function clearLayoutHash(): void {
  if (typeof window === 'undefined') return;
  if (window.location.hash.startsWith(KLE_HASH_PREFIX)) {
    history.replaceState({}, document.title, window.location.href.split('#')[0]);
  }
}
