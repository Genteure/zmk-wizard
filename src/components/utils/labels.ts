/**
 * Shared display-name helpers for kscans and encoders.
 *
 * Rules:
 * - Encoders always use their array index (0-based).
 * - Kscans: if the part has exactly 1 kscan, use index 0; if >1, use index i+1
 *   (so the single case stays "kscan0" and multi-case becomes "kscan1", "kscan2", …).
 */

/** Human-readable kscan label, e.g. "left_kscan0", "right_kscan1". */
export function kscanLabel(
  partName: string,
  kscans: readonly { id: string }[],
  kscanId: string,
): string {
  const idx = kscans.findIndex((k) => k.id === kscanId);
  const displayIdx = kscans.length > 1 ? idx + 1 : 0;
  return `${partName}_kscan${displayIdx}`;
}

/** Human-readable encoder label, e.g. "left_encoder0", "right_encoder1". */
export function encoderLabel(
  partName: string,
  encoders: readonly { id: string }[],
  encoderId: string,
): string {
  const idx = encoders.findIndex((e) => e.id === encoderId);
  return `${partName}_encoder${idx}`;
}
