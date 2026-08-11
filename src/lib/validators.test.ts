import { describe, it, expect } from 'vitest';
import { ulid } from 'ulidx';
import type { Key, KeyId, PinId } from '~/types';
import { ValidatedKeyboardSchema } from './validators';

function keyId(s: string): KeyId {
  return s as unknown as KeyId;
}

function pinId(s: string): PinId {
  return s as unknown as PinId;
}

function makeKey(part: number): Key {
  return {
    id: keyId(ulid()),
    part,
    row: 0,
    col: 0,
    x: 0,
    y: 0,
    w: 1,
    h: 1,
    r: 0,
    rx: 0,
    ry: 0,
  };
}

function validKeyboard(overrides: Record<string, unknown> = {}) {
  return {
    name: 'test',
    shield: 'my_shield',
    dongle: false,
    modules: [],
    layout: [],
    parts: [],
    ...overrides,
  };
}

describe('ValidatedKeyboardSchema', () => {
  describe('section 10 — key wiring kscan-instance check', () => {
    it('allows input and output pins from the same kscan instance', () => {
      const key = makeKey(0);
      const data = validKeyboard({
        layout: [key],
        parts: [
          {
            name: 'main',
            controller: 'nice_nano_v2',
            pins: {
              [pinId('d0')]: {
                usage: 'kscan' as const,
                kscan: 'k1',
                role: 'input' as const,
              },
              [pinId('d1')]: {
                usage: 'kscan' as const,
                kscan: 'k1',
                role: 'output' as const,
              },
            },
            kscans: [{ id: 'k1', kind: 'matrix' as const, diodes: true }],
            keys: {
              [key.id]: { input: pinId('d0'), output: pinId('d1') },
            },
            encoders: [],
            buses: {},
          },
        ],
      });

      const result = ValidatedKeyboardSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('flags input and output pins from different kscan instances', () => {
      const key = makeKey(0);
      const data = validKeyboard({
        layout: [key],
        parts: [
          {
            name: 'main',
            controller: 'nice_nano_v2',
            pins: {
              [pinId('d0')]: {
                usage: 'kscan' as const,
                kscan: 'k1',
                role: 'input' as const,
              },
              [pinId('d2')]: {
                usage: 'kscan' as const,
                kscan: 'k2',
                role: 'output' as const,
              },
            },
            kscans: [
              { id: 'k1', kind: 'matrix' as const, diodes: true },
              { id: 'k2', kind: 'matrix' as const, diodes: true },
            ],
            keys: {
              [key.id]: { input: pinId('d0'), output: pinId('d2') },
            },
            encoders: [],
            buses: {},
          },
        ],
      });

      const result = ValidatedKeyboardSchema.safeParse(data);
      expect(result.success).toBe(false);
      if (!result.success) {
        const issues = result.error.issues;
        const match = issues.find(
          i =>
            i.message.includes('same kscan instance')
            && i.message.includes('k1')
            && i.message.includes('k2'),
        );
        expect(match).toBeTruthy();
        expect(match!.path).toEqual(['parts', 0, 'keys', key.id]);
      }
    });

    it('allows input and output from same kscan for charlieplex driver', () => {
      const key = makeKey(0);
      const data = validKeyboard({
        layout: [key],
        parts: [
          {
            name: 'main',
            controller: 'nice_nano_v2',
            pins: {
              [pinId('d0')]: {
                usage: 'kscan' as const,
                kscan: 'k1',
                role: 'input' as const,
              },
              [pinId('d1')]: {
                usage: 'kscan' as const,
                kscan: 'k1',
                role: 'output' as const,
              },
            },
            kscans: [{ id: 'k1', kind: 'charlieplex' as const }],
            keys: {
              [key.id]: { input: pinId('d0'), output: pinId('d1') },
            },
            encoders: [],
            buses: {},
          },
        ],
      });

      const result = ValidatedKeyboardSchema.safeParse(data);
      expect(result.success).toBe(true);
    });
  });
});

describe('section 11 — duplicate pin wiring check', () => {
  it('allows two keys with distinct (input, output) pairs', () => {
    const kA = makeKey(0);
    const kB = makeKey(0);
    kA.row = 0; kA.col = 0;
    kB.row = 0; kB.col = 1;
    const data = validKeyboard({
      layout: [kA, kB],
      parts: [
        {
          name: 'main',
          controller: 'nice_nano_v2',
          pins: {
            [pinId('d0')]: { usage: 'kscan' as const, kscan: 'k1', role: 'input' as const },
            [pinId('d1')]: { usage: 'kscan' as const, kscan: 'k1', role: 'output' as const },
            [pinId('d2')]: { usage: 'kscan' as const, kscan: 'k1', role: 'input' as const },
            [pinId('d3')]: { usage: 'kscan' as const, kscan: 'k1', role: 'output' as const },
          },
          kscans: [{ id: 'k1', kind: 'matrix' as const, diodes: true }],
          keys: {
            [kA.id]: { input: pinId('d0'), output: pinId('d1') },
            [kB.id]: { input: pinId('d2'), output: pinId('d3') },
          },
          encoders: [],
          buses: {},
        },
      ],
    });

    const result = ValidatedKeyboardSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('flags two keys sharing the same input+output pin pair', () => {
    const kA = makeKey(0);
    const kB = makeKey(0);
    kA.row = 0; kA.col = 0;
    kB.row = 0; kB.col = 1;
    const data = validKeyboard({
      layout: [kA, kB],
      parts: [
        {
          name: 'main',
          controller: 'nice_nano_v2',
          pins: {
            [pinId('d0')]: { usage: 'kscan' as const, kscan: 'k1', role: 'input' as const },
            [pinId('d1')]: { usage: 'kscan' as const, kscan: 'k1', role: 'output' as const },
          },
          kscans: [{ id: 'k1', kind: 'matrix' as const, diodes: true }],
          keys: {
            [kA.id]: { input: pinId('d0'), output: pinId('d1') },
            [kB.id]: { input: pinId('d0'), output: pinId('d1') },
          },
          encoders: [],
          buses: {},
        },
      ],
    });

    const result = ValidatedKeyboardSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      const match = result.error.issues.find(
        i =>
          i.message.includes('share the same wiring')
          && i.message.includes('d0')
          && i.message.includes('d1')
          && i.message.includes('electrically identical'),
      );
      expect(match).toBeTruthy();
      expect(match!.path).toEqual(['parts', 0]);
    }
  });

  it('flags two direct-kscan keys sharing the same input pin with no output', () => {
    const kA = makeKey(0);
    const kB = makeKey(0);
    kA.row = 0; kA.col = 0;
    kB.row = 0; kB.col = 1;
    const data = validKeyboard({
      layout: [kA, kB],
      parts: [
        {
          name: 'main',
          controller: 'nice_nano_v2',
          pins: {
            [pinId('d0')]: { usage: 'kscan' as const, kscan: 'k1', role: 'input' as const },
          },
          kscans: [{ id: 'k1', kind: 'direct' as const, mode: 'gnd' as const }],
          keys: {
            [kA.id]: { input: pinId('d0') },
            [kB.id]: { input: pinId('d0') },
          },
          encoders: [],
          buses: {},
        },
      ],
    });

    const result = ValidatedKeyboardSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      const match = result.error.issues.find(
        i =>
          i.message.includes('share the same wiring')
          && i.message.includes('d0')
          && i.message.includes('direct kscan'),
      );
      expect(match).toBeTruthy();
      expect(match!.path).toEqual(['parts', 0]);
    }
  });

  it('does not flag keys on different parts with same wiring', () => {
    const kA = makeKey(0);
    const kB = makeKey(1);
    kA.row = 0; kA.col = 0;
    kB.row = 1; kB.col = 0;
    const data = validKeyboard({
      layout: [kA, kB],
      parts: [
        {
          name: 'left',
          controller: 'nice_nano_v2',
          pins: {
            [pinId('d0')]: { usage: 'kscan' as const, kscan: 'k1', role: 'input' as const },
            [pinId('d1')]: { usage: 'kscan' as const, kscan: 'k1', role: 'output' as const },
          },
          kscans: [{ id: 'k1', kind: 'matrix' as const, diodes: true }],
          keys: {
            [kA.id]: { input: pinId('d0'), output: pinId('d1') },
          },
          encoders: [],
          buses: {},
        },
        {
          name: 'right',
          controller: 'nice_nano_v2',
          pins: {
            [pinId('d0')]: { usage: 'kscan' as const, kscan: 'k1', role: 'input' as const },
            [pinId('d1')]: { usage: 'kscan' as const, kscan: 'k1', role: 'output' as const },
          },
          kscans: [{ id: 'k1', kind: 'matrix' as const, diodes: true }],
          keys: {
            [kB.id]: { input: pinId('d0'), output: pinId('d1') },
          },
          encoders: [],
          buses: {},
        },
      ],
    });

    const result = ValidatedKeyboardSchema.safeParse(data);
    expect(result.success).toBe(true);
  });
});
