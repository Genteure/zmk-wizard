/**
 * usePinInventory — Vue composable wrapping the pin resolution pure functions.
 *
 * Reactive wrapper: re-derives pin data when part state changes.
 * Used by UI components that need reactive pin access.
 */

import type { ComputedRef } from "vue";
import { computed } from "vue";
import type { BusName, BusPinRole, KeyboardPart, PinId, PinInfo } from "~/types";
import {
  type PinInventory,
  resolvePinInventory,
} from "./pinInventory";
import { Controllers } from "~/metadata/controllers";

/** Re-export the pure-function types for convenience. */
export type { PinInventory };

/**
 * Reactive pin inventory derived from keyboard part state.
 *
 * @param part - A ComputedRef to the current KeyboardPart.
 * @returns Reactive pin data: allPins, deviceNodeLabels, getPin, getPinsForBus.
 */
export function usePinInventory(part: ComputedRef<KeyboardPart>) {
  const inventory = computed<PinInventory>(() => resolvePinInventory(part.value));
  const allPins = computed<PinInfo[]>(() => inventory.value.allPins);
  const deviceNodeLabels = computed(() => inventory.value.deviceNodeLabels);

  /** Get a specific pin by ID. */
  const getPin = (id: PinId): PinInfo | undefined =>
    allPins.value.find((p) => p.id === id);

  /** Get all pins that can serve a specific bus role. */
  const getPinsForBus = (busName: BusName, role: BusPinRole): PinInfo[] => {
    const ctrl = Controllers[part.value.controller];
    if (!ctrl) return [];
    const result = ctrl.canBusPins(busName, role);
    const ids = result === true ? Object.keys(ctrl.gpios) as PinId[] : result;
    return ids.map((id) => ({
      id,
      label: ctrl.gpios[id].label,
      aka: ctrl.gpios[id].aka,
      dtsNodeLabel: ctrl.gpios[id].dtsNodeLabel,
      dtsPinNumber: ctrl.gpios[id].dtsPinNumber,
      pinctrlRef: ctrl.gpios[id].pinctrlRef,
      capabilities: ctrl.pinCapabilities[id],
      source: { type: "controller" as const, controllerId: part.value.controller },
    }));
  };

  return { allPins, deviceNodeLabels, getPin, getPinsForBus };
}
