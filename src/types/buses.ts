import { z } from "astro/zod";

// Bus name
export const BusNameSchema = z.string()
  .min(1, "Bus name cannot be empty")
  .max(16, "Bus name cannot be longer than 16 characters")
  .regex(/^[a-zA-Z0-9_]+$/, "Bus name must contain only letters, numbers, and underscores");
export type BusName = z.infer<typeof BusNameSchema>;

// Device schemas and types (Zod is source of truth)
export const BusDeviceTypeSchema = z.enum(["ssd1306", "niceview", "ws2812", "74hc595"]);
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
  cs: z.string().max(10).optional(),
});
export type NiceviewDevice = z.infer<typeof NiceviewDeviceSchema>;

export const WS2812DeviceSchema = BaseBusDeviceSchema.extend({
  type: z.literal("ws2812"),
  length: z.number().min(1).max(256).default(3),
  cs: z.string().max(10).optional(),
});
export type WS2812Device = z.infer<typeof WS2812DeviceSchema>;

export const ShiftRegisterDeviceSchema = BaseBusDeviceSchema.extend({
  type: z.literal("74hc595"),
  ngpios: z.union([z.literal(8), z.literal(16), z.literal(24), z.literal(32)]).default(8),
  cs: z.string().max(10).optional(),
});
export type ShiftRegisterDevice = z.infer<typeof ShiftRegisterDeviceSchema>;

export const SpiDeviceSchema = z.discriminatedUnion("type", [
  NiceviewDeviceSchema,
  WS2812DeviceSchema,
  ShiftRegisterDeviceSchema,
]);
export type SpiDevice = z.infer<typeof SpiDeviceSchema>;

export const I2cDeviceSchema = z.discriminatedUnion("type", [
  SSD1306DeviceSchema,
]);
export type I2cDevice = z.infer<typeof I2cDeviceSchema>;

export const AnyBusDeviceSchema = z.discriminatedUnion("type", [
  SSD1306DeviceSchema,
  NiceviewDeviceSchema,
  WS2812DeviceSchema,
  ShiftRegisterDeviceSchema,
]);
export type AnyBusDevice = z.infer<typeof AnyBusDeviceSchema>;

export const BaseBusSchema = z.object({
  name: BusNameSchema,
  devices: z.array(AnyBusDeviceSchema).default([]),
});
export type BaseBus = z.infer<typeof BaseBusSchema>;

export const SpiBusSchema = BaseBusSchema.extend({
  type: z.literal("spi"),
  mosi: z.string().max(10).optional(),
  miso: z.string().max(10).optional(),
  sck: z.string().max(10).optional(),
  devices: z.array(SpiDeviceSchema).default([]),
});
export type SpiBus = z.infer<typeof SpiBusSchema>;

export const I2cBusSchema = BaseBusSchema.extend({
  type: z.literal("i2c"),
  sda: z.string().max(10).optional(),
  scl: z.string().max(10).optional(),
  devices: z.array(I2cDeviceSchema).default([]),
});
export type I2cBus = z.infer<typeof I2cBusSchema>;

export const AnyBusSchema = z.discriminatedUnion("type", [SpiBusSchema, I2cBusSchema]);
export type AnyBus = z.infer<typeof AnyBusSchema>;

// Type guards
export const isSpiBus = (bus: AnyBus | undefined | null): bus is SpiBus => !!bus && bus.type === "spi";
export const isI2cBus = (bus: AnyBus | undefined | null): bus is I2cBus => !!bus && bus.type === "i2c";

export const isSSD1306 = (d: AnyBusDevice | undefined | null): d is SSD1306Device => !!d && d.type === "ssd1306";
export const isNiceview = (d: AnyBusDevice | undefined | null): d is NiceviewDevice => !!d && d.type === "niceview";
export const isWS2812 = (d: AnyBusDevice | undefined | null): d is WS2812Device => !!d && d.type === "ws2812";
export const isShiftRegisterDevice = (d: AnyBusDevice | undefined | null): d is ShiftRegisterDevice => !!d && d.type === "74hc595";
export const isSpiDevice = (d: AnyBusDevice | undefined | null): d is SpiDevice => !!d && (d.type === "niceview" || d.type === "ws2812" || d.type === "74hc595");

// Helpers
export type DeviceForBus<T extends AnyBus> = T extends SpiBus ? SpiDevice : T extends I2cBus ? I2cDevice : never;

export function addDeviceToBus<T extends AnyBus>(bus: T, device: DeviceForBus<T>): void {
  bus.devices = [...(bus.devices || []), device] as typeof bus.devices;
}

export function setBusPinTyped(bus: AnyBus, key: "sda" | "scl" | "mosi" | "miso" | "sck", value?: string): void {
  if (isI2cBus(bus)) {
    if (key === "sda") bus.sda = value;
    if (key === "scl") bus.scl = value;
    return;
  }
  if (isSpiBus(bus)) {
    if (key === "mosi") bus.mosi = value;
    if (key === "miso") bus.miso = value;
    if (key === "sck") bus.sck = value;
  }
}
