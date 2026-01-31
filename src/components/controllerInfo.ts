import type { AnyBus, AnyBusDevice, BusDeviceTypeName, BusName, Controller, ModuleId, Soc } from "~/typedef";

export interface VisualGpioPin {
  readonly id: string;
  readonly type: "gpio";
}

interface VisualGraphicPin {
  readonly type: "ui";
  /**
   * How the pin is represented in the UI
   */
  readonly ui: "power" | "gnd" | "rst" | "empty";
  readonly text: string;
}

export type VisualPin = VisualGpioPin | VisualGraphicPin;

export interface PinctrlSpiPinChoices {
  readonly type: "spi";
  readonly mosi: readonly string[];
  readonly miso: readonly string[];
  readonly sck: readonly string[];
}

export interface PinctrlI2cPinChoices {
  readonly type: "i2c";
  readonly sda: readonly string[];
  readonly scl: readonly string[];
}

/**
 * Function that returns pin choices for a given bus.
 * Returned string is the `id` of the pin as defined in the controller's pin list.
 */
export type PinctrlPinChoicesFunc = (name: BusName) => PinctrlSpiPinChoices | PinctrlI2cPinChoices | null;

export interface ControllerInfo {
  readonly name: string;
  readonly soc: Soc;
  /**
   * Zephyr board name for build.yaml and pinctrl overlay paths
   */
  readonly board: string;
  /**
   * Kconfig symbol for the board
   */
  readonly boardKconfig: string;
  /**
   * URL to documentation
   */
  readonly docLink: string;
  /**
   * Metadata for each signal pin
   */
  readonly pins: Readonly<Record<string, ControllerPinMetadata>>;
  /**
   * Visual representation of the controller's pins
   */
  readonly visual: {
    readonly left: readonly VisualPin[];
    readonly right: readonly VisualPin[];
  };
  // buses?: BusInfo[];
  readonly pinctrlChoices: PinctrlPinChoicesFunc;
}

export interface ControllerPinMetadata {
  /**
   * Display name for the pin
   */
  readonly displayName: string;
  /**
   * Devicetree syntax reference for the pin
   */
  readonly dtsRef: string;
  /**
   * Devicetree pinctrl node reference for the pin
   */
  readonly pinctrlRef: string;
  /**
   * Alternate names for the pin
   */
  readonly aka?: readonly string[] | undefined;
}

type SocBusDefinition = { readonly type: "spi" | "i2c"; readonly name: BusName };

export type SocBusData = {
  readonly tooltip: string | null;
  readonly conflicts: Record<BusName, readonly BusName[] | undefined>;
  readonly pinRequirements: Record<BusName, readonly string[] | undefined>;
  readonly buses: readonly SocBusDefinition[];
};

/**
 * Controller connectivity capabilities based on SOC type.
 */
export interface SocCapabilities {
  /** Whether the SOC supports USB connectivity */
  readonly usb: boolean;
  /** Whether the SOC supports BLE connectivity */
  readonly ble: boolean;
}

/**
 * SOC capabilities data for each supported SOC type.
 * Used to display controller capabilities in the UI.
 */
export const socCapabilities: Readonly<Record<Soc, SocCapabilities>> = {
  nrf52840: {
    usb: true,
    ble: true,
  },
  rp2040: {
    usb: true,
    ble: false,
  },
  // Future SOC example: BLE-only controller
  // nrf54l15: {
  //   usb: false,
  //   ble: true,
  // },
} as const;

function makeNrf52840PinctrlChoices(pins: readonly string[]): PinctrlPinChoicesFunc {
  // function pinctrlPins(bus: SpiBusInfo): PinctrlSpiPinChoices;
  // function pinctrlPins(bus: I2cBusInfo): PinctrlI2cPinChoices;
  function pinctrlPins(name: BusName): PinctrlSpiPinChoices | PinctrlI2cPinChoices | null {

    switch (name) {
      case "i2c0":
      case "i2c1":
        return {
          type: 'i2c',
          sda: pins,
          scl: pins,
        } satisfies PinctrlI2cPinChoices;


      case "spi0":
      case "spi1":
      case "spi2":
      case "spi3":
        return {
          type: 'spi',
          mosi: pins,
          miso: pins,
          sck: pins,
        } satisfies PinctrlSpiPinChoices;

      default:
        // invalid bus name
        return null;
    }
  }

  return pinctrlPins;
}

/**
 * Creates a pinctrl choices function for the RP2040 controller.
 * @param availablePins pins exposed by the controller, from native RP2040 pin names (keys) to controller pin ids (values)
 * @returns function that returns pin choices for a given bus
 */
function makeRP2040PinctrlChoices(availablePins: Readonly<Record<string, string>>): PinctrlPinChoicesFunc {
  const filterPins = (allPins: string[]) => allPins.filter((p) => availablePins.hasOwnProperty(p)).map((p) => availablePins[p]);
  type PinMap = Record<BusName, PinctrlSpiPinChoices | PinctrlI2cPinChoices>;
  const allPinsForRp2040 = {
    i2c0: {
      type: "i2c",
      // sda: 0, 4, 8, 16, 20, 24, 28
      sda: filterPins(["gp0", "gp4", "gp8", "gp12", "gp16", "gp20", "gp24", "gp28"]),
      // sdl: 1, 5, 9, 17, 21, 25, 29
      scl: filterPins(["gp1", "gp5", "gp9", "gp13", "gp17", "gp21", "gp25", "gp29"]),
    },
    i2c1: {
      type: "i2c",
      // sda: 2, 6, 10, 14, 18, 22, 26
      sda: filterPins(["gp2", "gp6", "gp10", "gp14", "gp18", "gp22", "gp26"]),
      // sdl: 3, 7, 11, 15, 19, 23, 27
      scl: filterPins(["gp3", "gp7", "gp11", "gp15", "gp19", "gp23", "gp27"]),
    },
    spi0: {
      type: "spi",
      // RX = MISO
      // TX = MOSI

      // spi0 rx = 0, 4, 16, 20
      miso: filterPins(["gp0", "gp4", "gp16", "gp20"]),
      // spi0 tx = 3, 7, 19, 23
      mosi: filterPins(["gp3", "gp7", "gp19", "gp23"]),
      // spi0 sck = 2, 6, 18, 22
      sck: filterPins(["gp2", "gp6", "gp18", "gp22"]),
    },
    spi1: {
      type: "spi",
      // rx = 8, 12, 24, 28
      miso: filterPins(["gp8", "gp12", "gp24", "gp28"]),
      // tx = 11, 15, 27
      mosi: filterPins(["gp11", "gp15", "gp27"]),
      // sck = 10, 14, 26
      sck: filterPins(["gp10", "gp14", "gp26"]),
    },
  } satisfies PinMap as PinMap;

  // function rp2040PinctrlChoices(bus: SpiBusInfo): PinctrlSpiPinChoices;
  // function rp2040PinctrlChoices(bus: I2cBusInfo): PinctrlI2cPinChoices;
  function rp2040PinctrlChoices(name: BusName): PinctrlSpiPinChoices | PinctrlI2cPinChoices | null {
    return allPinsForRp2040[name] || null;
  }

  return rp2040PinctrlChoices;
}
export const socBusData: Record<Soc, SocBusData> = {
  nrf52840: {
    tooltip: "I2C0 and SPI0 are mutually exclusive, I2C1 and SPI1 are mutually exclusive. SPI3 can work without SCK, SPI0/1/2 require SCK.",
    conflicts: {
      i2c0: ["spi0"],
      i2c1: ["spi1"],
      spi0: ["i2c0"],
      spi1: ["i2c1"],
    },
    pinRequirements: {
      i2c0: ["sda", "scl"],
      i2c1: ["sda", "scl"],
      spi0: ["sck"],
      spi1: ["sck"],
      spi2: ["sck"],
      spi3: [],
    },
    buses: [
      { type: "spi", name: "spi0" },
      { type: "spi", name: "spi1" },
      { type: "spi", name: "spi2" },
      { type: "spi", name: "spi3" },
      { type: "i2c", name: "i2c0" },
      { type: "i2c", name: "i2c1" },
    ],
  } as const,
  rp2040: {
    tooltip: null,
    conflicts: {},
    pinRequirements: {
      i2c0: ["sda", "scl"],
      i2c1: ["sda", "scl"],
      spi0: [], // TODO verify
      spi1: [],
    },
    buses: [
      { type: "spi", name: "spi0" },
      { type: "spi", name: "spi1" },
      { type: "i2c", name: "i2c0" },
      { type: "i2c", name: "i2c1" },
    ],
  } as const,
} as const;

const controllerInfoNiceNanoV2: ControllerInfo = {
  name: "nice!nano v2",
  soc: "nrf52840",
  board: "nice_nano_v2",
  boardKconfig: "BOARD_NICE_NANO_V2",
  docLink: "https://nicekeyboards.com/docs/nice-nano/pinout-schematic",
  pins: {
    d1: { displayName: "D1", aka: ["P0.06"], dtsRef: "&pro_micro 1", pinctrlRef: "0, 6" },
    d0: { displayName: "D0", aka: ["P0.08"], dtsRef: "&pro_micro 0", pinctrlRef: "0, 8" },
    d2: { displayName: "D2", aka: ["P0.17"], dtsRef: "&pro_micro 2", pinctrlRef: "0, 17" },
    d3: { displayName: "D3", aka: ["P0.20"], dtsRef: "&pro_micro 3", pinctrlRef: "0, 20" },
    d4: { displayName: "D4", aka: ["P0.22"], dtsRef: "&pro_micro 4", pinctrlRef: "0, 22" },
    d5: { displayName: "D5", aka: ["P0.24"], dtsRef: "&pro_micro 5", pinctrlRef: "0, 24" },
    d6: { displayName: "D6", aka: ["P1.00"], dtsRef: "&pro_micro 6", pinctrlRef: "1, 0" },
    d7: { displayName: "D7", aka: ["P0.11"], dtsRef: "&pro_micro 7", pinctrlRef: "0, 11" },
    d8: { displayName: "D8", aka: ["P1.04"], dtsRef: "&pro_micro 8", pinctrlRef: "1, 4" },
    d9: { displayName: "D9", aka: ["P1.06"], dtsRef: "&pro_micro 9", pinctrlRef: "1, 6" },

    d21: { displayName: "D21", aka: ["P0.31"], dtsRef: "&pro_micro 21", pinctrlRef: "0, 31" },
    d20: { displayName: "D20", aka: ["P0.29"], dtsRef: "&pro_micro 20", pinctrlRef: "0, 29" },
    d19: { displayName: "D19", aka: ["P0.02"], dtsRef: "&pro_micro 19", pinctrlRef: "0, 2" },
    d18: { displayName: "D18", aka: ["P1.15"], dtsRef: "&pro_micro 18", pinctrlRef: "1, 15" },
    d15: { displayName: "D15", aka: ["P1.13"], dtsRef: "&pro_micro 15", pinctrlRef: "1, 13" },
    d14: { displayName: "D14", aka: ["P1.11"], dtsRef: "&pro_micro 14", pinctrlRef: "1, 11" },
    d16: { displayName: "D16", aka: ["P0.10"], dtsRef: "&pro_micro 16", pinctrlRef: "0, 10" },
    d10: { displayName: "D10", aka: ["P0.09"], dtsRef: "&pro_micro 10", pinctrlRef: "0, 9" },

    p101: { displayName: "P1.01", dtsRef: "&gpio1 1", pinctrlRef: "1, 1" },
    p102: { displayName: "P1.02", dtsRef: "&gpio1 2", pinctrlRef: "1, 2" },
    p107: { displayName: "P1.07", dtsRef: "&gpio1 7", pinctrlRef: "1, 7" },
  },
  visual: {
    left: [
      { type: "ui", ui: "gnd", text: "GND" },
      { type: "gpio", id: "d1" },
      { type: "gpio", id: "d0" },
      { type: "ui", ui: "gnd", text: "GND" },
      { type: "ui", ui: "gnd", text: "GND" },
      { type: "gpio", id: "d2" },
      { type: "gpio", id: "d3" },
      { type: "gpio", id: "d4" },
      { type: "gpio", id: "d5" },
      { type: "gpio", id: "d6" },
      { type: "gpio", id: "d7" },
      { type: "gpio", id: "d8" },
      { type: "gpio", id: "d9" },
      { type: "ui", ui: "empty", text: "" },
      { type: "gpio", id: "p101" },
      { type: "gpio", id: "p102" },
    ],
    right: [
      { type: "ui", ui: "power", text: "BAT+" },
      { type: "ui", ui: "power", text: "BAT+" },
      { type: "ui", ui: "gnd", text: "GND" },
      { type: "ui", ui: "rst", text: "RST" },
      { type: "ui", ui: "power", text: "3.3V" },
      { type: "gpio", id: "d21" },
      { type: "gpio", id: "d20" },
      { type: "gpio", id: "d19" },
      { type: "gpio", id: "d18" },
      { type: "gpio", id: "d15" },
      { type: "gpio", id: "d14" },
      { type: "gpio", id: "d16" },
      { type: "gpio", id: "d10" },
      { type: "ui", ui: "empty", text: "" },
      { type: "ui", ui: "empty", text: "" },
      { type: "gpio", id: "p107" },
    ],
  },
  pinctrlChoices: makeNrf52840PinctrlChoices([
    "d1", "d0", "d2", "d3", "d4", "d5", "d6", "d7", "d8", "d9",
    "d21", "d20", "d19", "d18", "d15", "d14", "d16", "d10",
    "p101", "p102", "p107",
  ]),
};

const controllerInfoXiaoBle: ControllerInfo = {
  name: "Seeed XIAO nRF52840",
  soc: "nrf52840",
  board: "seeeduino_xiao_ble",
  boardKconfig: "BOARD_SEEEDUINO_XIAO_BLE",
  docLink: "https://files.seeedstudio.com/wiki/XIAO-BLE/pinout2.png",
  pins: {
    d0: { displayName: "D0", aka: ["P0.02"], dtsRef: "&xiao_d 0", pinctrlRef: "0, 2" },
    d1: { displayName: "D1", aka: ["P0.03"], dtsRef: "&xiao_d 1", pinctrlRef: "0, 3" },
    d2: { displayName: "D2", aka: ["P0.28"], dtsRef: "&xiao_d 2", pinctrlRef: "0, 28" },
    d3: { displayName: "D3", aka: ["P0.29"], dtsRef: "&xiao_d 3", pinctrlRef: "0, 29" },
    d4: { displayName: "D4", aka: ["P0.04"], dtsRef: "&xiao_d 4", pinctrlRef: "0, 4" },
    d5: { displayName: "D5", aka: ["P0.05"], dtsRef: "&xiao_d 5", pinctrlRef: "0, 5" },
    d6: { displayName: "D6", aka: ["P1.11"], dtsRef: "&xiao_d 6", pinctrlRef: "1, 11" },
    d7: { displayName: "D7", aka: ["P1.12"], dtsRef: "&xiao_d 7", pinctrlRef: "1, 12" },
    d8: { displayName: "D8", aka: ["P1.13"], dtsRef: "&xiao_d 8", pinctrlRef: "1, 13" },
    d9: { displayName: "D9", aka: ["P1.14"], dtsRef: "&xiao_d 9", pinctrlRef: "1, 14" },
    d10: { displayName: "D10", aka: ["P1.15"], dtsRef: "&xiao_d 10", pinctrlRef: "1, 15" },
  },
  visual: {
    left: [
      { type: "gpio", id: "d0" },
      { type: "gpio", id: "d1" },
      { type: "gpio", id: "d2" },
      { type: "gpio", id: "d3" },
      { type: "gpio", id: "d4" },
      { type: "gpio", id: "d5" },
      { type: "gpio", id: "d6" },
    ],
    right: [
      { type: "ui", ui: "power", text: "5V" },
      { type: "ui", ui: "gnd", text: "GND" },
      { type: "ui", ui: "power", text: "3.3V" },
      { type: "gpio", id: "d10" },
      { type: "gpio", id: "d9" },
      { type: "gpio", id: "d8" },
      { type: "gpio", id: "d7" },
    ],
  },
  pinctrlChoices: makeNrf52840PinctrlChoices([
    "d0", "d1", "d2", "d3", "d4", "d5", "d6",
    "d10", "d9", "d8", "d7",
  ]),
};

const controllerInfoXiaoBlePlus: ControllerInfo = {
  name: "Seeed XIAO nRF52840 Plus",
  soc: "nrf52840",
  board: "seeeduino_xiao_ble",
  boardKconfig: "BOARD_SEEEDUINO_XIAO_BLE",
  docLink: "https://files.seeedstudio.com/wiki/XIAO-BLE/plus_pinout.png",
  pins: {
    ...controllerInfoXiaoBle.pins,

    d11: { displayName: "D11", aka: ["P0.15"], dtsRef: "&gpio0 15", pinctrlRef: "0, 15" },
    d12: { displayName: "D12", aka: ["P0.19"], dtsRef: "&gpio0 19", pinctrlRef: "0, 19" },
    d13: { displayName: "D13", aka: ["P1.01"], dtsRef: "&gpio1 1", pinctrlRef: "1, 1" },
    d14: { displayName: "D14", aka: ["P0.09"], dtsRef: "&gpio0 9", pinctrlRef: "0, 9" },
    d15: { displayName: "D15", aka: ["P0.10"], dtsRef: "&gpio0 10", pinctrlRef: "0, 10" },

    // TODO remove support for D16
    // d16: { displayName: "D16", aka: ["P0.31"], dtsRef: "&gpio0 31", pinctrlRef: "0, 31" },

    d17: { displayName: "D17", aka: ["P1.03"], dtsRef: "&gpio1 3", pinctrlRef: "1, 3" },
    d18: { displayName: "D18", aka: ["P1.05"], dtsRef: "&gpio1 5", pinctrlRef: "1, 5" },
    d19: { displayName: "D19", aka: ["P1.07"], dtsRef: "&gpio1 7", pinctrlRef: "1, 7" },
  },
  visual: {
    left: [
      ...controllerInfoXiaoBle.visual.left,

      { type: "ui", ui: "empty", text: "" },

      { type: "ui", ui: "empty", text: "" },
      { type: "ui", ui: "empty", text: "" },
      { type: "ui", ui: "empty", text: "" },
      { type: "gpio", id: "d19" },
      { type: "gpio", id: "d18" },
      { type: "gpio", id: "d17" },
    ],
    right: [
      ...controllerInfoXiaoBle.visual.right,

      { type: "ui", ui: "empty", text: "" },

      { type: "gpio", id: "d11" },
      { type: "gpio", id: "d12" },
      { type: "gpio", id: "d13" },
      { type: "gpio", id: "d14" },
      { type: "gpio", id: "d15" },
      // { type: "gpio", id: "d16" },
      { type: "ui", ui: "rst", text: "D16" },
    ],
  },
  pinctrlChoices: makeNrf52840PinctrlChoices([
    "d0", "d1", "d2", "d3", "d4", "d5", "d6",
    "d19", "d18", "d17",
    "d10", "d9", "d8", "d7",
    "d11", "d12", "d13", "d14", "d15",
    // "d16",
  ]),
};

const controllerInfoRpiPico: ControllerInfo = {
  name: "Raspberry Pi Pico",
  soc: "rp2040",
  board: "rpi_pico",
  boardKconfig: "BOARD_RPI_PICO",
  docLink: "https://datasheets.raspberrypi.com/pico/Pico-R3-A4-Pinout.pdf",
  pins: {
    gp0: { displayName: "GP0", dtsRef: "&pico_header 0", pinctrlRef: "0" },
    gp1: { displayName: "GP1", dtsRef: "&pico_header 1", pinctrlRef: "1" },
    gp2: { displayName: "GP2", dtsRef: "&pico_header 2", pinctrlRef: "2" },
    gp3: { displayName: "GP3", dtsRef: "&pico_header 3", pinctrlRef: "3" },
    gp4: { displayName: "GP4", dtsRef: "&pico_header 4", pinctrlRef: "4" },
    gp5: { displayName: "GP5", dtsRef: "&pico_header 5", pinctrlRef: "5" },
    gp6: { displayName: "GP6", dtsRef: "&pico_header 6", pinctrlRef: "6" },
    gp7: { displayName: "GP7", dtsRef: "&pico_header 7", pinctrlRef: "7" },
    gp8: { displayName: "GP8", dtsRef: "&pico_header 8", pinctrlRef: "8" },
    gp9: { displayName: "GP9", dtsRef: "&pico_header 9", pinctrlRef: "9" },
    gp10: { displayName: "GP10", dtsRef: "&pico_header 10", pinctrlRef: "10" },
    gp11: { displayName: "GP11", dtsRef: "&pico_header 11", pinctrlRef: "11" },
    gp12: { displayName: "GP12", dtsRef: "&pico_header 12", pinctrlRef: "12" },
    gp13: { displayName: "GP13", dtsRef: "&pico_header 13", pinctrlRef: "13" },
    gp14: { displayName: "GP14", dtsRef: "&pico_header 14", pinctrlRef: "14" },
    gp15: { displayName: "GP15", dtsRef: "&pico_header 15", pinctrlRef: "15" },
    gp16: { displayName: "GP16", dtsRef: "&pico_header 16", pinctrlRef: "16" },
    gp17: { displayName: "GP17", dtsRef: "&pico_header 17", pinctrlRef: "17" },
    gp18: { displayName: "GP18", dtsRef: "&pico_header 18", pinctrlRef: "18" },
    gp19: { displayName: "GP19", dtsRef: "&pico_header 19", pinctrlRef: "19" },
    gp20: { displayName: "GP20", dtsRef: "&pico_header 20", pinctrlRef: "20" },
    gp21: { displayName: "GP21", dtsRef: "&pico_header 21", pinctrlRef: "21" },
    gp22: { displayName: "GP22", dtsRef: "&pico_header 22", pinctrlRef: "22" },
    gp26: { displayName: "GP26", dtsRef: "&pico_header 26", pinctrlRef: "26" },
    gp27: { displayName: "GP27", dtsRef: "&pico_header 27", pinctrlRef: "27" },
    gp28: { displayName: "GP28", dtsRef: "&pico_header 28", pinctrlRef: "28" },
  },
  visual: {
    left: [
      { type: "gpio", id: "gp0" },
      { type: "gpio", id: "gp1" },
      { type: "ui", ui: "gnd", text: "GND" },
      { type: "gpio", id: "gp2" },
      { type: "gpio", id: "gp3" },
      { type: "gpio", id: "gp4" },
      { type: "gpio", id: "gp5" },
      { type: "ui", ui: "gnd", text: "GND" },
      { type: "gpio", id: "gp6" },
      { type: "gpio", id: "gp7" },
      { type: "gpio", id: "gp8" },
      { type: "gpio", id: "gp9" },
      { type: "ui", ui: "gnd", text: "GND" },
      { type: "gpio", id: "gp10" },
      { type: "gpio", id: "gp11" },
      { type: "gpio", id: "gp12" },
      { type: "gpio", id: "gp13" },
      { type: "ui", ui: "gnd", text: "GND" },
      { type: "gpio", id: "gp14" },
      { type: "gpio", id: "gp15" },
    ],
    right: [
      { type: "ui", ui: "power", text: "VBUS" },
      { type: "ui", ui: "power", text: "VSYS" },
      { type: "ui", ui: "gnd", text: "GND" },
      { type: "ui", ui: "rst", text: "3V3EN" },
      { type: "ui", ui: "power", text: "3.3V" },
      { type: "ui", ui: "power", text: "VREF" },
      { type: "gpio", id: "gp28" },
      { type: "ui", ui: "gnd", text: "GND" },
      { type: "gpio", id: "gp27" },
      { type: "gpio", id: "gp26" },
      { type: "ui", ui: "rst", text: "RUN" },
      { type: "gpio", id: "gp22" },
      { type: "ui", ui: "gnd", text: "GND" },
      { type: "gpio", id: "gp21" },
      { type: "gpio", id: "gp20" },
      { type: "gpio", id: "gp19" },
      { type: "gpio", id: "gp18" },
      { type: "ui", ui: "gnd", text: "GND" },
      { type: "gpio", id: "gp17" },
      { type: "gpio", id: "gp16" },
    ],
  },
  pinctrlChoices: makeRP2040PinctrlChoices(Object.fromEntries([
    "gp0", "gp1", "gp2", "gp3", "gp4", "gp5", "gp6", "gp7", "gp8", "gp9",
    "gp10", "gp11", "gp12", "gp13", "gp14", "gp15", "gp16", "gp17", "gp18", "gp19",
    "gp20", "gp21", "gp22", "gp26", "gp27", "gp28",
  ].map((p) => [p, p]))),
};

const controllerInfoXiaoRp2040: ControllerInfo = {
  name: "Seeed XIAO RP2040",
  soc: "rp2040",
  board: "seeeduino_xiao_rp2040",
  boardKconfig: "BOARD_SEEEDUINO_XIAO_RP2040",
  docLink: "https://files.seeedstudio.com/wiki/XIAO-RP2040/img/xinpin.jpg",
  pins: {
    d0: { displayName: "D0", aka: ["P26"], dtsRef: "&xiao_d 0", pinctrlRef: "26" },
    d1: { displayName: "D1", aka: ["P27"], dtsRef: "&xiao_d 1", pinctrlRef: "27" },
    d2: { displayName: "D2", aka: ["P28"], dtsRef: "&xiao_d 2", pinctrlRef: "28" },
    d3: { displayName: "D3", aka: ["P29"], dtsRef: "&xiao_d 3", pinctrlRef: "29" },
    d4: { displayName: "D4", aka: ["P6"], dtsRef: "&xiao_d 4", pinctrlRef: "6" },
    d5: { displayName: "D5", aka: ["P7"], dtsRef: "&xiao_d 5", pinctrlRef: "7" },
    d6: { displayName: "D6", aka: ["P0"], dtsRef: "&xiao_d 6", pinctrlRef: "0" },
    d7: { displayName: "D7", aka: ["P1"], dtsRef: "&xiao_d 7", pinctrlRef: "1" },
    d8: { displayName: "D8", aka: ["P2"], dtsRef: "&xiao_d 8", pinctrlRef: "2" },
    d9: { displayName: "D9", aka: ["P4"], dtsRef: "&xiao_d 9", pinctrlRef: "4" },
    d10: { displayName: "D10", aka: ["P3"], dtsRef: "&xiao_d 10", pinctrlRef: "3" },
  },
  visual: controllerInfoXiaoBle.visual,
  pinctrlChoices: makeRP2040PinctrlChoices({
    // native pins: controller pins
    "gp26": "d0",
    "gp27": "d1",
    "gp28": "d2",
    "gp29": "d3",
    "gp6": "d4",
    "gp7": "d5",
    "gp0": "d6",

    "gp3": "d10",
    "gp4": "d9",
    "gp2": "d8",
    "gp1": "d7",
  }),
};

const controllerInfoQtPyRp2040: ControllerInfo = {
  name: "Adafruit QT Py RP2040",
  soc: "rp2040",
  board: "adafruit_qt_py_rp2040",
  boardKconfig: "BOARD_ADAFRUIT_QT_PY_RP2040",
  docLink: "https://learn.adafruit.com/adafruit-qt-py-2040/pinouts",
  pins: {
    d0: { displayName: "D0", aka: ["GPIO29", "A0"], dtsRef: "&xiao_d 0", pinctrlRef: "29" },
    d1: { displayName: "D1", aka: ["GPIO28", "A1"], dtsRef: "&xiao_d 1", pinctrlRef: "28" },
    d2: { displayName: "D2", aka: ["GPIO27", "A2"], dtsRef: "&xiao_d 2", pinctrlRef: "27" },
    d3: { displayName: "D3", aka: ["GPIO26", "A3"], dtsRef: "&xiao_d 3", pinctrlRef: "26" },
    d4: { displayName: "D4", aka: ["GPIO24", "SDA"], dtsRef: "&xiao_d 4", pinctrlRef: "24" },
    d5: { displayName: "D5", aka: ["GPIO25", "SCL"], dtsRef: "&xiao_d 5", pinctrlRef: "25" },
    d6: { displayName: "D6", aka: ["GPIO20", "TX"], dtsRef: "&xiao_d 6", pinctrlRef: "20" },
    d7: { displayName: "D7", aka: ["GPIO5", "RX"], dtsRef: "&xiao_d 7", pinctrlRef: "5" },
    d8: { displayName: "D8", aka: ["GPIO6", "SCK"], dtsRef: "&xiao_d 8", pinctrlRef: "6" },
    d9: { displayName: "D9", aka: ["GPIO4", "MISO"], dtsRef: "&xiao_d 9", pinctrlRef: "4" },
    d10: { displayName: "D10", aka: ["GPIO3", "MOSI"], dtsRef: "&xiao_d 10", pinctrlRef: "3" },

    gp22: { displayName: "GP22", aka: ["SDA1"], dtsRef: "&gpio0 22", pinctrlRef: "22" },
    gp23: { displayName: "GP23", aka: ["SCL1"], dtsRef: "&gpio0 23", pinctrlRef: "23" },
  },
  visual: {
    left: [
      ...controllerInfoXiaoBle.visual.left,
      { type: "ui", ui: "empty", text: "" },
      { type: "gpio", id: "gp22" },
    ],
    right: [
      ...controllerInfoXiaoBle.visual.right,
      { type: "ui", ui: "empty", text: "" },
      { type: "gpio", id: "gp23" },
    ],
  },
  pinctrlChoices: makeRP2040PinctrlChoices({
    // native pins: controller pins
    "gp29": "d0",
    "gp28": "d1",
    "gp27": "d2",
    "gp26": "d3",
    "gp24": "d4",
    "gp25": "d5",
    "gp20": "d6",

    "gp3": "d10",
    "gp4": "d9",
    "gp6": "d8",
    "gp5": "d7",

    "gp22": "gp22",
    "gp23": "gp23",
  }),
};

const controllerInfoKB2040: ControllerInfo = {
  name: "Adafruit KB2040",
  soc: "rp2040",
  board: "adafruit_kb2040",
  boardKconfig: "BOARD_ADAFRUIT_KB2040",
  docLink: "https://learn.adafruit.com/adafruit-kb2040/pinouts",
  pins: {
    d1: { displayName: "D1", aka: ["GPIO0"], dtsRef: "&pro_micro 1", pinctrlRef: "0" },
    d0: { displayName: "D0", aka: ["GPIO1"], dtsRef: "&pro_micro 0", pinctrlRef: "1" },
    d2: { displayName: "D2", aka: ["GPIO2"], dtsRef: "&pro_micro 2", pinctrlRef: "2" },
    d3: { displayName: "D3", aka: ["GPIO3"], dtsRef: "&pro_micro 3", pinctrlRef: "3" },
    d4: { displayName: "D4", aka: ["GPIO4"], dtsRef: "&pro_micro 4", pinctrlRef: "4" },
    d5: { displayName: "D5", aka: ["GPIO5"], dtsRef: "&pro_micro 5", pinctrlRef: "5" },
    d6: { displayName: "D6", aka: ["GPIO6"], dtsRef: "&pro_micro 6", pinctrlRef: "6" },
    d7: { displayName: "D7", aka: ["GPIO7"], dtsRef: "&pro_micro 7", pinctrlRef: "7" },
    d8: { displayName: "D8", aka: ["GPIO8"], dtsRef: "&pro_micro 8", pinctrlRef: "8" },
    d9: { displayName: "D9", aka: ["GPIO9"], dtsRef: "&pro_micro 9", pinctrlRef: "9" },

    d21: { displayName: "D21", aka: ["GPIO29", "A3"], dtsRef: "&pro_micro 21", pinctrlRef: "29" },
    d20: { displayName: "D20", aka: ["GPIO28", "A2"], dtsRef: "&pro_micro 20", pinctrlRef: "28" },
    d19: { displayName: "D19", aka: ["GPIO27", "A1"], dtsRef: "&pro_micro 19", pinctrlRef: "27" },
    d18: { displayName: "D18", aka: ["GPIO26", "A0"], dtsRef: "&pro_micro 18", pinctrlRef: "26" },

    d15: { displayName: "D15", aka: ["GPIO18", "SCK"], dtsRef: "&pro_micro 15", pinctrlRef: "18" },
    d14: { displayName: "D14", aka: ["GPIO20", "MISO"], dtsRef: "&pro_micro 14", pinctrlRef: "20" },
    d16: { displayName: "D16", aka: ["GPIO19", "MOSI"], dtsRef: "&pro_micro 16", pinctrlRef: "19" },
    d10: { displayName: "D10", aka: ["GPIO10"], dtsRef: "&pro_micro 10", pinctrlRef: "10" },

    gp12: { displayName: "GP12", aka: ["SDA"], dtsRef: "&gpio0 12", pinctrlRef: "12" },
    gp13: { displayName: "GP13", aka: ["SCL"], dtsRef: "&gpio0 13", pinctrlRef: "13" },
  },
  visual: {
    left: [
      { type: "ui", ui: "rst", text: "D+" },
      { type: "gpio", id: "d1" },
      { type: "gpio", id: "d0" },
      { type: "ui", ui: "gnd", text: "GND" },
      { type: "ui", ui: "gnd", text: "GND" },
      { type: "gpio", id: "d2" },
      { type: "gpio", id: "d3" },
      { type: "gpio", id: "d4" },
      { type: "gpio", id: "d5" },
      { type: "gpio", id: "d6" },
      { type: "gpio", id: "d7" },
      { type: "gpio", id: "d8" },
      { type: "gpio", id: "d9" },
      { type: "ui", ui: "empty", text: "" },
      { type: "gpio", id: "gp12" },
    ],
    right: [
      { type: "ui", ui: "rst", text: "D-" },
      { type: "ui", ui: "power", text: "VBUS" },
      { type: "ui", ui: "gnd", text: "GND" },
      { type: "ui", ui: "rst", text: "RST" },
      { type: "ui", ui: "power", text: "3.3V" },
      { type: "gpio", id: "d21" },
      { type: "gpio", id: "d20" },
      { type: "gpio", id: "d19" },
      { type: "gpio", id: "d18" },
      { type: "gpio", id: "d15" },
      { type: "gpio", id: "d14" },
      { type: "gpio", id: "d16" },
      { type: "gpio", id: "d10" },
      { type: "ui", ui: "empty", text: "" },
      { type: "gpio", id: "gp13" },
    ],
  },
  pinctrlChoices: makeRP2040PinctrlChoices({
    // native pins: controller pins
    "gp0": "d1",
    "gp1": "d0",
    "gp2": "d2",
    "gp3": "d3",
    "gp4": "d4",
    "gp5": "d5",
    "gp6": "d6",
    "gp7": "d7",
    "gp8": "d8",
    "gp9": "d9",

    "gp29": "d21",
    "gp28": "d20",
    "gp27": "d19",
    "gp26": "d18",

    "gp18": "d15",
    "gp20": "d14",
    "gp19": "d16",
    "gp10": "d10",

    "gp12": "gp12",
    "gp13": "gp13",
  }),
};

const controllerInfoSparkfunProMicroRp2040: ControllerInfo = {
  name: "SparkFun Pro Micro RP2040",
  soc: "rp2040",
  board: "sparkfun_pro_micro_rp2040",
  boardKconfig: "BOARD_SPARKFUN_PRO_MICRO_RP2040",
  docLink: "https://cdn.sparkfun.com/assets/e/2/7/6/b/ProMicroRP2040_Graphical_Datasheet.pdf",
  pins: {
    // pro micro left
    // TX in sparkfun's graphics
    d1: { displayName: "D1", aka: ["GPIO0", "TX"], dtsRef: "&pro_micro 1", pinctrlRef: "0" }, // RP2040 GPIO0 at pro_micro pin 1
    // RX
    d0: { displayName: "D0", aka: ["GPIO1", "RX"], dtsRef: "&pro_micro 0", pinctrlRef: "1" }, // RP2040 GPIO1 at pro_micro pin 0

    // 2 - 9 in sparkfun's graphics
    d2: { displayName: "D2", aka: ["GPIO2"], dtsRef: "&pro_micro 2", pinctrlRef: "2" },
    d3: { displayName: "D3", aka: ["GPIO3"], dtsRef: "&pro_micro 3", pinctrlRef: "3" },
    d4: { displayName: "D4", aka: ["GPIO4"], dtsRef: "&pro_micro 4", pinctrlRef: "4" },
    d5: { displayName: "D5", aka: ["GPIO5"], dtsRef: "&pro_micro 5", pinctrlRef: "5" },
    d6: { displayName: "D6", aka: ["GPIO6"], dtsRef: "&pro_micro 6", pinctrlRef: "6" },
    d7: { displayName: "D7", aka: ["GPIO7"], dtsRef: "&pro_micro 7", pinctrlRef: "7" },
    d8: { displayName: "D8", aka: ["GPIO8"], dtsRef: "&pro_micro 8", pinctrlRef: "8" },
    d9: { displayName: "D9", aka: ["GPIO9"], dtsRef: "&pro_micro 9", pinctrlRef: "9" },

    // pro micro right
    // A3 - A0 in pinout graphics
    d21: { displayName: "D21", aka: ["GPIO29", "A3"], dtsRef: "&pro_micro 21", pinctrlRef: "29" },
    d20: { displayName: "D20", aka: ["GPIO28", "A2"], dtsRef: "&pro_micro 20", pinctrlRef: "28" },
    d19: { displayName: "D19", aka: ["GPIO27", "A1"], dtsRef: "&pro_micro 19", pinctrlRef: "27" },
    d18: { displayName: "D18", aka: ["GPIO26", "A0"], dtsRef: "&pro_micro 18", pinctrlRef: "26" },

    // SCK, CI, CO, 21 in pinout graphics
    d15: { displayName: "D15", aka: ["GPIO22", "SCK"], dtsRef: "&pro_micro 15", pinctrlRef: "22" },
    d14: { displayName: "D14", aka: ["GPIO20", "CI"], dtsRef: "&pro_micro 14", pinctrlRef: "20" },
    d16: { displayName: "D16", aka: ["GPIO23", "CO"], dtsRef: "&pro_micro 16", pinctrlRef: "23" },
    d10: { displayName: "D10", aka: ["GPIO21"], dtsRef: "&pro_micro 10", pinctrlRef: "21" },

    // extra i2c connectors on bottom
    gp16: { displayName: "GP16", aka: ["SDA"], dtsRef: "&gpio0 16", pinctrlRef: "16" },
    gp17: { displayName: "GP17", aka: ["SCL"], dtsRef: "&gpio0 17", pinctrlRef: "17" },
  },
  visual: {
    left: [
      { type: "gpio", id: "d1" },
      { type: "gpio", id: "d0" },
      { type: "ui", ui: "gnd", text: "GND" },
      { type: "ui", ui: "gnd", text: "GND" },
      { type: "gpio", id: "d2" },
      { type: "gpio", id: "d3" },
      { type: "gpio", id: "d4" },
      { type: "gpio", id: "d5" },
      { type: "gpio", id: "d6" },
      { type: "gpio", id: "d7" },
      { type: "gpio", id: "d8" },
      { type: "gpio", id: "d9" },
      { type: "ui", ui: "empty", text: "" },
      { type: "gpio", id: "gp16" },
    ],
    right: [
      { type: "ui", ui: "power", text: "RAW" },
      { type: "ui", ui: "gnd", text: "GND" },
      { type: "ui", ui: "rst", text: "RST" },
      { type: "ui", ui: "power", text: "VCC" },
      { type: "gpio", id: "d21" },
      { type: "gpio", id: "d20" },
      { type: "gpio", id: "d19" },
      { type: "gpio", id: "d18" },
      { type: "gpio", id: "d15" },
      { type: "gpio", id: "d14" },
      { type: "gpio", id: "d16" },
      { type: "gpio", id: "d10" },
      { type: "ui", ui: "empty", text: "" },
      { type: "gpio", id: "gp17" },
    ],
  },
  pinctrlChoices: makeRP2040PinctrlChoices({
    // native pins: controller pins
    "gp1": "d0",
    "gp0": "d1",
    "gp2": "d2",
    "gp3": "d3",
    "gp4": "d4",
    "gp5": "d5",
    "gp6": "d6",
    "gp7": "d7",
    "gp8": "d8",
    "gp9": "d9",

    "gp28": "d21",
    "gp27": "d20",
    "gp26": "d19",
    "gp25": "d18",
    "gp22": "d15",
    "gp20": "d14",
    "gp23": "d16",
    "gp21": "d10",

    "gp16": "gp16",
    "gp17": "gp17",
  }),
};

export const controllerInfos: Readonly<Record<Controller, ControllerInfo>> = {
  "nice_nano_v2": controllerInfoNiceNanoV2,
  "xiao_ble": controllerInfoXiaoBle,
  "xiao_ble_plus": controllerInfoXiaoBlePlus,

  "rpi_pico": controllerInfoRpiPico,
  "xiao_rp2040": controllerInfoXiaoRp2040,
  "qt_py_rp2040": controllerInfoQtPyRp2040,
  "kb2040": controllerInfoKB2040,
  "sparkfun_pro_micro_rp2040": controllerInfoSparkfunProMicroRp2040,
};

// Require SCK on SPI 0 to 2 on nRF52840 due to hardware limitations
// See https://github.com/zephyrproject-rtos/zephyr/issues/57147#issuecomment-1540113856
// TODO allow setting SCK to unexposed pins to work around this limitation

// TODO before calling createZMKConfig in templating,
// validate the buses passed in actually exist for the controller
export function loadBusesForController(type: Controller): AnyBus[] {
  return structuredClone(socBusData[controllerInfos[type].soc].buses.map((bus) => ({ ...bus, devices: [] })));
}

export type BusDeviceClass = "display" | "led_strip" | "shift_register" | "pointing";

/**
 * Rules for device classes. When `maxPerPart` is set, at most that many
 * devices of the class can be added to a single split part.
 * If a class is omitted or `maxPerPart` is undefined, it is treated as unlimited.
 */
export const deviceClassRules: Readonly<Record<BusDeviceClass, Readonly<{ maxPerPart?: number }>>> = {
  display: { maxPerPart: 1 },
  led_strip: { maxPerPart: 1 },
  shift_register: { maxPerPart: 1 },
  pointing: {},
};

export const ZmkModuleRemotes = {
  "petejohanson": "https://github.com/petejohanson",
  "badjeff": "https://github.com/badjeff",
} as const;

export interface ModuleData {
  readonly remote: keyof typeof ZmkModuleRemotes;
  readonly repo: string;
  readonly rev: string;
  /**
   * Conflict keys - modules sharing any conflict key cannot be enabled together.
   * For example, if module A has ["apple", "banana"] and module B has ["apple"],
   * they conflict because both have "apple".
   */
  readonly conflicts: readonly string[];
}

export type ModuleRegistry = Record<ModuleId, ModuleData>;

export const ZmkModules: ModuleRegistry = {
  "petejohanson/cirque": {
    remote: "petejohanson",
    repo: "cirque-input-module",
    rev: "0de55f36bc720b5be3d8880dc856d4d78baf5214",
    conflicts: [],
  },
  "badjeff/pmw3610": {
    remote: "badjeff",
    repo: "zmk-pmw3610-driver",
    rev: "zmk-0.3",
    conflicts: ["pmw3610"], // There might be alternative PMW3610 drivers in the future
  },
  "badjeff/paw3395": {
    remote: "badjeff",
    repo: "zmk-paw3395-driver",
    rev: "ab43c664cf84c94bd6b9839f3e4aa9517773de82",
    conflicts: [],
  },
} as const;

/**
 * Check if two modules conflict with each other.
 * Two modules conflict if they share any conflict key.
 */
export function modulesConflict(moduleA: ModuleId, moduleB: ModuleId): boolean {
  const conflictsA = ZmkModules[moduleA].conflicts;
  const conflictsB = ZmkModules[moduleB].conflicts;
  return conflictsA.some(key => conflictsB.includes(key));
}

/**
 * UI widget type for device property
 *
 * - "pin": pin selection
 * - "dec": decimal number input (base 10)
 * - "hex": hexadecimal number input (base 16)
 * - "options": select from predefined options
 * - "checkbox": boolean checkbox
 */
export type DeviceDataWidgetType<T> =
  T extends string ? "pin" | "stringOptions" /* | "text" */ :
  T extends number ? "dec" | "hex" | "numberOptions" :
  T extends boolean ? "checkbox" :
  // T extends string[] ? "list" :
  never;

export type AllDeviceDataTypes = string | number | boolean;

export type AllWidgetTypes = DeviceDataWidgetType<AllDeviceDataTypes>;

type DeviceProps<T extends AnyBusDevice["type"]> = Omit<Extract<AnyBusDevice, { type: T }>, "type">;

export type DevicePropDefinition<T> = {
  readonly widget: DeviceDataWidgetType<T>;
  readonly optional?: boolean | undefined;
  /**
   * Name of the property for UI display
   */
  readonly name?: string | undefined;
  readonly desc?: string | undefined;
  readonly min?: number | undefined;
  readonly max?: number | undefined;
  readonly options?: readonly T[] | undefined;
};

type DeviceMetadata = {
  readonly [K in AnyBusDevice["type"]]: {
    readonly shortName: string;
    readonly fullName: string;
    readonly class: BusDeviceClass;
    readonly exclusive: boolean;
    readonly bus: "i2c" | "spi";
    readonly busPins: {
      readonly mosi?: boolean | undefined;
      readonly miso?: boolean | undefined;
      readonly sck?: boolean | undefined;
      // I2C pins are always required
    };
    /**
     * CS pin for SPI is active high instead of the default active low
     */
    readonly csActiveHigh?: true | undefined;
    readonly desc?: string | undefined;
    readonly module?: ModuleId | undefined;
    readonly defaults?: Partial<DeviceProps<K>> | undefined;
    readonly props: {
      readonly [P in keyof DeviceProps<K>]: DevicePropDefinition<DeviceProps<K>[P]>;
    };
  };
};

// shared metadata for pinnacle on i2c and spi
const pinnacleBaseMetadata = {
  class: "pointing",
  exclusive: false,
  module: "petejohanson/cirque",
  defaults: {
    rotate90: false,
    invertx: false,
    inverty: false,
    sleep: true,
    noSecondaryTap: true,
    noTaps: true,
    sensitivity: "2x",
  },
} as const;
const pinnacleBaseMetadataProps = {
  dr: {
    widget: "pin",
    desc: "Data Ready / Interrupt",
  },
  rotate90: {
    widget: "checkbox",
    name: "Rotate 90°",
  },
  invertx: {
    widget: "checkbox",
    name: "Invert X axis",
  },
  inverty: {
    widget: "checkbox",
    name: "Invert Y axis",
  },
  sleep: {
    widget: "checkbox",
    name: "Enable Sleep Mode",
  },
  noSecondaryTap: {
    widget: "checkbox",
    name: "Disable Secondary Tap",
  },
  noTaps: {
    widget: "checkbox",
    name: "Disable All Taps",
  },
  sensitivity: {
    widget: "stringOptions",
    name: "Sensitivity",
    options: ["1x", "2x", "3x", "4x"] as const,
  },
} as const;

/**
 * Metadata for bus devices, including UI widget types for properties.
 * Used for displaying device configuration UI, and for validating device properties.
 * This is the single source of truth for all bus device info.
 */
export const busDeviceMetadata: DeviceMetadata = {
  ssd1306: {
    shortName: "SSD1306",
    fullName: "SSD1306 OLED Display",
    class: "display",
    bus: "i2c",
    busPins: {
      // I2C pins are always required
    },
    exclusive: false,
    defaults: {
      add: 0x3c,
      width: 128,
      height: 64,
    },
    // desc: undefined,
    props: {
      add: {
        widget: "hex",
        name: "I2C Address",
        min: 0x00,
        max: 0x7f,
      },
      width: {
        widget: "dec",
        min: 1,
      },
      height: {
        widget: "dec",
        min: 1,
      },
    },
  },
  niceview: {
    shortName: "nice!view",
    fullName: "nice!view",
    class: "display",
    bus: "spi",
    busPins: {
      mosi: true,
      sck: true,
      // TODO cs check moved to props
      // cs: true,
    },
    exclusive: false,
    csActiveHigh: true,
    // desc: undefined,
    props: {
      cs: {
        widget: "pin",
      },
    },
  },
  ws2812: {
    shortName: "WS2812",
    fullName: "WS2812 LED Strip",
    class: "led_strip",
    bus: "spi",
    busPins: {
      mosi: true,
    },
    exclusive: true,
    defaults: {
      length: 3,
    },
    // desc: undefined,
    props: {
      length: {
        widget: "dec",
        name: "Chain Length",
        min: 1,
        max: 256,
      },
    },
  },
  "74hc595": {
    shortName: "Shift Register",
    fullName: "74HC595 Shift Register",
    class: "shift_register",
    bus: "spi",
    busPins: {
      mosi: true,
      sck: true,
      // TODO cs check moved to props
      // cs: true,
    },
    exclusive: false,
    defaults: {
      ngpios: 8,
    },
    // desc: undefined,
    props: {
      cs: {
        widget: "pin",
      },
      ngpios: {
        widget: "numberOptions",
        name: "Number of GPIOs",
        options: [8, 16, 24, 32] as const,
      },
    },
  },
  pmw3610: {
    shortName: "PMW3610",
    fullName: "PMW3610 Optical Sensor",
    class: "pointing",
    bus: "spi",
    busPins: {
      // TODO PMW3610 use the same pin for MOSI and MISO
      // we want to allow this in both UI and validation
      mosi: true,
      miso: true,
      sck: true,
      // TODO cs check moved to props
      // cs: true,
    },
    exclusive: false,
    // desc: undefined,
    module: "badjeff/pmw3610",
    defaults: {
      cpi: 600,
      swapxy: false,
      invertx: false,
      inverty: false,
    },
    props: {
      cs: {
        widget: "pin",
        desc: "Chip Select Pin",
      },
      irq: {
        // TODO add check for irq (or any other `widget: pin` props)
        widget: "pin",
        name: "MOTION",
        desc: "MOTION / Interrupt Pin",
      },
      cpi: {
        widget: "numberOptions",
        options: Array.from({ length: 16 }, (_, i) => (i + 1) * 200),
      },
      swapxy: {
        widget: "checkbox",
        name: "Swap X/Y axes",
      },
      invertx: {
        widget: "checkbox",
        name: "Invert X axis",
      },
      inverty: {
        widget: "checkbox",
        name: "Invert Y axis",
      },
    },
  },
  paw3395: {
    shortName: "PAW3395",
    fullName: "PAW3395 Optical Sensor",
    class: "pointing",
    bus: "spi",
    busPins: {
      mosi: true,
      miso: true,
      sck: true,
    },
    exclusive: false,
    module: "badjeff/paw3395",
    defaults: {
      cpi: 600,
      swapxy: false,
      invertx: false,
      inverty: false,
    },
    props: {
      cs: {
        widget: "pin",
        desc: "Chip Select Pin",
      },
      irq: {
        widget: "pin",
        name: "MOTION",
        desc: "MOTION / Interrupt Pin",
      },
      cpi: {
        widget: "numberOptions",
        options: [
          ...Array.from({ length: 15 }, (_, i) => (i + 1) * 200),
          ...Array.from({ length: 22 }, (_, i) => 3000 + (i + 1) * 400),
          ...Array.from({ length: 14 }, (_, i) => 12000 + (i + 1) * 1000),
        ],
      },
      swapxy: {
        widget: "checkbox",
        name: "Swap X/Y axes",
      },
      invertx: {
        widget: "checkbox",
        name: "Invert X axis",
      },
      inverty: {
        widget: "checkbox",
        name: "Invert Y axis",
      },
    },
  },
  pinnacle_i2c: {
    ...pinnacleBaseMetadata,
    shortName: "Pinnacle (I2C)",
    fullName: "Cirque Pinnacle Trackpad on I2C",
    bus: "i2c",
    busPins: {},
    props: {
      add: {
        name: "I2C Address",
        widget: "hex",
      },
      ...pinnacleBaseMetadataProps,
    },
  },
  pinnacle_spi: {
    ...pinnacleBaseMetadata,
    shortName: "Pinnacle (SPI)",
    fullName: "Cirque Pinnacle Trackpad on SPI",
    bus: "spi",
    busPins: {
      mosi: true,
      miso: true,
      sck: true,
    },
    props: {
      cs: {
        widget: "pin",
        desc: "Chip Select Pin",
      },
      ...pinnacleBaseMetadataProps,
    },
  },
};

export const busDeviceTypes = Object.keys(busDeviceMetadata) as readonly BusDeviceTypeName[];

/**
 * Groups of device types that represent the same device on different buses.
 * Each group has a display name and an array of device types (variants).
 * When a group has multiple variants, the UI shows a single button that
 * lets users choose which bus to add the device to.
 */
export interface DeviceGroup {
  /** Display name for the grouped device button */
  readonly displayName: string;
  /** Device type variants in this group */
  readonly variants: readonly BusDeviceTypeName[];
}

/**
 * Registry of device groups for devices that work on multiple buses.
 * Key is a unique group identifier, value is the group definition.
 */
export const deviceGroups: Readonly<Record<string, DeviceGroup>> = {
  pinnacle: {
    displayName: "Pinnacle",
    variants: ["pinnacle_i2c", "pinnacle_spi"],
  },
};

// Build reverse lookup map: device type -> group key
const deviceToGroupKey: Readonly<Record<BusDeviceTypeName, string>> = (() => {
  const map: Record<string, string> = {};
  for (const [groupKey, group] of Object.entries(deviceGroups)) {
    for (const variant of group.variants) {
      map[variant] = groupKey;
    }
  }
  return map as Record<BusDeviceTypeName, string>;
})();

/**
 * Get the group key and group data a device type belongs to, if any.
 * Returns null if the device is not part of any group.
 */
export function getDeviceGroup(type: BusDeviceTypeName): { key: string; group: DeviceGroup } | null {
  const groupKey = deviceToGroupKey[type];
  if (!groupKey) return null;
  return { key: groupKey, group: deviceGroups[groupKey] };
}

export function deviceOptionsForBus(busType: "i2c" | "spi"): readonly BusDeviceTypeName[] {
  return busDeviceTypes.filter((name) => busDeviceMetadata[name].bus === busType);
}

export function getBusDeviceMetadata(type: BusDeviceTypeName) {
  return busDeviceMetadata[type];
}

export function requiredBusPinsForDevice(type: BusDeviceTypeName): readonly string[] {
  const meta = getBusDeviceMetadata(type);
  return Object.entries(meta?.busPins || {})
    .filter(([, needed]) => Boolean(needed))
    .map(([pin]) => pin);
}

export function pinPropKeysForDevice(type: BusDeviceTypeName): readonly string[] {
  const meta = getBusDeviceMetadata(type);
  if (!meta) return [];
  return Object.entries(meta.props)
    .filter(([, prop]) => prop.widget === "pin")
    .map(([key]) => key);
}
