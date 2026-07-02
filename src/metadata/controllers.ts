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
  readonly type: 'i2c' | 'spi';
  /** Bus-level required pins (e.g., SCK for SPI, SDA+SCL for I2C). MISO/MOSI are device-level — see DeviceMeta.requiredBusPins. */
  readonly requires: readonly BusPinRole[];
}
export type SocBus = Readonly<Record<BusName, BusMetadata>>;
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
  readonly label: string;
  readonly aka?: readonly string[];
  /** Devicetree node label, e.g. "&pro_micro" or "&gpio1". */
  readonly dtsNodeLabel: string;
  /** Pin number on the GPIO controller, e.g. "0", "8". */
  readonly dtsPinNumber: string;
  /** Pinctrl reference for pinctrl nodes, e.g. "0, 8" (nRF52), "26" (RP2040). Only on native pins. */
  readonly pinctrlRef?: string;
}
const asPinMap = <T extends Record<string, PinMetadata>>(map: T) =>
  map as Record<PinId, PinMetadata>;

export interface ControllerMetadata {
  /** Display name */
  readonly name: string;
  /** System on Chip used by this controller */
  readonly soc: SocId;
  /** Link to pin reference for this controller */
  readonly pinref: string;
  /** Zephyr board name for build.yaml and pinctrl overlay paths */
  readonly board: string;
  /** Kconfig symbol for the board */
  readonly boardKconfig: string;
  /** General Purpose Input/Output pins */
  readonly gpios: Readonly<Record<PinId, PinMetadata>>;
  /**
   * Capabilities for each GPIO pin.
   * Keys are PinIds that match entries in `gpios`.
   *
   * TODO: Values are placeholders — all pins marked as full capability.
   * Replace with actual per-SoC per-pin data from datasheets.
   */
  readonly pinCapabilities: Readonly<Record<PinId, PinCapabilities>>;
  /**
   * Return which native pin IDs can serve a given bus role.
   * Only controller pins can participate in pinctrl.
   * @returns `true` if all pins are flexible,
   *          or a specific list of PinIds that support the role.
   */
  readonly canBusPins: (busName: BusName, role: BusPinRole) => Readonly<PinId[]> | true;
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
// const GPIO0 = "gpio0";
const GPIO1 = "gpio1";
const PICO_HEADER = "pico_header";

// ── RP2040 pinctrl pin capabilities ────────────────────────
/**
 * RP2040 has fixed hardware peripheral-to-GPIO assignments.
 * Maps bus name → role → native GPIO numbers that can serve that role.
 * Source: RP2040 datasheet section 2.19 GPIO, 2.19.2 Function Select.
 */
const RP2040_BUS_PINS: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> = {
  i2c0: { sda: ["0", "4", "8", "12", "16", "20", "24", "28"], scl: ["1", "5", "9", "13", "17", "21", "25", "29"] },
  i2c1: { sda: ["2", "6", "10", "14", "18", "22", "26"], scl: ["3", "7", "11", "15", "19", "23", "27"] },
  spi0: { miso: ["0", "4", "16", "20"], mosi: ["3", "7", "19", "23"], sck: ["2", "6", "18", "22"] },
  spi1: { miso: ["8", "12", "24", "28"], mosi: ["11", "15", "27"], sck: ["10", "14", "26"] },
};

/**
 * Build a `canBusPins` function for an RP2040-based controller.
 *
 * Uses the controller's gpios (whose `pinctrlRef` stores the native RP2040 GPIO number)
 * to determine which controller PinIds can serve each bus role.
 */
function makeRP2040CanBusPins(gpios: Readonly<Record<PinId, PinMetadata>>): (busName: BusName, role: BusPinRole) => Readonly<PinId[]> | true {
  // Build a reverse index: native GPIO number → controller PinIds that expose it
  const nativeToPinIds: Record<string, PinId[]> = {};
  for (const [pinId, meta] of Object.entries(gpios)) {
    if (meta.pinctrlRef) {
      (nativeToPinIds[meta.pinctrlRef] ??= []).push(pinId as PinId);
    }
  }

  return (busName, role) => {
    const busPins = RP2040_BUS_PINS[busName as string];
    if (!busPins) return [];
    const nativeGpios = busPins[role as string];
    if (!nativeGpios) return [];

    const result: PinId[] = [];
    for (const nativeGpio of nativeGpios) {
      const pinIds = nativeToPinIds[nativeGpio];
      if (pinIds) {
        result.push(...pinIds);
      }
    }
    return result;
  };
}

// ── RP2040 controller GPIO maps (shared between gpios and canBusPins) ──
const XIAO_RP2040_GPIOS = asPinMap({
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
});
const RPI_PICO_GPIOS = asPinMap({
  "gp0": { label: "GP0", dtsNodeLabel: PICO_HEADER, dtsPinNumber: "0", pinctrlRef: "0" },
  "gp1": { label: "GP1", dtsNodeLabel: PICO_HEADER, dtsPinNumber: "1", pinctrlRef: "1" },
  "gp2": { label: "GP2", dtsNodeLabel: PICO_HEADER, dtsPinNumber: "2", pinctrlRef: "2" },
  "gp3": { label: "GP3", dtsNodeLabel: PICO_HEADER, dtsPinNumber: "3", pinctrlRef: "3" },
  "gp4": { label: "GP4", dtsNodeLabel: PICO_HEADER, dtsPinNumber: "4", pinctrlRef: "4" },
  "gp5": { label: "GP5", dtsNodeLabel: PICO_HEADER, dtsPinNumber: "5", pinctrlRef: "5" },
  "gp6": { label: "GP6", dtsNodeLabel: PICO_HEADER, dtsPinNumber: "6", pinctrlRef: "6" },
  "gp7": { label: "GP7", dtsNodeLabel: PICO_HEADER, dtsPinNumber: "7", pinctrlRef: "7" },
  "gp8": { label: "GP8", dtsNodeLabel: PICO_HEADER, dtsPinNumber: "8", pinctrlRef: "8" },
  "gp9": { label: "GP9", dtsNodeLabel: PICO_HEADER, dtsPinNumber: "9", pinctrlRef: "9" },
  "gp10": { label: "GP10", dtsNodeLabel: PICO_HEADER, dtsPinNumber: "10", pinctrlRef: "10" },
  "gp11": { label: "GP11", dtsNodeLabel: PICO_HEADER, dtsPinNumber: "11", pinctrlRef: "11" },
  "gp12": { label: "GP12", dtsNodeLabel: PICO_HEADER, dtsPinNumber: "12", pinctrlRef: "12" },
  "gp13": { label: "GP13", dtsNodeLabel: PICO_HEADER, dtsPinNumber: "13", pinctrlRef: "13" },
  "gp14": { label: "GP14", dtsNodeLabel: PICO_HEADER, dtsPinNumber: "14", pinctrlRef: "14" },
  "gp15": { label: "GP15", dtsNodeLabel: PICO_HEADER, dtsPinNumber: "15", pinctrlRef: "15" },
  "gp16": { label: "GP16", dtsNodeLabel: PICO_HEADER, dtsPinNumber: "16", pinctrlRef: "16" },
  "gp17": { label: "GP17", dtsNodeLabel: PICO_HEADER, dtsPinNumber: "17", pinctrlRef: "17" },
  "gp18": { label: "GP18", dtsNodeLabel: PICO_HEADER, dtsPinNumber: "18", pinctrlRef: "18" },
  "gp19": { label: "GP19", dtsNodeLabel: PICO_HEADER, dtsPinNumber: "19", pinctrlRef: "19" },
  "gp20": { label: "GP20", dtsNodeLabel: PICO_HEADER, dtsPinNumber: "20", pinctrlRef: "20" },
  "gp21": { label: "GP21", dtsNodeLabel: PICO_HEADER, dtsPinNumber: "21", pinctrlRef: "21" },
  "gp22": { label: "GP22", dtsNodeLabel: PICO_HEADER, dtsPinNumber: "22", pinctrlRef: "22" },
  "gp26": { label: "GP26", dtsNodeLabel: PICO_HEADER, dtsPinNumber: "26", pinctrlRef: "26" },
  "gp27": { label: "GP27", dtsNodeLabel: PICO_HEADER, dtsPinNumber: "27", pinctrlRef: "27" },
  "gp28": { label: "GP28", dtsNodeLabel: PICO_HEADER, dtsPinNumber: "28", pinctrlRef: "28" },
});

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
    pinCapabilities: Object.fromEntries([
      "d0", "d1", "d2", "d3", "d4", "d5", "d6", "d7", "d8", "d9",
      "d10", "d14", "d15", "d16", "d18", "d19", "d20", "d21",
      "p101", "p102", "p107",
    ].map((id) => [id, ALL_CAPABILITIES])) as Record<PinId, PinCapabilities>,
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
    pinCapabilities: Object.fromEntries([
      "d0", "d1", "d2", "d3", "d4", "d5", "d6", "d7", "d8", "d9", "d10",
    ].map((id) => [id, ALL_CAPABILITIES])) as Record<PinId, PinCapabilities>,
    canBusPins: () => true,
  } satisfies ControllerMetadata,
  "xiao_rp2040": {
    name: "Seeed XIAO RP2040",
    soc: "rp2040",
    board: "seeeduino_xiao_rp2040",
    boardKconfig: "BOARD_SEEEDUINO_XIAO_RP2040",
    pinref: "https://wiki.seeedstudio.com/XIAO-RP2040/#hardware-overview",
    gpios: XIAO_RP2040_GPIOS,
    pinCapabilities: Object.fromEntries([
      "d0", "d1", "d2", "d3", "d4", "d5", "d6", "d7", "d8", "d9", "d10",
    ].map((id) => [id, ALL_CAPABILITIES])) as Record<PinId, PinCapabilities>,
    canBusPins: makeRP2040CanBusPins(XIAO_RP2040_GPIOS),
  } satisfies ControllerMetadata,
  "rpi_pico": {
    name: "Raspberry Pi Pico",
    soc: "rp2040",
    board: "rpi_pico",
    boardKconfig: "BOARD_RPI_PICO",
    pinref: "https://datasheets.raspberrypi.com/pico/Pico-R3-A4-Pinout.pdf",
    gpios: RPI_PICO_GPIOS,
    pinCapabilities: Object.fromEntries([
      ...Array.from({ length: 23 }, (_, i) => `gp${i}` as PinId),
      'gp26', 'gp27', 'gp28'
    ].map((id) => [id, ALL_CAPABILITIES])
    ) as Record<PinId, PinCapabilities>,
    canBusPins: makeRP2040CanBusPins(RPI_PICO_GPIOS),
  } satisfies ControllerMetadata,
};
