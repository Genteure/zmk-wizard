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
    // TODO: pin id for rp2040 based board to be decided, contemplating between gpioNN (native names) or dNN (board-based names)
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
  }
};
