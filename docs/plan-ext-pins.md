# Design: Extended Pins — Capability System

## Problem

Today's pin system treats all GPIO pins as interchangeable. When a user assigns a pin to a kscan input, nothing checks whether the pin can actually serve as an input. When a 595 shift register is added, its GPIO outputs aren't part of the pin inventory at all — they live outside the system. The UI shows all pins equally, with no filtering by what a pin can physically do.

This design adds a **pin capability** layer: every pin declares what it can do, the UI filters by those capabilities, and validation enforces them at export.

## Design Goals

1. **Capability-aware pin inventory** — every pin (controller GPIO and extension device output) declares its hardware capabilities.
2. **Sparse pin map** — `part.pins` only contains assigned pins. No pre-populated `undefined` entries.
3. **Unified pin resolution** — a single function resolves any `PinId` to its full metadata, regardless of whether it comes from the controller or an extension device.
4. **Capability-driven UI** — pin selection dropdowns only show pins compatible with the requested role.
5. **Capability-driven validation** — export-time validation rejects pin assignments that the hardware cannot fulfill.

## Pin Capabilities

A **capability** is a hardware-level property of a physical pin. Capabilities are independent of software assignment — they describe what the pin *can* do, not what it's *being used for*.

```typescript
type PinCapability =
  | "gpioIn"     // Can sense voltage (kscan input, encoder, device IRQ)
  | "gpioOut"    // Can drive voltage (kscan output, charlieplex, device CS)
  | "interrupt"  // Can generate hardware interrupts
  | "native";    // Pin is directly on the controller, not from an extension device

Each pin carries a set of these capabilities:

```typescript
interface PinCapabilities {
  gpioIn: boolean;
  gpioOut: boolean;
  interrupt: boolean;
  /** Whether this pin is native to the controller (not from an extension device). */
  native: boolean;
  /**
   * Check if this pin can serve a specific role on a specific bus instance.
   * Takes the bus name (e.g., "i2c0", "spi1") and the pin role (e.g., "sda", "sck").
   *
   * On nRF52840, the GPIO matrix is fully flexible — this returns true for all inputs.
   * On RP2040, each GPIO has a fixed set of peripheral functions — this checks
   * against a lookup table.
   */
  canBus(busName: BusName, role: BusPinRole): boolean;
}
```

### Why `canBus` is a function, not an array

A naive design would store `busRoles: BusPinRole[]` — a flat list of roles the pin can serve. This breaks down in two ways:

**Bus-instance specificity.** On RP2040, GPIO0 can be I2C0 SDA but *not* I2C1 SDA. A flat role array `["sda", "sck"]` doesn't capture which bus instance the role applies to. You'd need something like `"i2c0:sda"`, which is brittle and couples the pin metadata to the SoC's bus enumeration.

**Duplication on flexible SoCs.** On nRF52840, every GPIO can serve every bus role. Expanding this into per-pin arrays would require `pinCount × busCount × rolesPerBus` entries — e.g., 23 pins × 8 buses × 5 roles = 920 entries, all identical. A function `canBus(busName, role) => true` expresses this in one line per pin.

The function approach is also forward-compatible: if a future SoC adds a new bus type or role, existing pin metadata doesn't change — only the new pins need new `canBus` logic.

### Why `native` exists

Bus communication pins (SDA, SCL, MOSI, MISO, SCK) and device GPIO pins (CS, IRQ) must be on the controller's hardware peripherals. A 595 shift register's GPIO output cannot serve as I2C SDA — it's physically on a different chip, connected via SPI.

The `native` flag marks controller pins as directly connected to the SoC. Bus and device pin assignments are restricted to native pins. Extension device pins (which have `native: false`) can only be used for kscan and encoder features — the roles where raw GPIO output is sufficient.

### Why there is no `device` capability

The draft lists `device` as a capability. In this design, device GPIO requirements are derived from existing capabilities:

- A chip-select (CS) pin needs `gpioOut`.
- An interrupt (IRQ) pin needs `gpioIn` + `interrupt`.
- A data-ready (DR) pin needs `gpioIn`.

There is no hardware state that is "device-only." The `device` category is a UI concern (which pins to show in the device pin selector), not a hardware capability. The UI question is answered by filtering: "show pins that have the capabilities this device role requires."

## Pin Metadata

Every pin in the system has a `PinInfo` record that carries its full identity:

```typescript
interface PinInfo {
  /** Unique identifier. Controller pins use raw IDs ("d0"). Device pins use "DEVICE_ULID:INDEX". */
  id: PinId;
  /** Human-readable display name. */
  label: string;
  /** Alternative names (e.g., SoC pin names like "P0.08"). */
  aka?: string[];
  /**
   * Devicetree node label for DTS generation.
   * Controller pins: the GPIO controller node (e.g., "&pro_micro").
   * Device pins: the device's unique node label (e.g., "&shifter0").
   */
  dtsNodeLabel: string;
  /**
   * Pin number within the DTS node.
   * Controller pins: the pin index on the GPIO controller (e.g., "0").
   * Device pins: the GPIO index on the device (e.g., "3").
   */
  dtsPinNumber: string;
  /** Pinctrl reference for SoC-specific pinctrl nodes. Only present for native (controller) pins. */
  pinctrlRef?: string;
  /** Hardware capabilities of this pin. */
  capabilities: PinCapabilities;
  /** Where this pin comes from. */
  source: PinSource;
}

type PinSource =
  | { type: "controller"; controllerId: ControllerId }
  | { type: "device"; deviceId: DeviceId; deviceTypeName: string };
```

### PinId length constraint

The current `PinIdSchema` has `.max(10)`. Device pin IDs use the format `DEVICE_ULID:INDEX` (e.g., `01ARZ3NDEKTSV4RRFFQ69G5FAV:0`), which is 28 characters. The `PinIdSchema` max must be relaxed to accommodate these longer IDs. A limit of 40 characters provides headroom for ULID-based device pin IDs while still catching malformed input.

The `source` field answers "who provides this pin?" — it identifies the *origin* of the pin, not what the pin is being *used for*. A pin assigned as a device's chip-select (`PinUsageDevice.deviceId`) still has `source.deviceId` pointing to the device that *provides* the pin (e.g., a 595 shift register), not the device consuming it. This distinction matters for:

- **Export**: controller pins need pinctrl nodes; device pins are handled by the device template.
- **UI**: device pins can show which device they belong to.
- **Validation**: device pins can only be used while the device that provides them exists on the bus.

## Pin Providers: Derived from Keyboard State

The keyboard state is the single source of truth. The list of available pins is **derived** from `part.controller` and `part.buses` (which contain devices). There is no separate inventory object to keep in sync.

### How pins are derived

**Controller pins** come from controller metadata. Given a `ControllerId`, look up `Controllers[id]` to get the `gpios` map and `pinCapabilities`. Each entry becomes a `PinInfo` with `native: true`. The `canBus` function on each pin captures the SoC's routing matrix.

**Device pins** come from device metadata. Each device type can optionally define a `pins` function on its `DeviceMeta`:

```typescript
// On DeviceMeta — metadata-time definition
interface DeviceMeta<...> {
  // ... existing fields ...
  /**
   * Devicetree node label base for this device type.
   * Each instance gets a unique label by appending the instance index:
   * "shifter" → "&shifter0", "&shifter1", etc.
   *
   * Only required for device types that provide pins (i.e., define `pins`).
   */
  dtsNodeLabel?: string;
  /**
   * Generate pin metadata for a device instance.
   * Returns PinInfo[] if this device type provides pins, or undefined if it doesn't.
   *
   * @param device - The device instance from part.buses.
   * @param deviceIndex - The device's position within its bus (0-based).
   *   The resolver uses this with `DeviceMeta.dtsNodeLabel` to build the
   *   `deviceNodeLabels` map — the `pins` function doesn't need to set it.
   */
  pins?: (device: AnyBusDevice, deviceIndex: number) => PinInfo[];
}
```

The 595 shift register defines `dtsNodeLabel: "shifter"` and a `pins` function that generates 8–32 output pins (from the device's `ngpios` config). Each pin gets `{ gpioIn: false, gpioOut: true, interrupt: false, native: false, canBus: () => false }` with `dtsPinNumber` set to the GPIO index (`"0"` through `"31"`). Pin IDs follow `DEVICE_ULID:INDEX` (e.g., `01ARZ3NDEKTSV4RRFFQ69G5FAV:0`). The resolver (`resolveDevicePins`) independently builds the `deviceNodeLabels` map entry `"&shifter0"` → device ULID using `meta.dtsNodeLabel` + bus index. Other devices (SSD1306, PMW3610, etc.) don't provide pins and omit `pins`.

### Pin resolution: pure function + Vue wrapper

Pin derivation is split into a pure function (no Vue dependency) and a thin Vue composable. The pure function is the single source of truth — used by validators, export code, and the composable alike.

```typescript
// ── Pure function (no Vue dependency) ─────────────────────
// Used by: validators, export templates, tests.

interface PinInventory {
  /** All pins (controller + device), resolved from keyboard state. */
  allPins: PinInfo[];
  /**
   * Unique DTS node labels for each pin-providing device.
   * Keyed by device ULID. Example: "01ARZ3NDEKTSV4RRFFQ69G5FAV" → "&shifter0".
   * The UI uses this to group pins by source device and display the device label.
   */
  deviceNodeLabels: Record<DeviceId, string>;
}

/** Derive controller GPIO pins from controller metadata. */
function resolveControllerPins(part: KeyboardPart): PinInfo[] {
  const meta = Controllers[part.controller];
  if (!meta) return [];
  return Object.entries(meta.gpios).map(([id, gpio]): PinInfo => ({
    id: id as PinId,
    label: gpio.label,
    aka: gpio.aka,
    dtsNodeLabel: gpio.dtsNodeLabel,
    dtsPinNumber: gpio.dtsPinNumber,
    pinctrlRef: gpio.pinctrlRef,
    capabilities: meta.pinCapabilities[id as PinId],
    source: { type: "controller", controllerId: part.controller },
  }));
}

/** Derive extension device pins and build the device node label map. */
function resolveDevicePins(part: KeyboardPart): { devicePins: PinInfo[]; deviceNodeLabels: Record<DeviceId, string> } {
  const devicePins: PinInfo[] = [];
  const deviceNodeLabels: Record<DeviceId, string> = {};
  for (const bus of Object.values(part.buses)) {
    for (const [index, device] of bus.devices.entries()) {
      const meta = getDeviceMeta(device.type);
      if (meta?.dtsNodeLabel) {
        deviceNodeLabels[device.id] = `&${meta.dtsNodeLabel}${index}`;
      }
      if (meta?.pins) {
        devicePins.push(...meta.pins(device, index));
      }
    }
  }
  return { devicePins, deviceNodeLabels };
}

/** Resolve the full pin inventory from a part's state. */
function resolvePinInventory(part: KeyboardPart): PinInventory {
  const { devicePins, deviceNodeLabels } = resolveDevicePins(part);
  return {
    allPins: [...resolveControllerPins(part), ...devicePins],
    deviceNodeLabels,
  };
}
```

```typescript
// ── Vue composable (reactive wrapper) ─────────────────────
// Used by: UI components that need reactive pin data.

function usePinInventory(part: ComputedRef<KeyboardPart>) {
  const inventory = computed(() => resolvePinInventory(part.value));
  const allPins = computed(() => inventory.value.allPins);
  const deviceNodeLabels = computed(() => inventory.value.deviceNodeLabels);

  /** Get a specific pin by ID. */
  const getPin = (id: PinId): PinInfo | undefined =>
    allPins.value.find(p => p.id === id);

  /** Get all pins that can serve a specific bus role. */
  const getPinsForBus = (busName: BusName, role: BusPinRole): PinInfo[] =>
    allPins.value.filter(p => p.capabilities.native && p.capabilities.canBus(busName, role));

  return { allPins, deviceNodeLabels, getPin, getPinsForBus };
}
```

The pure functions (`resolveControllerPins`, `resolveDevicePins`, `resolvePinInventory`) have no Vue imports — they operate on plain `KeyboardPart` data. The composable wraps `resolvePinInventory` in `computed()` so the derivation re-runs when the part state changes. This keeps the backend and frontend in lockstep: both call the same derivation logic, one with reactivity and one without.

### Lifecycle

No explicit lifecycle. The derivation runs on every call to `resolvePinInventory(part)` (or the reactive `usePinInventory` wrapper). Consumers don't need to register or unregister — the keyboard state drives everything:

1. **Controller changed**: `resolveControllerPins` re-derives from the new controller's metadata.
2. **Device added/removed**: `resolveDevicePins` re-derives from the updated buses.
3. **Pin lookup**: consumers use `getPin(id)` or `getPinsForBus(busName, role)` from the composable, or call `resolvePinInventory` directly in backend code.

## Sparse Pin Map

The `part.pins` map changes from `Record<PinId, PinUsage | undefined>` to `Record<PinId, PinUsage>`. The map only contains entries for pins that are actually assigned. Unassigned pins are absent.

### Why sparse

The current design pre-populates every controller GPIO as `undefined`. This means:

- The map is large (20+ entries) even when the user hasn't assigned anything.
- Serialization includes all unused pins.
- "Is this pin free?" requires checking `=== undefined` rather than checking key existence.

With a sparse map:

- The map starts empty.
- "Is this pin free?" is `!(pinId in part.pins)`.
- Serialization is compact.
- The list of available pins comes from the pin provider, not from the map.

### Initialization

When a part is created or its controller changes, `part.pins` is reset to `{}`. The pin provider supplies the available pins; the map is the assignment overlay.

### Cascade cleanup

When a feature is removed (kscan, encoder, device), the store action scans the map for entries tagged with that feature's ID and deletes them. The cascade logic is the same as today, but uses `delete` instead of setting to `undefined`.

## Capabilities as Metadata, Not Enforcement

The pin system provides **what each pin can do** (`PinCapabilities`). It does **not** decide what a pin *should* be used for. That decision belongs to downstream consumers — the UI (which pins to show in a dropdown), the store (which assignments to allow), and the validator (which configurations to reject).

For example, a kscan input requires `gpioIn` + `interrupt`. The pin system doesn't encode this rule — the kscan editor component does, by querying the inventory for pins that match. A future feature with different requirements doesn't require changes to the pin system.

This separation keeps the pin model stable as new features are added. The capabilities are hardware facts; the requirements are feature-level policies.

## Bus Capability Sub-typing

The bus capability problem has two layers:

1. **Per-pin bus routing** — which (bus instance, role) pairs can this pin serve? (Encoded in `PinCapabilities.canBus`.)
2. **Per-SoC bus conflicts** — which bus instances are mutually exclusive? (Already handled by `SOC_BUS_CONFLICTS`.)

The first layer is new. The second layer is unchanged.

### How bus pin selection works

When the user assigns a pin to bus `i2c0` with role `sda`:

1. The UI calls `getPinsForBus("i2c0", "sda")` from the `usePinInventory` composable.
2. The dropdown shows only those pins (excluding already-assigned ones from `part.pins`).
3. The user selects a pin; the store records `{ usage: "bus", bus: "i2c0", role: "sda" }`.

The `getPinsForBus` function filters `allPins` by `canBus(busName, role)`. For nRF52840, this returns all controller pins in one pass. For RP2040, it returns only the pins whose `canBus` closure matches.

### nRF52840 vs RP2040

- **nRF52840**: `canBus: () => true` on every pin. The GPIO matrix is fully flexible.
- **RP2040**: `canBus` is a closure over a per-pin lookup. GPIO0: `("i2c0", "sda") → true`, `("spi0", "mosi") → true`, everything else → false.

## Controller Metadata Changes

Controller metadata gains a `pinCapabilities` map that declares capabilities per GPIO pin. This replaces the implicit assumption that "all GPIO pins can do everything." All controller pins have `native: true`. The `canBus` function captures the SoC's pin routing matrix — a simple `() => true` for nRF52840's flexible GPIO matrix, or a per-pin lookup for RP2040's fixed peripheral assignments.

The existing `PinMetadata` interface splits `dtsRef` into `dtsNodeLabel` and `dtsPinNumber`, and makes `pinctrlRef` optional (only controller pins have pinctrl references):

```typescript
interface PinMetadata {
  label: string;
  aka?: string[];
  /** Devicetree node label, e.g. "&pro_micro" or "&gpio1". */
  dtsNodeLabel: string;
  /** Pin number on the GPIO controller, e.g. "0", "8". */
  dtsPinNumber: string;
  /** Pinctrl reference for pinctrl nodes, e.g. "0, 8" (nRF52), "26" (RP2040). Only on native pins. */
  pinctrlRef?: string;
}
```

```typescript
interface ControllerMetadata {
  // ... existing fields ...

  /**
   * Capabilities for each GPIO pin.
   * Keys are PinIds that match entries in `gpios`.
   */
  pinCapabilities: Record<PinId, PinCapabilities>;
}
```

For nRF52840 controllers, every GPIO entry would have the same full capabilities. For RP2040, capabilities vary per pin. This is hardcoded in the controller definition, derived from the SoC datasheet.

The existing `gpios` map (with `label`, `aka`, `dtsNodeLabel`, `dtsPinNumber`, `pinctrlRef`) is updated to use the split DTS format. The new `pinCapabilities` map is a parallel structure indexed by the same keys.

## DTS Reference Composition

The split `dtsNodeLabel` / `dtsPinNumber` fields are composed into a full DTS reference string at the point of use (template generation, validation). This keeps the data model clean while providing the composed string where DTS output is needed:

```typescript
/**
 * Compose a full devicetree pin reference from its parts.
 * Example: composeDtsRef("&pro_micro", "0") → "&pro_micro 0"
 */
function composeDtsRef(pin: PinInfo): string {
  return `${pin.dtsNodeLabel} ${pin.dtsPinNumber}`;
}
```

For controller pins, `dtsNodeLabel` and `dtsPinNumber` are both hardcoded in `PinMetadata` (e.g., `"&pro_micro"` + `"0"` → `"&pro_micro 0"`). For device pins, `dtsNodeLabel` is the device's unique node label (generated from `DeviceMeta.dtsNodeLabel` + instance index, e.g., `"&shifter0"`), and `dtsPinNumber` is the GPIO index on that device (e.g., `"3"` → `"&shifter0 3"`).

The existing `PinTemplateInfo` interface (used by template functions) continues to carry a composed `dtsRef: string` — templates don't need the decomposed form.

## Validation Changes

The `ValidatedKeyboardSchema` superRefine gains pin resolution and existence checks:

1. For each pin in `part.pins`, derive the `PinInfo` from the keyboard state (same derivation as the composable).
2. Reject if the pin ID doesn't resolve (pin doesn't exist on controller or active extension device).
3. Reject if a device pin is assigned but the device no longer exists on the bus.

Capability checking (e.g., "does this pin have `gpioIn` for a kscan input?") is the validator's responsibility, using `PinInfo.capabilities` as the data source. The pin system doesn't enforce which capabilities a feature requires.

## UI Changes

Pin selection dropdowns derive compatible pins from the keyboard state:

- **Kscan input assignment**: filter `allPins` for `gpioIn && interrupt`, exclude assigned.
- **Kscan output assignment**: filter `allPins` for `gpioOut`, exclude assigned.
- **Encoder assignment**: filter `allPins` for `gpioIn && interrupt`, exclude assigned.
- **Bus pin assignment**: call `getPinsForBus(busName, role)`, exclude assigned and non-native.
- **Device pin assignment**: filter `allPins` for `native && (gpioIn || gpioOut)`, exclude assigned.

All dropdowns also exclude pins already assigned in `part.pins`.

The pin panel (the visual GPIO map) continues to show all controller pins and extension device pins, but uses the capability info to display capability badges or indicators (e.g., a pin without `interrupt` capability is visually distinguished when the user is assigning encoder pins).

## Extension Lifecycle

When an extension device is added:

1. Store creates the device entity on the bus.
2. `devicePins` re-derives automatically (the composable reads `part.buses`).
3. Device pins become available for assignment.

When an extension device is removed:

1. Store scans `part.pins` for entries with `source.type === "device"` and `source.deviceId === removedId`.
2. Deletes those entries from the map.
3. Cleans up any wiring or feature references that used those pins.
4. Deletes the device entity.
5. `devicePins` re-derives automatically.

## Summary of Changes

| Area | Current | Proposed |
|---|---|---|
| `part.pins` type | `Record<PinId, PinUsage \| undefined>` | `Record<PinId, PinUsage>` |
| Pin source | Pre-populated from controller `gpios` | Derived from keyboard state (controller + devices) |
| Pin metadata | Separate `gpios` map, no capabilities | `PinInfo` with capabilities, source, DTS node/pin split |
| DTS references | Single `dtsRef` string per pin | Split `dtsNodeLabel` + `dtsPinNumber`; composed at export |
| Bus routing | Not modeled | `canBus(busName, role)` per pin; `getPinsForBus()` on composable |
| Native pins | Not distinguished | `native` flag; bus/device restricted to native |
| `pinctrlRef` | Always present | Optional — only on native (controller) pins |
| Pin providers | None | `DeviceMeta.pins?` + `dtsNodeLabel` functions; derived via `usePinInventory` composable |
| Pin queries | Direct map lookup | `usePinInventory` with `allPins`, `deviceNodeLabels`, `getPin()`, `getPinsForBus()` |
| UI filtering | Shows all pins | Derives compatible pins from keyboard state |
| Validation | Checks pin existence | Also resolves pins from keyboard state, checks native |
| Extension device pins | Not in pin system | First-class via `DeviceMeta.pins?` function |
| Controller metadata | `gpios` map only | `gpios` + `pinCapabilities` |
| Backend/frontend split | Pin derivation only in Vue composable | `resolvePinInventory()` pure function + Vue wrapper |

## Use Cases

Common access patterns for pin queries. UI components use `usePinInventory(part)` for reactive access; backend code (validators, export) calls `resolvePinInventory(part)` directly.

### Kscan pin assignment (custom UI)

The kscan editor shows all pins grouped by source. Each pin-providing device gets its own card with the unique node label as the title, looked up from the `deviceNodeLabels` map:

```
allPins → show all pins grouped by source
  ├── "Nice!Nano v2" (controller — source.controllerId)
  │   └── D0, D1, D2, ... (native GPIO pins)
  └── "&shifter0" (device — deviceNodeLabels.get(source.deviceId))
      └── SR0.0, SR0.1, ... SR0.7 (extension GPIO pins)
```

Grouping logic: iterate `allPins`, collect pins by `source.type` + `source.deviceId` (or `source.controllerId`). For device groups, look up `deviceNodeLabels.get(source.deviceId)` for the card title. The UI uses `PinInfo.capabilities` to colorize (e.g., pins without `interrupt` are dimmed when the user is assigning encoder pins).

### Encoder pin selection (dropdown)

A dropdown for selecting encoder phase A or B pins. Only pins with `gpioIn` + `interrupt` should appear.

```
allPins.filter(p => p.capabilities.gpioIn && p.capabilities.interrupt)
  → exclude pins already in part.pins
  → populate dropdown
```

### Bus pin selection (dropdown)

A dropdown for selecting a bus communication pin (e.g., I2C0 SDA, SPI1 MOSI). Only native pins that can serve the specific bus role should appear.

```
getPinsForBus("i2c0", "sda")
  → returns only native pins where canBus("i2c0", "sda") === true
  → exclude pins already in part.pins
  → populate dropdown
```

This is the one case where `getPinsForBus` is used instead of manual filtering — it encapsulates the `canBus` check in a single call.

### Device direct pin selection (dropdown)

A dropdown for selecting a device GPIO pin (e.g., chip select, interrupt). Only native pins with GPIO capability should appear.

```
allPins.filter(p => p.capabilities.native && (p.capabilities.gpioIn || p.capabilities.gpioOut))
  → exclude pins already in part.pins
  → populate dropdown
```

### Backend validation of pin assignments

The `ValidatedKeyboardSchema` superRefine validates all pin assignments at export time. For each pin in `part.pins`:

1. Derive the `PinInfo` from the keyboard state.
2. Reject if the pin doesn't exist (not on controller or active extension device).
3. Reject if a device pin is assigned but the device no longer exists.

Capability checking (e.g., "does this pin have `gpioIn` for a kscan input?") is the validator's own logic, using `PinInfo.capabilities` as the data source.
