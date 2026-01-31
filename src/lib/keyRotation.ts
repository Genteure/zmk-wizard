/**
 * Math helper functions for key rotation operations.
 * 
 * Key rotation model:
 * - x, y: base position (top-left corner before rotation)
 * - w, h: width and height
 * - r: rotation angle in degrees (clockwise)
 * - rx, ry: rotation origin in absolute coordinates. If both are 0, (x,y) is used.
 * 
 * The key is first placed at (x,y), then rotated by r degrees around (rx,ry).
 */

import type { Point } from "../typedef";

/**
 * Get the effective rotation origin in units.
 * If rx,ry are both 0, the origin is the key's top-left corner (x,y).
 */
export function getEffectiveRotationOrigin(key: { x: number; y: number; rx: number; ry: number }): Point {
  if (key.rx === 0 && key.ry === 0) {
    return { x: key.x, y: key.y };
  }
  return { x: key.rx, y: key.ry };
}

/**
 * Calculate the key center point (before rotation) in units.
 */
export function getKeyUnrotatedCenter(key: { x: number; y: number; w: number; h: number }): Point {
  return {
    x: key.x + key.w / 2,
    y: key.y + key.h / 2,
  };
}

/**
 * Rotate a point around an origin by a given angle.
 * @param point - Point to rotate (in any unit)
 * @param origin - Origin of rotation (in same unit)
 * @param angleDeg - Angle in degrees (positive = clockwise)
 * @returns Rotated point
 */
export function rotatePoint(point: Point, origin: Point, angleDeg: number): Point {
  const rad = angleDeg * Math.PI / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  return {
    x: origin.x + dx * cos - dy * sin,
    y: origin.y + dx * sin + dy * cos,
  };
}

/**
 * Calculate the actual center of a key after rotation is applied.
 * @param key - Key geometry with x, y, w, h, r, rx, ry (all in units)
 * @returns Center point after rotation (in units)
 */
export function getKeyRotatedCenter(key: { x: number; y: number; w: number; h: number; r: number; rx: number; ry: number }): Point {
  const unrotatedCenter = getKeyUnrotatedCenter(key);
  const origin = getEffectiveRotationOrigin(key);
  return rotatePoint(unrotatedCenter, origin, key.r);
}

/**
 * Calculate the angle from one point to another (in degrees).
 * 0° = right (+x), 90° = down (+y)
 */
export function angleBetweenPoints(from: Point, to: Point): number {
  return Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI;
}

/**
 * Calculate distance between two points.
 */
export function distance(p1: Point, p2: Point): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Normalize angle to be within [0, 360) range.
 */
export function normalizeAngle(angle: number): number {
  let normalized = angle % 360;
  if (normalized < 0) normalized += 360;
  return normalized;
}

/**
 * Round a number to a specified number of decimal places.
 */
export function roundTo(value: number, decimals: number = 3): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

// ============================================================================
// LOCAL CENTER ROTATION MODE
// ============================================================================

/**
 * Set up a key for local center rotation mode.
 * This normalizes the key so that rx,ry is at the key center.
 * The visual appearance of the key remains unchanged.
 * 
 * @param key - Key geometry
 * @returns New key geometry with rx,ry at center
 */
export function normalizeToLocalCenter(
  key: { x: number; y: number; w: number; h: number; r: number; rx: number; ry: number }
): { x: number; y: number; w: number; h: number; r: number; rx: number; ry: number } {
  // Get current rotated center position
  const currentCenter = getKeyRotatedCenter(key);
  
  // New rotation origin is the center
  const newRx = key.x + key.w / 2;
  const newRy = key.y + key.h / 2;
  
  // For center rotation, the unrotated center equals the rotated center
  // So we need to find new x,y such that:
  // newX + w/2 = currentCenter.x and newY + h/2 = currentCenter.y
  const newX = currentCenter.x - key.w / 2;
  const newY = currentCenter.y - key.h / 2;
  
  return {
    x: roundTo(newX),
    y: roundTo(newY),
    w: key.w,
    h: key.h,
    r: key.r,
    rx: roundTo(newRx),
    ry: roundTo(newRy),
  };
}

/**
 * Apply rotation delta in local center mode.
 * The key rotates around its own center.
 * 
 * @param key - Key geometry (should already be normalized to center)
 * @param deltaAngle - Angle change in degrees
 * @returns Updated key geometry
 */
export function applyLocalCenterRotation(
  key: { x: number; y: number; w: number; h: number; r: number; rx: number; ry: number },
  deltaAngle: number
): { x: number; y: number; w: number; h: number; r: number; rx: number; ry: number } {
  // In center mode, rx,ry should be at key center (x + w/2, y + h/2)
  // We just update the rotation angle
  const newR = normalizeAngle(key.r + deltaAngle);
  
  // Update rx,ry to match the current center (in case key was moved)
  const newRx = key.x + key.w / 2;
  const newRy = key.y + key.h / 2;
  
  return {
    ...key,
    r: roundTo(newR),
    rx: roundTo(newRx),
    ry: roundTo(newRy),
  };
}

// ============================================================================
// ANCHOR POINT ROTATION MODE
// ============================================================================

/**
 * Apply anchor point drag in anchor rotation mode.
 * The key center stays fixed, but the key rotates to point away from the anchor.
 * 
 * The rotation origin (rx,ry) is the anchor point. The key should point
 * directly away from the anchor (the anchor is "below" the key in the -y direction
 * of the key's local coordinate system).
 * 
 * @param key - Current key geometry
 * @param newAnchor - New anchor point position (in units)
 * @returns Updated key geometry
 */
export function applyAnchorRotation(
  key: { x: number; y: number; w: number; h: number; r: number; rx: number; ry: number },
  newAnchor: Point
): { x: number; y: number; w: number; h: number; r: number; rx: number; ry: number } {
  // The key center after rotation should remain fixed
  const fixedCenter = getKeyRotatedCenter(key);
  
  // Calculate the angle from anchor to center
  // The key points away from the anchor, meaning the top of the key faces away
  // from the anchor. So the rotation angle should point the key's +y (down) toward anchor.
  // If anchor is directly below center, rotation = 0
  // If anchor is to the right of center, key rotates CCW (negative angle)
  const angleFromAnchorToCenter = angleBetweenPoints(newAnchor, fixedCenter);
  
  // The key's "up" direction in local coords is -y (negative y)
  // When r=0, the key's -y points up (toward -y in world coords)
  // We want the key's -y to point away from anchor (toward center from anchor)
  // angleFromAnchorToCenter gives us the angle where the key's -y should point
  // But we need to adjust: when angle=90 (pointing up), we want r=0
  // So: r = angleFromAnchorToCenter - 90
  // Actually, let's think again:
  // - angleFromAnchorToCenter = -90 means center is above anchor (key points up, r should be 0)
  // - angleFromAnchorToCenter = 0 means center is to the right of anchor (key points right, r should be 90)
  // - angleFromAnchorToCenter = 90 means center is below anchor (key points down, r should be 180)
  // So: r = angleFromAnchorToCenter + 90
  const newR = normalizeAngle(angleFromAnchorToCenter + 90);
  
  // Now calculate new x,y such that when rotated around newAnchor by newR,
  // the center ends up at fixedCenter
  // 
  // The unrotated center is at (newX + w/2, newY + h/2)
  // After rotation around newAnchor, it should be at fixedCenter
  // 
  // rotatePoint(unrotatedCenter, newAnchor, newR) = fixedCenter
  // So: unrotatedCenter = rotatePoint(fixedCenter, newAnchor, -newR)
  const unrotatedCenter = rotatePoint(fixedCenter, newAnchor, -newR);
  
  const newX = unrotatedCenter.x - key.w / 2;
  const newY = unrotatedCenter.y - key.h / 2;
  
  return {
    x: roundTo(newX),
    y: roundTo(newY),
    w: key.w,
    h: key.h,
    r: roundTo(newR),
    rx: roundTo(newAnchor.x),
    ry: roundTo(newAnchor.y),
  };
}

/**
 * Calculate what the anchor position should be for a given key with center rotation.
 * Used when switching from center mode to anchor mode - places anchor at a default position.
 * 
 * @param key - Key geometry
 * @param distanceFromCenter - Distance from key center to anchor (in units)
 * @returns Anchor point position
 */
export function calculateDefaultAnchorPosition(
  key: { x: number; y: number; w: number; h: number; r: number; rx: number; ry: number },
  distanceFromCenter: number = 2
): Point {
  const center = getKeyRotatedCenter(key);
  
  // Place anchor in the direction opposite to where the key is pointing.
  // In our coordinate system:
  // - r=0 means key points "up" (toward -y in screen coords)
  // - We want anchor "below" the key (in the +y direction from key perspective)
  // - To convert: key's local "down" direction = r + 90 degrees in world coords
  //   (because r=0 pointing up = -90° in standard math coords, so down = -90° + 180° = +90°)
  const anchorAngle = (key.r + 90) * Math.PI / 180;
  
  return {
    x: roundTo(center.x + distanceFromCenter * Math.cos(anchorAngle)),
    y: roundTo(center.y + distanceFromCenter * Math.sin(anchorAngle)),
  };
}

/**
 * Move the anchor (rotation origin) to a new position without changing the key's
 * final visual appearance (position after rotation).
 * 
 * This is used in center mode when the user drags the anchor point - the key
 * should appear to stay in the same place while only the rotation origin moves.
 * 
 * @param key - Current key geometry
 * @param newAnchor - New anchor point position (in units)
 * @returns Updated key geometry with same visual position but new anchor
 */
export function moveAnchorWithoutAffectingPosition(
  key: { x: number; y: number; w: number; h: number; r: number; rx: number; ry: number },
  newAnchor: Point
): { x: number; y: number; w: number; h: number; r: number; rx: number; ry: number } {
  // The key's rotated center should remain at the same visual position
  const fixedRotatedCenter = getKeyRotatedCenter(key);
  
  // With the new anchor at newAnchor, we need to find new x, y such that:
  // When we rotate the key's center around newAnchor by r degrees,
  // it ends up at fixedRotatedCenter.
  //
  // rotatePoint(unrotatedCenter, newAnchor, r) = fixedRotatedCenter
  // So: unrotatedCenter = rotatePoint(fixedRotatedCenter, newAnchor, -r)
  const unrotatedCenter = rotatePoint(fixedRotatedCenter, newAnchor, -key.r);
  
  const newX = unrotatedCenter.x - key.w / 2;
  const newY = unrotatedCenter.y - key.h / 2;
  
  return {
    x: roundTo(newX),
    y: roundTo(newY),
    w: key.w,
    h: key.h,
    r: key.r, // Rotation angle stays the same
    rx: roundTo(newAnchor.x),
    ry: roundTo(newAnchor.y),
  };
}
