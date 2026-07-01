import type {
  Bus,
  BusPinRole,
  ControllerId,
  DeviceId,
  I2cBus,
  PinSelection,
  PinUsage,
  SpiBus,
} from "~/types";
import { Controllers, type ControllerMetadata } from "~/metadata/controllers";
import type { DeviceTemplateArgs, PinTemplateInfo } from "~/metadata/device/type";
import { getDeviceMeta, type DeviceTypeName } from "~/metadata/device";
import { generateBusPinctrl } from "./pinctrl";

// ─────────────────────────────────────────────────────────────
// Bus-Level Device Orchestration
//
// For each bus in a part:
//   1. Generate SoC-specific pinctrl node (NRF_PSEL or pinmux)
//   2. For SPI buses: collect CS pins → cs-gpios array
//   3. Sort devices (nice!view first so reg=0)
//   4. Call each device's template function with typed args
//   5. Aggregate DTS + Kconfig
// ─────────────────────────────────────────────────────────────

/** Indexed view of pin usage by device ID. */
type DevicePinIndex = Map<
  DeviceId,
  Map<string, { pinId: string; pinInfo: PinTemplateInfo }>
>;

/** Build a lookup: deviceId → role → { pinId, pinInfo } from part.pins */
function indexDevicePins(
  pins: PinSelection,
  controller: ControllerMetadata,
): DevicePinIndex {
  const index: DevicePinIndex = new Map();
  for (const [pinId, usage] of Object.entries(pins)) {
    if (usage.usage !== "device") continue;
    const pu = usage as Extract<PinUsage, { usage: "device" }>;
    const pinInfo = controller.gpios[pinId as keyof typeof controller.gpios];
    if (!pinInfo) continue;
    let byRole = index.get(pu.deviceId);
    if (!byRole) {
      byRole = new Map();
      index.set(pu.deviceId, byRole);
    }
    byRole.set(pu.role, {
      pinId,
      pinInfo: {
        displayName: pinInfo.label,
        dtsRef: `&${pinInfo.dtsNodeLabel} ${pinInfo.dtsPinNumber}`,
        pinctrlRef: pinInfo.pinctrlRef ?? "",
      },
    });
  }
  return index;
}

/** Build a lookup: busName → Partial<Record<BusPinRole, PinTemplateInfo>> */
function indexBusPins(
  pins: PinSelection,
  controller: ControllerMetadata,
): Map<string, Partial<Record<BusPinRole, PinTemplateInfo>>> {
  const index = new Map<
    string,
    Partial<Record<BusPinRole, PinTemplateInfo>>
  >();
  for (const [pinId, usage] of Object.entries(pins)) {
    if (usage.usage !== "bus") continue;
    const pu = usage as Extract<PinUsage, { usage: "bus" }>;
    const pinInfo = controller.gpios[pinId as keyof typeof controller.gpios];
    if (!pinInfo) continue;
    let busEntry = index.get(pu.bus as string);
    if (!busEntry) {
      busEntry = {};
      index.set(pu.bus as string, busEntry);
    }
    busEntry[pu.role] = {
      displayName: pinInfo.label,
      dtsRef: `&${pinInfo.dtsNodeLabel} ${pinInfo.dtsPinNumber}`,
      pinctrlRef: pinInfo.pinctrlRef ?? "",
    };
  }
  return index;
}

/**
 * Options for generating a complete section for one bus.
 */
export interface GenerateBusSectionArgs {
  /** Part index (0-based) */
  partIndex: number;
  /** Part name string */
  partName: string;
  /** Display name for the section comment */
  busName: string;
  /** The bus object (I2C or SPI) */
  bus: Bus;
  /** Full pin selection for the part */
  pins: PinSelection;
  /** Controller metadata for pin lookups */
  controller: ControllerMetadata;
  /** Controller ID string */
  controllerId: ControllerId;
  /** Whether this is the central part in a split */
  isCentral: boolean;
}

export interface PartTemplateResult {
  /** DTS content for the pinctrl overlay file */
  pinctrlDts: string;
  /** Kconfig entries to merge into the defconfig */
  kconfig: string[];
}

/**
 * Generate the complete template output for all buses on a part.
 */
export function generatePartTemplates(
  _partIndex: number,
  partName: string,
  buses: Record<string, Bus>,
  pins: PinSelection,
  controllerId: ControllerId,
  _isCentral: boolean,
): PartTemplateResult {
  const controller = Controllers[controllerId];
  if (!controller) return { pinctrlDts: "", kconfig: [] };

  const deviceIndex = indexDevicePins(pins, controller);
  const busPinIndex = indexBusPins(pins, controller);

  let allDts = "";
  const allKconfig = new Set<string>();
  // Per-type counter for unique DTS node labels across all buses (shifter0, shifter1, etc.)
  const typeCounters = new Map<string, number>();

  for (const [busName, bus] of Object.entries(buses)) {
    if (bus.devices.length === 0) continue;

    const busPins = busPinIndex.get(busName) ?? {};

    // 1. Pinctrl node
    const pinctrlDts = generateBusPinctrl({
      busName,
      busType: bus.type,
      busPins,
      controller,
    });
    allDts += pinctrlDts;

    // 2. Section header
    allDts += `\n// devices on ${busName}\n`;

    // 3. Kconfig: enable bus type
    if (bus.type === "i2c") {
      allKconfig.add("\nconfig I2C\n    default y\n");
    } else {
      allKconfig.add("\nconfig SPI\n    default y\n");
    }

    // 4. SPI: sort devices (nice!view first) and generate cs-gpios
    if (bus.type === "spi") {
      const spiBus = bus as SpiBus;
      spiBus.devices.sort((a, b) =>
        a.type === "niceview" ? -1 : b.type === "niceview" ? 1 : 0,
      );

      allDts += generateCsGpios(busName, spiBus, pins, controller);
    }
    // 5. Generate per-device DTS + Kconfig

    (bus as SpiBus | I2cBus).devices.forEach((device, busIndex) => {
      const meta = getDeviceMeta(device.type as DeviceTypeName);
      if (!meta) return;

      const gpios = deviceIndex.get(device.id as DeviceId) ?? new Map();
      const gpiosRecord: Record<string, PinTemplateInfo> = {};
      for (const [role, info] of gpios) {
        gpiosRecord[role] = info;
      }

      const count = typeCounters.get(device.type) ?? 0;
      typeCounters.set(device.type, count + 1);

      const args: DeviceTemplateArgs = {
        bus: busName,
        csIndex: bus.type === "spi" ? busIndex : undefined,
        props: device as unknown as Record<string, unknown>,
        gpios: gpiosRecord,
        busPins,
        controllerId,
        nodeLabel: meta.dtsNodeLabel ? `${meta.dtsNodeLabel}${count}` : undefined,
      };

      const result = meta.template(args);

      if (result.deviceDts) {
        allDts += `\n${result.deviceDts}`;
      }
      if (result.kconfig) {
        for (const kc of result.kconfig) {
          allKconfig.add(kc);
        }
      }
    });
  }

  // 6. Wrap everything in the header
  let pinctrlDts = "";
  if (allDts.trim()) {
    pinctrlDts = `
/**
 * Generated by Shield Wizard for ZMK
 * Applies to part "${partName}" with controller "${controllerId}"
 */

${allDts.trim()}
`;
  }

  return {
    pinctrlDts: pinctrlDts.trimStart(),
    kconfig: [...allKconfig],
  };
}

/**
 * Generate cs-gpios property for an SPI bus.
 *
 * Scans part.pins for PinUsageDevice entries on this bus with role "cs",
 * collects their DTS references, and outputs the `cs-gpios` property.
 * Devices are assumed to be in the correct order (nice!view first).
 */
function generateCsGpios(
  busName: string,
  bus: SpiBus,
  pins: PinSelection,
  controller: ControllerMetadata,
): string {
  // Collect device IDs on this bus that need a CS pin.
  const deviceIds = new Set<string>();
  for (const dev of bus.devices) {
    const meta = getDeviceMeta(dev.type as DeviceTypeName);
    if (meta?.gpio?.cs?.required) {
      deviceIds.add(dev.id as string);
    }
  }

  if (deviceIds.size === 0) return "";

  // Find CS pin assignments for these devices, preserving bus device order.
  const csEntries: string[] = [];
  let allAssigned = true;

  for (const dev of bus.devices) {
    const devId = dev.id as string;
    if (!deviceIds.has(devId)) continue;

    // Find the pin assigned to this device with role "cs"
    let csPinInfo: { dtsRef: string } | undefined;
    for (const [pinId, usage] of Object.entries(pins)) {
      if (
        usage?.usage === "device" &&
        (usage as Extract<typeof usage, { usage: "device" }>).deviceId ===
          devId &&
        (usage as Extract<typeof usage, { usage: "device" }>).role === "cs"
      ) {
        const pinMeta =
          controller.gpios[pinId as keyof typeof controller.gpios];
        if (pinMeta) {
          csPinInfo = { dtsRef: `&${pinMeta.dtsNodeLabel} ${pinMeta.dtsPinNumber}` };
        }
        break;
      }
    }

    if (csPinInfo) {
      const isNiceView = dev.type === "niceview";
      const gpioFlag = isNiceView ? "GPIO_ACTIVE_HIGH" : "GPIO_ACTIVE_LOW";
      csEntries.push(`<${csPinInfo.dtsRef} ${gpioFlag}>`);
    } else {
      allAssigned = false;
    }
  }

  if (csEntries.length === 0) return "";

  if (!allAssigned) {
    return `// CS pins not defined for at least one device on ${busName}, skipping CS pin configuration\n`;
  }

  return `
// CS pins for devices on ${busName}
&${busName} {
    cs-gpios = ${csEntries.join(", ")};
};
`;
}
