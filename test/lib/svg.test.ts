import { describe, expect, it } from "vitest";
import { generateKeyboardSvg } from "../../src/lib/templating/svg";
import { getLayouts } from "../../src/lib/physicalLayouts";
import type { Keyboard, Key, KeyboardPart } from "../../src/typedef";

/**
 * Helper to create a minimal KeyboardPart for testing.
 */
function makePart(name: string): KeyboardPart {
  return {
    name,
    controller: "nice_nano_v2",
    wiring: "direct_gnd",
    pins: {},
    keys: {},
    encoders: [],
    buses: [],
  };
}

/**
 * Helper to create a Keyboard from layout keys and optional part configuration.
 * For split keyboards, keys are assigned to parts based on their X position.
 */
function makeKeyboard(
  name: string,
  shield: string,
  keys: Key[],
  parts: KeyboardPart[]
): Keyboard {
  return {
    name,
    shield,
    dongle: false,
    layout: keys,
    parts,
  };
}

/**
 * Assign keys to parts for split keyboards based on their X position.
 * Keys in the left half go to part 0, right half to part 1.
 */
function assignKeysToParts(keys: Key[]): Key[] {
  if (keys.length === 0) return keys;

  // Find the center X position
  const xValues = keys.map((k) => k.x + k.w / 2);
  const minX = Math.min(...xValues);
  const maxX = Math.max(...xValues);
  const centerX = (minX + maxX) / 2;

  return keys.map((k) => ({
    ...k,
    part: k.x + k.w / 2 < centerX ? 0 : 1,
  }));
}

describe("generateKeyboardSvg", () => {
  const layouts = getLayouts();

  describe("split keyboard (Ferris)", () => {
    const ferrisLayout = layouts["Popular Layouts"]?.find(
      (l) => l.name === "Ferris"
    );

    it("should find Ferris layout in presets", () => {
      expect(ferrisLayout).toBeDefined();
      expect(ferrisLayout!.keys.length).toBe(34);
    });

    it("should generate valid SVG for split keyboard", () => {
      const keys = assignKeysToParts(ferrisLayout!.keys);
      const keyboard = makeKeyboard("Ferris", "ferris", keys, [
        makePart("left"),
        makePart("right"),
      ]);

      const svg = generateKeyboardSvg(keyboard);

      // Check SVG structure
      expect(svg).toContain("<svg");
      expect(svg).toContain("</svg>");
      expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
      expect(svg).toContain("viewBox=");
    });

    it("should include CSS with light/dark mode support", () => {
      const keys = assignKeysToParts(ferrisLayout!.keys);
      const keyboard = makeKeyboard("Ferris", "ferris", keys, [
        makePart("left"),
        makePart("right"),
      ]);

      const svg = generateKeyboardSvg(keyboard);

      // Check for style element
      expect(svg).toContain("<style>");
      expect(svg).toContain("</style>");

      // Check for dark mode media query
      expect(svg).toContain("prefers-color-scheme: dark");

      // Check for key styling classes
      expect(svg).toContain(".key-bg");
      expect(svg).toContain(".key-index");
    });

    it("should include key paths for all 34 keys", () => {
      const keys = assignKeysToParts(ferrisLayout!.keys);
      const keyboard = makeKeyboard("Ferris", "ferris", keys, [
        makePart("left"),
        makePart("right"),
      ]);

      const svg = generateKeyboardSvg(keyboard);

      // Count key paths
      const pathMatches = svg.match(/<path class="key-bg/g);
      expect(pathMatches).toHaveLength(34);
    });

    it("should label keys with index numbers", () => {
      const keys = assignKeysToParts(ferrisLayout!.keys);
      const keyboard = makeKeyboard("Ferris", "ferris", keys, [
        makePart("left"),
        makePart("right"),
      ]);

      const svg = generateKeyboardSvg(keyboard);

      // Check for key index text elements
      expect(svg).toContain('class="key-index"');
      // Check specific index numbers
      expect(svg).toContain(">0</text>");
      expect(svg).toContain(">33</text>");
    });

    it("should include part names for split keyboard", () => {
      const keys = assignKeysToParts(ferrisLayout!.keys);
      const keyboard = makeKeyboard("Ferris", "ferris", keys, [
        makePart("left"),
        makePart("right"),
      ]);

      const svg = generateKeyboardSvg(keyboard);

      // Check for part labels
      expect(svg).toContain('class="key-part"');
      expect(svg).toContain(">left</text>");
      expect(svg).toContain(">right</text>");
    });

    it("should include part-specific stroke colors", () => {
      const keys = assignKeysToParts(ferrisLayout!.keys);
      const keyboard = makeKeyboard("Ferris", "ferris", keys, [
        makePart("left"),
        makePart("right"),
      ]);

      const svg = generateKeyboardSvg(keyboard);

      // Check for part color classes
      expect(svg).toContain(".part-0");
      expect(svg).toContain(".part-1");
      expect(svg).toContain('class="key-bg part-0"');
      expect(svg).toContain('class="key-bg part-1"');
    });
  });

  describe("unibody keyboard (60% All 1U)", () => {
    const keyboard60Layout = layouts["60%"]?.find(
      (l) => l.name === "60% All 1U"
    );

    it("should find 60% All 1U layout in presets", () => {
      expect(keyboard60Layout).toBeDefined();
      expect(keyboard60Layout!.keys.length).toBe(66);
    });

    it("should generate valid SVG for unibody keyboard", () => {
      // For unibody, all keys stay on part 0
      const keys = keyboard60Layout!.keys;
      const keyboard = makeKeyboard("60% All 1U", "sixty_percent", keys, [
        makePart("main"),
      ]);

      const svg = generateKeyboardSvg(keyboard);

      // Check SVG structure
      expect(svg).toContain("<svg");
      expect(svg).toContain("</svg>");
      expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    });

    it("should include key paths for all 66 keys", () => {
      const keys = keyboard60Layout!.keys;
      const keyboard = makeKeyboard("60% All 1U", "sixty_percent", keys, [
        makePart("main"),
      ]);

      const svg = generateKeyboardSvg(keyboard);

      // Count key paths
      const pathMatches = svg.match(/<path class="key-bg"/g);
      expect(pathMatches).toHaveLength(66);
    });

    it("should label keys with index numbers only (no part names)", () => {
      const keys = keyboard60Layout!.keys;
      const keyboard = makeKeyboard("60% All 1U", "sixty_percent", keys, [
        makePart("main"),
      ]);

      const svg = generateKeyboardSvg(keyboard);

      // Check for key index text elements
      expect(svg).toContain('class="key-index"');
      expect(svg).toContain(">0</text>");
      expect(svg).toContain(">65</text>");

      // Unibody keyboards should NOT have part labels
      expect(svg).not.toContain('class="key-part"');
    });

    it("should not include part-specific styling for unibody", () => {
      const keys = keyboard60Layout!.keys;
      const keyboard = makeKeyboard("60% All 1U", "sixty_percent", keys, [
        makePart("main"),
      ]);

      const svg = generateKeyboardSvg(keyboard);

      // Should not have part-specific classes
      expect(svg).not.toContain(".part-0");
      expect(svg).not.toContain('class="key-bg part-');
    });
  });

  describe("edge cases", () => {
    it("should handle empty keyboard layout", () => {
      const keyboard = makeKeyboard("Empty", "empty_keyboard", [], [
        makePart("main"),
      ]);

      const svg = generateKeyboardSvg(keyboard);

      expect(svg).toContain("<svg");
      expect(svg).toContain("</svg>");
    });

    it("should escape special characters in part names", () => {
      const keys = [
        {
          id: "test",
          part: 0,
          row: 0,
          col: 0,
          w: 1,
          h: 1,
          x: 0,
          y: 0,
          r: 0,
          rx: 0,
          ry: 0,
        },
        {
          id: "test2",
          part: 1,
          row: 0,
          col: 1,
          w: 1,
          h: 1,
          x: 5,
          y: 0,
          r: 0,
          rx: 0,
          ry: 0,
        },
      ] satisfies Key[];

      const keyboard = makeKeyboard("Special", "special_kb", keys, [
        makePart("left<part>"),
        makePart("right&part"),
      ]);

      const svg = generateKeyboardSvg(keyboard);

      // Check that special characters are escaped
      expect(svg).toContain("&lt;part&gt;");
      expect(svg).toContain("&amp;part");
      expect(svg).not.toContain("<part>");
    });

    it("should use monospace font for key indices", () => {
      const keys = [
        {
          id: "test",
          part: 0,
          row: 0,
          col: 0,
          w: 1,
          h: 1,
          x: 0,
          y: 0,
          r: 0,
          rx: 0,
          ry: 0,
        },
      ] satisfies Key[];

      const keyboard = makeKeyboard("Test", "test_kb", keys, [makePart("main")]);

      const svg = generateKeyboardSvg(keyboard);

      // Check for monospace font family in styles
      expect(svg).toMatch(/\.key-index\s*\{[^}]*font-family:\s*ui-monospace/);
      expect(svg).toMatch(/\.key-index\s*\{[^}]*font-weight:\s*700/);
    });
  });

  describe("SVG output format", () => {
    it("should generate portable SVG with no external dependencies", () => {
      const ferrisLayout = layouts["Popular Layouts"]?.find(
        (l) => l.name === "Ferris"
      );
      const keys = assignKeysToParts(ferrisLayout!.keys);
      const keyboard = makeKeyboard("Ferris", "ferris", keys, [
        makePart("left"),
        makePart("right"),
      ]);

      const svg = generateKeyboardSvg(keyboard);

      // Should not reference external files
      expect(svg).not.toContain("xlink:href");
      expect(svg).not.toContain("<image");
      expect(svg).not.toContain("<use");

      // All styles should be inline
      expect(svg).toContain("<style>");
    });

    it("should have reasonable viewBox dimensions", () => {
      const keyboard60Layout = layouts["60%"]?.find(
        (l) => l.name === "60% All 1U"
      );
      const keys = keyboard60Layout!.keys;
      const keyboard = makeKeyboard("60% All 1U", "sixty_percent", keys, [
        makePart("main"),
      ]);

      const svg = generateKeyboardSvg(keyboard);

      // Extract viewBox values
      const viewBoxMatch = svg.match(/viewBox="([^"]+)"/);
      expect(viewBoxMatch).not.toBeNull();

      const [, viewBox] = viewBoxMatch!;
      const [x, y, width, height] = viewBox.split(" ").map(parseFloat);

      // ViewBox should start at 0,0
      expect(x).toBe(0);
      expect(y).toBe(0);

      // Dimensions should be positive and reasonable
      expect(width).toBeGreaterThan(100);
      expect(height).toBeGreaterThan(100);
      expect(width).toBeLessThan(2000);
      expect(height).toBeLessThan(1000);
    });
  });
});
