import { z } from "astro:schema";

export const WiringType = z.enum([
  "matrix_diode",
  "matrix_no_diode",
  "direct_gnd",
  "direct_vcc",
]);
export type WiringType = z.infer<typeof WiringType>;

export const PinMode = z.enum(["input", "output"]);
export type PinMode = z.infer<typeof PinMode>;

export const Controller = z.enum([
  "nice_nano_v2",
  "seeed_xiao_ble",
  "seeed_xiao_ble_plus",
]);
export type Controller = z.infer<typeof Controller>;

export interface PinInfo {
  name: string;
  /**
   * Example: '&pro_micro 0'
   */
  handle: string;
}

export interface ControllerInfo {
  // name: string;
  pins: Record<string, PinInfo>;
}

export const PinoutSelections = z.record(PinMode.optional());
export type PinoutSelections = z.infer<typeof PinoutSelections>;

export const Key = z.object({
  /**
   * Which part of the split keyboard this key belongs to.
   * For unibody keyboards, this is always 0.
   */
  partOf: z.number(), // .default(0),
  /**
   * Row in logical/textual layout.
   * NOT the electrical/kscan row.
   */
  row: z.number(),
  /**
   * Column in logical/textual layout.
   * NOT the electrical/kscan column.
   */
  column: z.number(),
  /**
   * Physical layout width in units.
   */
  width: z.number(), // .default(1),
  /**
   * Physical layout height in units.
   */
  height: z.number(), // .default(1),
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
export type Key = z.infer<typeof Key>;

export const KeyboardContext = z.object({
  info: z.object({
    name: z.string(),
    shield: z.string(),
    controller: Controller,
    wiring: WiringType,
    dongle: z.boolean(),
  }),
  layout: z.array(Key),
  pinouts: z.array(PinoutSelections),
  wiring: z.array(z.object({
    input: z.string().nullable(),
    output: z.string().nullable(),
  })),
});
export type KeyboardContext = z.infer<typeof KeyboardContext>;

export interface KeyboardTemplatingContext {
  name: string;
  shield: string;
  controller: Controller;
  wiring: WiringType;
  dongle: boolean;
  keys: (Key & ({ inputPin: string | null, outputPin?: string | null }))[];
  /**
   * Pins to key index mapping, for each part of the keyboard.
   */
  pins: Record<string, { mode: PinMode, keys: number[] }>[];
}

export interface Point {
  x: number;
  y: number;
}

export interface BoundingBox {
  min: Point;
  max: Point;
}

export interface VirtualTextFolder {
  [filePath: string]: string
}


export interface VirtualBinaryFolder {
  [filePath: string]: Uint8Array;
}

export interface VirtualFolder {
  [filePath: string]: string | Uint8Array;
}
