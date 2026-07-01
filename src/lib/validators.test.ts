import { describe, it, expect } from "vitest";
import { ulid } from "ulidx";
import type { Key, KeyId, PinId } from "~/types";
import { ValidatedKeyboardSchema } from "./validators";

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
    name: "test",
    shield: "my_shield",
    dongle: false,
    modules: [],
    layout: [],
    parts: [],
    ...overrides,
  };
}

describe("ValidatedKeyboardSchema", () => {
  describe("section 10 — key wiring kscan-instance check", () => {
    it("allows input and output pins from the same kscan instance", () => {
      const key = makeKey(0);
      const data = validKeyboard({
        layout: [key],
        parts: [
          {
            name: "main",
            controller: "nice_nano_v2",
            pins: {
              [pinId("d0")]: {
                usage: "kscan" as const,
                kscan: "k1",
                role: "input" as const,
              },
              [pinId("d1")]: {
                usage: "kscan" as const,
                kscan: "k1",
                role: "output" as const,
              },
            },
            kscans: [{ id: "k1", kind: "matrix" as const, diodes: true }],
            keys: {
              [key.id]: { input: pinId("d0"), output: pinId("d1") },
            },
            encoders: [],
            buses: {},
          },
        ],
      });

      const result = ValidatedKeyboardSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it("flags input and output pins from different kscan instances", () => {
      const key = makeKey(0);
      const data = validKeyboard({
        layout: [key],
        parts: [
          {
            name: "main",
            controller: "nice_nano_v2",
            pins: {
              [pinId("d0")]: {
                usage: "kscan" as const,
                kscan: "k1",
                role: "input" as const,
              },
              [pinId("d2")]: {
                usage: "kscan" as const,
                kscan: "k2",
                role: "output" as const,
              },
            },
            kscans: [
              { id: "k1", kind: "matrix" as const, diodes: true },
              { id: "k2", kind: "matrix" as const, diodes: true },
            ],
            keys: {
              [key.id]: { input: pinId("d0"), output: pinId("d2") },
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
          (i) =>
            i.message.includes("same kscan instance") &&
            i.message.includes("k1") &&
            i.message.includes("k2"),
        );
        expect(match).toBeTruthy();
        expect(match!.path).toEqual(["parts", 0, "keys", key.id]);
      }
    });

    it("allows input and output from same kscan for charlieplex driver", () => {
      const key = makeKey(0);
      const data = validKeyboard({
        layout: [key],
        parts: [
          {
            name: "main",
            controller: "nice_nano_v2",
            pins: {
              [pinId("d0")]: {
                usage: "kscan" as const,
                kscan: "k1",
                role: "input" as const,
              },
              [pinId("d1")]: {
                usage: "kscan" as const,
                kscan: "k1",
                role: "output" as const,
              },
            },
            kscans: [{ id: "k1", kind: "charlieplex" as const }],
            keys: {
              [key.id]: { input: pinId("d0"), output: pinId("d1") },
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
