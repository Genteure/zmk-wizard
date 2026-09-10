import { describe, expect, test } from 'vitest';
import { lazyComponent, scheduleIdlePreload } from './lazyComponent';

// ── Test helpers ───────────────────────────────────────────

/**
 * The scheduler falls back to `setTimeout(…, 0)` outside the browser (Vitest
 * runs in Node), so tests yield through the real timer queue to let a flush
 * happen instead of reaching into module internals.
 */
async function waitForIdle(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
}

/** Minimal stand-in for a lazy component's `preload()`. */
function stubPreload(load: () => Promise<unknown>): () => Promise<unknown> {
  return load;
}

// ── scheduleIdlePreload ────────────────────────────────────

describe('scheduleIdlePreload', () => {
  test('waits for idle before loading, so it never competes with first paint', async () => {
    const calls: string[] = [];
    scheduleIdlePreload(stubPreload(async () => { calls.push('a'); }));

    // Nothing may have started synchronously.
    expect(calls).toEqual([]);

    await waitForIdle();
    expect(calls).toEqual(['a']);
  });

  test('loads every queued preload', async () => {
    const calls: string[] = [];
    scheduleIdlePreload(
      stubPreload(async () => { calls.push('a'); }),
      stubPreload(async () => { calls.push('b'); }),
    );

    await waitForIdle();
    expect(calls.sort()).toEqual(['a', 'b']);
  });

  test('queues work added after a flush', async () => {
    const calls: string[] = [];
    scheduleIdlePreload(stubPreload(async () => { calls.push('first'); }));
    await waitForIdle();

    scheduleIdlePreload(stubPreload(async () => { calls.push('second'); }));
    await waitForIdle();

    expect(calls).toEqual(['first', 'second']);
  });

  test('a failing preload does not block the rest of the batch', async () => {
    const calls: string[] = [];
    scheduleIdlePreload(
      stubPreload(async () => { throw new Error('chunk unavailable'); }),
      stubPreload(async () => { calls.push('still ran'); }),
    );

    await waitForIdle();
    expect(calls).toEqual(['still ran']);
  });

  test('never runs the same preload twice, even when queued again', async () => {
    let count = 0;
    const preload = stubPreload(async () => { count++; });

    scheduleIdlePreload(preload);
    scheduleIdlePreload(preload);
    await waitForIdle();

    expect(count).toBe(1);
  });
});

// ── lazyComponent ──────────────────────────────────────────

describe('lazyComponent', () => {
  test('exposes a preload that downloads the module exactly once', async () => {
    let loads = 0;
    const component = lazyComponent(async () => {
      loads++;
      return { default: { name: 'Stub' } };
    });

    expect(typeof component.preload).toBe('function');

    await component.preload();
    await component.preload();

    expect(loads).toBe(1);
  });

  test('a failed preload resolves silently instead of rejecting', async () => {
    let attempts = 0;
    const component = lazyComponent(async () => {
      attempts++;
      throw new Error('network down');
    });

    await expect(component.preload()).resolves.toBeUndefined();
    await expect(component.preload()).resolves.toBeUndefined();
    expect(attempts).toBe(1);
  });

  test('preloading a screen also preloads the lazy children it declares', async () => {
    let childLoads = 0;
    const child = lazyComponent(async () => {
      childLoads++;
      return { default: { name: 'Child' } };
    });
    const parent = lazyComponent(async () => ({ default: { name: 'Parent', preload: child.preload } }));

    await parent.preload();

    expect(childLoads).toBe(1);
  });
});
