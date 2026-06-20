import { defineStore } from 'pinia';
import { ulid } from 'ulidx';
import { computed, reactive, ref, watch } from 'vue';
import { KeyboardPartSchema, KeySchema, type AnyBusDevice, type Bus, type BusName, type BusPinRole, type ControllerId, type DeviceId, type EncoderId, type I2cBus, type I2cDevice, type Key, type Keyboard, type KeyId, type KscanDriver, type ModuleId, type PinId, type SpiBus, type SpiDevice } from '~/types';
import type { localeMap } from './locales';
import { Controllers } from '~/metadata/controllers';
import { getDeviceMeta, type DeviceTypeName } from '~/metadata/device';
import type { WiringTransform } from '~/lib/wiringMapping';
import { mapKeyWirings } from '~/lib/wiringMapping';

function isSpiBus(bus: Bus): bus is SpiBus { return bus.type === 'spi'; }
function isI2cBus(bus: Bus): bus is I2cBus { return bus.type === 'i2c'; }

/**
 * Build a PinSelection populated with every GPIO pin from the controller
 * metadata, all set to `undefined` (unused).
 */
function seedPins(controllerId: ControllerId): Record<string, undefined> {
  const gpios = Controllers[controllerId]?.gpios;
  if (!gpios) return {};
  const pins: Record<string, undefined> = {};
  for (const pinId of Object.keys(gpios)) {
    pins[pinId] = undefined;
  }
  return pins;
}

/**
 * Keyboard configuration state
 */
export const useKeyboardStore = defineStore('keyboard', {
  state: (): Keyboard => ({
    name: '',
    shield: '',
    dongle: false,
    modules: [],
    layout: [],
    parts: [
      KeyboardPartSchema.parse({ name: 'left', controller: 'nice_nano_v2', pins: seedPins('nice_nano_v2') }),
      KeyboardPartSchema.parse({ name: 'right', controller: 'nice_nano_v2', pins: seedPins('nice_nano_v2') }),
    ],
  }),

  actions: {

    // ─── Module CRUD ────────────────────────────────────────────

    /** Add a module to the enabled list. No-op if already present. */
    addModule(moduleId: ModuleId) {
      if (!this.modules.includes(moduleId)) {
        this.modules.push(moduleId);
      }
    },

    /** Remove a module from the enabled list. Does NOT cascade-remove devices. */
    removeModule(moduleId: ModuleId) {
      const idx = this.modules.indexOf(moduleId);
      if (idx >= 0) this.modules.splice(idx, 1);
    },
    /** Sort layout array by row then col so keymap order stays consistent. */
    sortLayout() {
      this.layout.sort((a, b) => a.row - b.row || a.col - b.col);
    },

    deleteSelected() {
      const selection = useSelectionStore();
      const ids = selection.selectedIdSet;
      if (ids.size === 0) return;

      this.$patch((state) => {
        state.layout = state.layout.filter((key) => !ids.has(key.id));
        for (const part of state.parts) {
          for (const keyId of ids) {
            delete part.keys[keyId as KeyId];
          }
        }
      });

      selection.clearSelected();
    },

    addKey() {
      const layout = this.layout;
      let row = 0;
      let col = 0;
      let x = 0;
      let y = 0;

      if (layout.length > 0) {
        row = Math.max(...layout.map((k) => k.row));
        col = 1 + Math.max(...layout.map((k) => k.col));
        x = Math.ceil(Math.max(...layout.map((k) => k.x)));
        y = 1 + Math.ceil(Math.max(...layout.map((k) => k.y)));
      }

      const key: Key = KeySchema.parse({
        id: ulid() as KeyId,
        part: 0,
        row,
        col,
        x,
        y,
        w: 1,
        h: 1,
        r: 0,
        rx: 0,
        ry: 0,
      });

      this.$patch((state) => {
        state.layout.push(key);
      });
      this.sortLayout();
    },

    /**
     * Add multiple keys at once (used by paste/duplicate).
     * Each entry should omit `id` — new ULIDs are generated.
     * Returns the IDs of the newly created keys.
     */
    addKeys(keysData: Array<Omit<Key, 'id'>>): KeyId[] {
      const newIds: KeyId[] = [];
      this.$patch((state) => {
        for (const data of keysData) {
          const id = ulid() as KeyId;
          state.layout.push(KeySchema.parse({ ...data, id }));
          newIds.push(id);
        }
      });
      this.sortLayout();
      return newIds;
    },

    patchKey(id: KeyId, changes: Partial<Omit<Key, 'id'>>) {
      this.$patch((state) => {
        const key = state.layout.find((k) => k.id === id);
        if (key) Object.assign(key, changes);
      });
      if ('row' in changes || 'col' in changes) this.sortLayout();
    },

    patchKeys(patches: Array<{ id: KeyId; changes: Partial<Omit<Key, 'id'>> }>) {
      this.$patch((state) => {
        for (const { id, changes } of patches) {
          const key = state.layout.find((k) => k.id === id);
          if (key) Object.assign(key, changes);
        }
      });
      const needsSort = patches.some(({ changes }) => 'row' in changes || 'col' in changes);
      if (needsSort) this.sortLayout();
    },
    /**
     * Change the controller for a part, wiping all part-specific data
     * (pins, kscans, keys, encoders, buses) and resetting to defaults.
     */
    changeController(partIdx: number, newController: ControllerId) {
      this.$patch((state) => {
        const part = state.parts[partIdx];
        if (!part) return;
        part.controller = newController;
        part.pins = seedPins(newController);
        part.kscans = [];
        part.keys = {};
        part.encoders = [];
        part.buses = {};
      });
    },
    // ─── Kscan CRUD ────────────────────────────────────────────
    // Kscan drivers detect key presses by scanning GPIO pins.
    // Pin assignments live in part.pins (shared pin map), not on the kscan entity.
    // When a kscan is removed, its pins are released back to unused (set to undefined).

    addKscan(partIdx: number, kind: KscanDriver['kind']) {
      this.$patch((state) => {
        const part = state.parts[partIdx];
        if (!part) return;
        const id = ulid();
        switch (kind) {
          case 'matrix':
            part.kscans.push({ kind: 'matrix', id, diodes: true });
            break;
          case 'direct':
            part.kscans.push({ kind: 'direct', id, mode: 'gnd' });
            break;
          case 'charlieplex':
            part.kscans.push({ kind: 'charlieplex', id });
            break;
        }
      });
    },

    removeKscan(partIdx: number, kscanId: string) {
      this.$patch((state) => {
        const part = state.parts[partIdx];
        if (!part) return;
        part.kscans = part.kscans.filter((k) => k.id !== kscanId);
        // Collect released pin IDs for wiring cleanup.
        const releasedPins: PinId[] = [];
        for (const [pinId, usage] of Object.entries(part.pins)) {
          if (usage?.usage === 'kscan' && usage.kscan === kscanId) {
            part.pins[pinId as PinId] = undefined;
            releasedPins.push(pinId as PinId);
          }
        }
        // Remove released pins from all key wirings.
        for (const pinId of releasedPins) {
          for (const [keyId, wiring] of Object.entries(part.keys)) {
            if (!wiring) continue;
            if (wiring.input === pinId) wiring.input = undefined;
            if (wiring.output === pinId) wiring.output = undefined;
            if (wiring.input === undefined && wiring.output === undefined) {
              part.keys[keyId as KeyId] = undefined;
            }
          }
        }
      });
    },

    patchKscan(partIdx: number, kscanId: string, changes: Record<string, unknown>) {
      this.$patch((state) => {
        const part = state.parts[partIdx];
        if (!part) return;
        const kscan = part.kscans.find((k) => k.id === kscanId);
        if (kscan) Object.assign(kscan, changes);
      });
    },
    /** Move a kscan up (-1) or down (+1) in the list. */
    moveKscan(partIdx: number, kscanId: string, direction: -1 | 1) {
      this.$patch((state) => {
        const part = state.parts[partIdx];
        if (!part) return;
        const idx = part.kscans.findIndex((k) => k.id === kscanId);
        const target = idx + direction;
        if (idx < 0 || target < 0 || target >= part.kscans.length) return;
        const temp = part.kscans[idx];
        part.kscans[idx] = part.kscans[target];
        part.kscans[target] = temp;
      });
    },

    // ─── Encoder CRUD ──────────────────────────────────────────

    addEncoder(partIdx: number) {
      this.$patch((state) => {
        const part = state.parts[partIdx];
        if (!part) return;
        part.encoders.push({ id: ulid() as EncoderId });
      });
    },

    /** Move an encoder up (-1) or down (+1) in the list. */
    moveEncoder(partIdx: number, encoderId: string, direction: -1 | 1) {
      this.$patch((state) => {
        const part = state.parts[partIdx];
        if (!part) return;
        const idx = part.encoders.findIndex((e) => e.id === encoderId);
        const target = idx + direction;
        if (idx < 0 || target < 0 || target >= part.encoders.length) return;
        const temp = part.encoders[idx];
        part.encoders[idx] = part.encoders[target];
        part.encoders[target] = temp;
      });
    },
    removeEncoder(partIdx: number, encoderId: string) {
      this.$patch((state) => {
        const part = state.parts[partIdx];
        if (!part) return;
        // Cascade: release pins assigned to this encoder
        for (const [pinId, usage] of Object.entries(part.pins)) {
          if (usage?.usage === 'encoder' && usage.encoderId === encoderId) {
            part.pins[pinId as PinId] = undefined;
          }
        }
        part.encoders = part.encoders.filter((e) => e.id !== encoderId);
      });
    },

    // ─── Pin assignment ────────────────────────────────────────
    /** Assign an unused pin to a kscan driver. */
    assignPinToKscan(partIdx: number, pinId: PinId, kscanId: string, role: 'input' | 'output' | 'interrupt') {
      this.$patch((state) => {
        const part = state.parts[partIdx];
        if (!part) return;
        if (!part.kscans.some((k) => k.id === kscanId)) return;
        if (part.pins[pinId] !== undefined) return; // pin already in use
        part.pins[pinId] = { usage: 'kscan', kscan: kscanId, role };
      });
    },

    /** Release a pin (reset to unused). */
    releasePin(partIdx: number, pinId: PinId) {
      this.$patch((state) => {
        const part = state.parts[partIdx];
        if (!part) return;
        // Release the pin from the pin map.
        part.pins[pinId] = undefined;
        // Remove the pin from all key wirings that reference it.
        for (const [keyId, wiring] of Object.entries(part.keys)) {
          if (!wiring) continue;
          if (wiring.input === pinId) {
            wiring.input = undefined;
          }
          if (wiring.output === pinId) {
            wiring.output = undefined;
          }
          // Clean up fully empty wiring entries.
          if (wiring.input === undefined && wiring.output === undefined) {
            part.keys[keyId as KeyId] = undefined;
          }
        }
      });
    },


    /** Assign a pin to an encoder phase (pinA/pinB). */
    setEncoderPin(partIdx: number, encoderId: string, phase: 'pinA' | 'pinB', pinId: string | undefined) {
      this.$patch((state) => {
        const part = state.parts[partIdx];
        if (!part) return;
        const encoder = part.encoders.find((e) => e.id === encoderId);
        if (!encoder) return;
        // Find and release old pin for this encoder+phase
        for (const [pid, usage] of Object.entries(part.pins)) {
          if (usage?.usage === 'encoder' && usage.encoderId === encoderId && usage.role === phase) {
            part.pins[pid as PinId] = undefined;
            break;
          }
        }
        // Assign new pin if provided and available
        if (pinId && part.pins[pinId as PinId] === undefined) {
          part.pins[pinId as PinId] = { usage: 'encoder', encoderId: encoder.id, role: phase };
        }
      });
    },

    /** Wire a selected pin to a key (associate kscan pin with key matrix position). */
    setKeyWiring(partIdx: number, keyId: KeyId, wiring: { pinId: PinId; role: 'input' | 'output' }) {
      this.$patch((state) => {
        const part = state.parts[partIdx];
        if (!part) return;
        const current = part.keys[keyId] ?? {};
        part.keys[keyId] = { ...current, [wiring.role]: wiring.pinId };
      });
    },

    // ─── Bus/Device CRUD ───────────────────────────────────────
    // Buses are implicit: they are created when the first device is
    // added and removed when the last device is removed. Users never
    // call addBus/removeBus directly — the device lifecycle drives it.
    //
    // Bus communication pins (MOSI, MISO, SCK, SDA, SCL) and device
    // GPIOs (CS, IRQ, DR) live in part.pins, not on bus/device entities.

    /**
     * Add a device to a bus. If the bus doesn't exist yet, it is created
     * automatically. Returns the new DeviceId.
     */
    addDevice(partIdx: number, busName: string, deviceType: DeviceTypeName): DeviceId | undefined {
      const meta = getDeviceMeta(deviceType);
      if (!meta) return undefined;
      const deviceId = ulid() as DeviceId;
      const device = meta.schema.parse({ id: deviceId, type: deviceType }) as AnyBusDevice;
      let applied = false;
      this.$patch((state) => {
        const part = state.parts[partIdx];
        if (!part) return;
        const existing = part.buses[busName as BusName];
        if (existing && existing.type !== meta.bus) return;
        if (!existing) {
          part.buses[busName as BusName] = meta.bus === 'i2c'
            ? { type: 'i2c', devices: [] }
            : { type: 'spi', devices: [] };
        }
        const bus = part.buses[busName as BusName]!;
        if (isSpiBus(bus)) bus.devices.push(device as SpiDevice);
        else if (isI2cBus(bus)) bus.devices.push(device as I2cDevice);
        applied = true;
      });
      return applied ? deviceId : undefined;
    },

    /**
     * Remove a device from a bus. If this was the last device, the bus
     * is also removed and its communication pins are released.
     */
    removeDevice(partIdx: number, busName: string, deviceId: string) {
      this.$patch((state) => {
        const part = state.parts[partIdx];
        if (!part) return;
        const bus = part.buses[busName as BusName];
        if (!bus) return;
        // Release device GPIO pins
        for (const [pinId, usage] of Object.entries(part.pins)) {
          if (usage?.usage === 'device' && usage.deviceId === deviceId) {
            part.pins[pinId as PinId] = undefined;
          }
        }
        const idx = bus.devices.findIndex((d) => d.id === deviceId);
        if (idx !== -1) bus.devices.splice(idx, 1);
        // If the bus is now empty, remove it and release its bus pins
        if (bus.devices.length === 0) {
          for (const [pinId, usage] of Object.entries(part.pins)) {
            if (usage?.usage === 'bus' && usage.bus === busName) {
              part.pins[pinId as PinId] = undefined;
            }
          }
          delete part.buses[busName as BusName];
        }
      });
    },


    /** Patch properties on a device (e.g., CPI, address, dimensions). */
    patchDevice(partIdx: number, busName: string, deviceId: string, changes: Record<string, unknown>) {
      this.$patch((state) => {
        const part = state.parts[partIdx];
        if (!part) return;
        const bus = part.buses[busName as BusName];
        if (!bus) return;
        const device = bus.devices.find((d) => d.id === deviceId);
        if (device) Object.assign(device, changes);
      });
    },

    // ─── Pin assignment for buses and devices ──────────────────

    /** Assign a pin to a bus role (MOSI, MISO, SCK, SDA, SCL). */
    assignBusPin(partIdx: number, pinId: PinId, busName: string, role: BusPinRole) {
      this.$patch((state) => {
        const part = state.parts[partIdx];
        if (!part) return;
        if (!part.buses[busName as BusName]) return;
        part.pins[pinId] = { usage: 'bus', bus: busName as BusName, role };
      });
    },

    /** Assign an unused pin to a device GPIO role (CS, IRQ, DR, etc.). */
    assignDevicePin(partIdx: number, pinId: PinId, deviceId: string, role: string) {
      this.$patch((state) => {
        const part = state.parts[partIdx];
        if (!part) return;
        if (part.pins[pinId] !== undefined) return; // pin already in use
        part.pins[pinId] = { usage: 'device', deviceId: deviceId as DeviceId, role };
      });
    },
    // ─── Copy wiring from another part ─────────────────────────
    /**
     * Copy kscan wirings from another part, with optional layout transform.
     *
     * Maps keys between the source and target parts by (row, col) position,
     * then copies the wiring (input/output pin references) and kscan pin
     * assignments. Kscan drivers are cloned with new IDs.
     */
    copyFromPart(partIdx: number, sourcePartIdx: number, transform: WiringTransform = "none") {
      if (partIdx === sourcePartIdx) return;
      this.$patch((state) => {
        const target = state.parts[partIdx];
        const source = state.parts[sourcePartIdx];
        if (!target || !source) return;

        // 1. Map key wirings between layouts
        const result = mapKeyWirings(
          state.layout,
          sourcePartIdx,
          partIdx,
          source.keys,
          transform,
        );

        // 2. Clone kscan drivers from source (new IDs)
        const kscanIdMap = new Map<string, string>();
        const newKscans: KscanDriver[] = source.kscans.map((kscan) => {
          const newId = ulid();
          kscanIdMap.set(kscan.id, newId);
          switch (kscan.kind) {
            case "matrix":
              return { kind: "matrix" as const, id: newId, diodes: kscan.diodes };
            case "direct":
              return { kind: "direct" as const, id: newId, mode: kscan.mode };
            case "charlieplex":
              return { kind: "charlieplex" as const, id: newId };
          }
        });

        // 3. Copy kscan pin assignments from source (updated kscan IDs)
        const newPins = { ...target.pins };
        for (const [pinId, usage] of Object.entries(source.pins)) {
          if (!usage || usage.usage !== "kscan") continue;
          const newKscanId = kscanIdMap.get(usage.kscan);
          if (!newKscanId) continue;
          newPins[pinId as PinId] = {
            usage: "kscan",
            kscan: newKscanId,
            role: usage.role,
          };
        }

        // 4. Set key wiring from mapped result
        const newKeys = { ...target.keys };
        for (const [targetKeyId, wiring] of Object.entries(result.keyWirings)) {
          newKeys[targetKeyId as KeyId] = wiring;
        }

        target.kscans = newKscans;
        target.pins = newPins as typeof target.pins;
        target.keys = newKeys;
      });
    },
  },
});

/**
 * User interface state
 */
export const useNavigationStore = defineStore('navigation', () => {
  const locale = ref<keyof typeof localeMap>('en');
  const activeTab = ref<'layout' | 'keyboard' | 'parts'>('layout');
  const activePart = ref<number | null>(null);
  /** Currently selected pin for key wiring. */
  const wiringSelection = ref<{ pinId: string; role: 'input' | 'output' } | null>(null);
  const dialog = reactive({ info: true });
  const build = reactive({ repoId: '' });

  // Clear wiring selection when switching parts.
  watch(activePart, () => { wiringSelection.value = null; });

  // Clear wiring selection when the selected pin is released (covers all release paths).
  const keyboard = useKeyboardStore();
  watch(
    () => {
      if (activePart.value === null) return null;
      return keyboard.parts[activePart.value]?.pins;
    },
    (newPins, oldPins) => {
      if (!newPins || !oldPins || !wiringSelection.value) return;
      const selectedPinId = wiringSelection.value.pinId;
      const pid = selectedPinId as PinId;
      if (newPins[pid] === undefined && oldPins[pid] !== undefined) {
        wiringSelection.value = null;
      }
    },
    { deep: true },
  );

  return { locale, activeTab, activePart, wiringSelection, dialog, build };
});

export const useSelectionStore = defineStore('selection', () => {
  const navigation = useNavigationStore()

  // ─── Canonical state ─────────────────────────────────────────
  // May contain `false` entries written by TanStack on user deselect.
  // Use the filtered getters below for actual selected-entity data.
  const rowSelection = ref<Record<string, boolean>>({})

  // ─── Invariant enforcement ───────────────────────────────────
  // Clear selection when navigating away from the keyboard tab.
  watch(
    () => navigation.activeTab,
    (tab, previousTab) => {
      if (previousTab === 'layout' && tab !== 'layout') {
        rowSelection.value = {}
      }
    },
  )

  // ─── Filtered derived state ──────────────────────────────────
  // Only entries where value === true. Safe for graphics consumers.
  const selectedIds = computed(() =>
    Object.entries(rowSelection.value)
      .filter(([, selected]) => selected)
      .map(([id]) => id),
  )

  const selectedIdSet = computed(() => new Set(selectedIds.value))
  const selectedCount = computed(() => selectedIds.value.length)

  // ─── Guard ───────────────────────────────────────────────────
  function isLayoutTab(): boolean {
    return navigation.activeTab === 'layout'
  }

  // ─── Mutations ───────────────────────────────────────────────
  // Called by the graphics area. Each produces a clean record
  // (only `true` values, no `false` entries).

  /** Replace the entire selection with the given ids. */
  function setSelected(ids: string[]) {
    if (!isLayoutTab()) return
    rowSelection.value = Object.fromEntries(ids.map((id) => [id, true]))
  }

  /** Add ids to the current selection. */
  function addSelected(ids: string[]) {
    if (!isLayoutTab()) return
    const next = { ...rowSelection.value }
    for (const id of ids) {
      next[id] = true
    }
    rowSelection.value = next
  }

  /** Remove ids from the current selection (safe on any tab). */
  function removeSelected(ids: string[]) {
    const next = { ...rowSelection.value }
    for (const id of ids) {
      delete next[id]
    }
    rowSelection.value = next
  }

  /** Toggle each id in/out of the current selection. */
  function toggleSelected(ids: string[]) {
    if (!isLayoutTab()) return
    const next = { ...rowSelection.value }
    for (const id of ids) {
      if (next[id]) {
        delete next[id]
      } else {
        next[id] = true
      }
    }
    rowSelection.value = next
  }

  /** Clear all selection. */
  function clearSelected() {
    rowSelection.value = {}
  }

  return {
    // State (bind to UTable)
    rowSelection,
    // Derived (consume in graphics / UI)
    selectedIds,
    selectedIdSet,
    selectedCount,
    // Mutations (call from graphics)
    setSelected,
    addSelected,
    removeSelected,
    toggleSelected,
    clearSelected,
  }
})
