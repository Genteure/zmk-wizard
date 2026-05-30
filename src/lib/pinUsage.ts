import type { PinMode, PinUsage, PinUsageBus, PinUsageDevice, PinUsageEncoder, PinUsageKscan } from "~/typedef";

export const DEFAULT_KSCAN_ID = "default";

export function pinModeFromUsage(usage: PinUsage | undefined): PinMode | undefined {
  if (!usage) return undefined;
  if (usage.usage === "kscan") {
    if (usage.role === "input") return "input";
    if (usage.role === "output") return "output";
    // Interrupt is not exposed as a selectable UI pin mode.
    return undefined;
  }
  if (usage.usage === "encoder") return "encoder";
  if (usage.usage === "bus" || usage.usage === "device") return "bus";
  return undefined;
}

export function isBusPinUsage(usage: PinUsage | undefined): boolean {
  return usage?.usage === "bus" || usage?.usage === "device";
}

export function isEncoderPinUsage(usage: PinUsage | undefined): boolean {
  return usage?.usage === "encoder";
}

export function makeKscanPinUsage(role: "input" | "output" | "interrupt", kscan: string = DEFAULT_KSCAN_ID): PinUsageKscan {
  return { usage: "kscan", kscan, role };
}

export function makeBusPinUsage(bus: string, role: PinUsageBus["role"]): PinUsageBus {
  return { usage: "bus", bus, role };
}

export function makeDevicePinUsage(bus: string, deviceId: string, role: string): PinUsageDevice {
  return { usage: "device", bus, deviceId, role };
}

export function makeEncoderPinUsage(encoderId: string, role: PinUsageEncoder["role"]): PinUsageEncoder {
  return { usage: "encoder", encoderId, role };
}
