import { existsSync, rmSync, statSync } from 'node:fs';

/**
 * Pagefind always emits every standalone UI bundle next to the search index.
 * Starlight ships its own UI (`@pagefind/default-ui`, bundled by Vite) and only
 * loads the Pagefind core (`pagefind.js`) plus its worker from `/pagefind/`, so
 * these emitted UI variants are dead weight in the deployed output.
 *
 * Must be registered after `starlight()` so its `astro:build:done` hook runs
 * after Pagefind has written the files.
 */
const UNUSED_PAGEFIND_FILES = [
  'pagefind-ui.js',
  'pagefind-ui.css',
  'pagefind-component-ui.js',
  'pagefind-component-ui.css',
  'pagefind-modular-ui.js',
  'pagefind-modular-ui.css',
  'pagefind-highlight.js',
];

export default function prunePagefindAssets() {
  return {
    name: 'prune-pagefind-assets',
    hooks: {
      'astro:build:done': ({ dir, logger }) => {
        const pagefindDir = new URL('./pagefind/', dir);
        if (!existsSync(pagefindDir)) return;

        let freed = 0;
        const removed = [];
        for (const file of UNUSED_PAGEFIND_FILES) {
          const fileUrl = new URL(file, pagefindDir);
          if (!existsSync(fileUrl)) continue;
          freed += statSync(fileUrl).size;
          rmSync(fileUrl);
          removed.push(file);
        }

        if (removed.length > 0) {
          logger.info(
            `Pruned ${removed.length} unused Pagefind UI asset(s), freed ${(freed / 1024).toFixed(0)} KiB.`,
          );
        }
      },
    },
  };
}
