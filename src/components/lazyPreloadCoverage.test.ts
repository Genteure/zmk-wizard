import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

/**
 * The whole point of `lazyComponent` is that the chunk is split out of the
 * initial graph *and* fetched eagerly on idle. A component that is split but
 * never preloaded silently regresses to a click-then-wait download, so every
 * lazy definition is required to be handed to the idle preloader.
 */
function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(vue|ts)$/.test(entry.name) ? [full] : [];
  });
}

describe('idle preloading coverage', () => {
  const root = path.resolve(import.meta.dirname, '..');
  const files = sourceFiles(root).filter(file => !file.endsWith('.test.ts'));

  test('scans the component tree', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  test('every lazyComponent() is queued for idle preloading', () => {
    const unwired: string[] = [];
    const lazyPattern = /const\s+([A-Z]\w*)\s*=\s*lazyComponent\(/g;

    for (const file of files) {
      const source = fs.readFileSync(file, 'utf8');
      for (const match of source.matchAll(lazyPattern)) {
        const component = match[1];
        // Accepted wiring: `scheduleIdlePreload(X.preload, …)`,
        // `idlePreload(X)`, or the preload being passed onward.
        const wired = new RegExp(`\\b${component}\\s*\\.preload\\b|idlePreload\\([^)]*\\b${component}\\b|\\b${component}\\s*,`).test(source);
        if (!wired) {
          unwired.push(`${path.relative(root, file)}: ${component}`);
        }
      }
    }

    expect(unwired).toEqual([]);
  });
});
