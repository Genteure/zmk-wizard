/**
 * Prefetch entry point for the KLE hash parser.
 *
 * Startup code must not statically import `urlImport.ts`, because that would
 * pull `lz-string` and `layouthelper` into the initial bundle. The cached
 * loader here lets that startup code warm the parser up on idle and then reuse
 * the very same module instance when a `#kle=` hash is actually present.
 */
type UrlImportModule = typeof import('./urlImport');

let urlImportModule: Promise<UrlImportModule> | null = null;

/** Load the KLE hash parser, reusing an in-flight or finished load. */
export function loadUrlImport(): Promise<UrlImportModule> {
  urlImportModule ??= import('./urlImport');
  return urlImportModule;
}

/** Download the KLE hash parser in the background. */
export function preloadUrlImport(): Promise<unknown> {
  return loadUrlImport();
}
