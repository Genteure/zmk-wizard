import type {
  AnyBus,
  AnyBusDevice,
  I2cBus,
  I2cDevice,
  NiceviewDevice,
  ShiftRegisterDevice,
  SpiBus,
  SpiDevice,
  SSD1306Device,
  WS2812Device
} from "./typedef";

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
