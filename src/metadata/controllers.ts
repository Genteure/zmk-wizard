import type { BusName, BusPinRole, ControllerId, PinId, SocId } from "~/types";

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
  /** Devicetree reference for DTS templates, e.g. "&pro_micro 0" */
  dtsRef: string;
  /** Pinctrl reference for pinctrl nodes, e.g. "0, 8" (nRF52), "26" (RP2040) */
  pinctrlRef: string;
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

  // TODO add more metadata fields.
}

export const Controllers: Record<ControllerId, ControllerMetadata> = {
  "nice_nano_v2": {
    name: "nice!nano v2",
    soc: "nrf52840",
    pinref: "https://nicekeyboards.com/docs/nice-nano/pinout-schematic",
    board: "nice_nano_v2",
    boardKconfig: "BOARD_NICE_NANO_V2",
    gpios: asPinMap({
      "d0": { label: "D0", aka: ["P0.08"], dtsRef: "&pro_micro 0", pinctrlRef: "0, 8" },
      "d1": { label: "D1", aka: ["P0.06"], dtsRef: "&pro_micro 1", pinctrlRef: "0, 6" },
      "d2": { label: "D2", aka: ["P0.17"], dtsRef: "&pro_micro 2", pinctrlRef: "0, 17" },
      "d3": { label: "D3", aka: ["P0.20"], dtsRef: "&pro_micro 3", pinctrlRef: "0, 20" },
      "d4": { label: "D4", aka: ["P0.22"], dtsRef: "&pro_micro 4", pinctrlRef: "0, 22" },
      "d5": { label: "D5", aka: ["P0.24"], dtsRef: "&pro_micro 5", pinctrlRef: "0, 24" },
      "d6": { label: "D6", aka: ["P1.00"], dtsRef: "&pro_micro 6", pinctrlRef: "1, 0" },
      "d7": { label: "D7", aka: ["P0.11"], dtsRef: "&pro_micro 7", pinctrlRef: "0, 11" },
      "d8": { label: "D8", aka: ["P1.04"], dtsRef: "&pro_micro 8", pinctrlRef: "1, 4" },
      "d9": { label: "D9", aka: ["P1.06"], dtsRef: "&pro_micro 9", pinctrlRef: "1, 6" },
      "d10": { label: "D10", aka: ["P0.09"], dtsRef: "&pro_micro 10", pinctrlRef: "0, 9" },
      "d14": { label: "D14", aka: ["P0.10"], dtsRef: "&pro_micro 14", pinctrlRef: "1, 11" },
      "d15": { label: "D15", aka: ["P1.13"], dtsRef: "&pro_micro 15", pinctrlRef: "1, 13" },
      "d16": { label: "D16", aka: ["P0.10"], dtsRef: "&pro_micro 16", pinctrlRef: "0, 10" },
      "d18": { label: "D18", aka: ["P1.15"], dtsRef: "&pro_micro 18", pinctrlRef: "1, 15" },
      "d19": { label: "D19", aka: ["P0.02"], dtsRef: "&pro_micro 19", pinctrlRef: "0, 2" },
      "d20": { label: "D20", aka: ["P0.29"], dtsRef: "&pro_micro 20", pinctrlRef: "0, 29" },
      "d21": { label: "D21", aka: ["P0.31"], dtsRef: "&pro_micro 21", pinctrlRef: "0, 31" },

      "p101": { label: "P1.01", dtsRef: "&gpio1 1", pinctrlRef: "1, 1" },
      "p102": { label: "P1.02", dtsRef: "&gpio1 2", pinctrlRef: "1, 2" },
      "p107": { label: "P1.07", dtsRef: "&gpio1 7", pinctrlRef: "1, 7" },
    }),
  } satisfies ControllerMetadata,
  "xiao_ble": {
    name: "Seeed XIAO nRF52840",
    soc: "nrf52840",
    pinref: "https://wiki.seeedstudio.com/XIAO_BLE/#hardware-overview",
    board: "seeeduino_xiao_ble",
    boardKconfig: "BOARD_SEEEDUINO_XIAO_BLE",
    gpios: asPinMap({
      "d0": { label: "D0", aka: ["P0.02"], dtsRef: "&xiao_d 0", pinctrlRef: "0, 2" },
      "d1": { label: "D1", aka: ["P0.03"], dtsRef: "&xiao_d 1", pinctrlRef: "0, 3" },
      "d2": { label: "D2", aka: ["P0.28"], dtsRef: "&xiao_d 2", pinctrlRef: "0, 28" },
      "d3": { label: "D3", aka: ["P0.29"], dtsRef: "&xiao_d 3", pinctrlRef: "0, 29" },
      "d4": { label: "D4", aka: ["P0.04"], dtsRef: "&xiao_d 4", pinctrlRef: "0, 4" },
      "d5": { label: "D5", aka: ["P0.05"], dtsRef: "&xiao_d 5", pinctrlRef: "0, 5" },
      "d6": { label: "D6", aka: ["P1.11"], dtsRef: "&xiao_d 6", pinctrlRef: "1, 11" },
      "d7": { label: "D7", aka: ["P1.12"], dtsRef: "&xiao_d 7", pinctrlRef: "1, 12" },
      "d8": { label: "D8", aka: ["P1.13"], dtsRef: "&xiao_d 8", pinctrlRef: "1, 13" },
      "d9": { label: "D9", aka: ["P1.14"], dtsRef: "&xiao_d 9", pinctrlRef: "1, 14" },
      "d10": { label: "D10", aka: ["P1.15"], dtsRef: "&xiao_d 10", pinctrlRef: "1, 15" },
    }),
  } satisfies ControllerMetadata,
  "xiao_rp2040": {
    name: "Seeed XIAO RP2040",
    soc: "rp2040",
    board: "seeeduino_xiao_rp2040",
    boardKconfig: "BOARD_SEEEDUINO_XIAO_RP2040",
    pinref: "https://wiki.seeedstudio.com/XIAO-RP2040/#hardware-overview",
    gpios: asPinMap({
      "d0": { label: "D0", aka: ["GPIO26"], dtsRef: "&xiao_d 0", pinctrlRef: "26" },
      "d1": { label: "D1", aka: ["GPIO27"], dtsRef: "&xiao_d 1", pinctrlRef: "27" },
      "d2": { label: "D2", aka: ["GPIO28"], dtsRef: "&xiao_d 2", pinctrlRef: "28" },
      "d3": { label: "D3", aka: ["GPIO29"], dtsRef: "&xiao_d 3", pinctrlRef: "29" },
      "d4": { label: "D4", aka: ["GPIO6"], dtsRef: "&xiao_d 4", pinctrlRef: "6" },
      "d5": { label: "D5", aka: ["GPIO7"], dtsRef: "&xiao_d 5", pinctrlRef: "7" },
      "d6": { label: "D6", aka: ["GPIO0"], dtsRef: "&xiao_d 6", pinctrlRef: "0" },
      "d7": { label: "D7", aka: ["GPIO1"], dtsRef: "&xiao_d 7", pinctrlRef: "1" },
      "d8": { label: "D8", aka: ["GPIO2"], dtsRef: "&xiao_d 8", pinctrlRef: "2" },
      "d9": { label: "D9", aka: ["GPIO4"], dtsRef: "&xiao_d 9", pinctrlRef: "4" },
      "d10": { label: "D10", aka: ["GPIO3"], dtsRef: "&xiao_d 10", pinctrlRef: "3" },
    }),
  } satisfies ControllerMetadata,
};
