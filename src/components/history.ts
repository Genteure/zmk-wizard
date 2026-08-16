import { defineStore } from 'pinia';
import { computed, toRaw } from 'vue';
import { useRefHistory } from '@vueuse/core';
import { useKeyboardStore, useSelectionStore } from './stores';
import type { Keyboard } from '~/types';

const HISTORY_CAPACITY = 50;

/**
 * Recursively strip Vue reactivity from a value. `toRaw` only unwraps the
 * top-level proxy, while reactive array/object reads (and array methods
 * such as `filter`) can hand out newly-created nested proxies. Those make
 * `structuredClone` throw `DataCloneError`, so walk every level before
 * cloning.
 */
function detachRaw<T>(value: T): unknown {
  const raw = toRaw(value);
  if (Array.isArray(raw)) {
    return raw.map(item => detachRaw(item));
  }
  if (raw !== null && typeof raw === 'object') {
    const copy: Record<string, unknown> = {};
    for (const key of Object.keys(raw)) {
      copy[key] = detachRaw((raw as Record<string, unknown>)[key]);
    }
    return copy;
  }
  return raw;
}

/** Plain, detached snapshot of the reactive keyboard state. */
function snapshot(state: Keyboard): Keyboard {
  return structuredClone(detachRaw(state)) as Keyboard;
}

/**
 * Serializable state signature used to skip no-op commits.
 * `undefined` values are preserved so that `{ pin: undefined }` and a
 * missing `pin` key are not treated as the same state.
 */
function stateSignature(state: Keyboard): string {
  return JSON.stringify(toRaw(state), (_key, value) =>
    value === undefined ? '\u0000undefined' : value,
  );
}

/**
 * Snapshot-based undo/redo history for the keyboard store.
 *
 * Deep-watches `keyboard.$state`, so every mutation path is captured:
 * store actions, `$patch` calls, and direct `v-model` writes alike.
 * Synchronous multi-step operations collapse into a single undo step
 * thanks to Vue's default pre-flush watcher batching; use `batch()` to
 * group mutations that span asynchronous boundaries.
 */
export const useHistoryStore = defineStore('history', () => {
  const keyboard = useKeyboardStore();

  const keyboardState = computed<Keyboard>({
    get: () => keyboard.$state,
    set: (value: Keyboard) => {
      keyboard.$patch((state) => {
        // Object.assign replaces nested structures wholesale. A plain
        // $patch(snapshot) would deep-merge and fail to remove deleted
        // pins / keys / buses when restoring an older snapshot.
        Object.assign(state, toRaw(value));
      });
    },
  });

  // `keyboardState.value` always returns the same reactive proxy, so
  // comparing the two raw values VueUse hands to `shouldCommit` would
  // compare the current state with itself and reject every commit.
  // Keep our own signature of the last committed state instead.
  let lastSignature = stateSignature(keyboardState.value);

  const history = useRefHistory(keyboardState, {
    deep: true,
    clone: snapshot,
    capacity: HISTORY_CAPACITY,
    shouldCommit: (_before, after) => {
      const nextSignature = stateSignature(after);
      if (nextSignature === lastSignature) return false;
      lastSignature = nextSignature;
      return true;
    },
  });

  function undo() {
    if (!history.canUndo.value) return;
    history.undo();
    lastSignature = stateSignature(keyboard.$state);
    useSelectionStore().clearSelected();
  }

  function redo() {
    if (!history.canRedo.value) return;
    history.redo();
    lastSignature = stateSignature(keyboard.$state);
    useSelectionStore().clearSelected();
  }

  /**
   * Group keyboard mutations inside `fn` into a single undo step.
   * Supports synchronous and asynchronous callbacks: with an async
   * callback, mutations before and after each `await` stay grouped.
   */
  function batch<T>(fn: () => T): T;
  function batch<T>(fn: () => Promise<T>): Promise<T>;
  function batch<T>(fn: () => T | Promise<T>): T | Promise<T> {
    history.pause();
    try {
      const result = fn();
      if (result instanceof Promise) {
        return result.finally(() => history.resume(true)) as Promise<T>;
      }
      history.resume(true);
      return result;
    }
    catch (error) {
      history.resume(true);
      throw error;
    }
  }

  function clear() {
    history.clear();
    lastSignature = stateSignature(keyboard.$state);
  }

  return {
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    undo,
    redo,
    batch,
    clear,
  };
});
