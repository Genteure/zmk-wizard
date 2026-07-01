// ─────────────────────────────────────────────────────────────
// Device Registry — central, type-safe index of all bus devices
//
// Every supported device type is registered here. The registry
// powers:
//   - UI: listing available devices for a bus type
//   - Validation: checking GPIO requirements, bus pin needs
//   - Templates: looking up the template function for codegen
//   - Store: creating new device instances with defaults
//
// Type safety chain:
//   DEVICE_REGISTRY["ssd1306"] → typed DeviceMeta<"ssd1306", …>
//   getDeviceMeta("ssd1306") → same, but with type narrowing
//   devicesForBus("i2c") → ("ssd1306" | "pinnacle_i2c")[]
// ─────────────────────────────────────────────────────────────

import { z } from "astro/zod";
import { shifter595DeviceSchema, shifter595Meta } from "./74hc595";
import { niceViewDeviceSchema, niceViewMeta } from "./niceview";
import { paw3395DeviceSchema, paw3395Meta } from "./paw3395";
import { pinnacleI2cDeviceSchema, pinnacleI2cMeta, pinnacleSpiDeviceSchema, pinnacleSpiMeta } from "./pinnacle";
import { pmw3610DeviceSchema, pmw3610Meta } from "./pmw3610";
import { ssd1306DeviceSchema, ssd1306Meta } from "./ssd1306";
import { ws2812DeviceSchema, ws2812Meta } from "./ws2812";
import type { DeviceCategory, DeviceMeta } from "./type";
import type { SocId } from "~/types";

// Re-export device schemas and types — single source of truth.
export { ssd1306DeviceSchema, type SSD1306Device } from "./ssd1306";
export { niceViewDeviceSchema, type NiceViewDevice } from "./niceview";
export { ws2812DeviceSchema, type WS2812Device } from "./ws2812";
export { shifter595DeviceSchema, type Shifter595Device } from "./74hc595";
export { pmw3610DeviceSchema, type Pmw3610Device } from "./pmw3610";
export { paw3395DeviceSchema, type Paw3395Device } from "./paw3395";
export { pinnacleSpiDeviceSchema, type PinnacleSpiDevice, pinnacleI2cDeviceSchema, type PinnacleI2cDevice } from "./pinnacle";

/**
 * Central registry of all supported bus devices.
 *
 * Explicitly typed as Record<string, DeviceMeta> so consumers get
 * the broad interface, not the literal types of each entry.
 * Individual device files use `satisfies DeviceMeta<…>` for compile-time
 * validation; the registry widens them.
 */
export const DEVICE_REGISTRY: Record<string, DeviceMeta> = {
  ssd1306: ssd1306Meta,
  niceview: niceViewMeta,
  ws2812: ws2812Meta,
  "74hc595": shifter595Meta,
  pmw3610: pmw3610Meta,
  paw3395: paw3395Meta,
  pinnacle_spi: pinnacleSpiMeta,
  pinnacle_i2c: pinnacleI2cMeta,
};

/** Union of all registered device type names */
export type DeviceTypeName = keyof typeof DEVICE_REGISTRY;

/**
 * Device metadata lookup. Returns the broad DeviceMeta for any registered type.
 * Use the `type` field to discriminate between device types.
 */
export function getDeviceMeta(type: DeviceTypeName): DeviceMeta {
  return DEVICE_REGISTRY[type];
}

/**
 * List device type names compatible with a given bus type.
 *
 * @example
 *   devicesForBus("spi") // → ["niceview", "ws2812", "74hc595", "pmw3610", "paw3395", "pinnacle_spi"]
 *   devicesForBus("i2c") // → ["ssd1306", "pinnacle_i2c"]
 */
export function devicesForBus(busType: "i2c" | "spi"): DeviceTypeName[] {
  return (Object.entries(DEVICE_REGISTRY) as [DeviceTypeName, DeviceMeta][])
    .filter(([, meta]) => meta.bus === busType)
    .map(([name]) => name);
}

/**
 * List device type names in a given category.
 *
 * @example
 *   devicesByCategory("display") // → ["ssd1306", "niceview"]
 *   devicesByCategory("pointing") // → ["pmw3610", "paw3395", "pinnacle_spi", "pinnacle_i2c"]
 */
export function devicesByCategory(category: DeviceCategory): DeviceTypeName[] {
  return (Object.entries(DEVICE_REGISTRY) as [DeviceTypeName, DeviceMeta][])
    .filter(([, meta]) => meta.class === category)
    .map(([name]) => name);
}

/**
 * Per-category device limits.
 * When `maxPerPart` is set, at most that many devices of the category
 * can be added to a single keyboard part.
 */
export const DEVICE_CLASS_LIMITS: Partial<Record<DeviceCategory, number>> = {
  display: 1,
  rgb: 1,
  // shift_register: unlimited
  // pointing: unlimited
};

// ─────────────────────────────────────────────────────────────
// Discriminated Unions — device schemas grouped by bus type
// ─────────────────────────────────────────────────────────────

export const I2cDeviceSchema = z.discriminatedUnion("type", [
  ssd1306DeviceSchema,
  pinnacleI2cDeviceSchema,
]);
export type I2cDevice = z.infer<typeof I2cDeviceSchema>;

export const SpiDeviceSchema = z.discriminatedUnion("type", [
  niceViewDeviceSchema,
  ws2812DeviceSchema,
  shifter595DeviceSchema,
  pmw3610DeviceSchema,
  paw3395DeviceSchema,
  pinnacleSpiDeviceSchema,
]);
export type SpiDevice = z.infer<typeof SpiDeviceSchema>;

export const AnyBusDeviceSchema = z.discriminatedUnion("type", [
  ssd1306DeviceSchema,
  niceViewDeviceSchema,
  ws2812DeviceSchema,
  shifter595DeviceSchema,
  pmw3610DeviceSchema,
  paw3395DeviceSchema,
  pinnacleSpiDeviceSchema,
  pinnacleI2cDeviceSchema,
]);
export type AnyBusDevice = z.infer<typeof AnyBusDeviceSchema>;

// ─────────────────────────────────────────────────────────────
// SoC Bus Group Conflicts — mutually exclusive bus pairs.
//
// On nRF52840, I2C and SPI instances of the same index share
// hardware peripherals (TWIM/SPIM blocks), so they cannot be
// active at the same time.
// RP2040 has no such conflicts — its PIO-based peripherals are
// independent.
// ─────────────────────────────────────────────────────────────

/** Pair of bus names that cannot both be active. */
export type BusConflictGroup = [string, string];

/** Bus conflict groups keyed by SoC ID. */
export const SOC_BUS_CONFLICTS: Record<SocId, BusConflictGroup[]> = {
  nrf52840: [
    ["i2c0", "spi0"],
    ["i2c1", "spi1"],
  ],
  rp2040: [],
};
