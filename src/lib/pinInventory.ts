/**
 * Pin Inventory — pure functions for resolving pin metadata from keyboard state.
 *
 * No Vue dependency. Used by validators, export templates, and the
 * usePinInventory composable (which wraps these in computed()).
 */

import type { DeviceId, KeyboardPart, PinId, PinInfo } from "~/types";
import { Controllers } from "~/metadata/controllers";
import { getDeviceMeta } from "~/metadata/device";

// ── Types ─────────────────────────────────────────────────

export interface PinInventory {
  /** All pins (controller + device), resolved from keyboard state. */
  allPins: PinInfo[];
  /**
   * Unique DTS node labels for each pin-providing device.
   * Keyed by device ULID. Example: "01ARZ3NDEKTSV4RRFFQ69G5FAV" → "&shifter0".
   */
  deviceNodeLabels: Record<DeviceId, string>;
}

// ── Pure functions ────────────────────────────────────────

/** Derive controller GPIO pins from controller metadata. */
export function resolveControllerPins(part: KeyboardPart): PinInfo[] {
  const meta = Controllers[part.controller];
  if (!meta) return [];
  return Object.entries(meta.gpios).map(([id, gpio]): PinInfo => ({
    id: id as PinId,
    label: gpio.label,
    aka: gpio.aka,
    dtsNodeLabel: gpio.dtsNodeLabel,
    dtsPinNumber: gpio.dtsPinNumber,
    pinctrlRef: gpio.pinctrlRef,
    capabilities: meta.pinCapabilities[id as PinId],
    source: { type: "controller", controllerId: part.controller },
  }));
}

/** Derive extension device pins and build the device node label map. */
export function resolveDevicePins(part: KeyboardPart): {
  devicePins: PinInfo[];
  deviceNodeLabels: Record<DeviceId, string>;
} {
  const devicePins: PinInfo[] = [];
  const deviceNodeLabels: Record<DeviceId, string> = {};

  for (const bus of Object.values(part.buses)) {
    for (const [index, device] of bus.devices.entries()) {
      const meta = getDeviceMeta(device.type as Parameters<typeof getDeviceMeta>[0]);
      const nodeLabel = meta?.dtsNodeLabel
        ? `${meta.dtsNodeLabel}${index}`
        : undefined;
      if (nodeLabel) {
        deviceNodeLabels[device.id] = nodeLabel;
      }
      if (meta?.pins && nodeLabel) {
        devicePins.push(...meta.pins(device, nodeLabel));
      }
    }
  }

  return { devicePins, deviceNodeLabels };
}

/** Resolve the full pin inventory from a part's state. */
export function resolvePinInventory(part: KeyboardPart): PinInventory {
  const { devicePins, deviceNodeLabels } = resolveDevicePins(part);
  return {
    allPins: [...resolveControllerPins(part), ...devicePins],
    deviceNodeLabels,
  };
}
