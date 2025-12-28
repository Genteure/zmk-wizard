import { z } from "astro:schema";
import { ulid } from "ulidx";

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
export const Controller = ControllerSchema;
export type Controller = z.infer<typeof ControllerSchema>;

export const WiringTypeSchema = z.enum([
  "matrix_diode",
  "matrix_no_diode",
  "direct_gnd",
  "direct_vcc",
]);
export const WiringType = WiringTypeSchema;
export type WiringType = z.infer<typeof WiringTypeSchema>;

export const PinModeSchema = z.enum(["input", "output"]);
export const PinMode = PinModeSchema;
export type PinMode = z.infer<typeof PinModeSchema>;

export const PinSelectionSchema = z.record(PinModeSchema.optional());
export const PinSelection = PinSelectionSchema;
export type PinSelection = z.infer<typeof PinSelectionSchema>;

export const SingleKeyWiringSchema = z.object({
  input: z.string().max(10).optional(),
  output: z.string().max(10).optional(),
});
export const SingleKeyWiring = SingleKeyWiringSchema;
export type SingleKeyWiring = z.infer<typeof SingleKeyWiringSchema>;

export interface PinInfo {
  name: string;
  /** Example: "&pro_micro 0" */
  handle: string;
}

export interface ControllerInfo {
  pins: Record<string, PinInfo>;
}

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
});

export const KeyboardPart = KeyboardPartSchema;
export type KeyboardPart = z.infer<typeof KeyboardPartSchema>;

export const KeySchema = z.object({
  id: z.string().min(1).default(() => ulid()),
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
export const Key = KeySchema;
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

export const Keyboard = KeyboardSchema;
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
