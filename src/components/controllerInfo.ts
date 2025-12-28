export interface GPIOInfo {
  id: string;
  name: string;
  type: "gpio";
}
interface PowerPinInfo {
  name: string;
  type: "power" | "gnd" | "rst";
}
interface EmptyPinInfo {
  type: "empty";
}
export type PinInfo = GPIOInfo | PowerPinInfo | EmptyPinInfo;

export interface ControllerInfo {
  name: string;
  docLink: string;
  pins: {
    left: PinInfo[];
    right: PinInfo[];
  };
  dtsMap: {
    [id: string]: string;
  };
}

export const controllerInfos = {
  "nice_nano_v2": {
    name: "nice!nano v2",
    docLink: "https://nicekeyboards.com/docs/nice-nano/pinout-schematic",
    pins: {
      left: [
        { name: "GND", type: "gnd" },
        { name: "D1", type: "gpio", id: "d1" },
        { name: "D0", type: "gpio", id: "d0" },
        { name: "GND", type: "gnd" },
        { name: "GND", type: "gnd" },
        { name: "D2", type: "gpio", id: "d2" },
        { name: "D3", type: "gpio", id: "d3" },
        { name: "D4", type: "gpio", id: "d4" },
        { name: "D5", type: "gpio", id: "d5" },
        { name: "D6", type: "gpio", id: "d6" },
        { name: "D7", type: "gpio", id: "d7" },
        { name: "D8", type: "gpio", id: "d8" },
        { name: "D9", type: "gpio", id: "d9" },
        { type: "empty" },
        { name: "P1.01", type: "gpio", id: "p101" },
        { name: "P1.02", type: "gpio", id: "p102" },
      ],
      right: [
        { name: "BAT+", type: "power" },
        { name: "BAT+", type: "power" },
        { name: "GND", type: "gnd" },
        { name: "RST", type: "rst" },
        { name: "3.3V", type: "power" },
        { name: "D21", type: "gpio", id: "d21" },
        { name: "D20", type: "gpio", id: "d20" },
        { name: "D19", type: "gpio", id: "d19" },
        { name: "D18", type: "gpio", id: "d18" },
        { name: "D15", type: "gpio", id: "d15" },
        { name: "D14", type: "gpio", id: "d14" },
        { name: "D16", type: "gpio", id: "d16" },
        { name: "D10", type: "gpio", id: "d10" },
        { type: "empty" },
        { type: "empty" },
        { name: "P1.07", type: "gpio", id: "p107" },
      ],
    },
    dtsMap: {
      d1: "&pro_micro 1",
      d0: "&pro_micro 0",
      d2: "&pro_micro 2",
      d3: "&pro_micro 3",
      d4: "&pro_micro 4",
      d5: "&pro_micro 5",
      d6: "&pro_micro 6",
      d7: "&pro_micro 7",
      d8: "&pro_micro 8",
      d9: "&pro_micro 9",

      d21: "&pro_micro 21",
      d20: "&pro_micro 20",
      d19: "&pro_micro 19",
      d18: "&pro_micro 18",
      d15: "&pro_micro 15",
      d14: "&pro_micro 14",
      d16: "&pro_micro 16",
      d10: "&pro_micro 10",

      p101: "&gpio1 1",
      p102: "&gpio1 2",
      p107: "&gpio1 7",
    }
  } satisfies ControllerInfo as ControllerInfo,

  "xiao_ble": {
    name: "Seeed Studio XIAO nRF52840",
    docLink: "https://files.seeedstudio.com/wiki/XIAO-BLE/pinout2.png",
    pins: {
      left: [
        { name: "D0", type: "gpio", id: "d0" },
        { name: "D1", type: "gpio", id: "d1" },
        { name: "D2", type: "gpio", id: "d2" },
        { name: "D3", type: "gpio", id: "d3" },
        { name: "D4", type: "gpio", id: "d4" },
        { name: "D5", type: "gpio", id: "d5" },
        { name: "D6", type: "gpio", id: "d6" },
      ],
      right: [
        { name: "5V", type: "power" },
        { name: "GND", type: "gnd" },
        { name: "3.3V", type: "power" },
        { name: "D10", type: "gpio", id: "d10" },
        { name: "D9", type: "gpio", id: "d9" },
        { name: "D8", type: "gpio", id: "d8" },
        { name: "D7", type: "gpio", id: "d7" },
      ],
    },
    dtsMap: {
      d0: "&xiao_d 0",
      d1: "&xiao_d 1",
      d2: "&xiao_d 2",
      d3: "&xiao_d 3",
      d4: "&xiao_d 4",
      d5: "&xiao_d 5",
      d6: "&xiao_d 6",
      d10: "&xiao_d 10",
      d9: "&xiao_d 9",
      d8: "&xiao_d 8",
      d7: "&xiao_d 7",
    }
  } satisfies ControllerInfo as ControllerInfo,

  "xiao_ble_plus": {
    name: "Seeed Studio XIAO nRF52840 Plus",
    docLink: "https://files.seeedstudio.com/wiki/XIAO-BLE/plus_pinout.png",
    pins: {
      left: [
        { name: "D0", type: "gpio", id: "d0" },
        { name: "D1", type: "gpio", id: "d1" },
        { name: "D2", type: "gpio", id: "d2" },
        { name: "D3", type: "gpio", id: "d3" },
        { name: "D4", type: "gpio", id: "d4" },
        { name: "D5", type: "gpio", id: "d5" },
        { name: "D6", type: "gpio", id: "d6" },

        { type: "empty" },

        { type: "empty" },
        { type: "empty" },
        { type: "empty" },
        { name: "D19", type: "gpio", id: "d19" },
        { name: "D18", type: "gpio", id: "d18" },
        { name: "D17", type: "gpio", id: "d17" },
      ],
      right: [
        { name: "5V", type: "power" },
        { name: "GND", type: "gnd" },
        { name: "3.3V", type: "power" },
        { name: "D10", type: "gpio", id: "d10" },
        { name: "D9", type: "gpio", id: "d9" },
        { name: "D8", type: "gpio", id: "d8" },
        { name: "D7", type: "gpio", id: "d7" },

        { type: "empty" },

        { name: "D11", type: "gpio", id: "d11" },
        { name: "D12", type: "gpio", id: "d12" },
        { name: "D13", type: "gpio", id: "d13" },
        { name: "D14", type: "gpio", id: "d14" },
        { name: "D15", type: "gpio", id: "d15" },
        { name: "D16", type: "gpio", id: "d16" },
      ],
    },
    dtsMap: {
      d0: "&xiao_d 0",
      d1: "&xiao_d 1",
      d2: "&xiao_d 2",
      d3: "&xiao_d 3",
      d4: "&xiao_d 4",
      d5: "&xiao_d 5",
      d6: "&xiao_d 6",
      d10: "&xiao_d 10",
      d9: "&xiao_d 9",
      d8: "&xiao_d 8",
      d7: "&xiao_d 7",

      d11: "&gpio0 15",
      d12: "&gpio0 19",
      d13: "&gpio1 1",
      d14: "&gpio0 9",
      d15: "&gpio0 10",

      d16: "&gpio0 31",

      d17: "&gpio1 3",
      d18: "&gpio1 5",
      d19: "&gpio1 7",
    }
  } satisfies ControllerInfo as ControllerInfo,
};

