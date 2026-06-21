import { beforeEach, describe, expect, test } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { ulid } from "ulidx";
import type {
  BusName,
  EncoderId,
  Key,
  KeyId,
  KscanDriver,
  PinId,
  PinUsage,
} from "~/types";
import type { DeviceTypeName } from "~/metadata/device";

import {
  useKeyboardStore,
  useNavigationStore,
  useSelectionStore,
} from "./stores";

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

/** Narrow a PinUsage to the kscan variant (for assertions). */
function asKscanUsage(u: PinUsage | undefined): { kscan: string; role: "input" | "output" | "interrupt" } | undefined {
  if (u && "kscan" in u) return u as typeof u & { kscan: string };
  return undefined;
}

/** Narrow a PinUsage to the device variant (for assertions). */
function asDeviceUsage(u: PinUsage | undefined): { deviceId: string; role: string } | undefined {
  if (u && "deviceId" in u) return u as typeof u & { deviceId: string };
  return undefined;
}

// ─────────────────────────────────────────────────────────────
// useKeyboardStore
// ─────────────────────────────────────────────────────────────

describe("useKeyboardStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  // ── Module CRUD ───────────────────────────────────────────

  describe("addModule", () => {
    test("adds a new module", () => {
      const kb = useKeyboardStore();
      kb.addModule("petejohanson/cirque");
      expect(kb.modules).toEqual(["petejohanson/cirque"]);
    });

    test("no-op when module already exists", () => {
      const kb = useKeyboardStore();
      kb.addModule("petejohanson/cirque");
      kb.addModule("petejohanson/cirque");
      expect(kb.modules).toEqual(["petejohanson/cirque"]);
    });

    test("adds multiple distinct modules", () => {
      const kb = useKeyboardStore();
      kb.addModule("petejohanson/cirque");
      kb.addModule("badjeff/pmw3610");
      expect(kb.modules).toHaveLength(2);
    });
  });

  describe("removeModule", () => {
    test("removes an existing module", () => {
      const kb = useKeyboardStore();
      kb.addModule("petejohanson/cirque");
      kb.removeModule("petejohanson/cirque");
      expect(kb.modules).toEqual([]);
    });

    test("no-op when module not present", () => {
      const kb = useKeyboardStore();
      kb.removeModule("badjeff/pmw3610");
      expect(kb.modules).toEqual([]);
    });
  });

  // ── sortLayout ──────────────────────────────────────────

  describe("sortLayout", () => {
    test("sorts by row then col", () => {
      const kb = useKeyboardStore();
      kb.$patch({
        layout: [
          makeKey({ row: 2, col: 0 }),
          makeKey({ row: 1, col: 5 }),
          makeKey({ row: 1, col: 2 }),
        ],
      });
      kb.sortLayout();
      expect(kb.layout.map((k) => [k.row, k.col])).toEqual([
        [1, 2],
        [1, 5],
        [2, 0],
      ]);
    });

    test("handles empty layout", () => {
      const kb = useKeyboardStore();
      kb.sortLayout();
      expect(kb.layout).toEqual([]);
    });

    test("handles single key", () => {
      const kb = useKeyboardStore();
      const k = makeKey();
      kb.$patch({ layout: [k] });
      kb.sortLayout();
      expect(kb.layout).toEqual([k]);
    });
  });

  // ── deleteSelected ──────────────────────────────────────

  describe("deleteSelected", () => {
    test("no-op when nothing selected", () => {
      const kb = useKeyboardStore();
      const keys = [makeKey({ id: keyId("abc") }), makeKey({ id: keyId("def") })];
      kb.$patch({ layout: keys });
      kb.deleteSelected();
      expect(kb.layout).toHaveLength(2);
    });

    test("removes selected keys from layout and parts.keys", () => {
      const kb = useKeyboardStore();
      const k0 = makeKey({ id: keyId("k0"), part: 0 });
      const k1 = makeKey({ id: keyId("k1"), part: 1 });
      kb.$patch({ layout: [k0, k1] });
      kb.parts[0].keys[keyId("k0")] = { input: pinId("d0") };
      kb.parts[1].keys[keyId("k1")] = { input: pinId("d1") };

      const sel = useSelectionStore();
      sel.rowSelection = { k0: true, k1: true };

      kb.deleteSelected();
      expect(kb.layout).toHaveLength(0);
      expect(kb.parts[0].keys[keyId("k0")]).toBeUndefined();
      expect(kb.parts[1].keys[keyId("k1")]).toBeUndefined();
      expect(sel.selectedCount).toBe(0);
    });
  });

  // ── addKey ──────────────────────────────────────────────

  describe("addKey", () => {
    test("adds first key at origin", () => {
      const kb = useKeyboardStore();
      kb.addKey();
      expect(kb.layout).toHaveLength(1);
      const k = kb.layout[0];
      expect(k.row).toBe(0);
      expect(k.col).toBe(0);
      expect(k.x).toBe(0);
      expect(k.y).toBe(0);
      expect(k.w).toBe(1);
    });

    test("positions subsequent keys past max row/col", () => {
      const kb = useKeyboardStore();
      kb.$patch({ layout: [makeKey({ row: 2, col: 3, x: 15, y: 10 })] });
      kb.addKey();
      const k = kb.layout[1];
      expect(k.row).toBe(2);
      expect(k.col).toBe(4);
      expect(k.y).toBe(10);
      expect(k.x).toBe(16);
    });

    test("sorts layout after adding", () => {
      const kb = useKeyboardStore();
      kb.$patch({ layout: [makeKey({ row: 9, col: 9 })] });
      kb.addKey();
      expect(kb.layout[0].col).toBe(9);
      expect(kb.layout[1].col).toBe(10);
    });
  });

  // ── addKeys ─────────────────────────────────────────────

  describe("addKeys", () => {
    test("adds multiple keys and returns ids", () => {
      const kb = useKeyboardStore();
      const ids = kb.addKeys([
        makeKey(), // just use a full key minus id
      ].map((k) => {
        const { id: _, ...rest } = k;
        return rest;
      }));
      expect(ids).toHaveLength(1);
      expect(kb.layout).toHaveLength(1);
    });

    test("sorts layout after adding", () => {
      const kb = useKeyboardStore();
      const ids = kb.addKeys([
        { part: 0, row: 2, col: 0, x: 0, y: 0, w: 1, h: 1, r: 0, rx: 0, ry: 0 },
        { part: 0, row: 1, col: 5, x: 0, y: 0, w: 1, h: 1, r: 0, rx: 0, ry: 0 },
      ]);
      expect(ids).toHaveLength(2);
      expect(kb.layout[0].row).toBe(1);
      expect(kb.layout[1].row).toBe(2);
    });
  });

  // ── patchKey ────────────────────────────────────────────

  describe("patchKey", () => {
    test("updates key fields", () => {
      const kb = useKeyboardStore();
      const k = makeKey();
      kb.$patch({ layout: [k] });
      kb.patchKey(k.id, { x: 42, y: 99 });
      expect(kb.layout[0].x).toBe(42);
      expect(kb.layout[0].y).toBe(99);
    });

    test("triggers sort when row changes", () => {
      const kb = useKeyboardStore();
      const k0 = makeKey({ id: keyId("k0"), row: 2, col: 0 });
      const k1 = makeKey({ id: keyId("k1"), row: 1, col: 5 });
      kb.$patch({ layout: [k0, k1] });
      kb.patchKey(keyId("k1"), { row: 3 });
      expect(kb.layout[0].id).toBe("k0");
      expect(kb.layout[1].id).toBe("k1");
    });

    test("no-op for unknown id", () => {
      const kb = useKeyboardStore();
      kb.patchKey(keyId("nonexistent"), { x: 99 });
      expect(kb.layout).toHaveLength(0);
    });
  });

  // ── patchKeys ───────────────────────────────────────────

  describe("patchKeys", () => {
    test("patches multiple keys", () => {
      const kb = useKeyboardStore();
      const k0 = makeKey({ id: keyId("k0") });
      const k1 = makeKey({ id: keyId("k1") });
      kb.$patch({ layout: [k0, k1] });
      kb.patchKeys([
        { id: keyId("k0"), changes: { x: 10 } },
        { id: keyId("k1"), changes: { y: 20 } },
      ]);
      const found0 = kb.layout.find((k) => k.id === keyId("k0"));
      const found1 = kb.layout.find((k) => k.id === keyId("k1"));
      expect(found0?.x).toBe(10);
      expect(found1?.y).toBe(20);
    });

    test("skips sort when no row/col changes", () => {
      const kb = useKeyboardStore();
      const k0 = makeKey({ id: keyId("k0") });
      kb.$patch({ layout: [k0] });
      kb.patchKeys([{ id: keyId("k0"), changes: { x: 5 } }]);
      expect(kb.layout[0].x).toBe(5);
    });
  });

  // ── changeController ────────────────────────────────────

  describe("changeController", () => {
    test("resets pins, kscans, keys, encoders, buses for the part", () => {
      const kb = useKeyboardStore();
      const part = kb.parts[0];
      part.kscans = [{ kind: "matrix", id: "old-kscan", diodes: true }];
      part.keys = { [ulid() as KeyId]: { input: pinId("d0") } };
      part.encoders.push({ id: encoderId("old-enc") });
      part.buses = { [busName("i2c0")]: { type: "i2c", devices: [] } };

      kb.changeController(0, "xiao_ble");

      const p = kb.parts[0];
      expect(p.controller).toBe("xiao_ble");
      expect(p.kscans).toEqual([]);
      expect(p.keys).toEqual({});
      expect(p.encoders).toEqual([]);
      expect(p.buses).toEqual({});
      expect(Object.keys(p.pins)).toEqual(["d0", "d1", "d2", "d3", "d4", "d5", "d6", "d7", "d8", "d9", "d10"]);
    });

    test("no-op for out-of-range part index", () => {
      const kb = useKeyboardStore();
      kb.changeController(99, "xiao_ble");
    });
  });

  // ── Kscan CRUD ──────────────────────────────────────────

  describe("addKscan", () => {
    test("adds matrix kscan", () => {
      const kb = useKeyboardStore();
      kb.addKscan(0, "matrix");
      const kscan = kb.parts[0].kscans[0];
      expect(kscan.kind).toBe("matrix");
      if (kscan.kind === "matrix") expect(kscan.diodes).toBe(true);
    });

    test("adds direct kscan with default mode", () => {
      const kb = useKeyboardStore();
      kb.addKscan(0, "direct");
      const kscan = kb.parts[0].kscans[0];
      expect(kscan.kind).toBe("direct");
      if (kscan.kind === "direct") expect(kscan.mode).toBe("gnd");
    });

    test("adds charlieplex kscan", () => {
      const kb = useKeyboardStore();
      kb.addKscan(0, "charlieplex");
      const kscan = kb.parts[0].kscans[0];
      expect(kscan.kind).toBe("charlieplex");
    });

    test("no-op for invalid part index", () => {
      const kb = useKeyboardStore();
      kb.addKscan(99, "matrix");
      expect(kb.parts).toHaveLength(2);
    });
  });

  describe("removeKscan", () => {
    test("removes kscan and releases its pins, cleans up wiring", () => {
      const kb = useKeyboardStore();
      kb.addKscan(0, "matrix");
      const kscanId = kb.parts[0].kscans[0].id;

      kb.assignPinToKscan(0, pinId("d0"), kscanId, "input");

      const key = makeKey();
      kb.$patch({ layout: [key] });
      kb.setKeyWiring(0, key.id, { pinId: pinId("d0"), role: "input" });

      kb.removeKscan(0, kscanId);

      expect(kb.parts[0].kscans).toHaveLength(0);
      expect(kb.parts[0].pins[pinId("d0")]).toBeUndefined();
      expect(kb.parts[0].keys[key.id]?.input).toBeUndefined();
    });

    test("no-op for invalid part index", () => {
      const kb = useKeyboardStore();
      kb.removeKscan(99, "some-id");
    });

    test("no-op for non-existent kscan id", () => {
      const kb = useKeyboardStore();
      kb.removeKscan(0, "nonexistent");
      expect(kb.parts[0].kscans).toHaveLength(0);
    });
  });

  describe("patchKscan", () => {
    test("patches existing kscan", () => {
      const kb = useKeyboardStore();
      kb.addKscan(0, "matrix");
      const kscanId = kb.parts[0].kscans[0].id;
      kb.patchKscan(0, kscanId, { diodes: false });
      const kscan = kb.parts[0].kscans[0];
      if (kscan.kind === "matrix") expect(kscan.diodes).toBe(false);
    });

    test("no-op for non-existent kscan id", () => {
      const kb = useKeyboardStore();
      kb.patchKscan(0, "nonexistent", { diodes: false });
    });

    test("no-op for invalid part index", () => {
      const kb = useKeyboardStore();
      kb.patchKscan(99, "some-id", { diodes: false });
    });
  });

  describe("moveKscan", () => {
    function threeIds(kb: ReturnType<typeof useKeyboardStore>): string[] {
      kb.addKscan(0, "matrix");
      kb.addKscan(0, "direct");
      kb.addKscan(0, "charlieplex");
      return kb.parts[0].kscans.map((k) => k.id);
    }

    test("moves kscan up", () => {
      const kb = useKeyboardStore();
      const ids = threeIds(kb);
      kb.moveKscan(0, ids[2], -1);
      expect(kb.parts[0].kscans.map((k) => k.id)).toEqual([ids[0], ids[2], ids[1]]);
    });

    test("moves kscan down", () => {
      const kb = useKeyboardStore();
      const ids = threeIds(kb);
      kb.moveKscan(0, ids[0], 1);
      expect(kb.parts[0].kscans.map((k) => k.id)).toEqual([ids[1], ids[0], ids[2]]);
    });

    test("no-op when moving first item up", () => {
      const kb = useKeyboardStore();
      const ids = threeIds(kb);
      kb.moveKscan(0, ids[0], -1);
      expect(kb.parts[0].kscans.map((k) => k.id)).toEqual(ids);
    });

    test("no-op when moving last item down", () => {
      const kb = useKeyboardStore();
      const ids = threeIds(kb);
      kb.moveKscan(0, ids[2], 1);
      expect(kb.parts[0].kscans.map((k) => k.id)).toEqual(ids);
    });

    test("no-op for non-existent kscan id", () => {
      const kb = useKeyboardStore();
      const ids = threeIds(kb);
      kb.moveKscan(0, "nonexistent", 1);
      expect(kb.parts[0].kscans.map((k) => k.id)).toEqual(ids);
    });

    test("no-op for invalid part index", () => {
      const kb = useKeyboardStore();
      kb.moveKscan(99, "some-id", 1);
    });
  });

  // ── Encoder CRUD ────────────────────────────────────────

  describe("addEncoder", () => {
    test("adds encoder to part", () => {
      const kb = useKeyboardStore();
      kb.addEncoder(0);
      expect(kb.parts[0].encoders).toHaveLength(1);
    });

    test("no-op for invalid part index", () => {
      const kb = useKeyboardStore();
      kb.addEncoder(99);
      expect(kb.parts[0].encoders).toHaveLength(0);
    });
  });

  describe("moveEncoder", () => {
    function twoIds(kb: ReturnType<typeof useKeyboardStore>): string[] {
      kb.addEncoder(0);
      kb.addEncoder(0);
      return kb.parts[0].encoders.map((e) => e.id);
    }

    test("moves encoder up", () => {
      const kb = useKeyboardStore();
      const ids = twoIds(kb);
      kb.moveEncoder(0, ids[1], -1);
      expect(kb.parts[0].encoders.map((e) => e.id)).toEqual([ids[1], ids[0]]);
    });

    test("moves encoder down", () => {
      const kb = useKeyboardStore();
      const ids = twoIds(kb);
      kb.moveEncoder(0, ids[0], 1);
      expect(kb.parts[0].encoders.map((e) => e.id)).toEqual([ids[1], ids[0]]);
    });

    test("no-op moving first encoder up", () => {
      const kb = useKeyboardStore();
      const ids = twoIds(kb);
      kb.moveEncoder(0, ids[0], -1);
      expect(kb.parts[0].encoders.map((e) => e.id)).toEqual(ids);
    });

    test("no-op for non-existent id", () => {
      const kb = useKeyboardStore();
      const ids = twoIds(kb);
      kb.moveEncoder(0, "nonexistent", 1);
      expect(kb.parts[0].encoders.map((e) => e.id)).toEqual(ids);
    });

    test("no-op for invalid part index", () => {
      const kb = useKeyboardStore();
      kb.moveEncoder(99, "some-id", 1);
    });
  });

  describe("removeEncoder", () => {
    test("removes encoder and releases its pins", () => {
      const kb = useKeyboardStore();
      kb.addEncoder(0);
      const encId = kb.parts[0].encoders[0].id;

      kb.setEncoderPin(0, encId, "pinA", pinId("d0"));
      kb.setEncoderPin(0, encId, "pinB", pinId("d1"));

      kb.removeEncoder(0, encId);
      expect(kb.parts[0].encoders).toHaveLength(0);
      expect(kb.parts[0].pins[pinId("d0")]).toBeUndefined();
      expect(kb.parts[0].pins[pinId("d1")]).toBeUndefined();
    });

    test("no-op for invalid part index", () => {
      const kb = useKeyboardStore();
      kb.removeEncoder(99, "some-id");
    });

    test("no-op for non-existent encoder id", () => {
      const kb = useKeyboardStore();
      kb.addEncoder(0);
      kb.removeEncoder(0, "nonexistent");
      expect(kb.parts[0].encoders).toHaveLength(1);
    });
  });

  // ── Pin assignment ──────────────────────────────────────

  describe("assignPinToKscan", () => {
    test("assigns free pin to kscan", () => {
      const kb = useKeyboardStore();
      kb.addKscan(0, "matrix");
      const kscanId = kb.parts[0].kscans[0].id;
      kb.assignPinToKscan(0, pinId("d0"), kscanId, "input");
      const usage = asKscanUsage(kb.parts[0].pins[pinId("d0")]);
      expect(usage?.kscan).toBe(kscanId);
      expect(usage?.role).toBe("input");
    });

    test("no-op when pin is already in use", () => {
      const kb = useKeyboardStore();
      kb.addKscan(0, "matrix");
      kb.addKscan(0, "direct");
      const ids = kb.parts[0].kscans.map((k) => k.id);
      kb.assignPinToKscan(0, pinId("d0"), ids[0], "input");
      kb.assignPinToKscan(0, pinId("d0"), ids[1], "input");
      const usage = asKscanUsage(kb.parts[0].pins[pinId("d0")]);
      expect(usage?.kscan).toBe(ids[0]);
    });

    test("no-op when kscan does not exist", () => {
      const kb = useKeyboardStore();
      kb.assignPinToKscan(0, pinId("d0"), "nonexistent", "input");
      expect(kb.parts[0].pins[pinId("d0")]).toBeUndefined();
    });
  });

  describe("releasePin", () => {
    test("releases unused pin", () => {
      const kb = useKeyboardStore();
      kb.addKscan(0, "matrix");
      const kscanId = kb.parts[0].kscans[0].id;
      kb.assignPinToKscan(0, pinId("d0"), kscanId, "input");
      kb.releasePin(0, pinId("d0"));
      expect(kb.parts[0].pins[pinId("d0")]).toBeUndefined();
    });

    test("releasing pin clears key wiring referencing it", () => {
      const kb = useKeyboardStore();
      kb.addKscan(0, "matrix");
      const kscanId = kb.parts[0].kscans[0].id;
      kb.assignPinToKscan(0, pinId("d0"), kscanId, "input");

      const key = makeKey();
      kb.$patch({ layout: [key] });
      kb.setKeyWiring(0, key.id, { pinId: pinId("d0"), role: "input" });
      expect(kb.parts[0].keys[key.id]?.input).toBe(pinId("d0"));

      kb.releasePin(0, pinId("d0"));
      expect(kb.parts[0].keys[key.id]?.input).toBeUndefined();
    });

    test("releasing pin removes empty wiring entry", () => {
      const kb = useKeyboardStore();
      const key = makeKey();
      kb.$patch({ layout: [key] });
      kb.setKeyWiring(0, key.id, { pinId: pinId("d0"), role: "input" });
      kb.releasePin(0, pinId("d0"));
      expect(kb.parts[0].keys[key.id]).toBeUndefined();
    });
  });

  describe("setEncoderPin", () => {
    test("assigns pin to encoder phase", () => {
      const kb = useKeyboardStore();
      kb.addEncoder(0);
      const encId = kb.parts[0].encoders[0].id;
      kb.setEncoderPin(0, encId, "pinA", pinId("d0"));
      const usage = kb.parts[0].pins[pinId("d0")];
      expect(usage).toBeDefined();
      if (usage && "usage" in usage) {
        expect(usage.usage).toBe("encoder");
        if (usage.usage === "encoder") {
          expect(usage.encoderId).toBe(encId);
          expect(usage.role).toBe("pinA");
        }
      }
    });

    test("replaces old pin for same encoder+phase", () => {
      const kb = useKeyboardStore();
      kb.addEncoder(0);
      const encId = kb.parts[0].encoders[0].id;
      kb.setEncoderPin(0, encId, "pinA", pinId("d0"));
      kb.setEncoderPin(0, encId, "pinA", pinId("d1"));
      expect(kb.parts[0].pins[pinId("d0")]).toBeUndefined();
      expect(kb.parts[0].pins[pinId("d1")]).toBeDefined();
    });

    test("releases pin when pinId is undefined", () => {
      const kb = useKeyboardStore();
      kb.addEncoder(0);
      const encId = kb.parts[0].encoders[0].id;
      kb.setEncoderPin(0, encId, "pinA", pinId("d0"));
      kb.setEncoderPin(0, encId, "pinA", undefined);
      expect(kb.parts[0].pins[pinId("d0")]).toBeUndefined();
    });

    test("no-op for non-existent encoder", () => {
      const kb = useKeyboardStore();
      kb.setEncoderPin(0, "nonexistent", "pinA", pinId("d0"));
      expect(kb.parts[0].pins[pinId("d0")]).toBeUndefined();
    });
  });

  describe("setKeyWiring", () => {
    test("wires input pin to key", () => {
      const kb = useKeyboardStore();
      const key = makeKey();
      kb.$patch({ layout: [key] });
      kb.setKeyWiring(0, key.id, { pinId: pinId("d0"), role: "input" });
      expect(kb.parts[0].keys[key.id]?.input).toBe(pinId("d0"));
    });

    test("wires output pin to key", () => {
      const kb = useKeyboardStore();
      const key = makeKey();
      kb.$patch({ layout: [key] });
      kb.setKeyWiring(0, key.id, { pinId: pinId("d1"), role: "output" });
      expect(kb.parts[0].keys[key.id]?.output).toBe(pinId("d1"));
    });

    test("wires both pins", () => {
      const kb = useKeyboardStore();
      const key = makeKey();
      kb.$patch({ layout: [key] });
      kb.setKeyWiring(0, key.id, { pinId: pinId("d0"), role: "input" });
      kb.setKeyWiring(0, key.id, { pinId: pinId("d1"), role: "output" });
      expect(kb.parts[0].keys[key.id]?.input).toBe(pinId("d0"));
      expect(kb.parts[0].keys[key.id]?.output).toBe(pinId("d1"));
    });
  });

  // ── Bus/Device CRUD ─────────────────────────────────────

  describe("addDevice", () => {
    test("adds device to a new bus (auto-creates bus)", () => {
      const kb = useKeyboardStore();
      const deviceId = kb.addDevice(0, "i2c0", "ssd1306");
      expect(deviceId).toBeDefined();
      const bus = kb.parts[0].buses[busName("i2c0")];
      expect(bus).toBeDefined();
      expect(bus.type).toBe("i2c");
      expect(bus.devices).toHaveLength(1);
      expect(bus.devices[0].id).toBe(deviceId);
    });

    test("adds device to an existing bus", () => {
      const kb = useKeyboardStore();
      kb.addDevice(0, "i2c0", "ssd1306");
      const deviceId2 = kb.addDevice(0, "i2c0", "ssd1306");
      expect(deviceId2).toBeDefined();
      const bus = kb.parts[0].buses[busName("i2c0")];
      expect(bus.devices).toHaveLength(2);
    });

    test("returns undefined for unknown device type", () => {
      const kb = useKeyboardStore();
      const result = kb.addDevice(0, "i2c0", "nonexistent" as unknown as DeviceTypeName);
      expect(result).toBeUndefined();
    });

    test("no-op when bus type mismatches", () => {
      const kb = useKeyboardStore();
      // niceview is SPI — creates an SPI bus
      const id1 = kb.addDevice(0, "mybus", "niceview");
      expect(id1).toBeDefined();
      // ssd1306 is I2C — rejected because existing bus is SPI
      const id2 = kb.addDevice(0, "mybus", "ssd1306");
      expect(id2).toBeUndefined();
    });
  });

  describe("removeDevice", () => {
    test("removes device and releases its pins", () => {
      const kb = useKeyboardStore();
      const deviceId = kb.addDevice(0, "i2c0", "ssd1306") as string;
      kb.assignDevicePin(0, pinId("d0"), deviceId, "cs");
      kb.removeDevice(0, "i2c0", deviceId);
      // Bus is deleted because it was the only device
      expect(kb.parts[0].buses[busName("i2c0")]).toBeUndefined();
      expect(kb.parts[0].pins[pinId("d0")]).toBeUndefined();
    });

    test("removes empty bus and releases its bus pins", () => {
      const kb = useKeyboardStore();
      const deviceId = kb.addDevice(0, "i2c0", "ssd1306") as string;
      kb.assignBusPin(0, pinId("d0"), "i2c0", "sda");
      kb.removeDevice(0, "i2c0", deviceId);
      expect(kb.parts[0].buses[busName("i2c0")]).toBeUndefined();
      expect(kb.parts[0].pins[pinId("d0")]).toBeUndefined();
    });

    test("no-op for non-existent bus", () => {
      const kb = useKeyboardStore();
      kb.removeDevice(0, "nonexistent", "some-id");
    });
  });

  describe("patchDevice", () => {
    test("patches device fields", () => {
      const kb = useKeyboardStore();
      const deviceId = kb.addDevice(0, "i2c0", "ssd1306") as string;
      kb.patchDevice(0, "i2c0", deviceId, { width: 64 });
      const bus = kb.parts[0].buses[busName("i2c0")];
      expect(bus.devices[0]).toHaveProperty("width", 64);
    });

    test("no-op for non-existent bus", () => {
      const kb = useKeyboardStore();
      kb.patchDevice(0, "nonexistent", "some-id", { width: 64 });
    });

    test("no-op for non-existent device", () => {
      const kb = useKeyboardStore();
      kb.addDevice(0, "i2c0", "ssd1306");
      kb.patchDevice(0, "i2c0", "nonexistent", { width: 64 });
    });
  });

  // ── Bus/Device pin assignment ───────────────────────────

  describe("assignBusPin", () => {
    test("assigns bus pin when bus exists", () => {
      const kb = useKeyboardStore();
      kb.addDevice(0, "i2c0", "ssd1306");
      kb.assignBusPin(0, pinId("d0"), "i2c0", "sda");
      const usage = kb.parts[0].pins[pinId("d0")];
      expect(usage).toBeDefined();
      if (usage && "usage" in usage && usage.usage === "bus") {
        expect(usage.bus).toBe(busName("i2c0"));
        expect(usage.role).toBe("sda");
      }
    });

    test("no-op when bus does not exist", () => {
      const kb = useKeyboardStore();
      kb.assignBusPin(0, pinId("d0"), "nonexistent", "sda");
      expect(kb.parts[0].pins[pinId("d0")]).toBeUndefined();
    });
  });

  describe("assignDevicePin", () => {
    test("assigns free pin to device", () => {
      const kb = useKeyboardStore();
      const deviceId = kb.addDevice(0, "i2c0", "ssd1306") as string;
      kb.assignDevicePin(0, pinId("d0"), deviceId, "cs");
      const usage = asDeviceUsage(kb.parts[0].pins[pinId("d0")]);
      expect(usage?.deviceId).toBe(deviceId);
      expect(usage?.role).toBe("cs");
    });

    test("no-op when pin is already in use", () => {
      const kb = useKeyboardStore();
      const deviceId = kb.addDevice(0, "i2c0", "ssd1306") as string;
      kb.assignDevicePin(0, pinId("d0"), deviceId, "cs");
      kb.assignDevicePin(0, pinId("d0"), "other-device", "irq");
      const usage = asDeviceUsage(kb.parts[0].pins[pinId("d0")]);
      expect(usage?.deviceId).toBe(deviceId);
    });
  });

  // ── copyFromPart ────────────────────────────────────────

  describe("copyFromPart", () => {
    test("no-op when copying to self", () => {
      const kb = useKeyboardStore();
      const origKeys = kb.parts[0].keys;
      kb.copyFromPart(0, 0);
      expect(kb.parts[0].keys).toBe(origKeys);
    });

    test("copies kscan and wiring from source part", () => {
      const kb = useKeyboardStore();
      kb.parts[1].kscans = [{ kind: "matrix", id: "src-kscan", diodes: true }] as KscanDriver[];
      const sourceKscanId = kb.parts[1].kscans[0].id;
      const sourcePin = pinId("d0");
      kb.parts[1].pins[sourcePin] = { usage: "kscan", kscan: sourceKscanId, role: "input" };

      const key0 = makeKey({ id: keyId("sk0"), part: 1, row: 0, col: 0 });
      const key1 = makeKey({ id: keyId("tk0"), part: 0, row: 0, col: 0 });
      kb.$patch({ layout: [key0, key1] });

      kb.parts[1].keys[keyId("sk0")] = { input: sourcePin };

      kb.copyFromPart(0, 1);

      expect(kb.parts[0].kscans).toHaveLength(1);
      expect(kb.parts[0].kscans[0].id).not.toBe(sourceKscanId);
      expect(kb.parts[0].kscans[0].kind).toBe("matrix");

      expect(kb.parts[0].keys[keyId("tk0")]).toBeDefined();
    });
  });
});

// ─────────────────────────────────────────────────────────────
// useNavigationStore
// ─────────────────────────────────────────────────────────────

describe("useNavigationStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  test("has default state", () => {
    const nav = useNavigationStore();
    expect(nav.locale).toBe("en");
    expect(nav.activeTab).toBe("layout");
    expect(nav.activePart).toBeNull();
});

  test("clears wiringSelection when activePart changes", async () => {
    const { nextTick } = await import("vue");
    const nav = useNavigationStore();
    nav.wiringSelection = { pinId: "d0", role: "input" };
    nav.activePart = 0;
    await nextTick();
    expect(nav.wiringSelection).toBeNull();
  });
  test("setting wiringSelection does not clear when part unchanged", () => {
    const nav = useNavigationStore();
    nav.wiringSelection = { pinId: "d0", role: "input" };
    expect(nav.wiringSelection).toEqual({ pinId: "d0", role: "input" });
  });
});

// ─────────────────────────────────────────────────────────────
// useSelectionStore
// ─────────────────────────────────────────────────────────────

describe("useSelectionStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  // ── Derived state (always available) ────────────────────

  describe("derived state", () => {
    test("empty by default", () => {
      const sel = useSelectionStore();
      expect(sel.selectedIds).toEqual([]);
      expect(sel.selectedIdSet).toEqual(new Set());
      expect(sel.selectedCount).toBe(0);
    });

    test("filters false entries from rowSelection", () => {
      const sel = useSelectionStore();
      sel.rowSelection = { a: true, b: false, c: true };
      expect(sel.selectedIds).toEqual(["a", "c"]);
      expect(sel.selectedCount).toBe(2);
    });

    test("selectedIdSet matches selectedIds", () => {
      const sel = useSelectionStore();
      sel.rowSelection = { x: true, y: true };
      expect(sel.selectedIdSet).toEqual(new Set(["x", "y"]));
    });
  });

  // ── setSelected ─────────────────────────────────────────

  describe("setSelected", () => {
    test("replaces selection on layout tab", () => {
      const sel = useSelectionStore();
      sel.setSelected(["a", "b"]);
      expect(sel.selectedIds).toEqual(["a", "b"]);
    });

    test("no-op when not on layout tab", () => {
      const nav = useNavigationStore();
      nav.activeTab = "keyboard";
      const sel = useSelectionStore();
      sel.rowSelection = { old: true };
      sel.setSelected(["a", "b"]);
      expect(sel.selectedIds).toEqual(["old"]);
    });
  });

  // ── addSelected ─────────────────────────────────────────

  describe("addSelected", () => {
    test("adds ids to current selection on layout tab", () => {
      const sel = useSelectionStore();
      sel.setSelected(["a"]);
      sel.addSelected(["b", "c"]);
      expect(sel.selectedIds).toEqual(["a", "b", "c"]);
    });

    test("no-op when not on layout tab", () => {
      const nav = useNavigationStore();
      nav.activeTab = "keyboard";
      const sel = useSelectionStore();
      sel.rowSelection = { existing: true };
      sel.addSelected(["new"]);
      expect(sel.selectedIds).toEqual(["existing"]);
    });

    test("handles duplicates idempotently", () => {
      const sel = useSelectionStore();
      sel.setSelected(["a"]);
      sel.addSelected(["a"]);
      expect(sel.selectedIds).toEqual(["a"]);
    });
  });

  // ── removeSelected ──────────────────────────────────────

  describe("removeSelected", () => {
    test("removes ids from selection on any tab", () => {
      const nav = useNavigationStore();
      nav.activeTab = "keyboard";
      const sel = useSelectionStore();
      sel.rowSelection = { a: true, b: true, c: true };
      sel.removeSelected(["a", "c"]);
      expect(sel.selectedIds).toEqual(["b"]);
    });

    test("no-op for ids not in selection", () => {
      const sel = useSelectionStore();
      sel.rowSelection = { a: true };
      sel.removeSelected(["b"]);
      expect(sel.selectedIds).toEqual(["a"]);
    });
  });

  // ── toggleSelected ──────────────────────────────────────

  describe("toggleSelected", () => {
    test("adds unselected ids on layout tab", () => {
      const sel = useSelectionStore();
      sel.setSelected(["a"]);
      sel.toggleSelected(["b"]);
      expect(sel.selectedIds).toEqual(["a", "b"]);
    });

    test("removes selected ids on layout tab", () => {
      const sel = useSelectionStore();
      sel.setSelected(["a", "b"]);
      sel.toggleSelected(["a"]);
      expect(sel.selectedIds).toEqual(["b"]);
    });

    test("no-op when not on layout tab", () => {
      const nav = useNavigationStore();
      nav.activeTab = "keyboard";
      const sel = useSelectionStore();
      sel.rowSelection = { a: true };
      sel.toggleSelected(["a"]);
      expect(sel.selectedIds).toEqual(["a"]);
    });
  });

  // ── clearSelected ───────────────────────────────────────

  describe("clearSelected", () => {
    test("clears all selection on any tab", () => {
      const sel = useSelectionStore();
      sel.rowSelection = { a: true, b: true };
      sel.clearSelected();
      expect(sel.selectedIds).toEqual([]);
      expect(sel.selectedCount).toBe(0);
    });
  });
});
