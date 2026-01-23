import { z } from "astro/zod";
import { isValid as isValidUlid, ulid } from "ulidx";

export interface Point {
  x: number;
  y: number;
}

export interface BoundingBox {
  min: Point;
  max: Point;
}

export interface Options {
  keySize?: number;
  padding?: number;
}

/**
 * Pin identifier, e.g. d0, d1, p101, gp12, etc.
 */
export const PinIdSchema = z.string().max(10);
export type PinId = z.infer<typeof PinIdSchema>;

// ----------------
// Bus device types

// Bus name
export const BusNameSchema = z.string()
  .min(1, "Bus name cannot be empty")
  .max(16, "Bus name cannot be longer than 16 characters")
  .regex(/^[a-zA-Z0-9_]+$/, "Bus name must contain only letters, numbers, and underscores");
export type BusName = z.infer<typeof BusNameSchema>;

// Device schemas and types
export const BusDeviceTypeSchema = z.enum(["ssd1306", "niceview", "ws2812", "74hc595", "pmw3610", "paw3395", "pinnacle_spi", "pinnacle_i2c"]);
export type BusDeviceTypeName = z.infer<typeof BusDeviceTypeSchema>;

export const BaseBusDeviceSchema = z.object({
  type: BusDeviceTypeSchema,
});
export type BaseBusDevice = z.infer<typeof BaseBusDeviceSchema>;

export const SSD1306DeviceSchema = BaseBusDeviceSchema.extend({
  type: z.literal("ssd1306"),
  add: z.number().min(0).max(0x7f).default(0x3c),
  width: z.number().default(128),
  height: z.number().default(64),
});
export type SSD1306Device = z.infer<typeof SSD1306DeviceSchema>;

export const NiceviewDeviceSchema = BaseBusDeviceSchema.extend({
  type: z.literal("niceview"),
  cs: PinIdSchema.optional(),
});
export type NiceviewDevice = z.infer<typeof NiceviewDeviceSchema>;

export const WS2812DeviceSchema = BaseBusDeviceSchema.extend({
  type: z.literal("ws2812"),
  length: z.number().min(1).max(256).default(3),
  // cs: PinIdSchema.optional(),
  // TODO WS2812 doesn't need CS, this was here only to satisfy the old schema
  // We want to remove this and the corresponding UI field and special-case handling
});
export type WS2812Device = z.infer<typeof WS2812DeviceSchema>;

export const ShiftRegisterDeviceSchema = BaseBusDeviceSchema.extend({
  type: z.literal("74hc595"),
  ngpios: z.union([z.literal(8), z.literal(16), z.literal(24), z.literal(32)]).default(8),
  cs: PinIdSchema.optional(),
});
export type ShiftRegisterDevice = z.infer<typeof ShiftRegisterDeviceSchema>;

export const Pmw3610DeviceSchema = BaseBusDeviceSchema.extend({
  type: z.literal("pmw3610"),
  cs: PinIdSchema.optional(),
  irq: PinIdSchema.optional(),
  // up to 3200 cpi with 200 increments
  cpi: z.number()
    .min(0)
    .max(3200)
    .refine((val) => val % 200 === 0, "CPI must be set in 200 increments")
    // TODO maybe not a good idea to do `refine` validation here,
    // the UI/UX is worse since zod fail blocks our custom validators
    .default(600),
  swapxy: z.boolean().default(false),
  invertx: z.boolean().default(false),
  inverty: z.boolean().default(false),
});
export type Pmw3610Device = z.infer<typeof Pmw3610DeviceSchema>;

export const Paw3395DeviceSchema = BaseBusDeviceSchema.extend({
  type: z.literal("paw3395"),
  cs: PinIdSchema.optional(),
  irq: PinIdSchema.optional(),
  cpi: z.number()
    .min(0)
    .max(26000)
    .refine((val) => val % 50 === 0, "CPI must be set in 50 increments")
    .default(800),
  swapxy: z.boolean().default(false),
  invertx: z.boolean().default(false),
  inverty: z.boolean().default(false),
});
export type Paw3395Device = z.infer<typeof Paw3395DeviceSchema>;

export const PinnacleBaseDeviceSchema = z.object({
  /**
   * Data ready pin / interrupt
   */
  dr: PinIdSchema.optional(),
  rotate90: z.boolean().default(false),
  invertx: z.boolean().default(false),
  inverty: z.boolean().default(false),
  sleep: z.boolean().default(true),
  noSecondaryTap: z.boolean().default(true),
  noTaps: z.boolean().default(true),
  sensitivity: z.union([z.literal("1x"), z.literal("2x"), z.literal("3x"), z.literal("4x")]).default("2x"),
});
export type PinnacleBaseDevice = z.infer<typeof PinnacleBaseDeviceSchema>;

export const PinnacleSpiDeviceSchema = PinnacleBaseDeviceSchema.extend({
  type: z.literal("pinnacle_spi"),
  cs: PinIdSchema.optional(),
});
export type PinnacleSpiDevice = z.infer<typeof PinnacleSpiDeviceSchema>;

export const PinnacleI2cDeviceSchema = PinnacleBaseDeviceSchema.extend({
  type: z.literal("pinnacle_i2c"),
  add: z.number().min(0).max(0x7f).default(0x2A),
});
export type PinnacleI2cDevice = z.infer<typeof PinnacleI2cDeviceSchema>;

export const SpiDeviceSchema = z.discriminatedUnion("type", [
  NiceviewDeviceSchema,
  WS2812DeviceSchema,
  ShiftRegisterDeviceSchema,
  Pmw3610DeviceSchema,
  Paw3395DeviceSchema,
  PinnacleSpiDeviceSchema,
]);
export type SpiDevice = z.infer<typeof SpiDeviceSchema>;

export const I2cDeviceSchema = z.discriminatedUnion("type", [
  SSD1306DeviceSchema,
  PinnacleI2cDeviceSchema,
]);
export type I2cDevice = z.infer<typeof I2cDeviceSchema>;

export const AnyBusDeviceSchema = z.discriminatedUnion("type", [
  SSD1306DeviceSchema,
  NiceviewDeviceSchema,
  WS2812DeviceSchema,
  ShiftRegisterDeviceSchema,
  Pmw3610DeviceSchema,
  Paw3395DeviceSchema,
  PinnacleSpiDeviceSchema,
  PinnacleI2cDeviceSchema,
]);
export type AnyBusDevice = z.infer<typeof AnyBusDeviceSchema>;

export const BaseBusSchema = z.object({
  name: BusNameSchema,
  devices: z.array(AnyBusDeviceSchema).default([]),
});
export type BaseBus = z.infer<typeof BaseBusSchema>;

export const SpiBusSchema = BaseBusSchema.extend({
  type: z.literal("spi"),
  mosi: PinIdSchema.optional(),
  miso: PinIdSchema.optional(),
  sck: PinIdSchema.optional(),
  devices: z.array(SpiDeviceSchema).default([]),
});
export type SpiBus = z.infer<typeof SpiBusSchema>;

export const I2cBusSchema = BaseBusSchema.extend({
  type: z.literal("i2c"),
  sda: PinIdSchema.optional(),
  scl: PinIdSchema.optional(),
  devices: z.array(I2cDeviceSchema).default([]),
});
export type I2cBus = z.infer<typeof I2cBusSchema>;

export const AnyBusSchema = z.discriminatedUnion("type", [SpiBusSchema, I2cBusSchema]);
export type AnyBus = z.infer<typeof AnyBusSchema>;

// ----------------
// Keyboard types

export const SocSchema = z.enum([
  "nrf52840",
  "rp2040",
]);
export type Soc = z.infer<typeof SocSchema>;

export const ControllerSchema = z.enum([
  "nice_nano_v2",
  "xiao_ble",
  "xiao_ble_plus",
  "rpi_pico",
  "xiao_rp2040",
  "qt_py_rp2040",
  "kb2040",
  "sparkfun_pro_micro_rp2040",
]);
export type Controller = z.infer<typeof ControllerSchema>;

export const WiringTypeSchema = z.enum([
  "matrix_diode",
  "matrix_no_diode",
  "direct_gnd",
  "direct_vcc",
]);
export type WiringType = z.infer<typeof WiringTypeSchema>;

export const PinModeSchema = z.enum(["input", "output", "bus", "encoder"]);
export type PinMode = z.infer<typeof PinModeSchema>;

export const PinSelectionSchema = z.record(PinIdSchema, PinModeSchema.optional());
export type PinSelection = z.infer<typeof PinSelectionSchema>;

export const SingleKeyWiringSchema = z.object({
  input: PinIdSchema.optional(),
  output: PinIdSchema.optional(),
});
export type SingleKeyWiring = z.infer<typeof SingleKeyWiringSchema>;

export const EncoderSchema = z.object({
  pinA: PinIdSchema.optional(),
  pinB: PinIdSchema.optional(),
  /**
   * Optional pin for button press functionality, in case
   * the push button is wired as direct pin in a matrix keyboard.
   */
  pinS: PinIdSchema.optional(),
  // TODO configure steps?
});
export type Encoder = z.infer<typeof EncoderSchema>;

export const KeyboardPartSchema = z.object({
  name: z.string()
    .min(1, "Part name cannot be empty")
    .max(16, "Part name cannot be longer than 16 characters")
    .regex(/^[a-z0-9]+$/, "Part name must contain only lowercase letters and numbers"),
  controller: ControllerSchema,
  wiring: WiringTypeSchema,
  /**
   * Pin modes
   */
  pins: PinSelectionSchema,
  /**
   * Key wiring
   */
  keys: z.record(z.string(), SingleKeyWiringSchema.optional()), // key id to wiring
  encoders: z.array(EncoderSchema).default([]),
  buses: z.array(AnyBusSchema).default([]),
});
export type KeyboardPart = z.infer<typeof KeyboardPartSchema>;

export const KeySchema = z.object({
  // ULID is 26 chars Crockford base32 (no I, L, O, U)
  id: z.string()
    .length(26, "Key id must be 26 characters long")
    .refine((value) => isValidUlid(value), "Key id must be a valid ULID")
    .default(() => ulid()),

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

export const ShieldNameSchema = z.string()
  .min(3, "Shield name cannot be empty")
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
  name: z.string()
    .min(1, "Keyboard name cannot be empty")
    .max(16, "Keyboard name cannot be longer than 16 characters"),
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

export interface VirtualTextFolder {
  [filePath: string]: string;
}

export interface VirtualBinaryFolder {
  [filePath: string]: Uint8Array;
}

export interface VirtualFolder {
  [filePath: string]: string | Uint8Array;
}
