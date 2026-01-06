import type { AnyBus, BusDeviceTypeName, BusName, Controller, Soc } from "~/typedef";

export interface VisualGpioPin {
  id: string;
  type: "gpio";
}

interface VisualGraphicPin {
  type: "ui";
  /**
   * How the pin is represented in the UI
   */
  ui: "power" | "gnd" | "rst" | "empty";
  text: string;
}

export type VisualPin = VisualGpioPin | VisualGraphicPin;

export interface SpiBusInfo {
  name: string;
  type: "spi";
}

export interface I2cBusInfo {
  name: string;
  type: "i2c";
}

export type BusInfo = SpiBusInfo | I2cBusInfo;

export interface PinctrlSpiPinChoices {
  mosi: string[];
  miso: string[];
  sck: string[];
  cs: string[];
}

export type PinctrlSpiPinChoicesFunc = (spiBus: SpiBusInfo) => PinctrlSpiPinChoices;

export interface PinctrlI2cPinChoices {
  sda: string[];
  scl: string[];
}

export type PinctrlI2cPinChoicesFunc = (i2cBus: I2cBusInfo) => PinctrlI2cPinChoices;

/**
 * Function that returns pin choices for a given bus.
 * Returned string is the `id` of the pin as defined in the controller's pin list.
 */
export interface PinctrlPinChoicesFunc {
  (bus: SpiBusInfo): PinctrlSpiPinChoices;
  (bus: I2cBusInfo): PinctrlI2cPinChoices;
}

export interface ControllerInfo {
  name: string;
  soc: Soc;
  /**
   * Zephyr board name for build.yaml and pinctrl overlay paths
   */
  board: string;
  /**
   * Kconfig symbol for the board
   */
  boardKconfig: string;
  /**
   * URL to documentation
   */
  docLink: string;
  /**
   * Metadata for each signal pin
   */
  pins: Record<string, ControllerPinMetadata>;
  /**
   * Visual representation of the controller's pins
   */
  visual: {
    left: VisualPin[];
    right: VisualPin[];
  };
  // buses?: BusInfo[];
  pinctrlChoices: PinctrlPinChoicesFunc;
  busConflicts: Record<BusName, BusName[]>;
}

export interface ControllerPinMetadata {
  /**
   * Display name for the pin
   */
  displayName: string;
  /**
   * Devicetree syntax reference for the pin
   */
  dtsRef: string;
  /**
   * Devicetree pinctrl node reference for the pin
   */
  pinctrlRef: string;
}

function staticPinctrlChoices(pins: string[]) {
  function pinctrlPins(bus: SpiBusInfo): PinctrlSpiPinChoices;
  function pinctrlPins(bus: I2cBusInfo): PinctrlI2cPinChoices;
  function pinctrlPins(bus: BusInfo): PinctrlSpiPinChoices | PinctrlI2cPinChoices {
    if (bus.type === "i2c") {
      return {
        sda: pins,
        scl: pins,
      } satisfies PinctrlI2cPinChoices;
    }

    return {
      mosi: pins,
      miso: pins,
      sck: pins,
      cs: pins,
    } satisfies PinctrlSpiPinChoices;
  }

  return pinctrlPins;
}

/**
 * Creates a pinctrl choices function for the RP2040 controller.
 * @param pins pins exposed by the controller
 * @returns function that returns pin choices for a given bus
 */
function makeRP2040PinctrlChoices(pins: string[]) {
  /**
   * All possible pin assignments for RP2040 I2C and SPI buses at chip level.
   */
  const allPinsForRp2040 = {
    i2c: {
      i2c0: {
        // sda: 0, 4, 8, 16, 20, 24, 28
        sda: ["gp0", "gp4", "gp8", "gp12", "gp16", "gp20", "gp24", "gp28"].filter((p) => pins.includes(p)),
        // sdl: 1, 5, 9, 17, 21, 25, 29
        scl: ["gp1", "gp5", "gp9", "gp13", "gp17", "gp21", "gp25", "gp29"].filter((p) => pins.includes(p)),
      },
      i2c1: {
        // sda: 2, 6, 10, 14, 18, 22, 26
        sda: ["gp2", "gp6", "gp10", "gp14", "gp18", "gp22", "gp26"].filter((p) => pins.includes(p)),
        // sdl: 3, 7, 11, 15, 19, 23, 27
        scl: ["gp3", "gp7", "gp11", "gp15", "gp19", "gp23", "gp27"].filter((p) => pins.includes(p)),
      },
    } satisfies Record<string, PinctrlI2cPinChoices> as Record<string, PinctrlI2cPinChoices>,
    spi: {
      spi0: {
        // RX = MISO
        // TX = MOSI

        // spi0 rx = 0, 4, 16, 20
        miso: ["gp0", "gp4", "gp16", "gp20"].filter((p) => pins.includes(p)),
        // spi0 tx = 3, 7, 19, 23
        mosi: ["gp3", "gp7", "gp19", "gp23"].filter((p) => pins.includes(p)),
        // spi0 sck = 2, 6, 18, 22
        sck: ["gp2", "gp6", "gp18", "gp22"].filter((p) => pins.includes(p)),
        // spi0 cs = 1, 5, 17, 21 ???
        // cs: ["gp1", "gp5", "gp17", "gp21"],
        cs: pins, // allow any pin
      },
      spi1: {
        // rx = 8, 12, 24, 28
        miso: ["gp8", "gp12", "gp24", "gp28"].filter((p) => pins.includes(p)),
        // tx = 11, 15, 27
        mosi: ["gp11", "gp15", "gp27"].filter((p) => pins.includes(p)),
        // sck = 10, 14, 26
        sck: ["gp10", "gp14", "gp26"].filter((p) => pins.includes(p)),
        // cs = 9, 13, 25, 29
        // cs: ["gp9", "gp13", "gp25", "gp29"],
        cs: pins, // allow any pin
      },
    } satisfies Record<string, PinctrlSpiPinChoices> as Record<string, PinctrlSpiPinChoices>,
  }

  function rp2040PinctrlChoices(bus: SpiBusInfo): PinctrlSpiPinChoices;
  function rp2040PinctrlChoices(bus: I2cBusInfo): PinctrlI2cPinChoices;
  function rp2040PinctrlChoices(bus: BusInfo): PinctrlSpiPinChoices | PinctrlI2cPinChoices {
    return allPinsForRp2040[bus.type][bus.name];
  }

  return rp2040PinctrlChoices;
}

export const controllerInfos: Record<Controller, ControllerInfo> = {
  "nice_nano_v2": {
    name: "nice!nano v2",
    soc: "nrf52840",
    board: "nice_nano_v2",
    boardKconfig: "BOARD_NICE_NANO_V2",
    docLink: "https://nicekeyboards.com/docs/nice-nano/pinout-schematic",
    pins: {
      d1: { displayName: "D1", dtsRef: "&pro_micro 1", pinctrlRef: "0, 6" },
      d0: { displayName: "D0", dtsRef: "&pro_micro 0", pinctrlRef: "0, 8" },
      d2: { displayName: "D2", dtsRef: "&pro_micro 2", pinctrlRef: "0, 17" },
      d3: { displayName: "D3", dtsRef: "&pro_micro 3", pinctrlRef: "0, 20" },
      d4: { displayName: "D4", dtsRef: "&pro_micro 4", pinctrlRef: "0, 22" },
      d5: { displayName: "D5", dtsRef: "&pro_micro 5", pinctrlRef: "0, 24" },
      d6: { displayName: "D6", dtsRef: "&pro_micro 6", pinctrlRef: "1, 0" },
      d7: { displayName: "D7", dtsRef: "&pro_micro 7", pinctrlRef: "0, 11" },
      d8: { displayName: "D8", dtsRef: "&pro_micro 8", pinctrlRef: "1, 4" },
      d9: { displayName: "D9", dtsRef: "&pro_micro 9", pinctrlRef: "1, 6" },

      d21: { displayName: "D21", dtsRef: "&pro_micro 21", pinctrlRef: "0, 31" },
      d20: { displayName: "D20", dtsRef: "&pro_micro 20", pinctrlRef: "0, 29" },
      d19: { displayName: "D19", dtsRef: "&pro_micro 19", pinctrlRef: "0, 2" },
      d18: { displayName: "D18", dtsRef: "&pro_micro 18", pinctrlRef: "1, 15" },
      d15: { displayName: "D15", dtsRef: "&pro_micro 15", pinctrlRef: "1, 13" },
      d14: { displayName: "D14", dtsRef: "&pro_micro 14", pinctrlRef: "1, 11" },
      d16: { displayName: "D16", dtsRef: "&pro_micro 16", pinctrlRef: "0, 10" },
      d10: { displayName: "D10", dtsRef: "&pro_micro 10", pinctrlRef: "0, 9" },

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
    pinctrlChoices: staticPinctrlChoices([
      "d1", "d0", "d2", "d3", "d4", "d5", "d6", "d7", "d8", "d9",
      "d21", "d20", "d19", "d18", "d15", "d14", "d16", "d10",
      "p101", "p102", "p107",
    ]),
    busConflicts: {
      i2c0: ["spi0"],
      i2c1: ["spi1"],
      spi0: ["i2c0"],
      spi1: ["i2c1"],
    },
  },

  "xiao_ble": {
    name: "Seeed Studio XIAO nRF52840",
    soc: "nrf52840",
    board: "seeeduino_xiao_ble",
    boardKconfig: "BOARD_SEEEDUINO_XIAO_BLE",
    docLink: "https://files.seeedstudio.com/wiki/XIAO-BLE/pinout2.png",
    pins: {
      d0: { displayName: "D0", dtsRef: "&xiao_d 0", pinctrlRef: "0, 2" },
      d1: { displayName: "D1", dtsRef: "&xiao_d 1", pinctrlRef: "0, 3" },
      d2: { displayName: "D2", dtsRef: "&xiao_d 2", pinctrlRef: "0, 28" },
      d3: { displayName: "D3", dtsRef: "&xiao_d 3", pinctrlRef: "0, 29" },
      d4: { displayName: "D4", dtsRef: "&xiao_d 4", pinctrlRef: "0, 4" },
      d5: { displayName: "D5", dtsRef: "&xiao_d 5", pinctrlRef: "0, 5" },
      d6: { displayName: "D6", dtsRef: "&xiao_d 6", pinctrlRef: "1, 11" },
      d7: { displayName: "D7", dtsRef: "&xiao_d 7", pinctrlRef: "1, 12" },
      d8: { displayName: "D8", dtsRef: "&xiao_d 8", pinctrlRef: "1, 13" },
      d9: { displayName: "D9", dtsRef: "&xiao_d 9", pinctrlRef: "1, 14" },
      d10: { displayName: "D10", dtsRef: "&xiao_d 10", pinctrlRef: "1, 15" },
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
    pinctrlChoices: staticPinctrlChoices([
      "d0", "d1", "d2", "d3", "d4", "d5", "d6",
      "d10", "d9", "d8", "d7",
    ]),
    busConflicts: {
      i2c0: ["spi0"],
      i2c1: ["spi1"],
      spi0: ["i2c0"],
      spi1: ["i2c1"],
    },
  },

  "xiao_ble_plus": {
    name: "Seeed Studio XIAO nRF52840 Plus",
    soc: "nrf52840",
    board: "seeeduino_xiao_ble",
    boardKconfig: "BOARD_SEEEDUINO_XIAO_BLE",
    docLink: "https://files.seeedstudio.com/wiki/XIAO-BLE/plus_pinout.png",
    pins: {
      d0: { displayName: "D0", dtsRef: "&xiao_d 0", pinctrlRef: "0, 2" },
      d1: { displayName: "D1", dtsRef: "&xiao_d 1", pinctrlRef: "0, 3" },
      d2: { displayName: "D2", dtsRef: "&xiao_d 2", pinctrlRef: "0, 28" },
      d3: { displayName: "D3", dtsRef: "&xiao_d 3", pinctrlRef: "0, 29" },
      d4: { displayName: "D4", dtsRef: "&xiao_d 4", pinctrlRef: "0, 4" },
      d5: { displayName: "D5", dtsRef: "&xiao_d 5", pinctrlRef: "0, 5" },
      d6: { displayName: "D6", dtsRef: "&xiao_d 6", pinctrlRef: "1, 11" },
      d7: { displayName: "D7", dtsRef: "&xiao_d 7", pinctrlRef: "1, 12" },
      d8: { displayName: "D8", dtsRef: "&xiao_d 8", pinctrlRef: "1, 13" },
      d9: { displayName: "D9", dtsRef: "&xiao_d 9", pinctrlRef: "1, 14" },
      d10: { displayName: "D10", dtsRef: "&xiao_d 10", pinctrlRef: "1, 15" },

      d11: { displayName: "D11", dtsRef: "&gpio0 15", pinctrlRef: "0, 15" },
      d12: { displayName: "D12", dtsRef: "&gpio0 19", pinctrlRef: "0, 19" },
      d13: { displayName: "D13", dtsRef: "&gpio1 1", pinctrlRef: "1, 1" },
      d14: { displayName: "D14", dtsRef: "&gpio0 9", pinctrlRef: "0, 9" },
      d15: { displayName: "D15", dtsRef: "&gpio0 10", pinctrlRef: "0, 10" },

      d16: { displayName: "D16", dtsRef: "&gpio0 31", pinctrlRef: "0, 31" },

      d17: { displayName: "D17", dtsRef: "&gpio1 3", pinctrlRef: "1, 3" },
      d18: { displayName: "D18", dtsRef: "&gpio1 5", pinctrlRef: "1, 5" },
      d19: { displayName: "D19", dtsRef: "&gpio1 7", pinctrlRef: "1, 7" },
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

        { type: "ui", ui: "empty", text: "" },

        { type: "ui", ui: "empty", text: "" },
        { type: "ui", ui: "empty", text: "" },
        { type: "ui", ui: "empty", text: "" },
        { type: "gpio", id: "d19" },
        { type: "gpio", id: "d18" },
        { type: "gpio", id: "d17" },
      ],
      right: [
        { type: "ui", ui: "power", text: "5V" },
        { type: "ui", ui: "gnd", text: "GND" },
        { type: "ui", ui: "power", text: "3.3V" },
        { type: "gpio", id: "d10" },
        { type: "gpio", id: "d9" },
        { type: "gpio", id: "d8" },
        { type: "gpio", id: "d7" },

        { type: "ui", ui: "empty", text: "" },

        { type: "gpio", id: "d11" },
        { type: "gpio", id: "d12" },
        { type: "gpio", id: "d13" },
        { type: "gpio", id: "d14" },
        { type: "gpio", id: "d15" },
        { type: "gpio", id: "d16" },
      ],
    },
    pinctrlChoices: staticPinctrlChoices([
      "d0", "d1", "d2", "d3", "d4", "d5", "d6",
      "d19", "d18", "d17",
      "d10", "d9", "d8", "d7",
      "d11", "d12", "d13", "d14", "d15",
      // "d16",
    ]),
    busConflicts: {
      i2c0: ["spi0"],
      i2c1: ["spi1"],
      spi0: ["i2c0"],
      spi1: ["i2c1"],
    },
  },

  "rpi_pico": {
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
    pinctrlChoices: makeRP2040PinctrlChoices([
      "gp0", "gp1", "gp2", "gp3", "gp4", "gp5", "gp6", "gp7", "gp8", "gp9",
      "gp10", "gp11", "gp12", "gp13", "gp14", "gp15", "gp16", "gp17", "gp18", "gp19",
      "gp20", "gp21", "gp22", "gp26", "gp27", "gp28",
    ]),
    busConflicts: {}, // No bus conflicts for RP2040..?
  },
};

const makeSpiBus = (name: BusName): AnyBus => ({ type: "spi", name, devices: [] });
const makeI2cBus = (name: BusName): AnyBus => ({ type: "i2c", name, devices: [] });

const defaultBuses: Record<Controller, AnyBus[]> = {
  "nice_nano_v2": [
    makeSpiBus("spi0"),
    makeSpiBus("spi1"),
    makeSpiBus("spi2"),
    makeSpiBus("spi3"),
    makeI2cBus("i2c0"),
    makeI2cBus("i2c1"),
  ],
  "xiao_ble": [
    makeSpiBus("spi0"),
    makeSpiBus("spi1"),
    makeSpiBus("spi2"),
    makeSpiBus("spi3"),
    makeI2cBus("i2c0"),
    makeI2cBus("i2c1"),
  ],
  "xiao_ble_plus": [
    makeSpiBus("spi0"),
    makeSpiBus("spi1"),
    makeSpiBus("spi2"),
    makeSpiBus("spi3"),
    makeI2cBus("i2c0"),
    makeI2cBus("i2c1"),
  ],
  "rpi_pico": [
    makeSpiBus("spi0"),
    makeSpiBus("spi1"),
    makeI2cBus("i2c0"),
    makeI2cBus("i2c1"),
  ],
};

export function loadBusesForController(type: Controller): AnyBus[] {
  return structuredClone(defaultBuses[type] || []);
}

export interface BusDeviceInfo {
  name: string;
  exclusive: boolean;
  /**
   * CS pin for SPI is active high instead of the default active low
   */
  csActiveHigh?: true | undefined;
  // onBus: BusName;
  needs?: Record<string, boolean>;
}

export const busDeviceInfos: Record<BusDeviceTypeName, BusDeviceInfo> = {
  ssd1306: {
    name: "SSD1306 OLED Display",
    exclusive: false,
    // onBus: "i2c",
  },
  niceview: {
    name: "nice!view",
    csActiveHigh: true,
    // onBus: "spi",
    exclusive: false,
    needs: {
      sck: true,
      mosi: true,
      cs: true,
    },
  },
  ws2812: {
    name: "WS2812 LED Strip",
    // onBus: "spi",
    exclusive: true,
    needs: {
      mosi: true,
    },
  },
  "74hc595": {
    name: "74HC595 Shift Register",
    // onBus: "spi",
    exclusive: false,
    needs: {
      mosi: true,
      sck: true,
      cs: true,
    },
  },
};
