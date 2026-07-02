import { computed, type ComputedRef } from "vue";
import type { Bus, BusName, BusPinRole, ControllerId, KeyboardPart, ModuleId } from "~/types";
import { Controllers, SocBuses } from "~/metadata/controllers";
import { DEVICE_CLASS_LIMITS, getDeviceMeta, SOC_BUS_CONFLICTS, type DeviceTypeName } from "~/metadata/device";
import { ZMK_MODULES } from "~/metadata/modules";
import type { DeviceCategory } from "~/metadata/device/type";

// ─────────────────────────────────────────────────────────────
// Bus Status — per-bus availability state
// ─────────────────────────────────────────────────────────────

export type BusStatus = "active" | "inactive" | "unavailable";

export interface BusStatusEntry {
  name: string;
  type: "i2c" | "spi";
  status: BusStatus;
  /** Roles that devices on this bus need (e.g., ["sck", "mosi"]). */
  requires: readonly BusPinRole[];
  /** All possible roles for this bus type (e.g., ["sda", "scl"] for I2C). */
  available: readonly BusPinRole[];
}

export interface BusAvailabilityContext {
  busStatuses: ComputedRef<BusStatusEntry[]>;
  /** Whether any compatible bus is available for this device type. */
  deviceAvailable: (deviceType: DeviceTypeName) => boolean;
  /** Whether a specific bus is available for this device type. */
  canAddToBus: (deviceType: DeviceTypeName, busName: string) => boolean;
  /** Reason a device type cannot be added to a bus (null = can add). */
  conflictReason: (deviceType: DeviceTypeName, busName: string) => string | null;
}

// ─────────────────────────────────────────────────────────────
// Pure helpers — testable, no Vue reactivity
/**
 * Compute the effective required bus pins by merging bus-level requires
 * with the requiredBusPins from all devices on the bus.
 */
function effectiveBusRequires(
  busRequires: readonly BusPinRole[],
  devices: { type: string }[],
): BusPinRole[] {
  const roles = new Set<BusPinRole>(busRequires);
  for (const device of devices) {
    const meta = getDeviceMeta(device.type as DeviceTypeName);
    if (meta?.requiredBusPins) {
      for (const role of Object.keys(meta.requiredBusPins)) {
        if (meta.requiredBusPins[role as BusPinRole]) roles.add(role as BusPinRole);
      }
    }
  }
  return [...roles];
}
// ─────────────────────────────────────────────────────────────

/** Count active devices of a given class on a part. */
export function countDevicesOfClass(part: KeyboardPart, cls: DeviceCategory): number {
  let count = 0;
  for (const bus of Object.values(part.buses)) {
    for (const device of bus.devices) {
      const meta = getDeviceMeta(device.type as DeviceTypeName);
      if (meta.class === cls) count++;
    }
  }
  return count;
}

/** Check if a bus has any device that requires exclusive bus access. */
export function busHasExclusiveDevice(bus: Bus): boolean {
  return bus.devices.some((d) => {
    const meta = getDeviceMeta(d.type as DeviceTypeName);
    return meta.exclusive === true;
  });
}

/** Check if a device type's class limit is reached on the part. */
export function deviceClassLimitReached(
  part: KeyboardPart,
  deviceType: DeviceTypeName,
): boolean {
  const meta = getDeviceMeta(deviceType);
  const limit = DEVICE_CLASS_LIMITS[meta.class];
  if (limit === undefined || limit === Infinity) return false;
  return countDevicesOfClass(part, meta.class) >= limit;
}

/**
 * Compute bus group conflicts from SoC conflict groups.
 * Returns a Record mapping each bus name to the set of conflicting bus names.
 */
function buildConflictMap(controllerId: ControllerId): Record<string, Record<string, true>> {
  const map: Record<string, Record<string, true>> = {};
  const controllerMeta = Controllers[controllerId];
  if (!controllerMeta) return map;
  const groups = SOC_BUS_CONFLICTS[controllerMeta.soc];
  for (const [a, b] of groups) {
    if (!map[a]) map[a] = {};
    if (!map[b]) map[b] = {};
    map[a][b] = true;
    map[b][a] = true;
  }
  return map;
}

/** All possible pin roles for each bus type. */
const BUS_PIN_ROLES: Readonly<Record<"i2c" | "spi", readonly BusPinRole[]>> = {
  i2c: ["sda", "scl"],
  spi: ["sck", "mosi", "miso"],
};

/**
 * Compute bus statuses for a part given its controller.
 * Pure function — returns BusStatusEntry[].
 */
export function computeBusStatuses(
  part: KeyboardPart,
  controllerId: ControllerId,
): BusStatusEntry[] {
  const controllerMeta = Controllers[controllerId];
  if (!controllerMeta) return [];

  const socBusMeta = SocBuses[controllerMeta.soc];
  if (!socBusMeta) return [];

  const conflictMap = buildConflictMap(controllerId);

  // Collect which buses are active
  const activeBuses: Record<string, true> = {};
  for (const name of Object.keys(part.buses)) {
    const bus = part.buses[name as BusName];
    if (bus && bus.devices.length > 0) {
      activeBuses[name] = true;
    }
  }

  const results: BusStatusEntry[] = [];

  for (const name of Object.keys(socBusMeta)) {
    const busMeta = socBusMeta[name as BusName];
    const bus = part.buses[name as BusName];

    // Active: bus exists and has devices
    if (bus && bus.devices.length > 0) {
      results.push({
        name,
        type: busMeta.type,
        status: "active",
        requires: effectiveBusRequires(busMeta.requires, bus.devices),
        available: BUS_PIN_ROLES[busMeta.type],
      });
      continue;
    }

    // Inactive by default — check for conflicts that make it unavailable
    let status: BusStatus = "inactive";

    const conflicting = conflictMap[name];
    if (conflicting) {
      for (const conflictName of Object.keys(conflicting)) {
        if (activeBuses[conflictName]) {
          status = "unavailable";
          break;
        }
      }
    }

    results.push({
      name,
      type: busMeta.type,
      status,
      requires: busMeta.requires,
      available: BUS_PIN_ROLES[busMeta.type],
    });
  }

  return results;
}

/**
 * Determine if a device type can be added to a specific bus on a part.
 * Returns null if it can be added, or a reason string if it cannot.
 */
export function canAddDeviceToBus(
  part: KeyboardPart,
  controllerId: ControllerId,
  deviceType: DeviceTypeName,
  busName: string,
  enabledModules: ModuleId[] = [],
): string | null {
  const meta = getDeviceMeta(deviceType);

  // Module requirement — device requires a module that is not enabled
  if (meta.module && !enabledModules.includes(meta.module as ModuleId)) {
    const modMeta = ZMK_MODULES[meta.module];
    return `Requires external module "${modMeta?.name ?? meta.module}" which is not enabled.`;
  }

  // Check bus exists and type matches
  const busStatuses = computeBusStatuses(part, controllerId);
  const busEntry = busStatuses.find((b) => b.name === busName);
  if (!busEntry) return "Bus not found on this controller.";
  if (busEntry.type !== meta.bus) return "Bus type mismatch.";
  if (busEntry.status === "unavailable") return "Bus unavailable due to SoC conflicts.";

  // Class limit
  if (deviceClassLimitReached(part, deviceType)) {
    return `Only ${DEVICE_CLASS_LIMITS[meta.class]} ${meta.class} device(s) allowed per part.`;
  }

  const bus = part.buses[busName as BusName];

  // If this device requires exclusive bus and bus already has devices
  if (meta.exclusive && bus && bus.devices.length > 0) {
    return "This device requires a dedicated bus.";
  }

  // If bus has an exclusive device
  if (bus && busHasExclusiveDevice(bus)) {
    return "Bus already has an exclusive device that cannot share.";
  }

  return null; // OK
}

// ─────────────────────────────────────────────────────────────
// Vue composable — wraps pure helpers in computed refs
// ─────────────────────────────────────────────────────────────

export function useBusAvailability(
  part: () => KeyboardPart,
  controllerId: () => ControllerId,
  enabledModules: () => ModuleId[] = () => [],
): BusAvailabilityContext {
  const busStatuses = computed<BusStatusEntry[]>(() =>
    computeBusStatuses(part(), controllerId()),
  );

  const modules = computed(() => enabledModules());

  function deviceAvailable(deviceType: DeviceTypeName): boolean {
    return busStatuses.value.some(
      (b) => canAddDeviceToBus(part(), controllerId(), deviceType, b.name, modules.value) === null,
    );
  }

  function canAddToBus(deviceType: DeviceTypeName, busName: string): boolean {
    return canAddDeviceToBus(part(), controllerId(), deviceType, busName, modules.value) === null;
  }

  function conflictReason(
    deviceType: DeviceTypeName,
    busName: string,
  ): string | null {
    return canAddDeviceToBus(part(), controllerId(), deviceType, busName, modules.value);
  }

  return { busStatuses, deviceAvailable, canAddToBus, conflictReason };
}
