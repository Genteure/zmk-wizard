import { describe, it, expect } from 'vitest';
import type { Key } from '~/types';
import { generateLayoutSvg } from './layoutSvg';
import { DEFAULT_KEY_SIZE as KS, DEFAULT_PADDING as PAD } from '~/components/graphic/keyShape';

function key(overrides: Partial<Key>): Key {
  return {
    id: 'k',
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
    ...overrides,
  } as Key;
}

/** Extract the `rotate(r,cx,cy)` center args from a key's group transform, if any. */
function rotateCenter(svg: string, index: number): [number, number] | null {
  const groups = [...svg.matchAll(/<g transform="([^"]+)"/g)];
  const t = groups[index]?.[1];
  if (!t) throw new Error(`no group transform #${index}`);
  const m = t.match(/rotate\((-?[\d.e]+),(-?[\d.e]+),(-?[\d.e]+)\)/);
  return m ? [Number(m[2]), Number(m[3])] : null;
}

describe('generateLayoutSvg', () => {
  // Rotation-origin fallback: rx === 0 means "rotate around the key's own
  // top-left corner" (same for ry) — must match the editor (KeyEntity.vue).
  describe('rotated key transforms', () => {
    it('rotates a normalized key (rx=0, ry=0) around its own top-left corner', () => {
      const svg = generateLayoutSvg({
        layout: [key({ x: 2.5, y: 1.5, r: 30 })],
      });
      // effRx = x, effRy = y → center in group-local space is (0, 0)
      expect(rotateCenter(svg, 0)).toEqual([0, 0]);
    });

    it('rotates around an explicit non-zero origin', () => {
      const svg = generateLayoutSvg({
        layout: [key({ x: 5, y: 3, r: 20, rx: 6, ry: 3 })],
      });
      expect(rotateCenter(svg, 0)).toEqual([(6 - 5) * KS, (3 - 3) * KS]);
    });

    it('applies the per-axis fallback (ry=0 → rotate around key y)', () => {
      const svg = generateLayoutSvg({
        layout: [key({ x: 6, y: 2, r: 45, rx: 6 })],
      });
      expect(rotateCenter(svg, 0)).toEqual([0, 0]);
    });

    it('leaves unrotated keys without a rotate()', () => {
      const svg = generateLayoutSvg({
        layout: [key({ x: 1, y: 1 }), key({ x: 2, y: 1, r: 10 })],
      });
      expect(rotateCenter(svg, 0)).toBeNull();
      expect(rotateCenter(svg, 1)).toEqual([0, 0]);
    });
  });

  describe('viewBox containment', () => {
    it('keeps rotated keys inside the viewBox', () => {
      const layout = [
        key({ x: 0, y: 0 }),
        key({ x: 4, y: 0 }),
        key({ x: 2.5, y: 1.5, r: 30 }),
        key({ x: 7.75, y: 3.5, r: -25 }),
      ];
      const svg = generateLayoutSvg({ layout });
      const [, , , vbW, vbH] = svg.match(/viewBox="([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+)"/)!.map(Number);

      const groups = [...svg.matchAll(/<g transform="([^"]+)"/g)];
      const p = PAD / 2;
      for (let i = 0; i < layout.length; i++) {
        const t = groups[i]![1];
        const tx = Number(t.match(/translate\((-?[\d.e]+),(-?[\d.e]+)/)![1]);
        const ty = Number(t.match(/translate\((-?[\d.e]+),(-?[\d.e]+)/)![2]);
        const rm = t.match(/rotate\((-?[\d.e]+),(-?[\d.e]+),(-?[\d.e]+)\)/);
        const r = rm ? Number(rm[1]) : 0;
        const cx = rm ? Number(rm[2]) : 0;
        const cy = rm ? Number(rm[3]) : 0;
        const rad = (r * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const rw = layout[i]!.w * KS - PAD;
        const rh = layout[i]!.h * KS - PAD;
        for (const [lx, ly] of [[p, p], [p + rw, p], [p + rw, p + rh], [p, p + rh]] as const) {
          const x = tx + cx + (lx - cx) * cos - (ly - cy) * sin;
          const y = ty + cy + (lx - cx) * sin + (ly - cy) * cos;
          expect(x).toBeGreaterThanOrEqual(0);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThanOrEqual(vbW);
          expect(y).toBeLessThanOrEqual(vbH);
        }
      }
    });
  });
});
