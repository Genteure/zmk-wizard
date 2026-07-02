// Metadata about visual representation of pins available on each controller.
// For the GPIO pins, see `./controller.ts` for everything on the controller itself.

import type { ControllerId, PinId } from '~/types';

export type PinVisual = {
  pinId: PinId;
  /**
   * Show an interactive element on the UI for this IO pin.
   */
  kind: 'gpio'
} | {
  text: string;
  /**
   * Static visual element. Kind denotes the color/style.
   *
   * - vcc: red-ish, used for power pins like VCC, VBAT, etc.
   * - gnd: gray-ish, used for GND pins.
   * - ctl: blue-ish, used for special function pins like reset, boot, etc.
   * - none: fully empty and invisible, placeholders for alignment purposes.
   */
  kind: 'vcc' | 'gnd' | 'ctl' | 'none';
};

export interface ControllerPinVisual {
  left: PinVisual[];
  right: PinVisual[];
}

export const ControllerPinVisuals: Record<ControllerId, ControllerPinVisual> = {
  "nice_nano_v2": {
    left: [
      { kind: 'gnd', text: 'GND' },
      { kind: 'gpio', pinId: 'd1' as PinId },
      { kind: 'gpio', pinId: 'd0' as PinId },
      { kind: 'gnd', text: 'GND' },
      { kind: 'gnd', text: 'GND' },
      { kind: 'gpio', pinId: 'd2' as PinId },
      { kind: 'gpio', pinId: 'd3' as PinId },
      { kind: 'gpio', pinId: 'd4' as PinId },
      { kind: 'gpio', pinId: 'd5' as PinId },
      { kind: 'gpio', pinId: 'd6' as PinId },
      { kind: 'gpio', pinId: 'd7' as PinId },
      { kind: 'gpio', pinId: 'd8' as PinId },
      { kind: 'gpio', pinId: 'd9' as PinId },

      { kind: 'none', text: '' },

      { kind: 'gpio', pinId: 'p101' as PinId },
      { kind: 'gpio', pinId: 'p102' as PinId },
    ],
    right: [
      { kind: 'vcc', text: 'BAT+' },
      { kind: 'vcc', text: 'BAT+' },
      { kind: 'gnd', text: 'GND' },
      { kind: 'ctl', text: 'RST' },
      { kind: 'vcc', text: 'VCC' },
      { kind: 'gpio', pinId: 'd21' as PinId },
      { kind: 'gpio', pinId: 'd20' as PinId },
      { kind: 'gpio', pinId: 'd19' as PinId },
      { kind: 'gpio', pinId: 'd18' as PinId },
      { kind: 'gpio', pinId: 'd15' as PinId },
      { kind: 'gpio', pinId: 'd14' as PinId },
      { kind: 'gpio', pinId: 'd16' as PinId },
      { kind: 'gpio', pinId: 'd10' as PinId },

      { kind: 'none', text: '' },

      { kind: 'none', text: '' },
      { kind: 'gpio', pinId: 'p107' as PinId },
    ],
  },
  "xiao_ble": {
    left: [
      { kind: 'gpio', pinId: 'd0' as PinId },
      { kind: 'gpio', pinId: 'd1' as PinId },
      { kind: 'gpio', pinId: 'd2' as PinId },
      { kind: 'gpio', pinId: 'd3' as PinId },
      { kind: 'gpio', pinId: 'd4' as PinId },
      { kind: 'gpio', pinId: 'd5' as PinId },
      { kind: 'gpio', pinId: 'd6' as PinId },
    ],
    right: [
      { kind: 'vcc', text: 'VBUS' },
      { kind: 'gnd', text: 'GND' },
      { kind: 'vcc', text: '3.3V' },
      { kind: 'gpio', pinId: 'd10' as PinId },
      { kind: 'gpio', pinId: 'd9' as PinId },
      { kind: 'gpio', pinId: 'd8' as PinId },
      { kind: 'gpio', pinId: 'd7' as PinId },
    ],
  },
  "xiao_rp2040": {
    left: [
      { kind: 'gpio', pinId: 'd0' as PinId },
      { kind: 'gpio', pinId: 'd1' as PinId },
      { kind: 'gpio', pinId: 'd2' as PinId },
      { kind: 'gpio', pinId: 'd3' as PinId },
      { kind: 'gpio', pinId: 'd4' as PinId },
      { kind: 'gpio', pinId: 'd5' as PinId },
      { kind: 'gpio', pinId: 'd6' as PinId },
    ],
    right: [
      { kind: 'vcc', text: 'VBUS' },
      { kind: 'gnd', text: 'GND' },
      { kind: 'vcc', text: '3.3V' },
      { kind: 'gpio', pinId: 'd10' as PinId },
      { kind: 'gpio', pinId: 'd9' as PinId },
      { kind: 'gpio', pinId: 'd8' as PinId },
      { kind: 'gpio', pinId: 'd7' as PinId },
    ],
  },
  "rpi_pico": {
    left: [
      { kind: 'gpio', pinId: 'gp0' as PinId },
      { kind: 'gpio', pinId: 'gp1' as PinId },
      { kind: 'gnd', text: 'GND' },
      { kind: 'gpio', pinId: 'gp2' as PinId },
      { kind: 'gpio', pinId: 'gp3' as PinId },
      { kind: 'gpio', pinId: 'gp4' as PinId },
      { kind: 'gpio', pinId: 'gp5' as PinId },
      { kind: 'gnd', text: 'GND' },
      { kind: 'gpio', pinId: 'gp6' as PinId },
      { kind: 'gpio', pinId: 'gp7' as PinId },
      { kind: 'gpio', pinId: 'gp8' as PinId },
      { kind: 'gpio', pinId: 'gp9' as PinId },
      { kind: 'gnd', text: 'GND' },
      { kind: 'gpio', pinId: 'gp10' as PinId },
      { kind: 'gpio', pinId: 'gp11' as PinId },
      { kind: 'gpio', pinId: 'gp12' as PinId },
      { kind: 'gpio', pinId: 'gp13' as PinId },
      { kind: 'gnd', text: 'GND' },
      { kind: 'gpio', pinId: 'gp14' as PinId },
      { kind: 'gpio', pinId: 'gp15' as PinId },
    ],
    right: [
      { kind: 'vcc', text: 'VBUS' },
      { kind: 'vcc', text: 'VSYS' },
      { kind: 'gnd', text: 'GND' },
      { kind: 'ctl', text: '3V3EN' },
      { kind: 'vcc', text: '3V3' },
      { kind: 'vcc', text: 'VREF' },
      { kind: 'gpio', pinId: 'gp28' as PinId },
      { kind: 'gnd', text: 'AGND' },
      { kind: 'gpio', pinId: 'gp27' as PinId },
      { kind: 'gpio', pinId: 'gp26' as PinId },
      { kind: 'ctl', text: 'RUN' },
      { kind: 'gpio', pinId: 'gp22' as PinId },
      { kind: 'gnd', text: 'GND' },
      { kind: 'gpio', pinId: 'gp21' as PinId },
      { kind: 'gpio', pinId: 'gp20' as PinId },
      { kind: 'gpio', pinId: 'gp19' as PinId },
      { kind: 'gpio', pinId: 'gp18' as PinId },
      { kind: 'gnd', text: 'GND' },
      { kind: 'gpio', pinId: 'gp17' as PinId },
      { kind: 'gpio', pinId: 'gp16' as PinId },
    ],
  },
  "xiao_ble_plus": {
    left: [
      { kind: 'gpio', pinId: 'd0' as PinId },
      { kind: 'gpio', pinId: 'd1' as PinId },
      { kind: 'gpio', pinId: 'd2' as PinId },
      { kind: 'gpio', pinId: 'd3' as PinId },
      { kind: 'gpio', pinId: 'd4' as PinId },
      { kind: 'gpio', pinId: 'd5' as PinId },
      { kind: 'gpio', pinId: 'd6' as PinId },

      { kind: 'none', text: '' },

      { kind: 'none', text: '' },
      { kind: 'none', text: '' },
      { kind: 'none', text: '' },
      { kind: 'gpio', pinId: 'd19' as PinId },
      { kind: 'gpio', pinId: 'd18' as PinId },
      { kind: 'gpio', pinId: 'd17' as PinId },
    ],
    right: [
      { kind: 'vcc', text: 'VBUS' },
      { kind: 'gnd', text: 'GND' },
      { kind: 'vcc', text: '3.3V' },
      { kind: 'gpio', pinId: 'd10' as PinId },
      { kind: 'gpio', pinId: 'd9' as PinId },
      { kind: 'gpio', pinId: 'd8' as PinId },
      { kind: 'gpio', pinId: 'd7' as PinId },

      { kind: 'none', text: '' },

      { kind: 'gpio', pinId: 'd11' as PinId },
      { kind: 'gpio', pinId: 'd12' as PinId },
      { kind: 'gpio', pinId: 'd13' as PinId },
      { kind: 'gpio', pinId: 'd14' as PinId },
      { kind: 'gpio', pinId: 'd15' as PinId },
      { kind: 'ctl', text: 'D16' },
    ],
  },
  "qt_py_rp2040": {
    left: [
      { kind: 'gpio', pinId: 'd0' as PinId },
      { kind: 'gpio', pinId: 'd1' as PinId },
      { kind: 'gpio', pinId: 'd2' as PinId },
      { kind: 'gpio', pinId: 'd3' as PinId },
      { kind: 'gpio', pinId: 'd4' as PinId },
      { kind: 'gpio', pinId: 'd5' as PinId },
      { kind: 'gpio', pinId: 'd6' as PinId },

      { kind: 'none', text: '' },

      { kind: 'gpio', pinId: 'gp22' as PinId },
    ],
    right: [
      { kind: 'vcc', text: 'VBUS' },
      { kind: 'gnd', text: 'GND' },
      { kind: 'vcc', text: '3.3V' },
      { kind: 'gpio', pinId: 'd10' as PinId },
      { kind: 'gpio', pinId: 'd9' as PinId },
      { kind: 'gpio', pinId: 'd8' as PinId },
      { kind: 'gpio', pinId: 'd7' as PinId },

      { kind: 'none', text: '' },

      { kind: 'gpio', pinId: 'gp23' as PinId },
    ],
  },
  "kb2040": {
    left: [
      { kind: 'ctl', text: 'D+' },
      { kind: 'gpio', pinId: 'd1' as PinId },
      { kind: 'gpio', pinId: 'd0' as PinId },
      { kind: 'gnd', text: 'GND' },
      { kind: 'gnd', text: 'GND' },
      { kind: 'gpio', pinId: 'd2' as PinId },
      { kind: 'gpio', pinId: 'd3' as PinId },
      { kind: 'gpio', pinId: 'd4' as PinId },
      { kind: 'gpio', pinId: 'd5' as PinId },
      { kind: 'gpio', pinId: 'd6' as PinId },
      { kind: 'gpio', pinId: 'd7' as PinId },
      { kind: 'gpio', pinId: 'd8' as PinId },
      { kind: 'gpio', pinId: 'd9' as PinId },

      { kind: 'none', text: '' },

      { kind: 'gpio', pinId: 'gp12' as PinId },
    ],
    right: [
      { kind: 'ctl', text: 'D-' },
      { kind: 'vcc', text: 'VBUS' },
      { kind: 'gnd', text: 'GND' },
      { kind: 'ctl', text: 'RST' },
      { kind: 'vcc', text: '3.3V' },
      { kind: 'gpio', pinId: 'd21' as PinId },
      { kind: 'gpio', pinId: 'd20' as PinId },
      { kind: 'gpio', pinId: 'd19' as PinId },
      { kind: 'gpio', pinId: 'd18' as PinId },
      { kind: 'gpio', pinId: 'd15' as PinId },
      { kind: 'gpio', pinId: 'd14' as PinId },
      { kind: 'gpio', pinId: 'd16' as PinId },
      { kind: 'gpio', pinId: 'd10' as PinId },

      { kind: 'none', text: '' },

      { kind: 'gpio', pinId: 'gp13' as PinId },
    ],
  },
  "sparkfun_pro_micro_rp2040": {
    left: [
      { kind: 'gpio', pinId: 'd1' as PinId },
      { kind: 'gpio', pinId: 'd0' as PinId },
      { kind: 'gnd', text: 'GND' },
      { kind: 'gnd', text: 'GND' },
      { kind: 'gpio', pinId: 'd2' as PinId },
      { kind: 'gpio', pinId: 'd3' as PinId },
      { kind: 'gpio', pinId: 'd4' as PinId },
      { kind: 'gpio', pinId: 'd5' as PinId },
      { kind: 'gpio', pinId: 'd6' as PinId },
      { kind: 'gpio', pinId: 'd7' as PinId },
      { kind: 'gpio', pinId: 'd8' as PinId },
      { kind: 'gpio', pinId: 'd9' as PinId },

      { kind: 'none', text: '' },

      { kind: 'gpio', pinId: 'gp16' as PinId },
    ],
    right: [
      { kind: 'vcc', text: 'RAW' },
      { kind: 'gnd', text: 'GND' },
      { kind: 'ctl', text: 'RST' },
      { kind: 'vcc', text: 'VCC' },
      { kind: 'gpio', pinId: 'd21' as PinId },
      { kind: 'gpio', pinId: 'd20' as PinId },
      { kind: 'gpio', pinId: 'd19' as PinId },
      { kind: 'gpio', pinId: 'd18' as PinId },
      { kind: 'gpio', pinId: 'd15' as PinId },
      { kind: 'gpio', pinId: 'd14' as PinId },
      { kind: 'gpio', pinId: 'd16' as PinId },
      { kind: 'gpio', pinId: 'd10' as PinId },

      { kind: 'none', text: '' },

      { kind: 'gpio', pinId: 'gp17' as PinId },
    ],
  },
};
