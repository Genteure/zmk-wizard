import type { BusName, BusPinRole, ControllerId, PinCapabilities, PinId, SocId } from "~/types";

// Metadata for controllers

export interface SocMetadata {
  // TODO add metadata fields.
}

export const SoCs = {
  "nrf52840": {

  } satisfies SocMetadata,
  "rp2040": {

  } satisfies SocMetadata,
}

interface BusMetadata {
  type: 'i2c' | 'spi';
  /** Bus-level required pins (e.g., SCK for SPI, SDA+SCL for I2C). MISO/MOSI are device-level — see DeviceMeta.requiredBusPins. */
  requires: BusPinRole[];
}

export type SocBus = Record<BusName, BusMetadata>;
/**
 * Mapping of SoC to its available buses and their metadata.
 * This is the single source of truth for all bus-related information, for UI and for validation.
 */
export const SocBuses: Record<SocId, SocBus> = {
  "nrf52840": {
    "i2c0": {
      type: 'i2c',
      requires: ["sda", "scl"],
    },
    "i2c1": {
      type: 'i2c',
      requires: ["sda", "scl"],
    },
    "spi0": {
      type: 'spi',
      requires: ["sck"],
    },
    "spi1": {
      type: 'spi',
      requires: ["sck"],
    },
    "spi2": {
      type: 'spi',
      requires: ["sck"],
    },
    "spi3": {
      type: 'spi',
      requires: [], // SPI3 doesn't require SCK
    },
  } satisfies Record<string, BusMetadata> as SocBus,
  "rp2040": {
    "i2c0": {
      type: 'i2c',
      requires: ["sda", "scl"],
    },
    "i2c1": {
      type: 'i2c',
      requires: ["sda", "scl"],
    },
    "spi0": {
      type: 'spi',
      requires: ["sck"],
    },
    "spi1": {
      type: 'spi',
      requires: ["sck"],
    },
  } satisfies Record<string, BusMetadata> as SocBus,
};

interface PinMetadata {
  label: string;
  aka?: string[];
  /** Devicetree node label, e.g. "&pro_micro" or "&gpio1". */
  dtsNodeLabel: string;
  /** Pin number on the GPIO controller, e.g. "0", "8". */
  dtsPinNumber: string;
  /** Pinctrl reference for pinctrl nodes, e.g. "0, 8" (nRF52), "26" (RP2040). Only on native pins. */
  pinctrlRef?: string;
}

const asPinMap = <T extends Record<string, PinMetadata>>(map: T) =>
  map as Record<PinId, PinMetadata>;

export interface ControllerMetadata {
  /** Display name */
  name: string;
  /** System on Chip used by this controller */
  soc: SocId;
  /** Link to pin reference for this controller */
  pinref: string;
  /** Zephyr board name for build.yaml and pinctrl overlay paths */
  board: string;
  /** Kconfig symbol for the board */
  boardKconfig: string;
  /** General Purpose Input/Output pins */
  gpios: Record<PinId, PinMetadata>;
  /**
   * Capabilities for each GPIO pin.
   * Keys are PinIds that match entries in `gpios`.
   *
   * TODO: Values are placeholders — all pins marked as full capability.
   * Replace with actual per-SoC per-pin data from datasheets.
   */
  pinCapabilities: Record<PinId, PinCapabilities>;
  /**
   * Return which native pin IDs can serve a given bus role.
   * Only controller pins can participate in pinctrl.
   * @returns `true` if all pins are flexible,
   *          or a specific list of PinIds that support the role.
   */
  canBusPins(busName: BusName, role: BusPinRole): PinId[] | true;
}

/**
 * Placeholder: full capabilities for all pins on a flexible GPIO SoC.
 * TODO: Replace with actual per-pin capability data from SoC datasheets.
 */
const ALL_CAPABILITIES: PinCapabilities = {
  gpioIn: true,
  gpioOut: true,
  interrupt: true,
};

const PRO_MICRO = "pro_micro";
const XIAO_D = "xiao_d";
const GPIO0 = "gpio0";
const GPIO1 = "gpio1";

export const Controllers: Record<ControllerId, ControllerMetadata> = {
  "nice_nano_v2": {
    name: "nice!nano v2",
    soc: "nrf52840",
    pinref: "https://nicekeyboards.com/docs/nice-nano/pinout-schematic",
    board: "nice_nano_v2",
    boardKconfig: "BOARD_NICE_NANO_V2",
    gpios: asPinMap({
      "d0": { label: "D0", aka: ["P0.08"], dtsNodeLabel: PRO_MICRO, dtsPinNumber: "0", pinctrlRef: "0, 8" },
      "d1": { label: "D1", aka: ["P0.06"], dtsNodeLabel: PRO_MICRO, dtsPinNumber: "1", pinctrlRef: "0, 6" },
      "d2": { label: "D2", aka: ["P0.17"], dtsNodeLabel: PRO_MICRO, dtsPinNumber: "2", pinctrlRef: "0, 17" },
      "d3": { label: "D3", aka: ["P0.20"], dtsNodeLabel: PRO_MICRO, dtsPinNumber: "3", pinctrlRef: "0, 20" },
      "d4": { label: "D4", aka: ["P0.22"], dtsNodeLabel: PRO_MICRO, dtsPinNumber: "4", pinctrlRef: "0, 22" },
      "d5": { label: "D5", aka: ["P0.24"], dtsNodeLabel: PRO_MICRO, dtsPinNumber: "5", pinctrlRef: "0, 24" },
      "d6": { label: "D6", aka: ["P1.00"], dtsNodeLabel: PRO_MICRO, dtsPinNumber: "6", pinctrlRef: "1, 0" },
      "d7": { label: "D7", aka: ["P0.11"], dtsNodeLabel: PRO_MICRO, dtsPinNumber: "7", pinctrlRef: "0, 11" },
      "d8": { label: "D8", aka: ["P1.04"], dtsNodeLabel: PRO_MICRO, dtsPinNumber: "8", pinctrlRef: "1, 4" },
      "d9": { label: "D9", aka: ["P1.06"], dtsNodeLabel: PRO_MICRO, dtsPinNumber: "9", pinctrlRef: "1, 6" },
      "d10": { label: "D10", aka: ["P0.09"], dtsNodeLabel: PRO_MICRO, dtsPinNumber: "10", pinctrlRef: "0, 9" },
      "d14": { label: "D14", aka: ["P0.10"], dtsNodeLabel: PRO_MICRO, dtsPinNumber: "14", pinctrlRef: "1, 11" },
      "d15": { label: "D15", aka: ["P1.13"], dtsNodeLabel: PRO_MICRO, dtsPinNumber: "15", pinctrlRef: "1, 13" },
      "d16": { label: "D16", aka: ["P0.10"], dtsNodeLabel: PRO_MICRO, dtsPinNumber: "16", pinctrlRef: "0, 10" },
      "d18": { label: "D18", aka: ["P1.15"], dtsNodeLabel: PRO_MICRO, dtsPinNumber: "18", pinctrlRef: "1, 15" },
      "d19": { label: "D19", aka: ["P0.02"], dtsNodeLabel: PRO_MICRO, dtsPinNumber: "19", pinctrlRef: "0, 2" },
      "d20": { label: "D20", aka: ["P0.29"], dtsNodeLabel: PRO_MICRO, dtsPinNumber: "20", pinctrlRef: "0, 29" },
      "d21": { label: "D21", aka: ["P0.31"], dtsNodeLabel: PRO_MICRO, dtsPinNumber: "21", pinctrlRef: "0, 31" },

      "p101": { label: "P1.01", dtsNodeLabel: GPIO1, dtsPinNumber: "1", pinctrlRef: "1, 1" },
      "p102": { label: "P1.02", dtsNodeLabel: GPIO1, dtsPinNumber: "2", pinctrlRef: "1, 2" },
      "p107": { label: "P1.07", dtsNodeLabel: GPIO1, dtsPinNumber: "7", pinctrlRef: "1, 7" },
    }),
    // TODO: Replace ALL_CAPABILITIES with actual per-pin nRF52840 capability data
    pinCapabilities: Object.fromEntries(
      Object.keys({
        "d0": 0, "d1": 0, "d2": 0, "d3": 0, "d4": 0, "d5": 0, "d6": 0, "d7": 0,
        "d8": 0, "d9": 0, "d10": 0, "d14": 0, "d15": 0, "d16": 0, "d18": 0,
        "d19": 0, "d20": 0, "d21": 0, "p101": 0, "p102": 0, "p107": 0,
      }).map((id) => [id, ALL_CAPABILITIES])
    ) as Record<PinId, PinCapabilities>,
    canBusPins: () => true,
  } satisfies ControllerMetadata,
  "xiao_ble": {
    name: "Seeed XIAO nRF52840",
    soc: "nrf52840",
    pinref: "https://wiki.seeedstudio.com/XIAO_BLE/#hardware-overview",
    board: "seeeduino_xiao_ble",
    boardKconfig: "BOARD_SEEEDUINO_XIAO_BLE",
    gpios: asPinMap({
      "d0": { label: "D0", aka: ["P0.02"], dtsNodeLabel: XIAO_D, dtsPinNumber: "0", pinctrlRef: "0, 2" },
      "d1": { label: "D1", aka: ["P0.03"], dtsNodeLabel: XIAO_D, dtsPinNumber: "1", pinctrlRef: "0, 3" },
      "d2": { label: "D2", aka: ["P0.28"], dtsNodeLabel: XIAO_D, dtsPinNumber: "2", pinctrlRef: "0, 28" },
      "d3": { label: "D3", aka: ["P0.29"], dtsNodeLabel: XIAO_D, dtsPinNumber: "3", pinctrlRef: "0, 29" },
      "d4": { label: "D4", aka: ["P0.04"], dtsNodeLabel: XIAO_D, dtsPinNumber: "4", pinctrlRef: "0, 4" },
      "d5": { label: "D5", aka: ["P0.05"], dtsNodeLabel: XIAO_D, dtsPinNumber: "5", pinctrlRef: "0, 5" },
      "d6": { label: "D6", aka: ["P1.11"], dtsNodeLabel: XIAO_D, dtsPinNumber: "6", pinctrlRef: "1, 11" },
      "d7": { label: "D7", aka: ["P1.12"], dtsNodeLabel: XIAO_D, dtsPinNumber: "7", pinctrlRef: "1, 12" },
      "d8": { label: "D8", aka: ["P1.13"], dtsNodeLabel: XIAO_D, dtsPinNumber: "8", pinctrlRef: "1, 13" },
      "d9": { label: "D9", aka: ["P1.14"], dtsNodeLabel: XIAO_D, dtsPinNumber: "9", pinctrlRef: "1, 14" },
      "d10": { label: "D10", aka: ["P1.15"], dtsNodeLabel: XIAO_D, dtsPinNumber: "10", pinctrlRef: "1, 15" },
    }),
    // TODO: Replace ALL_CAPABILITIES with actual per-pin nRF52840 capability data
    pinCapabilities: Object.fromEntries(
      Object.keys({
        "d0": 0, "d1": 0, "d2": 0, "d3": 0, "d4": 0, "d5": 0, "d6": 0,
        "d7": 0, "d8": 0, "d9": 0, "d10": 0,
      }).map((id) => [id, ALL_CAPABILITIES])
    ) as Record<PinId, PinCapabilities>,
    canBusPins: () => true,
  } satisfies ControllerMetadata,
  "xiao_rp2040": {
    name: "Seeed XIAO RP2040",
    soc: "rp2040",
    board: "seeeduino_xiao_rp2040",
    boardKconfig: "BOARD_SEEEDUINO_XIAO_RP2040",
    pinref: "https://wiki.seeedstudio.com/XIAO-RP2040/#hardware-overview",
    gpios: asPinMap({
      "d0": { label: "D0", aka: ["GPIO26"], dtsNodeLabel: XIAO_D, dtsPinNumber: "0", pinctrlRef: "26" },
      "d1": { label: "D1", aka: ["GPIO27"], dtsNodeLabel: XIAO_D, dtsPinNumber: "1", pinctrlRef: "27" },
      "d2": { label: "D2", aka: ["GPIO28"], dtsNodeLabel: XIAO_D, dtsPinNumber: "2", pinctrlRef: "28" },
      "d3": { label: "D3", aka: ["GPIO29"], dtsNodeLabel: XIAO_D, dtsPinNumber: "3", pinctrlRef: "29" },
      "d4": { label: "D4", aka: ["GPIO6"], dtsNodeLabel: XIAO_D, dtsPinNumber: "4", pinctrlRef: "6" },
      "d5": { label: "D5", aka: ["GPIO7"], dtsNodeLabel: XIAO_D, dtsPinNumber: "5", pinctrlRef: "7" },
      "d6": { label: "D6", aka: ["GPIO0"], dtsNodeLabel: XIAO_D, dtsPinNumber: "6", pinctrlRef: "0" },
      "d7": { label: "D7", aka: ["GPIO1"], dtsNodeLabel: XIAO_D, dtsPinNumber: "7", pinctrlRef: "1" },
      "d8": { label: "D8", aka: ["GPIO2"], dtsNodeLabel: XIAO_D, dtsPinNumber: "8", pinctrlRef: "2" },
      "d9": { label: "D9", aka: ["GPIO4"], dtsNodeLabel: XIAO_D, dtsPinNumber: "9", pinctrlRef: "4" },
      "d10": { label: "D10", aka: ["GPIO3"], dtsNodeLabel: XIAO_D, dtsPinNumber: "10", pinctrlRef: "3" },
    }),
    // TODO: Replace ALL_CAPABILITIES with actual per-pin RP2040 capability data
    // RP2040 has fixed peripheral assignments per GPIO — canBus should check per-pin lookup
    pinCapabilities: Object.fromEntries(
      Object.keys({
        "d0": 0, "d1": 0, "d2": 0, "d3": 0, "d4": 0, "d5": 0, "d6": 0,
        "d7": 0, "d8": 0, "d9": 0, "d10": 0,
      }).map((id) => [id, ALL_CAPABILITIES])
    ) as Record<PinId, PinCapabilities>,
    canBusPins: () => true,
  } satisfies ControllerMetadata,
};
