import { describe, it, expect } from 'vitest';
import { parseNotation } from './colsThumbsParser';

describe('parseNotation', () => {
  // -----------------------------------------------------------------------
  // Valid inputs – structural correctness
  // -----------------------------------------------------------------------
  describe('valid inputs', () => {
    it('parses a single column‑only section', () => {
      // "22" is two entries (two columns) of height 2 each.
      // "222" would be three columns – the original test used "222" by mistake.
      const { physical, keymap } = parseNotation('22');
      const expected = [
        { x: 0, y: 0 }, { x: 0, y: 1 },
        { x: 1, y: 0 }, { x: 1, y: 1 },
      ];
      expect(physical).toEqual(expected);
      expect(keymap).toEqual(expected); // no modifiers, integer coords
    });

    it('parses a section with left thumbs only (cols_and_thumbs)', () => {
      const { physical, keymap } = parseNotation('2+333');
      // left thumb 2 keys, columns 333 (3 cols height 3)
      // thumb row at section_bottom+1 = 2+1=3? column max base_y = 2 (height 3, base_y 0,1,2), section_bottom=2, thumb_y=3
      // left thumb keys: (0,3),(1,3)
      // columns: (0,0),(0,1),(0,2),(1,0),(1,1),(1,2),(2,0),(2,1),(2,2)
      const expectedPhysical = [
        { x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 },
        { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 },
        { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 2, y: 2 },
        { x: 0, y: 3 }, { x: 1, y: 3 },
      ];
      expect(physical).toEqual(expectedPhysical);
      expect(keymap).toEqual(expectedPhysical);
    });

    it('parses a section with right thumbs only', () => {
      const { physical, keymap } = parseNotation('333+2');
      // columns 333 (height 3 each, 3 cols), right thumb 2 keys
      // thumb y = 3 (section_bottom=2), right‑aligned: x_start = 3-2=1, keys (1,3),(2,3)
      // order: columns first, then right thumbs
      const expectedPhysical = [
        { x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 },
        { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 },
        { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 2, y: 2 },
        { x: 1, y: 3 }, { x: 2, y: 3 },
      ];
      expect(physical).toEqual(expectedPhysical);
      expect(keymap).toEqual(expectedPhysical);
    });

    it('parses a thumbs‑only section (no columns)', () => {
      const { physical, keymap } = parseNotation('2+3');
      // thumb‑only: all chunks left‑aligned, stacked top‑to‑bottom starting at y=0
      // row0: 2 keys (0,0),(1,0); row1: 3 keys (0,1),(1,1),(2,1)
      const expected = [
        { x: 0, y: 0 }, { x: 1, y: 0 },
        { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 },
      ];
      expect(physical).toEqual(expected);
      expect(keymap).toEqual(expected);
    });

    it('handles multiple sections separated by spaces', () => {
      // Two column‑only sections: '22 33'
      const { physical, keymap } = parseNotation('22 33');
      // section 1: 2 cols height 2 → (0,0),(0,1),(1,0),(1,1), max_x_phys=1
      // section 2: offset = 1+2=3 → (3,0),(3,1),(3,2),(4,0),(4,1),(4,2)
      const expectedPhysical = [
        { x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 }, { x: 1, y: 1 },
        { x: 3, y: 0 }, { x: 3, y: 1 }, { x: 3, y: 2 },
        { x: 4, y: 0 }, { x: 4, y: 1 }, { x: 4, y: 2 },
      ];
      expect(physical).toEqual(expectedPhysical);
      expect(keymap).toEqual(expectedPhysical);
    });

    it('handles underscore as separator', () => {
      const { physical } = parseNotation('2_2');
      // same as '2 2' → two single‑column sections? Actually '2' is a chunk with one entry height 2, so column‑only section with 1 column height 2.
      // section1: keys (0,0),(0,1) max_x=0, section2 offset=0+0+2=2 → keys (2,0),(2,1)
      expect(physical).toEqual([
        { x: 0, y: 0 }, { x: 0, y: 1 },
        { x: 2, y: 0 }, { x: 2, y: 1 },
      ]);
    });

    it('collapses consecutive separators (spaces/underscores)', () => {
      const a = parseNotation('22  33');
      const b = parseNotation('22_ __33'); // underscores and spaces
      expect(a.physical).toEqual(b.physical);
      expect(a.keymap).toEqual(b.keymap);
    });
  });

  // -----------------------------------------------------------------------
  // Modifier handling – column vertical shifts
  // -----------------------------------------------------------------------
  describe('column vertical modifiers', () => {
    it('shifts column down with v', () => {
      const { physical, keymap } = parseNotation('1v2');
      // col0 base_y 0.5, offset +0.5 → physical y=1.0
      // col1 base_y 0,1, offset 0
      const expectedPhysical = [
        { x: 0, y: 1.0 },
        { x: 1, y: 0.0 }, { x: 1, y: 1.0 },
      ];
      const expectedKeymap = [
        { x: 0, y: 1 },
        { x: 1, y: 0 }, { x: 1, y: 1 },
      ];
      expect(physical).toEqual(expectedPhysical);
      expect(keymap).toEqual(expectedKeymap);
    });

    it('shifts column up with ^', () => {
      const { physical, keymap } = parseNotation('1^2');
      // col0 physical y = 0.5 + (-0.5) = 0
      // col1 y = 0,1
      // No normalisation needed (min_y=0)
      const expectedPhysical = [
        { x: 0, y: 0.0 },
        { x: 1, y: 0.0 }, { x: 1, y: 1.0 },
      ];
      const expectedKeymap = [
        { x: 0, y: 1 },        // round(0.5)+trunc(-0.5)=1+0=1
        { x: 1, y: 0 }, { x: 1, y: 1 },
      ];
      expect(physical).toEqual(expectedPhysical);
      expect(keymap).toEqual(expectedKeymap);
    });

    it('cancels opposing vertical modifiers', () => {
      // '2v^' → column entry 2 with v and ^ → net shift 0
      const { physical, keymap } = parseNotation('2v^');
      // behaves exactly like '2'
      const expected = [
        { x: 0, y: 0 }, { x: 0, y: 1 },
      ];
      expect(physical).toEqual(expected);
      expect(keymap).toEqual(expected);
    });

    it('accumulates multiple same‑direction vertical modifiers', () => {
      // '2vv' → net +1.0
      const { physical, keymap } = parseNotation('2vv');
      // col height 2, base_y=0,1, offset +1.0 → physical (0,1.0),(0,2.0)
      expect(physical).toEqual([
        { x: 0, y: 1.0 }, { x: 0, y: 2.0 },
      ]);
      // keymap: base 0→round=0, trunc(1)=1 → (0,1); base 1→round=1, trunc(1)=1 → (0,2)
      expect(keymap).toEqual([
        { x: 0, y: 1 }, { x: 0, y: 2 },
      ]);
    });

    it('handles v and d interchangeably (case and synonyms)', () => {
      const { physical: p1 } = parseNotation('1V');
      const { physical: p2 } = parseNotation('1d');
      const { physical: p3 } = parseNotation('1v');
      expect(p1).toEqual(p2);
      expect(p2).toEqual(p3);
    });
  });

  // -----------------------------------------------------------------------
  // Modifier handling – thumb horizontal shifts
  // -----------------------------------------------------------------------
  describe('thumb horizontal modifiers', () => {
    it('shifts thumb right with >', () => {
      // Use a column part with *multiple entries* so it’s cols_and_thumbs.
      const { physical, keymap } = parseNotation('33+2>');
      // columns: 2 cols height 3 → 6 keys, thumb: right-aligned 2 keys shift +0.5
      const expectedPhysical = [
        { x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 },
        { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 },
        { x: 0.5, y: 3 }, { x: 1.5, y: 3 },  // right thumb y=3
      ];
      const expectedKeymap = [
        { x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 },
        { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 },
        { x: 0, y: 3 }, { x: 1, y: 3 },        // trunc(0.5)=0
      ];
      expect(physical).toEqual(expectedPhysical);
      expect(keymap).toEqual(expectedKeymap);
    });

    it('shifts thumb left with <', () => {
      const { physical, keymap } = parseNotation('33+2<');
      // columns 2 cols height 3, right thumb 2 keys shift -0.5
      // right-aligned: x_start = 2-2=0 → (0,3),(1,3) + offset -0.5 → (-0.5,3),(0.5,3)
      // normalisation: min_x=-0.5, dx=0.5 → column keys shift to 0.5,1.5; thumbs to 0,1
      const expectedPhysical = [
        { x: 0.5, y: 0 }, { x: 0.5, y: 1 }, { x: 0.5, y: 2 },
        { x: 1.5, y: 0 }, { x: 1.5, y: 1 }, { x: 1.5, y: 2 },
        { x: 0, y: 3 }, { x: 1, y: 3 },
      ];
      const expectedKeymap = [
        { x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 },
        { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 },
        { x: 0, y: 3 }, { x: 1, y: 3 },
      ];
      expect(physical).toEqual(expectedPhysical);
      expect(keymap).toEqual(expectedKeymap);
    });

    it('cancels opposing horizontal modifiers', () => {
      const { physical, keymap } = parseNotation('33+1><');
      // right thumb 1 key, net shift 0
      const expectedPhysical = [
        { x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 },
        { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 },
        { x: 1, y: 3 },                        // right-aligned, c=2, k=1 → x=1
      ];
      expect(physical).toEqual(expectedPhysical);
      expect(keymap).toEqual(expectedPhysical);
    });

    it('accumulates multiple horizontal shifts', () => {
      // left thumb '2>>' (two right shifts = +1.0)
      const { physical, keymap } = parseNotation('2>>+33'); // 1 col height 2? '2>>' as left thumb? Wait classification: '2>>+33' -> chunks: '2>>' (1 entry) and '33' (2 entries) -> cols_and_thumbs, column part=33, left thumb=2>>. So column 2 cols height 3, thumb 2 keys shift +1.0.
      // thumb y = 3, left thumb keys base (0,3),(1,3) + offset 1.0 -> (1,3),(2,3)
      expect(physical).toEqual([
        { x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 },
        { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 },
        { x: 1, y: 3 }, { x: 2, y: 3 },
      ]);
      // keymap: trunc(1)=1 -> thumb (1,3),(2,3)
      expect(keymap).toEqual([
        { x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 },
        { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 },
        { x: 1, y: 3 }, { x: 2, y: 3 },
      ]);
    });

    it('treats r/l and R/L as right/left', () => {
      const p1 = parseNotation('2+1r');
      const p2 = parseNotation('2+1>');
      expect(p1.physical).toEqual(p2.physical);
      expect(p1.keymap).toEqual(p2.keymap);
    });
  });

  // -----------------------------------------------------------------------
  // Spec examples – column‑first ordering within sections
  // -----------------------------------------------------------------------
  describe('spec examples', () => {
    it('example 1: 33333+3 2+333331', () => {
      const { physical, keymap } = parseNotation('33333+3 2+333331');
      // Detailed expected coordinates from spec — columns are emitted before thumbs (§5.3–5.4)
      const expectedPhysical = [
        // Section 1 – columns then right thumb
        { x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 },
        { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 },
        { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 2, y: 2 },
        { x: 3, y: 0 }, { x: 3, y: 1 }, { x: 3, y: 2 },
        { x: 4, y: 0 }, { x: 4, y: 1 }, { x: 4, y: 2 },
        { x: 2, y: 3 }, { x: 3, y: 3 }, { x: 4, y: 3 }, // right thumb (right‑aligned)
        // Section 2 (offset 4+2=6) — columns first, then left thumbs
        { x: 6, y: 0 }, { x: 6, y: 1 }, { x: 6, y: 2 }, // col0 height 3
        { x: 7, y: 0 }, { x: 7, y: 1 }, { x: 7, y: 2 }, // col1
        { x: 8, y: 0 }, { x: 8, y: 1 }, { x: 8, y: 2 }, // col2
        { x: 9, y: 0 }, { x: 9, y: 1 }, { x: 9, y: 2 }, // col3
        { x: 10, y: 0 }, { x: 10, y: 1 }, { x: 10, y: 2 }, // col4 height 3 (fifth column, index 4)
        { x: 11, y: 1 }, // col5 height 1 (sixth column, index 5, base_y = (3-1)/2=1)
        { x: 6, y: 3 }, { x: 7, y: 3 }, // left thumb
      ];
      // Expected keymap is identical (all integer bases, no shifts)
      expect(physical).toEqual(expectedPhysical);
      expect(keymap).toEqual(expectedPhysical);
    });

    it('example 2: 2v333+2> 3+13332^ 33', () => {
      const { physical, keymap } = parseNotation('2v333+2> 3+13332^ 33');
      // Verify key counts first
      expect(physical).toHaveLength(34);
      expect(keymap).toHaveLength(34);

      // Check a few critical coordinates from the spec
      const findKey = (arr: { x: number; y: number }[], x: number, y: number) =>
        arr.some(k => k.x === x && k.y === y);

      // Section 1 col0 row0 physical (0,1.0)
      expect(findKey(physical, 0, 1.0)).toBe(true);
      // Section 1 right thumb (2.5,3) and (3.5,3)
      expect(findKey(physical, 2.5, 3)).toBe(true);
      expect(findKey(physical, 3.5, 3)).toBe(true);

      // Collision‑free check
      const keymapSet = new Set(keymap.map(k => `${k.x},${k.y}`));
      expect(keymapSet.size).toBe(34);
      expect(keymap.every(k => k.x >= 0 && k.y >= 0)).toBe(true);

      // Anchor checks: section 1 col0 keymap (0,1) and (0,2)
      expect(keymap).toContainEqual({ x: 0, y: 1 });
      expect(keymap).toContainEqual({ x: 0, y: 2 });
      // Section 1 thumb keymap (2,3) and (3,3)
      expect(keymap).toContainEqual({ x: 2, y: 3 });
      expect(keymap).toContainEqual({ x: 3, y: 3 });
      // Section 2 col4 keymap (10,1) and (10,2)
      expect(keymap).toContainEqual({ x: 10, y: 1 });
      expect(keymap).toContainEqual({ x: 10, y: 2 });
      // Section 3 col0 keymap (12,0) etc
      expect(keymap).toContainEqual({ x: 12, y: 0 });
    });
  });

  // -----------------------------------------------------------------------
  // Gap between sections
  // -----------------------------------------------------------------------
  describe('section gap', () => {
    it('ensures exactly 1U edge‑to‑edge between sections', () => {
      // Two sections, each a single column of height 1: '1 1'
      const { physical } = parseNotation('1 1');
      // Section 1: key at (0,0) max_x_phys=0, right edge 0.5
      // Section 2 offset = 0+0+2=2, key at (2,0) left edge 1.5
      // Gap = 1.5 - 0.5 = 1.0
      expect(physical).toEqual([
        { x: 0, y: 0 },
        { x: 2, y: 0 },
      ]);
    });
  });

  // -----------------------------------------------------------------------
  // Keymap rounding and truncation behavior
  // -----------------------------------------------------------------------
  describe('keymap rounding / truncation', () => {
    it('truncates half‑unit offset so single modifier does not move key in keymap', () => {
      const { keymap } = parseNotation('1v'); // single column height 1, shift +0.5
      // keymap: round(base_orig=0) + trunc(0.5) = 0+0=0 → (0,0)
      expect(keymap).toEqual([{ x: 0, y: 0 }]);
    });

    it('moves key when two same‑direction modifiers are applied (trunc(1)=1)', () => {
      const { keymap } = parseNotation('2vv'); // column height 2, shift +1.0
      // keys: base_y 0,1; keymap_y = round(0)+1=1, round(1)+1=2
      expect(keymap).toEqual([
        { x: 0, y: 1 }, { x: 0, y: 2 },
      ]);
    });

    it('truncates negative half‑unit to zero', () => {
      const { keymap } = parseNotation('2^^'); // shift -1.0
      // keymap: base_y 0,1; round(0)-1=-1, round(1)-1=0
      // After global non‑negative normalisation, shift right by 1 -> (0,0),(0,1)
      expect(keymap).toEqual([
        { x: 0, y: 0 }, { x: 0, y: 1 },
      ]);
    });
  });

  // -----------------------------------------------------------------------
  // Negative coordinate normalisation
  // -----------------------------------------------------------------------
  describe('negative coordinate normalisation', () => {
    it('normalises physical y to >=0 for a column shifted up (^)', () => {
      const { physical } = parseNotation('1^');
      // base_y=0, offset=-0.5 → before norm: -0.5; norm dy=0.5 → final 0
      expect(physical[0].y).toBe(0);
    });

    it('normalises physical x for a thumb with large left shift', () => {
      const { physical } = parseNotation('1<<+2'); // left thumb 1 with two < = -1.0 shift
      // thumb‑only section: two thumb rows stacked. row0: 1 key shift -1.0 → physical x=-1
      // row1: 2 keys shift 0. Normalisation min_x=-1 → dx=1
      expect(physical).toEqual([
        { x: 0, y: 0 }, // thumb0
        { x: 1, y: 1 }, { x: 2, y: 1 }, // thumb1
      ]);
    });

    it('global keymap normalisation handles negative keymap_x from thumb <<', () => {
      const { keymap } = parseNotation('2<<+3'); // thumbs_only: row0 2 keys shift -1.0, row1 3 keys shift 0
      // keymap row0: base (0,0),(1,0), round=0,1, trunc(-1)=-1 -> (-1,0),(0,0)
      // row1: (0,1),(1,1),(2,1)
      // min keymap_x = -1 → shift +1
      expect(keymap).toEqual([
        { x: 0, y: 0 }, { x: 1, y: 0 }, // row0 after shift
        { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 },
      ]);
    });
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------
  describe('edge cases', () => {
    it('handles a single key column (height 1)', () => {
      const { physical } = parseNotation('1');
      expect(physical).toEqual([{ x: 0, y: 0 }]);
    });

    it('handles varying column heights', () => {
      // '13' → cols heights [1,3]
      const { physical } = parseNotation('13');
      // max_h=3, col0 base_y_start = (3-1)/2=1 → y=1; col1 base_y=0,1,2
      expect(physical).toEqual([
        { x: 0, y: 1 }, // col0
        { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 }, // col1
      ]);
    });

    it('handles multiple left and right thumbs', () => {
      const { physical, keymap } = parseNotation('2+333+1>+2<');
      // chunks: 2 (L thumb), 333 (col), 1> (R thumb), 2< (R thumb)
      // column 333: height 3, 3 cols. left thumb 2 keys at y=3; right thumb 1> at y=4 with shift +0.5 (right-aligned: c=3, k=1, x_start=2 -> (2.5,4)); right thumb 2< at y=5 with shift -0.5 (x_start=3-2=1 -> (1-0.5,5),(2-0.5,5) = (0.5,5),(1.5,5))
      expect(physical).toContainEqual({ x: 2.5, y: 4 });
      expect(physical).toContainEqual({ x: 0.5, y: 5 });
      expect(physical).toContainEqual({ x: 1.5, y: 5 });

      // Keymap: trunc(0.5)=0, trunc(-0.5)=0 → thumb keymap positions are integer base values
      expect(keymap).toContainEqual({ x: 2, y: 4 }); // right thumb 1>
      expect(keymap).toContainEqual({ x: 1, y: 5 }); // right thumb 2< (first key)
      expect(keymap).toContainEqual({ x: 2, y: 5 }); // right thumb 2< (second key)

      // Just collision check
      const keySet = new Set(keymap.map(k => `${k.x},${k.y}`));
      expect(keySet.size).toBe(keymap.length);
    });

    it('multi‑digit entry "12" is parsed as two entries (columns)', () => {
      const { physical } = parseNotation('12');
      // two columns heights 1 and 2
      expect(physical).toEqual([
        { x: 0, y: 0.5 }, // col0 base_y = (2-1)/2=0.5
        { x: 1, y: 0 }, { x: 1, y: 1 }, // col1
      ]);
    });

    it('thumb‑only section with many rows', () => {
      const { physical } = parseNotation('1+2+3');
      expect(physical).toEqual([
        { x: 0, y: 0 },
        { x: 0, y: 1 }, { x: 1, y: 1 },
        { x: 0, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 2 },
      ]);
    });
  });

  // -----------------------------------------------------------------------
  // Invalid inputs – rejection
  // -----------------------------------------------------------------------
  describe('invalid inputs', () => {
    const invalidCases: [string, string][] = [
      ['empty string', ''],
      ['digit 0', '0'],
      ['invalid character', 'a'],
      ['horizontal modifier in column', '1>'],
      ['vertical modifier in thumb', '2+1v'],
      ['multiple multi‑entry chunks', '22+33'],   // |multi|=2
      ['empty chunk (leading +)', '+2'],
      ['empty chunk (trailing +)', '2+'],
      ['empty chunk (double +)', '2++3'],
      ['chunk starting with non‑digit', '2+a'],
      ['chunk starting with modifier', 'v2'],
      ['separator with invalid subsequent section', '2 +'],   // '+' yields empty chunks → error
      ['digit outside 1‑9 (0)', '33303'],
    ];

    for (const [description, input] of invalidCases) {
      it(`rejects: ${description}`, () => {
        expect(() => parseNotation(input)).toThrow();
      });
    }
  });

  // -----------------------------------------------------------------------
  // Collision‑free property for all valid test cases
  // -----------------------------------------------------------------------
  describe('collision‑free guarantee', () => {
    const validNotations = [
      '33333+3 2+333331',
      '2v333+2> 3+13332^ 33',
      '222',
      '2+333',
      '333+2',
      '2+3',
      '22 33',
      '1v2',
      '1^2',
      '2v^',
      '2vv',
      '2+2>',
      '3+2<',
      '2>>+33',
      '1',
      '13',
      '12',
      '1+2+3',
      '2<<+3',
      '2+333+1>+2<',
      '1<<+2', // thumbs_only
    ];
    for (const notation of validNotations) {
      it(`has no duplicate keymap coordinates for "${notation}"`, () => {
        const { keymap } = parseNotation(notation);
        const set = new Set(keymap.map(k => `${k.x},${k.y}`));
        expect(set.size).toBe(keymap.length);
      });
    }
  });
});
