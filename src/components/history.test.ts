import { beforeEach, describe, expect, test } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import { ulid } from 'ulidx';
import type { BusName, EncoderId, Key, KeyId, PinId } from '~/types';

import { useHistoryStore } from './history';
import { useKeyboardStore, useSelectionStore } from './stores';

// ── Helpers ─────────────────────────────────────────────────

function makeKey(overrides: Partial<Key> = {}): Key {
  return {
    id: ulid() as KeyId,
    part: 0,
    row: 0,
    col: 0,
    x: 0,
    y: 0,
    w: 1,
    h: 1,
    r: 0,
    rx: 0,
    ry: 0,
    ...overrides,
  } satisfies Key;
}

function pinId(s: string): PinId {
  return s as unknown as PinId;
}

function keyId(s: string): KeyId {
  return s as unknown as KeyId;
}

function busName(s: string): BusName {
  return s as unknown as BusName;
}

function encoderId(s: string): EncoderId {
  return s as unknown as EncoderId;
}

/** Wait for Vue's pre-flush watcher to commit pending history changes. */
async function settle() {
  await nextTick();
}

// ─────────────────────────────────────────────────────────────

describe('useHistoryStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  test('groups synchronous actions into a single undo step', async () => {
    const kb = useKeyboardStore();
    const history = useHistoryStore();

    kb.addKey();
    kb.addKey();
    await settle();

    expect(kb.layout).toHaveLength(2);
    expect(history.canUndo).toBe(true);

    history.undo();
    expect(kb.layout).toHaveLength(0);
    expect(history.canUndo).toBe(false);

    history.redo();
    expect(kb.layout).toHaveLength(2);
    expect(history.canRedo).toBe(false);
  });

  test('groups $patch + sortLayout into a single undo step', async () => {
    const kb = useKeyboardStore();
    const original = [
      makeKey({ id: keyId('k0'), row: 1, col: 0 }),
      makeKey({ id: keyId('k1'), row: 0, col: 5 }),
    ];
    kb.$patch({ layout: original });

    const history = useHistoryStore();
    kb.$patch({
      layout: [
        makeKey({ id: keyId('k2'), row: 3, col: 3 }),
        makeKey({ id: keyId('k3'), row: 2, col: 1 }),
      ],
    });
    kb.sortLayout();
    await settle();

    expect(kb.layout.map(k => k.row)).toEqual([2, 3]);
    expect(history.canUndo).toBe(true);

    history.undo();
    expect(kb.layout.map(k => k.id)).toEqual([keyId('k0'), keyId('k1')]);
    expect(history.canUndo).toBe(false);

    history.redo();
    expect(kb.layout.map(k => k.row)).toEqual([2, 3]);
  });

  test('undo restores nested pins, keys, encoders, and buses', async () => {
    const kb = useKeyboardStore();
    const key = makeKey({ id: keyId('key0') });
    const d0 = pinId('d0');
    kb.$patch({ layout: [key] });

    const part = kb.parts[0];
    part.pins[d0] = { usage: 'kscan', kscan: 'kscan0', role: 'input' };
    part.keys[key.id] = { input: d0 };
    part.encoders.push({ id: encoderId('enc0') });
    part.buses[busName('i2c0')] = { type: 'i2c', devices: [] };

    const history = useHistoryStore();

    kb.changeController(0, 'xiao_ble');
    await settle();

    const cleared = kb.parts[0];
    expect(cleared.controller).toBe('xiao_ble');
    expect(cleared.pins[d0]).toBeUndefined();
    expect(cleared.keys[key.id]).toBeUndefined();
    expect(cleared.encoders).toEqual([]);
    expect(cleared.buses[busName('i2c0')]).toBeUndefined();

    history.undo();

    const restored = kb.parts[0];
    expect(restored.controller).toBe('nice_nano_v2');
    expect(restored.pins[d0]).toEqual({ usage: 'kscan', kscan: 'kscan0', role: 'input' });
    expect(restored.keys[key.id]).toEqual({ input: d0 });
    expect(restored.encoders).toEqual([{ id: encoderId('enc0') }]);
    expect(restored.buses[busName('i2c0')]).toEqual({ type: 'i2c', devices: [] });

    history.redo();

    const redone = kb.parts[0];
    expect(redone.controller).toBe('xiao_ble');
    expect(redone.pins[d0]).toBeUndefined();
    expect(redone.keys[key.id]).toBeUndefined();
    expect(redone.encoders).toEqual([]);
    expect(redone.buses[busName('i2c0')]).toBeUndefined();
  });

  test('captures direct state writes such as v-model assignments', async () => {
    const kb = useKeyboardStore();
    const history = useHistoryStore();

    kb.dongle = true;
    await settle();

    expect(history.canUndo).toBe(true);

    history.undo();
    expect(kb.dongle).toBe(false);
  });

  test('batch groups mutations across await boundaries', async () => {
    const kb = useKeyboardStore();
    const history = useHistoryStore();

    await history.batch(async () => {
      kb.$patch((state) => {
        state.layout.push(makeKey({ row: 0, col: 0 }));
      });
      await Promise.resolve();
      kb.$patch((state) => {
        state.layout.push(makeKey({ row: 1, col: 0 }));
      });
    });
    await settle();

    expect(kb.layout).toHaveLength(2);
    expect(history.canUndo).toBe(true);

    history.undo();
    expect(kb.layout).toHaveLength(0);
    expect(history.canUndo).toBe(false);
  });

  test('no-op actions do not pollute the history', async () => {
    const kb = useKeyboardStore();
    const history = useHistoryStore();

    kb.addModule('petejohanson/cirque');
    await settle();
    expect(history.canUndo).toBe(true);

    // Second add is a no-op — it must not create another undo entry.
    kb.addModule('petejohanson/cirque');
    await settle();

    history.undo();
    expect(kb.modules).toEqual([]);
    expect(history.canUndo).toBe(false);
  });

  test('undo and redo clear stale selection', async () => {
    const kb = useKeyboardStore();
    const selection = useSelectionStore();
    const history = useHistoryStore();
    const key = makeKey();

    kb.$patch({ layout: [key] });
    await settle();
    selection.setSelected([key.id]);

    history.undo();
    expect(kb.layout).toEqual([]);
    expect(selection.selectedCount).toBe(0);

    selection.setSelected([key.id]);
    history.redo();
    expect(kb.layout).toEqual([key]);
    expect(selection.selectedCount).toBe(0);
  });
});
