import { describe, it, expect } from "vitest";
import { parseNotation as parseLayout } from './colsThumbsParser';

describe('parseLayout', () => {
  // ═══════════════════════════════════════════════════════
  //  §3 / §4 — Input Validation
  // ═══════════════════════════════════════════════════════

  describe("input validation", () => {
    it("rejects empty string", () => {
      expect(() => parseLayout("")).toThrow();
    });

    it("rejects whitespace-only input", () => {
      expect(() => parseLayout("   ")).toThrow();
    });

    it("rejects underscore-only input", () => {
      expect(() => parseLayout("___")).toThrow();
    });

    it("rejects digit 0", () => {
      expect(() => parseLayout("303")).toThrow();
    });

    it("rejects lowercase letter", () => {
      expect(() => parseLayout("3a3")).toThrow();
    });

    it("rejects uppercase non-modifier letter", () => {
      expect(() => parseLayout("3A3")).toThrow();
    });

    it("rejects special characters", () => {
      expect(() => parseLayout("3!3")).toThrow();
      expect(() => parseLayout("3#3")).toThrow();
      expect(() => parseLayout("3.3")).toThrow();
    });

    it("rejects empty chunk from leading +", () => {
      expect(() => parseLayout("+33")).toThrow();
    });

    it("rejects empty chunk from trailing +", () => {
      expect(() => parseLayout("33+")).toThrow();
    });

    it("rejects empty chunk from consecutive +", () => {
      expect(() => parseLayout("33++22")).toThrow();
    });

    it("rejects chunk not starting with digit", () => {
      expect(() => parseLayout("33+v3")).toThrow();
      expect(() => parseLayout("33+^3")).toThrow();
    });

    it("rejects multiple multi-entry chunks in same section", () => {
      expect(() => parseLayout("33+33")).toThrow();
      expect(() => parseLayout("22+33+44")).toThrow();
    });

    it("rejects column entry with horizontal modifier >", () => {
      expect(() => parseLayout("3>3")).toThrow();
    });

    it("rejects column entry with horizontal modifier <", () => {
      expect(() => parseLayout("3<3")).toThrow();
    });

    it("rejects column entry with horizontal modifier r/R", () => {
      expect(() => parseLayout("3r3")).toThrow();
      expect(() => parseLayout("3R3")).toThrow();
    });

    it("rejects column entry with horizontal modifier l/L", () => {
      expect(() => parseLayout("3l3")).toThrow();
      expect(() => parseLayout("3L3")).toThrow();
    });

    it("rejects thumb entry with vertical modifier v/V", () => {
      expect(() => parseLayout("3+3v")).toThrow();
      expect(() => parseLayout("3+3V")).toThrow();
    });

    it("rejects thumb entry with vertical modifier ^", () => {
      expect(() => parseLayout("3+3^")).toThrow();
    });

    it("rejects thumb entry with vertical modifier d/D", () => {
      expect(() => parseLayout("3+3d")).toThrow();
      expect(() => parseLayout("3+3D")).toThrow();
    });

    it("rejects thumb entry with vertical modifier u/U", () => {
      expect(() => parseLayout("3+3u")).toThrow();
      expect(() => parseLayout("3+3U")).toThrow();
    });
  });

  // ═══════════════════════════════════════════════════════
  //  §3 — Lexical Rules
  // ═══════════════════════════════════════════════════════

  describe("lexical rules", () => {
    it("modifier case insensitivity: V ≡ v", () => {
      const lower = parseLayout("2v333");
      const upper = parseLayout("2V333");
      expect(upper.physical).toEqual(lower.physical);
      expect(upper.keymap).toEqual(lower.keymap);
    });

    it("modifier case insensitivity: R ≡ r", () => {
      const lower = parseLayout("33+2r");
      const upper = parseLayout("33+2R");
      expect(upper.physical).toEqual(lower.physical);
    });

    it("modifier case insensitivity: D ≡ d, U ≡ u, L ≡ l", () => {
      const d = parseLayout("2d333");
      const D = parseLayout("2D333");
      expect(D.physical).toEqual(d.physical);

      const u = parseLayout("2u333");
      const U = parseLayout("2U333");
      expect(U.physical).toEqual(u.physical);

      const l = parseLayout("33+2l");
      const L = parseLayout("33+2L");
      expect(L.physical).toEqual(l.physical);
    });

    it("collapses consecutive spaces", () => {
      const single = parseLayout("33 33");
      const multiple = parseLayout("33    33");
      expect(multiple.physical).toEqual(single.physical);
    });

    it("collapses consecutive underscores", () => {
      const single = parseLayout("33_33");
      const multiple = parseLayout("33___33");
      expect(multiple.physical).toEqual(single.physical);
    });

    it("space and underscore are equivalent separators", () => {
      const space = parseLayout("33 33");
      const underscore = parseLayout("33_33");
      expect(underscore.physical).toEqual(space.physical);
    });

    it("mixed separator types collapse", () => {
      const mixed = parseLayout("33 _ 33");
      const space = parseLayout("33 33");
      expect(mixed.physical).toEqual(space.physical);
    });

    it("multi-digit is parsed as separate entries: '12' = entry(1) + entry(2)", () => {
      // "12" → 1 chunk, 2 entries, h=[1,2], 3 keys
      const r = parseLayout("12");
      expect(r.physical).toHaveLength(3);
    });
  });

  // ═══════════════════════════════════════════════════════
  //  §4.3 — Structural Classification
  // ═══════════════════════════════════════════════════════

  describe("structural classification", () => {
    it("1 chunk → columns_only", () => {
      const r = parseLayout("22");
      expect(r.physical).toHaveLength(4);
    });

    it("n≥2, exactly 1 multi-entry chunk → cols_and_thumbs", () => {
      const r = parseLayout("22+1");
      expect(r.physical).toHaveLength(5);
    });

    it("n≥2, all single-entry chunks → thumbs_only", () => {
      const r = parseLayout("2+3");
      expect(r.physical).toHaveLength(5);
    });

    it("single-entry before multi → left thumb", () => {
      const r = parseLayout("2+33+1");
      expect(r.physical).toHaveLength(9);
      expect(r.physical).toContainEqual({ x: 0, y: 3 }); // left thumb
      expect(r.physical).toContainEqual({ x: 1, y: 3 }); // left thumb
    });

    it("single-entry after multi → right thumb", () => {
      const r = parseLayout("33+1");
      expect(r.physical).toContainEqual({ x: 1, y: 3 }); // right thumb, x_start = 2-1 = 1
    });

    it("multiple left and right thumb chunks stack correctly", () => {
      // "1+2+33+1+2" → left(1),left(2),cols(6),right(1),right(2) = 12 keys
      const r = parseLayout("1+2+33+1+2");
      expect(r.physical).toHaveLength(12);
    });

    it("thumb-only: 3+2+1 → 3 left-aligned rows", () => {
      const r = parseLayout("3+2+1");
      expect(r.physical).toHaveLength(6);
      expect(r.physical).toContainEqual({ x: 0, y: 0 });
      expect(r.physical).toContainEqual({ x: 2, y: 0 });
      expect(r.physical).toContainEqual({ x: 0, y: 1 });
      expect(r.physical).toContainEqual({ x: 1, y: 1 });
      expect(r.physical).toContainEqual({ x: 0, y: 2 });
    });
  });

  // ═══════════════════════════════════════════════════════
  //  §4.5 — Modifier Accumulation
  // ═══════════════════════════════════════════════════════

  describe("modifier accumulation", () => {
    it("single v → +0.5 vertical shift", () => {
      const r = parseLayout("1v1");
      expect(r.physical).toContainEqual({ x: 0, y: 0.5 });
      expect(r.physical).toContainEqual({ x: 1, y: 0 });
    });

    it("single ^ → −0.5 vertical shift (triggers normalization)", () => {
      const r = parseLayout("1^1");
      expect(r.physical).toContainEqual({ x: 0, y: 0 });    // normalized
      expect(r.physical).toContainEqual({ x: 1, y: 0.5 });
    });

    it("v^ cancels to zero net shift", () => {
      const cancelled = parseLayout("1v^1");
      const baseline = parseLayout("11");
      expect(cancelled.physical).toEqual(baseline.physical);
    });

    it("vv → +1.0 shift (double accumulation)", () => {
      const r = parseLayout("1vv1");
      expect(r.physical).toContainEqual({ x: 0, y: 1 });
      expect(r.physical).toContainEqual({ x: 1, y: 0 });
    });

    it("vv^ → +0.5 net shift", () => {
      const r = parseLayout("1vv^1");
      expect(r.physical).toContainEqual({ x: 0, y: 0.5 });
    });

    it("single > → +0.5 horizontal thumb shift", () => {
      const r = parseLayout("33+2>");
      expect(r.physical).toContainEqual({ x: 0.5, y: 3 });
      expect(r.physical).toContainEqual({ x: 1.5, y: 3 });
    });

    it("single < → −0.5 horizontal thumb shift (triggers normalization)", () => {
      const r = parseLayout("33+2<");
      expect(r.physical).toContainEqual({ x: 0, y: 3 });
      expect(r.physical).toContainEqual({ x: 1, y: 3 });
    });

    it(">< cancels to zero net horizontal shift", () => {
      const cancelled = parseLayout("33+2><");
      const baseline = parseLayout("33+2");
      expect(cancelled.physical).toEqual(baseline.physical);
    });

    it(">> → +1.0 horizontal shift", () => {
      const r = parseLayout("33+1>>");
      expect(r.physical).toContainEqual({ x: 2, y: 3 });
    });

    it("d ≡ v, u ≡ ^, r ≡ >, l ≡ <", () => {
      expect(parseLayout("1d1").physical).toEqual(parseLayout("1v1").physical);
      expect(parseLayout("1u1").physical).toEqual(parseLayout("1^1").physical);
      expect(parseLayout("33+1r").physical).toEqual(parseLayout("33+1>").physical);
      expect(parseLayout("33+1l").physical).toEqual(parseLayout("33+1<").physical);
    });
  });

  // ═══════════════════════════════════════════════════════
  //  §5 — Physical Layout
  // ═══════════════════════════════════════════════════════

  describe("physical layout", () => {
    it("single key: '1' → (0,0)", () => {
      const r = parseLayout("1");
      expect(r.physical).toEqual([{ x: 0, y: 0 }]);
    });

    it("single column: '3' → 3 keys at x=0", () => {
      const r = parseLayout("3");
      expect(r.physical).toHaveLength(3);
      expect(r.physical).toContainEqual({ x: 0, y: 0 });
      expect(r.physical).toContainEqual({ x: 0, y: 1 });
      expect(r.physical).toContainEqual({ x: 0, y: 2 });
    });

    it("two equal columns: '33' → 2×3 grid", () => {
      const r = parseLayout("33");
      expect(r.physical).toHaveLength(6);
      expect(r.physical).toContainEqual({ x: 0, y: 0 });
      expect(r.physical).toContainEqual({ x: 0, y: 2 });
      expect(r.physical).toContainEqual({ x: 1, y: 0 });
      expect(r.physical).toContainEqual({ x: 1, y: 2 });
    });

    it("max columns: '999999999' → 81 keys", () => {
      const r = parseLayout("999999999");
      expect(r.physical).toHaveLength(81);
      expect(r.physical).toContainEqual({ x: 0, y: 0 });
      expect(r.physical).toContainEqual({ x: 8, y: 8 });
    });

    it("centers shorter column vertically (integer base_y)", () => {
      // h=[1,3], max_h=3 → col 0 base_y = (3-1)/2 = 1
      const r = parseLayout("13");
      expect(r.physical).toContainEqual({ x: 0, y: 1 });
      expect(r.physical).toContainEqual({ x: 1, y: 0 });
      expect(r.physical).toContainEqual({ x: 1, y: 2 });
    });

    it("centers shorter column with half-integer base_y", () => {
      // h=[1,2], max_h=2 → col 0 base_y = (2-1)/2 = 0.5
      const r = parseLayout("12");
      expect(r.physical).toContainEqual({ x: 0, y: 0.5 });
      expect(r.physical).toContainEqual({ x: 1, y: 0 });
      expect(r.physical).toContainEqual({ x: 1, y: 1 });
    });

    it("multiple short columns center symmetrically: '121'", () => {
      const r = parseLayout("121");
      expect(r.physical).toContainEqual({ x: 0, y: 0.5 });
      expect(r.physical).toContainEqual({ x: 1, y: 0 });
      expect(r.physical).toContainEqual({ x: 1, y: 1 });
      expect(r.physical).toContainEqual({ x: 2, y: 0.5 });
    });

    it("left thumb rows are left-aligned (x starts at 0)", () => {
      const r = parseLayout("2+333");
      expect(r.physical).toContainEqual({ x: 0, y: 3 });
      expect(r.physical).toContainEqual({ x: 1, y: 3 });
    });

    it("right thumb rows are right-aligned (x_start = c − k)", () => {
      const r = parseLayout("333+2");
      // x_start = 3 - 2 = 1
      expect(r.physical).toContainEqual({ x: 1, y: 3 });
      expect(r.physical).toContainEqual({ x: 2, y: 3 });
    });

    it("thumb rows stack below section_bottom + 1", () => {
      // h=[3,3] → section_bottom = 2, thumb at y = 3
      const r = parseLayout("33+2");
      expect(r.physical).toContainEqual({ x: 0, y: 3 });
      expect(r.physical).toContainEqual({ x: 1, y: 3 });
    });

    it("left thumbs placed on earlier rows than right thumbs", () => {
      // "2+33+1" → left at y=3, right at y=4
      const r = parseLayout("2+33+1");
      expect(r.physical).toContainEqual({ x: 0, y: 3 }); // left
      expect(r.physical).toContainEqual({ x: 1, y: 3 }); // left
      expect(r.physical).toContainEqual({ x: 1, y: 4 }); // right (x_start=2-1=1)
    });

    it("thumb-only section: section_bottom = −1, thumbs start at y=0", () => {
      const r = parseLayout("2+3");
      expect(r.physical).toHaveLength(5);
      expect(r.physical).toContainEqual({ x: 0, y: 0 });
      expect(r.physical).toContainEqual({ x: 1, y: 0 });
      expect(r.physical).toContainEqual({ x: 0, y: 1 });
      expect(r.physical).toContainEqual({ x: 1, y: 1 });
      expect(r.physical).toContainEqual({ x: 2, y: 1 });
    });

    it("modifier shifts column position physically", () => {
      const r = parseLayout("2v333+2>");
      // Col 0: base(0,0.5),(0,1.5), offset(0,+0.5) → phys(0,1),(0,2)
      expect(r.physical).toContainEqual({ x: 0, y: 1 });
      expect(r.physical).toContainEqual({ x: 0, y: 2 });
    });

    it("normalizes negative y coordinates to ≥ 0", () => {
      const r = parseLayout("1^1");
      for (const k of r.physical) expect(k.y).toBeGreaterThanOrEqual(0);
    });

    it("normalizes negative x coordinates to ≥ 0", () => {
      const r = parseLayout("1<+33");
      for (const k of r.physical) expect(k.x).toBeGreaterThanOrEqual(0);
    });

    it("normalizes combined negative x and y", () => {
      // "1<+1^1" → left thumb at (-0.5, 1), col 0 at (0, -0.5)... hmm
      // Actually "1<+1^1" → chunks: "1<", "1^1"
      // "1<" has 1 entry, "1^1" has 2 entries. |multi|=1. cols_and_thumbs.
      // Left thumb: 1 key, shift=-0.5, at y=section_bottom+1
      // cols h=[1,1], col 1 shift=-0.5.
      // max_h=1. col 0: base(0,0), phys(0,0). col 1: base(1,0), offset(0,-0.5), phys(1,-0.5).
      // section_bottom = max(0, -0.5) = 0. Left thumb at y=1.
      // Thumb: base(0,1), offset(-0.5,0), phys(-0.5,1).
      // min_x=-0.5, min_y=-0.5. dx=0.5, dy=0.5.
      const r = parseLayout("1<+1^1");
      for (const k of r.physical) {
        expect(k.x).toBeGreaterThanOrEqual(0);
        expect(k.y).toBeGreaterThanOrEqual(0);
      }
    });

    it("right thumb with count > columns produces negative x_start (normalizes)", () => {
      // "33+5" → x_start = 2-5 = -3
      const r = parseLayout("33+5");
      for (const k of r.physical) expect(k.x).toBeGreaterThanOrEqual(0);
      expect(r.physical).toHaveLength(11);
    });

    it("arranges two sections with 1U edge-to-edge gap", () => {
      // "3 3" → sec 0 max_x=0, sec 1 offset=0+0+2=2
      const r = parseLayout("3 3");
      expect(r.physical).toContainEqual({ x: 0, y: 0 });
      expect(r.physical).toContainEqual({ x: 0, y: 2 });
      expect(r.physical).toContainEqual({ x: 2, y: 0 });
      expect(r.physical).toContainEqual({ x: 2, y: 2 });
    });

    it("gap accounts for modifier extent on section width", () => {
      // "33+2> 3" → sec 0 cols h=[3,3], right thumb k=2 shift=+0.5
      // sec 0: max_x_phys = 1.5 (rightmost thumb at x=1.5)
      // sec 1 offset = 0 + 1.5 + 2 = 3.5
      const r = parseLayout("33+2> 3");
      expect(r.physical).toContainEqual({ x: 1.5, y: 3 }); // sec 0 rightmost thumb
      expect(r.physical).toContainEqual({ x: 3.5, y: 0 }); // sec 1 col 0
    });

    it("three sections arranged left to right", () => {
      // "3 3 3" → offsets: 0, 2, 4
      const r = parseLayout("3 3 3");
      expect(r.physical).toContainEqual({ x: 0, y: 0 });
      expect(r.physical).toContainEqual({ x: 2, y: 0 });
      expect(r.physical).toContainEqual({ x: 4, y: 0 });
    });

    it("sections of different widths arrange correctly", () => {
      // "3 33" → sec 0 max_x=0, sec 1 offset=0+0+2=2
      const r = parseLayout("3 33");
      expect(r.physical).toContainEqual({ x: 0, y: 0 }); // sec 0
      expect(r.physical).toContainEqual({ x: 2, y: 0 }); // sec 1 col 0
      expect(r.physical).toContainEqual({ x: 3, y: 0 }); // sec 1 col 1
    });

    it("output returns {keymap, physical} with correct shape", () => {
      const r = parseLayout("3");
      expect(r).toHaveProperty("keymap");
      expect(r).toHaveProperty("physical");
      expect(Array.isArray(r.keymap)).toBe(true);
      expect(Array.isArray(r.physical)).toBe(true);
      expect(typeof r.keymap[0].x).toBe("number");
      expect(typeof r.keymap[0].y).toBe("number");
    });
  });

  // ═══════════════════════════════════════════════════════
  //  §6 — Keymap Layout
  // ═══════════════════════════════════════════════════════

  describe("keymap layout", () => {
    it("integer bases + zero offsets → keymap equals physical", () => {
      const r = parseLayout("333");
      for (let i = 0; i < r.physical.length; i++) {
        expect(r.keymap[i].x).toBe(r.physical[i].x);
        expect(r.keymap[i].y).toBe(r.physical[i].y);
      }
    });

    it("rounds half-integer base_y upward (0.5 → 1)", () => {
      // "12" → col 0 base_y=0.5, round(0.5)=1
      const r = parseLayout("12");
      expect(r.keymap).toContainEqual({ x: 0, y: 1 });
      expect(r.keymap).toContainEqual({ x: 1, y: 0 });
      expect(r.keymap).toContainEqual({ x: 1, y: 1 });
    });

    it("rounds half-integer section offset (3.5 → 4)", () => {
      // "33+2> 3" → sec 1 offset=3.5. round(0+3.5)=4
      const r = parseLayout("33+2> 3");
      expect(r.keymap).toContainEqual({ x: 4, y: 0 });
    });

    it("round(8.5) = 9 for section offset in keymap", () => {
      // Example 2: sec 2 col 3 at round(3+5.5)=round(8.5)=9
      const r = parseLayout("2v333+2> 3+13332^ 33");
      expect(r.keymap).toContainEqual({ x: 9, y: 0 });
      expect(r.keymap).toContainEqual({ x: 9, y: 1 });
      expect(r.keymap).toContainEqual({ x: 9, y: 2 });
    });

    it("round(9.5) = 10 for section offset in keymap", () => {
      // Example 2: sec 2 col 4 at round(4+5.5)=round(9.5)=10
      const r = parseLayout("2v333+2> 3+13332^ 33");
      expect(r.keymap).toContainEqual({ x: 10, y: 1 });
      expect(r.keymap).toContainEqual({ x: 10, y: 2 });
    });

    it("trunc(0.5)=0: single modifier produces 0 keymap displacement", () => {
      // "1v1" → col 0: keymap_y = round(0) + trunc(0.5) = 0
      const r = parseLayout("1v1");
      expect(r.keymap).toContainEqual({ x: 0, y: 0 });
      expect(r.keymap).toContainEqual({ x: 1, y: 0 });
    });

    it("trunc(−0.5)=0: single negative modifier also 0 displacement", () => {
      const r = parseLayout("1^1");
      expect(r.keymap).toContainEqual({ x: 0, y: 0 });
    });

    it("trunc(1.0)=1: double modifier produces ±1 displacement", () => {
      const r = parseLayout("1vv1");
      expect(r.keymap).toContainEqual({ x: 0, y: 1 });
      expect(r.keymap).toContainEqual({ x: 1, y: 0 });
    });

    it("thumb > shift: trunc(0.5)=0, keymap x unchanged", () => {
      const r = parseLayout("33+2>");
      expect(r.keymap).toContainEqual({ x: 0, y: 3 });
      expect(r.keymap).toContainEqual({ x: 1, y: 3 });
    });

    it("thumb >> shift: trunc(1.0)=1, keymap x shifts by 1", () => {
      const r = parseLayout("33+1>>");
      expect(r.keymap).toContainEqual({ x: 2, y: 3 });
    });

    it("global normalization makes all keymap coords ≥ 0", () => {
      // "33+2<<" → thumb shift=−1.0, keymap_x can be −1
      const r = parseLayout("33+2<<");
      for (const k of r.keymap) {
        expect(k.x).toBeGreaterThanOrEqual(0);
        expect(k.y).toBeGreaterThanOrEqual(0);
      }
    });

    it("global normalization shifts are uniform integers", () => {
      // "33+2<<" → was (-1,3),(0,3) → (0,3),(1,3) after +1
      const r = parseLayout("33+2<<");
      expect(r.keymap).toContainEqual({ x: 0, y: 3 });
      expect(r.keymap).toContainEqual({ x: 1, y: 3 });
    });

    it("keymap uses original (pre-normalization) bases", () => {
      // "1^1" → col 1 has physical (1, 0.5) but keymap (1, 0)
      const r = parseLayout("1^1");
      expect(r.physical).toContainEqual({ x: 1, y: 0.5 });
      expect(r.keymap).toContainEqual({ x: 1, y: 0 });
    });

    it("keymap y-negative normalization from ^^ modifier", () => {
      // "1^^1" → col 0 offset=−1.0, keymap_y = round(0) + trunc(−1.0) = −1
      const r = parseLayout("1^^1");
      for (const k of r.keymap) {
        expect(k.x).toBeGreaterThanOrEqual(0);
        expect(k.y).toBeGreaterThanOrEqual(0);
      }
    });

    it("different sections never share keymap x coordinates (Type D)", () => {
      const r = parseLayout("333 333");
      const sec1Xs = new Set(r.keymap.slice(0, 9).map((k) => k.x));
      const sec2Xs = new Set(r.keymap.slice(9).map((k) => k.x));
      for (const x of sec1Xs) expect(sec2Xs.has(x)).toBe(false);
    });

    it("column vs thumb keymap_y never collide (Type C)", () => {
      // "2^2+1" → column max keymap_y < thumb keymap_y
      const r = parseLayout("2^2+1");
      const seen = new Set<string>();
      for (const k of r.keymap) {
        const key = `${k.x},${k.y}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    });

    it("no keymap collisions across diverse inputs", () => {
      const inputs = [
        "1", "2", "3", "9",
        "11", "22", "33", "99",
        "111", "123", "321", "121",
        "999999999",
        "2+3", "3+2+1",
        "33+1", "1+33",
        "2+33+1", "1+2+33+1+2",
        "1v1", "1^1", "1vv1", "1vv^1", "1v^1",
        "33+2>", "33+2<", "33+2>>", "33+2<<", "33+2><",
        "33+1>", "33+1>>",
        "1<+33", "1^^1", "1^^^1",
        "1<+33+1<",
        "3 3", "3 3 3",
        "33 33", "11 11",
        "33+2> 3",
        "33333+3 2+333331",
        "2v333+2> 3+13332^ 33",
        "2^2+1",
        "1v1 1",
        "9 9",
        "33+5",
        "1<+1^1",
      ];

      for (const input of inputs) {
        const r = parseLayout(input);
        const seen = new Set<string>();
        for (const k of r.keymap) {
          const key = `${k.x},${k.y}`;
          expect(
            seen.has(key),
            `Keymap collision at (${k.x},${k.y}) for "${input}"`
          ).toBe(false);
          seen.add(key);
        }
      }
    });
  });

  // ═══════════════════════════════════════════════════════
  //  §7 — Worked Examples
  // ═══════════════════════════════════════════════════════

  describe("worked examples", () => {
    it("Example 1: '33333+3 2+333331' — physical and keymap", () => {
      const r = parseLayout("33333+3 2+333331");

      // Section 1: 15 cols + 3 thumbs = 18
      // Section 2: 2 thumbs + 16 cols = 18
      expect(r.physical).toHaveLength(36);
      expect(r.keymap).toHaveLength(36);

      // ── Section 1: columns (0–4, 0–2), right thumb (2–4, 3) ──
      for (let x = 0; x <= 4; x++)
        for (let y = 0; y <= 2; y++)
          expect(r.physical).toContainEqual({ x, y });
      expect(r.physical).toContainEqual({ x: 2, y: 3 });
      expect(r.physical).toContainEqual({ x: 3, y: 3 });
      expect(r.physical).toContainEqual({ x: 4, y: 3 });

      // ── Section 2 (offset +6): left thumb, columns, col 5 ──
      expect(r.physical).toContainEqual({ x: 6, y: 3 });
      expect(r.physical).toContainEqual({ x: 7, y: 3 });
      for (let x = 6; x <= 10; x++)
        for (let y = 0; y <= 2; y++)
          expect(r.physical).toContainEqual({ x, y });
      expect(r.physical).toContainEqual({ x: 11, y: 1 }); // col 5, h=1, centered at y=1

      // No modifiers → keymap equals physical
      expect(r.keymap).toEqual(r.physical);
    });

    it("Example 1 gap verification: 1U edge-to-edge between sections", () => {
      const r = parseLayout("33333+3 2+333331");
      // Sec 1 rightmost center = 4, right edge = 4.5
      // Sec 2 leftmost center = 6, left edge = 5.5
      // Gap = 5.5 − 4.5 = 1.0
      expect(r.physical).toContainEqual({ x: 4, y: 0 });  // sec 1 rightmost
      expect(r.physical).toContainEqual({ x: 6, y: 0 });  // sec 2 leftmost
    });

    it("Example 2: '2v333+2> 3+13332^ 33' — physical layout", () => {
      const r = parseLayout("2v333+2> 3+13332^ 33");

      expect(r.physical).toHaveLength(34);

      // Section 1: col 0 shifted up
      expect(r.physical).toContainEqual({ x: 0, y: 1 });   // col 0, row 0
      expect(r.physical).toContainEqual({ x: 0, y: 2 });   // col 0, row 1
      for (const y of [0, 1, 2]) {
        expect(r.physical).toContainEqual({ x: 1, y });
        expect(r.physical).toContainEqual({ x: 2, y });
        expect(r.physical).toContainEqual({ x: 3, y });
      }
      // Right thumb with > shift
      expect(r.physical).toContainEqual({ x: 2.5, y: 3 });
      expect(r.physical).toContainEqual({ x: 3.5, y: 3 });

      // Section 2 (offset 5.5): left thumbs, columns, col 4 with ^ shift
      expect(r.physical).toContainEqual({ x: 5.5, y: 3 });
      expect(r.physical).toContainEqual({ x: 6.5, y: 3 });
      expect(r.physical).toContainEqual({ x: 7.5, y: 3 });
      expect(r.physical).toContainEqual({ x: 5.5, y: 1 }); // col 0, h=1, centered
      for (const y of [0, 1, 2]) {
        expect(r.physical).toContainEqual({ x: 6.5, y });
        expect(r.physical).toContainEqual({ x: 7.5, y });
        expect(r.physical).toContainEqual({ x: 8.5, y });
      }
      // Col 4 with ^: physical y shifted down by 0.5
      expect(r.physical).toContainEqual({ x: 9.5, y: 0 }); // base 0.5 + offset −0.5
      expect(r.physical).toContainEqual({ x: 9.5, y: 1 }); // base 1.5 + offset −0.5

      // Section 3 (offset 11.5)
      for (const y of [0, 1, 2]) {
        expect(r.physical).toContainEqual({ x: 11.5, y });
        expect(r.physical).toContainEqual({ x: 12.5, y });
      }
    });

    it("Example 2: '2v333+2> 3+13332^ 33' — keymap layout", () => {
      const r = parseLayout("2v333+2> 3+13332^ 33");

      expect(r.keymap).toHaveLength(34);

      // Section 1 keymap
      expect(r.keymap).toContainEqual({ x: 0, y: 1 }); // col 0 row 0: round(0.5)+trunc(0.5)=1
      expect(r.keymap).toContainEqual({ x: 0, y: 2 }); // col 0 row 1: round(1.5)+0=2
      for (const y of [0, 1, 2]) {
        expect(r.keymap).toContainEqual({ x: 1, y });
        expect(r.keymap).toContainEqual({ x: 2, y });
        expect(r.keymap).toContainEqual({ x: 3, y });
      }
      expect(r.keymap).toContainEqual({ x: 2, y: 3 }); // thumb: round(2)+trunc(0.5)=2+0
      expect(r.keymap).toContainEqual({ x: 3, y: 3 }); // thumb: round(3)+0

      // Section 2 keymap (section_offset=5.5)
      expect(r.keymap).toContainEqual({ x: 6, y: 3 });  // round(0+5.5)=6
      expect(r.keymap).toContainEqual({ x: 7, y: 3 });  // round(1+5.5)=7
      expect(r.keymap).toContainEqual({ x: 8, y: 3 });  // round(2+5.5)=8
      expect(r.keymap).toContainEqual({ x: 6, y: 1 });  // col 0
      for (const y of [0, 1, 2]) {
        expect(r.keymap).toContainEqual({ x: 7, y });
        expect(r.keymap).toContainEqual({ x: 8, y });
        expect(r.keymap).toContainEqual({ x: 9, y });  // round(3+5.5)=round(8.5)=9
      }
      // Col 4: round(4+5.5)=round(9.5)=10, round(0.5)+trunc(−0.5)=1+0=1
      expect(r.keymap).toContainEqual({ x: 10, y: 1 });
      expect(r.keymap).toContainEqual({ x: 10, y: 2 });

      // Section 3 keymap (section_offset=11.5)
      for (const y of [0, 1, 2]) {
        expect(r.keymap).toContainEqual({ x: 12, y }); // round(0+11.5)=12
        expect(r.keymap).toContainEqual({ x: 13, y }); // round(1+11.5)=round(12.5)=13
      }
    });

    it("Example 2: keymap collision-free", () => {
      const r = parseLayout("2v333+2> 3+13332^ 33");
      const seen = new Set<string>();
      for (const k of r.keymap) {
        const key = `${k.x},${k.y}`;
        expect(seen.has(key), `Collision at ${key}`).toBe(false);
        seen.add(key);
      }
      expect(seen.size).toBe(34);
    });
  });
});
