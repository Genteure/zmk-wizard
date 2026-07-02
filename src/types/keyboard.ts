import { z } from "astro/zod";
import { BusNameSchema, BusSchema, DeviceIdSchema, PinIdSchema, type DeviceId, type PinId } from "./devices";
import { UlidSchema } from "./utils";

// ----------------
// Keyboard types

export const SocIdSchema = z.enum([
  "nrf52840",
  "rp2040",
]);
export type SocId = z.infer<typeof SocIdSchema>;

// Note: when adding new controllers, also update src/components/editor/utils/ControllerChangeModal.vue

export const ControllerIdSchema = z.enum([
  "nice_nano_v2",
  "xiao_ble",
  // "xiao_ble_plus",
  "rpi_pico",
  "xiao_rp2040",
  // "qt_py_rp2040",
  // "kb2040",
  // "sparkfun_pro_micro_rp2040",
]);

// While we rewrite the entire project, some controllers are commented out to reduce initial implementation scope.
// TODO: Implement the rest of the controllers.

export type ControllerId = z.infer<typeof ControllerIdSchema>;

/**
 * Kscan driver types. Each key in the keyboard matrix is scanned by one of these drivers:
 *
 * - **matrix**: Traditional row/column grid. Needs at least 1 input pin (sensing) and
 *   at least 1 output pin (driving) to form a matrix. Diodes prevent ghosting.
 * - **direct**: Each key has its own dedicated pin. The pin senses voltage change;
 *   the other side of the switch is wired to GND or VCC (configured by `mode`).
 *   Only uses input pins.
 * - **charlieplex**: Charliplexed matrix where all pins are both input and output
 *   simultaneously. Each pin drives one line while sensing the others. Can have
 *   0 or 1 interrupt pin for efficient scanning.
 */
export const KscanDriverKindSchema = z.enum(["matrix", "direct", "charlieplex"]);
export type KscanDriverKind = z.infer<typeof KscanDriverKindSchema>;

export const KscanIdSchema = z.string() // ULID string
// TODO add ulid validation here
export type KscanId = z.infer<typeof KscanIdSchema>;

/**
 * Matrix kscan driver. Keys are arranged in a row/column grid.
 * Requires at least 1 input pin (sensing voltage) and at least 1 output pin (driving the line).
 * The `diodes` flag indicates whether the matrix uses diodes to prevent ghosting.
 */
export const KscanMatrixDriverSchema = z.object({
  kind: z.literal("matrix"),
  id: KscanIdSchema,
  diodes: z.boolean().default(true),
});
export type KscanMatrixDriver = z.infer<typeof KscanMatrixDriverSchema>;

/**
 * Direct kscan driver. Each key has its own dedicated pin wired to a switch,
 * with the other side connected to GND or VCC (configured by `mode`).
 * Only uses input pins — the driver senses voltage changes on each pin.
 */
export const KscanDirectDriverSchema = z.object({
  kind: z.literal("direct"),
  id: KscanIdSchema,
  mode: z.enum(["gnd", "vcc"]),
});
export type KscanDirectDriver = z.infer<typeof KscanDirectDriverSchema>;

/**
 * Charlieplex kscan driver. All matrix pins are both input and output simultaneously —
 * each pin drives one line while sensing the others. The same pin is assigned to keys
 * as both input and output. Can have 0 or 1 interrupt pin for efficient scanning.
 * Pins are internally marked with role "input" even though they dual-purpose.
 */
export const KscanCharlieplexDriverSchema = z.object({
  kind: z.literal("charlieplex"),
  id: KscanIdSchema,
});
export type KscanCharlieplexDriver = z.infer<typeof KscanCharlieplexDriverSchema>;

export const KscanDriverSchema = z.discriminatedUnion("kind", [
  KscanMatrixDriverSchema,
  KscanDirectDriverSchema,
  KscanCharlieplexDriverSchema,
]);
export type KscanDriver = z.infer<typeof KscanDriverSchema>;

// kscan end

export const PinUsageKscanSchema = z.object({
  usage: z.literal("kscan"),
  kscan: KscanIdSchema,
  /**
   * Pin role within the kscan driver. Meaning depends on driver type:
   *
   * - **input**: Sensing voltage changes on the pin.
   *   - matrix: senses voltage on the row/column line.
   *   - direct: senses voltage on the pin (other side is GND/VCC).
   *   - charlieplex: dual-purpose (both input and output), but internally marked as input.
   *
   * - **output**: Driving the line. Only used by matrix kscan to pull rows/columns low/high.
   *
   * - **interrupt**: Optional pin for efficient scanning. Only used by charlieplex (0 or 1).
   */
  role: z.enum(["input", "output", "interrupt"]),
});
export type PinUsageKscan = z.infer<typeof PinUsageKscanSchema>;

export const BusPinRoleSchema = z.enum([
  // I2C
  "sda", "scl",
  // SPI
  "mosi", "miso", "sck",
  /**
   * Both MISO and MOSI on this pin, for half-duplex SPI bus.
   */
  "miosio",
]);
export type BusPinRole = z.infer<typeof BusPinRoleSchema>;

export const PinUsageBusSchema = z.object({
  usage: z.literal("bus"),
  bus: BusNameSchema,
  role: BusPinRoleSchema,
});
export type PinUsageBus = z.infer<typeof PinUsageBusSchema>;

export const PinUsageDeviceSchema = z.object({
  usage: z.literal("device"),
  deviceId: DeviceIdSchema, // TODO ADD ULID for each device to associate pins with specific devices
  role: z.string(), // e.g. "cs", "irq", "dr", etc. Specific to the device type.
});
export type PinUsageDevice = z.infer<typeof PinUsageDeviceSchema>;
export const EncoderIdSchema = UlidSchema.brand<"EncoderId", "out">();
export type EncoderId = z.infer<typeof EncoderIdSchema>;

export const PinUsageEncoderSchema = z.object({
  usage: z.literal("encoder"),
  encoderId: EncoderIdSchema,
  role: z.enum(["pinA", "pinB"]),
});
export type PinUsageEncoder = z.infer<typeof PinUsageEncoderSchema>;

export const PinUsageSchema = z.discriminatedUnion("usage", [
  PinUsageKscanSchema,
  PinUsageBusSchema,
  PinUsageDeviceSchema,
  PinUsageEncoderSchema,
]);
export type PinUsage = z.infer<typeof PinUsageSchema>;
// ── Pin Capabilities ───────────────────────────────────────

/**
 * Hardware-level property of a physical pin.
 * Independent of software assignment — describes what the pin *can* do.
 */
export type PinCapability =
  | "gpioIn"     // Can sense voltage (kscan input, encoder, device IRQ)
  | "gpioOut"    // Can drive voltage (kscan output, charlieplex, device CS)
  | "interrupt"  // Can generate hardware interrupts
  ;

/**
 * Capabilities of a pin. Describes what the pin hardware can do.
 */
export type PinCapabilities = Readonly<Record<PinCapability, boolean>>;

/** Where a pin comes from. */
export type PinSource =
  | { type: "controller"; controllerId: ControllerId }
  | { type: "device"; deviceId: DeviceId; deviceTypeName: string };

/**
 * Full metadata for a pin in the system.
 * Each pin (controller GPIO or extension device output) has a PinInfo record.
 */
export interface PinInfo {
  /** Unique identifier. Controller pins use raw IDs ("d0"). Device pins use "DEVICE_ULID:INDEX". */
  id: PinId;
  /** Human-readable display name. */
  label: string;
  /** Alternative names (e.g., SoC pin names like "P0.08"). */
  aka?: readonly string[];
  /**
   * Devicetree node label for DTS generation (without `&` prefix).
   * Controller pins: the GPIO controller node (e.g., "pro_micro").
   * Device pins: the device's unique node label (e.g., "shifter0").
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

/**
 * Compose a full devicetree pin reference from its parts.
 * Adds the `&` prefix for DTS output — dtsNodeLabel is stored without `&`.
 * Example: composeDtsRef("pro_micro", "0") → "&pro_micro 0"
 */
export function composeDtsRef(dtsNodeLabel: string, dtsPinNumber: string): string {
  return `&${dtsNodeLabel} ${dtsPinNumber}`;
}


// Sparse pin map: only pins that are actually assigned have entries.
// "Is this pin free?" → !(pinId in part.pins)
export const PinSelectionSchema = z.record(PinIdSchema, PinUsageSchema);
export type PinSelection = z.infer<typeof PinSelectionSchema>;

/**
 * The kscan pins associated with each key. The actual meaning of input/output depends on the kscan driver type.
 */
export const SingleKeyWiringSchema = z.object({
  /**
   * - Matrix kscan: matrix input pin, sensing voltage change.
   * - Direct kscan: input pin, sensing voltage change.
   * - Charlieplex kscan: dual use but it's sensing pin for this key.
   *   For charlieplex kscan driver, column is always the sensing pin.
   */
  input: PinIdSchema.optional(),
  /**
   * - Matrix kscan: matrix output pin, driving the line.
   * - Direct kscan: not used.
   * - Charlieplex kscan: dual use but it's driving pin for this key.
   *   For charlieplex kscan driver, row is always the driving pin.
   */
  output: PinIdSchema.optional(),
});
export type SingleKeyWiring = z.infer<typeof SingleKeyWiringSchema>;


export const EncoderSchema = z.object({
  id: EncoderIdSchema,
  // TODO configure rotation steps?
});
export type Encoder = z.infer<typeof EncoderSchema>;

export const KeyIdSchema = UlidSchema.brand<"KeyId", "inout">();
export type KeyId = z.infer<typeof KeyIdSchema>;

export const KeyboardPartSchema = z.object({
  name: z.string()
    .min(1, "Part name cannot be empty")
    .max(16, "Part name cannot be longer than 16 characters")
    .regex(/^[a-z0-9]+$/, "Part name must contain only lowercase letters and numbers"),
  controller: ControllerIdSchema,
  // wiring: WiringTypeSchema, // TODO REMOOVE
  /**
   * Pin modes
   */
  pins: PinSelectionSchema.default({}),
  /**
   * Kscans
   */
  kscans: z.array(KscanDriverSchema).default([]),
  /**
   * Key wiring
   */
  keys: z.record(KeyIdSchema, SingleKeyWiringSchema.optional()).default({}), // key id to wiring
  /** Encoders */
  encoders: z.array(EncoderSchema).default([]),
  /** Buses (I2C/SPI) */
  buses: z.record(BusNameSchema, BusSchema).default({}),
  // buses: z.array(AnyBusSchema).default([]),
});
export type KeyboardPart = z.infer<typeof KeyboardPartSchema>;

export const KeySchema = z.object({
  /**
   * Key ID
   */
  id: KeyIdSchema,

  /**
   * Which part of the split keyboard this key belongs to.
   * For unibody keyboards, this is always 0.
   */
  part: z.number(),
  /**
   * Row in logical/textual layout.
   * NOT the electrical/kscan row.
   */
  row: z.number(),
  /**
   * Column in logical/textual layout.
   * NOT the electrical/kscan column.
   */
  col: z.number(),
  /**
   * Physical layout width in units.
   */
  w: z.number(), // .default(1),
  /**
   * Physical layout height in units.
   */
  h: z.number(), // .default(1),
  /**
   * Position in physical layout.
   */
  x: z.number(), // .default(0),
  /**
   * Position in physical layout.
   */
  y: z.number(), // .default(0),
  /**
   * Rotation in degrees, for physical layout.
   */
  r: z.number(), // .default(0),
  /**
   * Rotation origin X in units, for physical layout.
   */
  rx: z.number(), // .default(0),
  /**
   * Rotation origin Y in units, for physical layout.
   */
  ry: z.number(), // .default(0),
});
export type Key = z.infer<typeof KeySchema>;

export const KeyboardNameSchema = z.string()
  .min(1, "Keyboard name cannot be empty")
  .refine((name) => new TextEncoder().encode(name).length <= 16, "Keyboard name cannot be longer than 16 bytes");
export type KeyboardName = z.infer<typeof KeyboardNameSchema>;

export const ShieldNameSchema = z.string()
  .min(3, "Shield name must be at least 3 characters")
  .regex(/^[a-z][a-z0-9_]*$/, "Shield name must start with a letter and contain only lowercase letters, numbers, and underscores")
  .max(32, "Shield name cannot be longer than 32 characters");
export type ShieldName = z.infer<typeof ShieldNameSchema>;

/**
 * Module ID is in the format "remote/repo", e.g. "petejohanson/cirque"
 */
export const ModuleIdSchema = z.enum([
  "petejohanson/cirque",
  "badjeff/pmw3610",
  "badjeff/paw3395",
]);
export type ModuleId = z.infer<typeof ModuleIdSchema>;

export const KeyboardSchema = z.object({
  name: KeyboardNameSchema,
  shield: ShieldNameSchema,
  dongle: z.boolean().default(false),
  /**
   * External modules that are enabled for this keyboard.
   * Devices from these modules can be added to the keyboard.
   */
  modules: z.array(ModuleIdSchema).default([]),
  layout: z.array(KeySchema).min(1, "Keyboard must have at least one key"),
  parts: z.array(KeyboardPartSchema).min(1, "Keyboard must have at least one part"),
});
export type Keyboard = z.infer<typeof KeyboardSchema>;

export type KeyboardSnapshot = {
  time: Date;
  keyboard: Keyboard;
};
