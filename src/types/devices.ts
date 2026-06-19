import { z } from "astro/zod";

// Re-export from utils and metadata — single source of truth lives there.
export { DeviceIdSchema, type DeviceId } from "./utils";

// Re-export device schemas + types from metadata.
export {
  ssd1306DeviceSchema, type SSD1306Device,
  niceViewDeviceSchema, type NiceViewDevice,
  ws2812DeviceSchema, type WS2812Device,
  shifter595DeviceSchema, type Shifter595Device,
  pmw3610DeviceSchema, type Pmw3610Device,
  paw3395DeviceSchema, type Paw3395Device,
  pinnacleSpiDeviceSchema, type PinnacleSpiDevice,
  pinnacleI2cDeviceSchema, type PinnacleI2cDevice,
  I2cDeviceSchema, type I2cDevice,
  SpiDeviceSchema, type SpiDevice,
  AnyBusDeviceSchema, type AnyBusDevice,
} from "~/metadata/device";

// ── Pin & Bus Identifiers ─────────────────────────────────

/**
 * Pin identifier, e.g. d0, d1, p101, gp12, etc.
 */
export const PinIdSchema = z.string().brand<"PinId">().max(10);
export type PinId = z.infer<typeof PinIdSchema>;

export const BusNameSchema = z.string().brand<"BusName">()
  .min(1, "Bus name cannot be empty")
  .max(16, "Bus name cannot be longer than 16 characters")
  .regex(/^[a-zA-Z0-9_]+$/, "Bus name must contain only letters, numbers, and underscores");
export type BusName = z.infer<typeof BusNameSchema>;

// ── Bus Schemas ───────────────────────────────────────────
//
// Bus objects carry only bus-level data (type + devices).
// Bus communication pins (MOSI/MISO/SCK/SDA/SCL) are tracked
// via PinUsageBus (usage: "bus", bus: <name>, role: <BusPinRole>).
// This keeps all pin assignments in one place.

import { I2cDeviceSchema, SpiDeviceSchema } from "~/metadata/device";

export const SpiBusSchema = z.object({
  type: z.literal("spi"),
  devices: z.array(SpiDeviceSchema).default([]),
});
export type SpiBus = z.infer<typeof SpiBusSchema>;

export const I2cBusSchema = z.object({
  type: z.literal("i2c"),
  devices: z.array(I2cDeviceSchema).default([]),
});
export type I2cBus = z.infer<typeof I2cBusSchema>;

export const BusSchema = z.discriminatedUnion("type", [
  SpiBusSchema,
  I2cBusSchema,
]);
export type Bus = z.infer<typeof BusSchema>;
