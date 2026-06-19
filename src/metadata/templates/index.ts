// ─────────────────────────────────────────────────────────────
// Template Generation — pinctrl + bus-level device orchestration
//
// Public API:
//   generatePartTemplates() — full pinctrl DTS + Kconfig for one part
//   generateBusPinctrl()     — SoC-specific pinctrl node for one bus (low-level)
// ─────────────────────────────────────────────────────────────

export { generatePartTemplates } from "./bus";
export type { PartTemplateResult, GenerateBusSectionArgs } from "./bus";

export { generateBusPinctrl } from "./pinctrl";
export type { PinctrlArgs } from "./pinctrl";
