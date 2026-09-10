/**
 * Hash prefix used to pass a KLE layout into the wizard, e.g.
 * `https://shield-wizard.genteure.com/#kle=<lz-compressed>`.
 * The payload is `LZString.compressToEncodedURIComponent(JSON.stringify(kleArray))`,
 * matching the encoding used by kle-ng (editor.keyboard-tools.xyz).
 */
export const KLE_HASH_PREFIX = '#kle=';

/**
 * Remove the `#kle=` hash from the URL without reloading, so a refresh or a
 * later share doesn't re-import the incoming layout.
 *
 * Kept in a dependency-free module so startup code can clear the hash without
 * pulling in the KLE parser (`lz-string` + `layouthelper`).
 */
export function clearLayoutHash(): void {
  if (typeof window === 'undefined') return;
  if (window.location.hash.startsWith(KLE_HASH_PREFIX)) {
    history.replaceState({}, document.title, window.location.href.split('#')[0]);
  }
}
