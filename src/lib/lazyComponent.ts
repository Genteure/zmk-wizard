/**
 * Lazy component loading with idle-time prefetching.
 *
 * `defineAsyncComponent` alone only starts downloading a chunk when the
 * component is first rendered, which means the user sees a loading gap after
 * clicking a tab, opening a modal, or entering the editor.
 *
 * `lazyComponent` wraps it and additionally exposes `preload()`, which starts
 * the same download early. Call sites hand that to `scheduleIdlePreload` so the
 * request happens while the browser is idle — after first paint, long before
 * the click. Preloading changes nothing about what is bundled; it only moves
 * the network request off the interaction path.
 */
import type { Component } from 'vue';
import { defineAsyncComponent } from 'vue';

/** Identifies the (deduplicated) module load behind a lazy component. */
type LazyLoader = () => Promise<unknown>;

const loads = new Map<LazyLoader, Promise<unknown>>();

/**
 * Run `loader` at most once per identity, reusing the in-flight promise on
 * repeat calls. Failures resolve to `undefined` instead of rejecting: a
 * preload is only a cache warm-up, so it must never surface an error — the
 * component still loads on demand through Vue's normal path.
 */
function loadOnce(loader: LazyLoader): Promise<unknown> {
  let pending = loads.get(loader);
  if (!pending) {
    pending = loader().catch(() => undefined);
    loads.set(loader, pending);
  }
  return pending;
}

/** A lazy component that can be downloaded ahead of its first render. */
export type PreloadableComponent<T extends Component> = T & { preload(): Promise<void> };

interface ComponentModule {
  default?: { preload?: () => Promise<void> } | null;
}

/**
 * Start downloading a lazy component's chunk. Resolves once the chunk — and
 * any lazy children that chunk itself preloads — is available.
 */
async function preloadComponent(loader: LazyLoader): Promise<void> {
  const mod = await loadOnce(loader);
  // Preloading a whole screen also warms the panels inside it, so a later
  // click into it does not reveal a second round of spinners.
  await (mod as ComponentModule | null | undefined)?.default?.preload?.();
}

// ── Idle scheduling ─────────────────────────────────────────

const pending = new Set<() => Promise<unknown>>();
let flushScheduled = false;

/** Give the browser a real idle window, but never starve the queue. */
const IDLE_TIMEOUT_MS = 2000;

function flush(): void {
  const batch = [...pending];
  pending.clear();
  for (const preload of batch) {
    // Preloads resolve rather than reject, but guard anyway so one broken
    // chunk cannot stop the rest of the batch.
    void preload().catch(() => undefined);
  }
}

function scheduleFlush(): void {
  if (flushScheduled) return;
  flushScheduled = true;

  const runFlush = () => {
    flushScheduled = false;
    flush();
  };

  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(runFlush, { timeout: IDLE_TIMEOUT_MS });
    return;
  }

  // Safari and Node do not implement requestIdleCallback; a zero-delay timer
  // still runs after the current task and its queued microtasks.
  setTimeout(runFlush, 0);
}

/**
 * Queue components to download once the browser goes idle, so eager loading
 * never competes with first paint or user input. Repeat calls are coalesced by
 * preload identity, so remounts do not duplicate network work.
 */
export function scheduleIdlePreload(...preloads: (() => Promise<unknown>)[]): void {
  if (pending.size === 0) {
    scheduleFlush();
  }
  for (const preload of preloads) {
    pending.add(preload);
  }
}

/**
 * `defineAsyncComponent` plus a `preload()` for idle prefetching:
 *
 * ```ts
 * const HeavyPanel = lazyComponent(() => import('./HeavyPanel.vue'));
 * onMounted(() => scheduleIdlePreload(HeavyPanel.preload));
 * ```
 */
export function lazyComponent<T extends Component>(load: () => Promise<{ default: T }>): PreloadableComponent<T> {
  const component = defineAsyncComponent(load) as unknown as PreloadableComponent<T>;
  component.preload = () => preloadComponent(load as LazyLoader);
  return component;
}

/** Queue one or more lazy components for idle prefetching. */
export function idlePreload(...components: PreloadableComponent<Component>[]): void {
  scheduleIdlePreload(...components.map(component => component.preload));
}
