import { describe, expect, it } from "vitest";
import {
  getEffectiveRotationOrigin,
  getKeyUnrotatedCenter,
  rotatePoint,
  getKeyRotatedCenter,
  angleBetweenPoints,
  normalizeAngle,
  applyLocalCenterRotation,
  applyAnchorRotation,
} from "../../src/lib/keyRotation";

describe("keyRotation", () => {
  describe("getEffectiveRotationOrigin", () => {
    it("returns x,y when rx,ry are both 0", () => {
      const key = { x: 1, y: 2, rx: 0, ry: 0 };
      const result = getEffectiveRotationOrigin(key);
      expect(result).toEqual({ x: 1, y: 2 });
    });

    it("returns rx,ry when set", () => {
      const key = { x: 1, y: 2, rx: 5, ry: 6 };
      const result = getEffectiveRotationOrigin(key);
      expect(result).toEqual({ x: 5, y: 6 });
    });
  });

  describe("getKeyUnrotatedCenter", () => {
    it("calculates center correctly", () => {
      const key = { x: 0, y: 0, w: 2, h: 1 };
      const result = getKeyUnrotatedCenter(key);
      expect(result).toEqual({ x: 1, y: 0.5 });
    });
  });

  describe("rotatePoint", () => {
    it("rotates point 90 degrees clockwise", () => {
      const point = { x: 2, y: 0 };
      const origin = { x: 0, y: 0 };
      const result = rotatePoint(point, origin, 90);
      expect(result.x).toBeCloseTo(0, 5);
      expect(result.y).toBeCloseTo(2, 5);
    });

    it("rotates point 180 degrees", () => {
      const point = { x: 1, y: 0 };
      const origin = { x: 0, y: 0 };
      const result = rotatePoint(point, origin, 180);
      expect(result.x).toBeCloseTo(-1, 5);
      expect(result.y).toBeCloseTo(0, 5);
    });

    it("rotates around non-origin point", () => {
      const point = { x: 3, y: 1 };
      const origin = { x: 2, y: 1 };
      const result = rotatePoint(point, origin, 90);
      expect(result.x).toBeCloseTo(2, 5);
      expect(result.y).toBeCloseTo(2, 5);
    });
  });

  describe("getKeyRotatedCenter", () => {
    it("returns unrotated center when r=0", () => {
      const key = { x: 0, y: 0, w: 2, h: 1, r: 0, rx: 0, ry: 0 };
      const result = getKeyRotatedCenter(key);
      expect(result).toEqual({ x: 1, y: 0.5 });
    });

    it("rotates center around origin", () => {
      const key = { x: 0, y: 0, w: 2, h: 2, r: 90, rx: 0, ry: 0 };
      const result = getKeyRotatedCenter(key);
      // Unrotated center is (1, 1), rotated 90° around (0,0) = (−1, 1)
      expect(result.x).toBeCloseTo(-1, 5);
      expect(result.y).toBeCloseTo(1, 5);
    });

    it("rotates center around specified anchor", () => {
      const key = { x: 0, y: 0, w: 2, h: 2, r: 90, rx: 1, ry: 1 };
      const result = getKeyRotatedCenter(key);
      // Unrotated center is (1, 1), rotated 90° around (1,1) = (1, 1) - no change
      expect(result.x).toBeCloseTo(1, 5);
      expect(result.y).toBeCloseTo(1, 5);
    });
  });

  describe("angleBetweenPoints", () => {
    it("returns 0 for point to the right", () => {
      const from = { x: 0, y: 0 };
      const to = { x: 1, y: 0 };
      expect(angleBetweenPoints(from, to)).toBeCloseTo(0, 5);
    });

    it("returns 90 for point below", () => {
      const from = { x: 0, y: 0 };
      const to = { x: 0, y: 1 };
      expect(angleBetweenPoints(from, to)).toBeCloseTo(90, 5);
    });

    it("returns -90 for point above", () => {
      const from = { x: 0, y: 0 };
      const to = { x: 0, y: -1 };
      expect(angleBetweenPoints(from, to)).toBeCloseTo(-90, 5);
    });
  });

  describe("normalizeAngle", () => {
    it("keeps angle in range [0, 360)", () => {
      expect(normalizeAngle(0)).toBe(0);
      expect(normalizeAngle(90)).toBe(90);
      expect(normalizeAngle(360)).toBe(0);
      expect(normalizeAngle(-90)).toBe(270);
      expect(normalizeAngle(450)).toBe(90);
    });
  });

  describe("applyLocalCenterRotation", () => {
    it("updates rotation and sets rx,ry to center", () => {
      const key = { x: 0, y: 0, w: 2, h: 2, r: 0, rx: 0, ry: 0 };
      const result = applyLocalCenterRotation(key, 45);
      expect(result.r).toBe(45);
      expect(result.rx).toBe(1); // center x = x + w/2
      expect(result.ry).toBe(1); // center y = y + h/2
    });

    it("accumulates rotation correctly", () => {
      const key = { x: 0, y: 0, w: 1, h: 1, r: 45, rx: 0.5, ry: 0.5 };
      const result = applyLocalCenterRotation(key, 45);
      expect(result.r).toBe(90);
    });

    it("handles negative rotation", () => {
      const key = { x: 0, y: 0, w: 1, h: 1, r: 45, rx: 0.5, ry: 0.5 };
      const result = applyLocalCenterRotation(key, -45);
      expect(result.r).toBe(0);
    });

    it("wraps angle around 360", () => {
      const key = { x: 0, y: 0, w: 1, h: 1, r: 350, rx: 0.5, ry: 0.5 };
      const result = applyLocalCenterRotation(key, 20);
      expect(result.r).toBe(10);
    });
  });

  describe("applyAnchorRotation", () => {
    it("keeps key center fixed when anchor changes", () => {
      const key = { x: 0, y: 0, w: 1, h: 1, r: 0, rx: 0, ry: 0 };
      const originalCenter = getKeyRotatedCenter(key);
      
      const newAnchor = { x: 0.5, y: 2 }; // Anchor below key
      const result = applyAnchorRotation(key, newAnchor);
      const newCenter = getKeyRotatedCenter(result);
      
      expect(newCenter.x).toBeCloseTo(originalCenter.x, 3);
      expect(newCenter.y).toBeCloseTo(originalCenter.y, 3);
    });

    it("points key away from anchor when anchor is below", () => {
      const key = { x: 0, y: 0, w: 1, h: 1, r: 0, rx: 0, ry: 0 };
      // Place anchor directly below key center
      const keyCenter = getKeyRotatedCenter(key);
      const newAnchor = { x: keyCenter.x, y: keyCenter.y + 2 };
      
      const result = applyAnchorRotation(key, newAnchor);
      // Key should point up (r = 0) when anchor is below
      expect(result.r).toBeCloseTo(0, 1);
    });

    it("rotates key 90 degrees when anchor is to the left", () => {
      const key = { x: 0, y: 0, w: 1, h: 1, r: 0, rx: 0, ry: 0 };
      const keyCenter = getKeyRotatedCenter(key);
      const newAnchor = { x: keyCenter.x - 2, y: keyCenter.y };
      
      const result = applyAnchorRotation(key, newAnchor);
      // Key should point right (r = 90) when anchor is to the left
      expect(result.r).toBeCloseTo(90, 1);
    });
  });
});
