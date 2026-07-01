import type { z } from "astro/zod";
import type { AnyBusDevice, BusPinRole, ControllerId, ModuleId, PinInfo } from "~/types";

// ─────────────────────────────────────────────────────────────
// Widget Types — what UI widget to render for a device property
// ─────────────────────────────────────────────────────────────

export type WidgetType =
  | "pin"            // Pin selector drop-down
  | "dec"            // Decimal number input
  | "hex"            // Hexadecimal number input
  | "numberOptions"  // Select from a list of numbers
  | "stringOptions"  // Select from a list of strings
  | "checkbox";      // Boolean toggle

// ─────────────────────────────────────────────────────────────
// Device Category — groups devices for UI and validation limits
// ─────────────────────────────────────────────────────────────

export type DeviceCategory =
  | "display"
  | "rgb"
  | "shift_register"
  | "pointing";

// ─────────────────────────────────────────────────────────────
// GPIO Requirements — what GPIO roles a device type needs
//
// Example for PMW3610:
//   { cs: { label: "Chip Select", desc: "SPI chip select" },
//     irq: { label: "MOTION", desc: "Motion interrupt pin" } }
// ─────────────────────────────────────────────────────────────

export interface GpioRequirement {
  /** UI label for the pin selector */
  label: string;
  /** Help text shown below the selector */
  desc?: string;
  /** Whether this GPIO is mandatory for the device to function */
  required?: boolean;
}

/** Map of GPIO role name → requirement metadata */
export type DeviceGpioRequirements = Record<string, GpioRequirement>;

// ─────────────────────────────────────────────────────────────
// Property Metadata — UI widget definition for a device property
//
// Each device property (e.g., "cpi", "width") maps to one of these.
// The `widget` field determines which component renders it.
// ─────────────────────────────────────────────────────────────

export interface DevicePropMeta<TValue = unknown> {
  /** Which UI widget to render */
  widget: WidgetType;
  /** Display label (overrides the property key) */
  label?: string;
  /** Help text shown below the widget */
  desc?: string;
  /** For numeric widgets: minimum allowed value */
  min?: number;
  /** For numeric widgets: maximum allowed value */
  max?: number;
  /** For option widgets: list of selectable values */
  options?: readonly TValue[];
  /** When true, the UI marks this property as required (asterisk). */
  required?: boolean;
}

// ─────────────────────────────────────────────────────────────
// Visual / Display Metadata
// ─────────────────────────────────────────────────────────────

export interface DeviceVisualMeta {
  /** Full display name, e.g. "SSD1306 OLED Display" */
  name: string;
  /** Short name for compact UI, e.g. "SSD1306" */
  short: string;
  /** Category for grouping and validation rules */
  category: DeviceCategory;
}

// ─────────────────────────────────────────────────────────────
// Pin Metadata for Templates
//
// When generating DTS, template functions receive pin info via
// DeviceTemplateArgs.gpios and .busPins. The actual data comes
// from PinMetadata in metadata/controllers.ts (which now includes
// dtsRef and pinctrlRef). This interface mirrors that shape for
// the template layer boundary.
// ─────────────────────────────────────────────────────────────

export interface PinTemplateInfo {
  /** Human-readable name, e.g. "D0" */
  displayName: string;
  /** Devicetree reference, e.g. "&pro_micro 0" */
  dtsRef: string;
  /** Pinctrl reference, e.g. "0, 8" for nRF52, "26" for RP2040 */
  pinctrlRef: string;
}

// ─────────────────────────────────────────────────────────────
// Template Arguments — TYPED per device type
//
// Replaces the old `[key: string]: any` pattern.
// Each device's template function receives fully typed arguments.
// ─────────────────────────────────────────────────────────────

export interface DeviceTemplateArgs {
  /** Name of the bus this device is connected to */
  bus: string;
  /** CS pin index for SPI devices with cs-gpios array */
  csIndex?: number;
  /**
   * The device's serialized properties (from its Zod schema).
   * Each device template casts to its specific props type internally.
   */
  props: Record<string, unknown>;
  /**
   * GPIO pin assignments for this device instance.
   * Key = role string (e.g., "cs", "irq", "dr"),
   * Value = pin DTS template info.
   */
  gpios: Record<string, PinTemplateInfo>;
  /**
   * Bus-level pin assignments.
   * Key = BusPinRole (e.g., "mosi", "sck", "sda"),
   * Value = pin DTS template info.
   */
  busPins: Partial<Record<BusPinRole, PinTemplateInfo>>;
  /**
   * ID of the controller, for SoC-specific template branches.
   */
  controllerId: ControllerId;
}

// ─────────────────────────────────────────────────────────────
// Template Function — generates DTS + Kconfig for one device
// ─────────────────────────────────────────────────────────────

export type DeviceTemplateFunction = (
  args: DeviceTemplateArgs,
) => DeviceTemplateResult;

// ─────────────────────────────────────────────────────────────
// Template Result
// ─────────────────────────────────────────────────────────────

export interface DeviceTemplateResult {
  /** Devicetree content to be placed on the bus node */
  deviceDts?: string;
  /** Kconfig symbols to enable */
  kconfig?: string[];
  /**
   * Additional files to create or append to.
   * Key = relative file path, value = content to append.
   */
  appendFiles?: Record<string, string>;
}

// ─────────────────────────────────────────────────────────────
// Device Meta — the complete metadata for one device type
//
// This is the single source of truth for everything about a
// device type: its data schema, UI config, GPIO needs, bus
// requirements, template function, and display info.
//
// Type parameters:
//   TType — literal string discriminator (e.g., "ssd1306")
//
// Usage in device files:
//   export const ssd1306Meta = {
//     type: "ssd1306",
//     schema: SSD1306DeviceSchema,
//     bus: "i2c",
//     class: "display",
//     // ...
//   } satisfies DeviceMeta<"ssd1306">;
// ─────────────────────────────────────────────────────────────

export interface DeviceMeta<TType extends string = string> {
  /** Device type discriminator (must match the Zod schema's literal) */
  type: TType;
  /** Zod schema for device properties — does NOT include pin references */
  schema: z.ZodTypeAny;
  /** Which bus type this device connects to */
  bus: "i2c" | "spi";
  /** Device class for grouping and per-class limits (maxPerPart) */
  class: DeviceCategory;
  /**
   * Whether this device has exclusive use of the bus.
   * When true, only one device of this class can be on a bus.
   * Example: WS2812 is exclusive — you can't have two WS2812 strips
   * on the same SPI bus.
   */
  exclusive: boolean;
  /** External ZMK module required by this device driver */
  module?: ModuleId;
  /**
   * Which bus-level pins are required for this device to work.
   * Example: WS2812 needs { mosi: true }, shift register needs
   * { mosi: true, sck: true }.
   * These pins are assigned via PinUsageBus, not on the device.
   */
  requiredBusPins: Partial<Record<BusPinRole, boolean>>;
  /**
   * GPIO roles this device needs.
   * Each entry describes a pin the device requires (CS, IRQ, DR, etc.).
   * These pins are assigned via PinUsageDevice (referenced by deviceId).
   */
  gpio: DeviceGpioRequirements;
  /** Display metadata for the UI device picker */
  visual: DeviceVisualMeta;
  /**
   * UI widget definitions for each device property.
   * Key = property name in the Zod schema.
   */
  props: Record<string, DevicePropMeta>;
  /** Template function for DTS + Kconfig generation */
  template: DeviceTemplateFunction;
  /**
   * Devicetree node label base for this device type (without `&` prefix).
   * Each instance gets a unique label by appending the instance index:
   * "shifter" → "shifter0", "shifter1", etc.
   *
   * Only required for device types that provide pins (i.e., define `pins`).
   */
  dtsNodeLabel?: string;
  /**
   * Generate pin metadata for a device instance.
   * Returns PinInfo[] if this device type provides pins, or undefined if it doesn't.
   *
   * @param device - The device instance from part.buses.
   * @param deviceNodeLabel - Unique node label for this device instance (e.g., "shifter0").
   *   Built by the resolver from `dtsNodeLabel` + instance index. The pins function
   *   must NOT construct its own node label — it receives the canonical one here.
   */
  pins?: (device: AnyBusDevice, deviceNodeLabel: string) => PinInfo[];
}
