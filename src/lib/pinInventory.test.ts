import { describe, it, expect } from 'vitest';
import { resolveDevicePins, resolvePinInventory } from './pinInventory';
import type { KeyboardPart } from '~/types/keyboard';
import type { BusName, DeviceId } from '~/types';

// Helper: minimal KeyboardPart with a SPI bus carrying arbitrary devices.
function makePart(
  devices: { id: string; type: '74hc595' | 'ssd1306'; ngpios?: number }[],
): KeyboardPart {
  return {
    name: 'test',
    controller: 'nice_nano_v2' as const,
    pins: {},
    kscans: [],
    keys: {},
    encoders: [],
    buses: {
      spi1: {
        type: 'spi',
        devices: devices.map((d) => ({
          id: d.id as DeviceId,
          type: d.type,
          ngpios: d.ngpios ?? 8,
        })),
      },
    } as KeyboardPart['buses'],
  };
}

// ── resolveDevicePins — node-label indexing ──────────────

describe('resolveDevicePins', () => {
  describe('node label indexing', () => {
    it('indexes multiple same-type devices by incrementing counter', () => {
      const part = makePart([
        { id: 'a1', type: '74hc595', ngpios: 8 },
        { id: 'a2', type: '74hc595', ngpios: 8 },
        { id: 'a3', type: '74hc595', ngpios: 8 },
      ]);
      const { deviceNodeLabels } = resolveDevicePins(part);

      expect(deviceNodeLabels['a1' as DeviceId]).toBe('shifter0');
      expect(deviceNodeLabels['a2' as DeviceId]).toBe('shifter1');
      expect(deviceNodeLabels['a3' as DeviceId]).toBe('shifter2');
    });

    it('counts per type across multiple buses', () => {
      const part: KeyboardPart = {
        name: 'test',
        controller: 'nice_nano_v2',
        pins: {},
        kscans: [],
        keys: {},
        encoders: [],
        buses: {
          ['spi1' as BusName]: {
            type: 'spi',
            devices: [
              { id: 's1' as DeviceId, type: '74hc595', ngpios: 8 },
            ],
          },
          ['spi2' as BusName]: {
            type: 'spi',
            devices: [
              { id: 's2' as DeviceId, type: '74hc595', ngpios: 8 },
            ],
          },
        },
      };
      const { deviceNodeLabels } = resolveDevicePins(part);

      expect(deviceNodeLabels['s1' as DeviceId]).toBe('shifter0');
      expect(deviceNodeLabels['s2' as DeviceId]).toBe('shifter1');
    });

    it('skips devices without dtsNodeLabel in label map', () => {
      const part = makePart([
        { id: 'x1', type: '74hc595' },
        { id: 'x2', type: 'ssd1306' }, // no dtsNodeLabel
        { id: 'x3', type: '74hc595' },
      ]);
      const { deviceNodeLabels } = resolveDevicePins(part);

      expect(deviceNodeLabels['x1' as DeviceId]).toBe('shifter0');
      expect(deviceNodeLabels['x2' as DeviceId]).toBeUndefined();
      expect(deviceNodeLabels['x3' as DeviceId]).toBe('shifter1');
    });
  });

  describe('pin generation', () => {
    it('generates correct pin count per device', () => {
      const part = makePart([
        { id: 'p1', type: '74hc595', ngpios: 8 },
        { id: 'p2', type: '74hc595', ngpios: 16 },
      ]);
      const { devicePins } = resolveDevicePins(part);

      const p1Pins = devicePins.filter((p) => p.source.type === 'device' && p.source.deviceId === 'p1');
      const p2Pins = devicePins.filter((p) => p.source.type === 'device' && p.source.deviceId === 'p2');

      expect(p1Pins).toHaveLength(8);
      expect(p2Pins).toHaveLength(16);
    });

    it('uses deviceNodeLabel in pin dtsNodeLabel', () => {
      const part = makePart([
        { id: 'q1', type: '74hc595', ngpios: 8 },
        { id: 'q2', type: '74hc595', ngpios: 8 },
      ]);
      const { devicePins } = resolveDevicePins(part);

      const q1Pins = devicePins.filter((p) => p.source.type === 'device' && p.source.deviceId === 'q1');
      const q2Pins = devicePins.filter((p) => p.source.type === 'device' && p.source.deviceId === 'q2');

      for (const pin of q1Pins) {
        expect(pin.dtsNodeLabel).toBe('shifter0');
      }
      for (const pin of q2Pins) {
        expect(pin.dtsNodeLabel).toBe('shifter1');
      }
    });
  });
});

// ── resolvePinInventory — end-to-end ────────────────────

describe('resolvePinInventory', () => {
  it('includes both controller and device pins', () => {
    const part = makePart([
      { id: 'r1', type: '74hc595', ngpios: 8 },
    ]);
    const inventory = resolvePinInventory(part);

    // Should have controller GPIO pins + 8 device pins
    expect(inventory.allPins.length).toBeGreaterThan(8);

    const devicePins = inventory.allPins.filter(
      (p) => p.source.type === 'device',
    );
    expect(devicePins).toHaveLength(8);
  });
});
