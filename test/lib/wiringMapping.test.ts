import { describe, expect, it } from "vitest";
import { loadBusesForController } from "~/components/controllerInfo";
import { copyWiringBetweenParts } from "../../src/lib/wiringMapping";
import type { Key, KeyboardPart, SingleKeyWiring } from "../../src/typedef";

type KeyOverrides = Partial<Pick<Key, "x" | "y" | "w" | "h" | "r" | "rx" | "ry">>;

const baseGeom: KeyOverrides = { x: 0, y: 0, w: 1, h: 1, r: 0, rx: 0, ry: 0 };

function makeKey(id: string, part: number, row: number, col: number, overrides: KeyOverrides = {}): Key {
  return {
    id,
    part,
    row,
    col,
    ...baseGeom,
    ...overrides,
  } as Key;
}

function makePart(name: string, controller: KeyboardPart["controller"], wiring: KeyboardPart["wiring"], pins: KeyboardPart["pins"], keys: Record<string, SingleKeyWiring | undefined> = {}): KeyboardPart {
  return {
    name,
    controller,
    wiring,
    pins,
    keys,
    buses: loadBusesForController(controller),
  };
}

describe("copyWiringBetweenParts", () => {
  it("copies pins, controller, wiring type, and matches keys by row/col", () => {
    const layout: Key[] = [
      makeKey("s1", 0, 0, 0),
      makeKey("s2", 0, 0, 1),
      makeKey("t1", 1, 0, 0),
      makeKey("t2", 1, 0, 1),
    ];

    const source = makePart(
      "left",
      "nice_nano_v2",
      "matrix_diode",
      { p1: "input", p2: "output" },
      {
        s1: { input: "p1" },
        s2: { input: "p1", output: "p2" },
      }
    );

    const target = makePart("right", "xiao_ble", "direct_gnd", {}, {});

    const result = copyWiringBetweenParts({
      layout,
      sourcePartIndex: 0,
      targetPartIndex: 1,
      sourcePart: source,
      targetPart: target,
      transform: "none",
    });

    expect(result.controller).toBe("nice_nano_v2");
    expect(result.wiring).toBe("matrix_diode");
    expect(result.pins).toEqual({ p1: "input", p2: "output" });
    expect(result.keys).toEqual({
      t1: { input: "p1" },
      t2: { input: "p1", output: "p2" },
    });
    expect(result.mapped).toBe(2);
    expect(result.totalTargets).toBe(2);
  });

  it("mirrors horizontally using logical cols", () => {
    const layout: Key[] = [
      makeKey("s_left", 0, 0, 0),
      makeKey("s_right", 0, 0, 1),
      makeKey("t_left", 1, 0, 0),
      makeKey("t_right", 1, 0, 1),
    ];

    const source = makePart(
      "left",
      "nice_nano_v2",
      "matrix_diode",
      { p1: "input" },
      {
        s_left: { input: "p1" },
        s_right: { input: "p1", output: "p1" },
      }
    );
    const target = makePart("right", "xiao_ble", "direct_gnd", {}, {});

    const result = copyWiringBetweenParts({
      layout,
      sourcePartIndex: 0,
      targetPartIndex: 1,
      sourcePart: source,
      targetPart: target,
      transform: "flip-horiz",
    });

    expect(result.keys).toEqual({
      t_left: { input: "p1", output: "p1" },
      t_right: { input: "p1" },
    });
    expect(result.mapped).toBe(2);
  });

  it("best-effort maps when target has extra keys", () => {
    const layout: Key[] = [
      makeKey("s1", 0, 0, 0),
      makeKey("s2", 0, 1, 0),
      makeKey("t1", 1, 0, 0),
      makeKey("t2", 1, 1, 0),
      makeKey("t3", 1, 2, 0),
    ];

    const source = makePart(
      "source",
      "nice_nano_v2",
      "matrix_diode",
      { a: "input" },
      {
        s1: { input: "a" },
        s2: { input: "a" },
      }
    );
    const target = makePart("target", "xiao_ble", "direct_gnd", {}, {});

    const result = copyWiringBetweenParts({
      layout,
      sourcePartIndex: 0,
      targetPartIndex: 1,
      sourcePart: source,
      targetPart: target,
      transform: "none",
    });

    expect(result.keys).toEqual({
      t1: { input: "a" },
      t2: { input: "a" },
    });
    expect(result.mapped).toBe(2);
    expect(result.totalTargets).toBe(3);
    expect(result.keys.t3).toBeUndefined();
  });
});
