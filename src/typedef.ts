import { z } from "astro/zod";
import { isValid as isValidUlid, ulid } from "ulidx";
import { AnyBusSchema } from "./types/buses";
export * from "./types/buses";

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

export const ControllerSchema = z.enum([
  "nice_nano_v2",
  "xiao_ble",
  "xiao_ble_plus",
]);
export type Controller = z.infer<typeof ControllerSchema>;

export const WiringTypeSchema = z.enum([
  "matrix_diode",
  "matrix_no_diode",
  "direct_gnd",
  "direct_vcc",
]);
export type WiringType = z.infer<typeof WiringTypeSchema>;

export const PinModeSchema = z.enum(["input", "output", "bus"]);
export type PinMode = z.infer<typeof PinModeSchema>;

export const PinSelectionSchema = z.record(PinModeSchema.optional());
export type PinSelection = z.infer<typeof PinSelectionSchema>;

export const SingleKeyWiringSchema = z.object({
  input: z.string().max(10).optional(),
  output: z.string().max(10).optional(),
});
export type SingleKeyWiring = z.infer<typeof SingleKeyWiringSchema>;

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

  buses: z.array(AnyBusSchema).default([]),

  // // TODO need to think about this, should devices stored here or under each bus?
  // devices: z.array(z.object({
  //   name: z.string().min(1).max(32),
  //   cs: z.string().max(10),
  // })).optional(),

  // devices: z.object({
  //   display: DisplayDeviceSchema.optional(),
  //   ledStrip: LEDStripDeviceSchema.optional(),
  //   shifter: ShiftRegisterDeviceSchema.optional(),
  // }),

  // Users can attach devices to one or more SPI buses
  // spi: z.array(z.object({
  //   name: BusNameSchema,
  //   enable: z.boolean().default(false),
  //   mosi: z.string().max(10).optional(),
  //   miso: z.string().max(10).optional(),
  //   sck: z.string().max(10).optional(),
  // })),

  // i2c: z.array(z.object({
  //   name: BusNameSchema,
  //   enable: z.boolean().default(false),
  //   sda: z.string().max(10),
  //   scl: z.string().max(10),
  // })),
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

export const KeyboardSchema = z.object({
  name: z.string()
    .min(1, "Keyboard name cannot be empty")
    .max(16, "Keyboard name cannot be longer than 16 characters"),
  shield: ShieldNameSchema,
  dongle: z.boolean().default(false),
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
