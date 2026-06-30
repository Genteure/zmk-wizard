# Design: Pins as Single Source of Truth

## Core Principle

Every physical pin on a controller exists in exactly one place: a flat map (`Record<PinId, PinUsage | undefined>`) owned by each keyboard part. This map is the **single source of truth** for all pin assignments. No other data structure — not the kscan drivers, not the bus definitions, not the encoder list — stores pin assignments independently.

Each entry in the map is either `undefined` (pin is free) or a discriminated union variant that names the pin's consumer and its role within that consumer.

## Why a Flat Map

### The naive alternative

The alternative — embedding `pin` fields directly inside each sub-feature — is how most keyboard configurators work. A matrix kscan carries `row_pins[]` and `col_pins[]`. A direct kscan carries `input_pins[]`. An encoder carries `pin_a` and `pin_b`. An I2C bus carries `sda` and `scl`. Each feature owns its pins.

This seems natural. It's also wrong, and the reasons are structural.

### Problem 1: No global view

When pins live inside their consumer, there is no single place to ask "is this pin used?" You have to search every consumer's pin lists. For a keyboard part with 4 kscans, 3 encoders, 2 buses, and a pointing device, answering "is `d5` free?" means scanning 9 different data structures.

A flat map answers this in O(1): look up the key. The UI, the validation layer, and the code generator all benefit from this.

### Problem 2: No mutual exclusion

Without a central register, two features can claim the same pin. The system only discovers the conflict at export time, or worse, produces invalid firmware. With a flat map, assigning a pin to a new feature is a single write to a known key — if the slot is occupied, the assignment is rejected at the data layer, before any UI or validation logic runs.

### Problem 3: Orphaned references

When a feature is deleted — say, a kscan is removed — every place that referenced its pins must be found and cleaned up. With embedded pins, this is a cross-cutting concern: you must also delete the pins from every key's wiring that referenced that kscan, release the encoder that shared a pin, etc. Miss one reference and the data is inconsistent.

With a flat map, removing a kscan means scanning the map for entries tagged with that kscan's ID and setting them back to `undefined`. The wiring table, which also lives in the same part, can be cleaned up in the same operation. All the state that needs to change is in one data structure.

### Problem 4: Code generation needs aggregation

The ZMK output is a device tree overlay where pins appear in kscan nodes, encoder nodes, bus enable nodes, pinctrl nodes, and cs-gpios arrays — five different output locations derived from the same physical truth. With embedded pins, the generator must reach into each feature's data, extract pin lists, and reconstruct the global view that the flat map already provides.

With a flat map, the generator iterates `Object.entries(pins)`, filters by usage variant, and groups into the appropriate output structures. The iteration is uniform. Adding a new pin usage type means adding one new variant to the discriminated union and one new output case in the generator — no changes to the map iteration logic.

## Design Properties

### The map is keyed by the hardware, not the feature

`PinId` is a branded string derived from controller metadata — `"d0"`, `"d1"`, `"p101"`. The keys represent physical pins. The values describe what those pins do. This means the map's shape is determined by the controller, not by the user's configuration. Every pin the controller exposes is present; unassigned pins are `undefined`.

This has a concrete UI benefit: the pin panel can iterate the controller's GPIO list, look up each pin in the map, and render a complete inventory of all pins with their status. No pins are hidden because no feature claimed them yet.

### The discriminated union encodes the relationship graph

Each `PinUsage` variant carries exactly the data needed to resolve the pin's consumer:

- **kscan**: which kscan driver and which role (input, output, interrupt)
- **bus**: which bus name and which role (sda, scl, mosi, miso, sck, miosio)
- **device**: which device ID and which role (cs, irq, etc.)
- **encoder**: which encoder ID and which role (pinA, pinB)

This is not redundant with the kscan/bus/device/encoder data — it's the *link* between the pin and that data. The kscan driver definition describes the driver's type and configuration. The pin map describes which physical pins serve that driver. They are separate concerns.

The `SingleKeyWiring` table (`Record<KeyId, { input?: PinId, output?: PinId }>`) references pins by ID, not by ownership. A key's wiring says "my input is `d5`"; the pin map says "`d5` is kscan-0 input". The wiring never duplicates what the pin map already knows.

### Mutations are centralized

All pin state changes go through store actions: `assignPinToKscan`, `releasePin`, `setEncoderPin`, `assignBusPin`, `assignDevicePin`. Each action:

1. Checks the target entity (kscan, encoder, bus, device) exists.
2. Checks the pin is not already assigned (or is currently assigned to the same entity, for reassignment).
3. Writes the usage to the pin map.
4. Cascades cleanup if the operation releases a previously-assigned pin (e.g., clearing key wiring that referenced a released kscan pin).

The guard at step 2 is the enforcement of mutual exclusion. No UI code needs to implement its own duplicate check — the store rejects it.

### Validation reads one structure

The `ValidatedKeyboardSchema` (a Zod `superRefine`) checks pin correctness at export time:

- Pin IDs in the map exist on the selected controller.
- Every kscan has the minimum required pins for its driver type.
- Every encoder has both pinA and pinB assigned, and they are distinct.
- Every bus has its required communication pins (SDA/SCL for I2C, MOSI/MISO/SCK for SPI).
- Every device has its required GPIO pins (CS, IRQ, etc.).
- Key wiring references pins that are assigned to the correct kscan with the correct role.
- Bus conflict groups (e.g., nRF52840's mutually exclusive I2C0/SPI0) are respected.

None of this requires cross-referencing multiple pin storage locations. The validator iterates the pin map and the feature lists; the pin map provides the assignment state, the feature lists provide the expected requirements.

### Code generation is a single iteration

The shield overlay generator consumes the pin map in three uniform paths:

1. Filter by `usage === 'kscan'`, group by kscan ID, emit GPIO nodes.
2. Filter by `usage === 'encoder'`, group by encoder ID, emit a-gpios/b-gpios.
3. Filter by `usage === 'bus'` or `usage === 'device'`, build role indexes, emit pinctrl and device nodes.

Each path is a filter + group + emit over the same `Object.entries(pins)` source. The generator never reaches into the kscan driver or encoder object to find pins — it already has them.

## Design Guidelines

### Never embed pins outside the map

If a new feature needs pins, add a new variant to the `PinUsage` discriminated union. Do not add a `pin` field to the feature's schema. The feature schema describes the feature's configuration; the pin map describes its physical connections.

### The map is the only place to check pin state

Do not maintain parallel pin tracking in UI state, computed properties, or local component data. Read from `part.pins`. Derive from `part.pins`. If you need "all pins used by kscan X", filter the map — do not store a separate `kscanPins` list.

### Store actions are the only way to mutate

Never write to `part.pins` directly from components or composables. Always go through the store action for the relevant usage type. This ensures cascade cleanup and mutual exclusion enforcement happen consistently.

### Pin identity is the controller's label

`PinId` strings come from controller metadata. Do not generate, compute, or interpolate pin IDs. The map's keys are controller pins; the map's values are their assignments. This keeps the map aligned with the physical hardware.

### Wiring references pins by ID, not by index

Key wiring, encoder connections, and device GPIOs reference pins by their `PinId`. They do not carry pin metadata (label, DTS reference, position). That metadata lives in the controller's pin definitions. The pin map connects the two: a wiring entry says "pin `d5`"; the controller metadata says what `d5` looks like in the device tree.
