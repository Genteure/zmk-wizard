// Metadata for external ZMK modules providing device drivers.
//
// Module IDs are defined in src/types/keyboard.ts:ModuleIdSchema.
// Each module provides one or more device drivers that users can
// add to their keyboard config.
//
// When a user adds a device that requires a module, the module
// is automatically added to the keyboard's `modules` list during
// template generation (or validation).

import type { ModuleId } from "~/types";

export interface ModuleMeta {
  /** Human-readable name for UI display */
  name: string;
  /** URL to the module's source repository */
  gitUrl: string;
  /** Git revision (commit hash or tag) to pin */
  revision: string;
  /**
   * Conflict keys — modules sharing any conflict key cannot be
   * enabled together. For example, if module A has ["pmw3610"]
   * and module B also has ["pmw3610"], they conflict because
   * both provide a PMW3610 driver.
   */
  conflicts: readonly string[];
}

/**
 * Registry of all known ZMK modules.
 * Keyed by ModuleId — MUST match the ModuleIdSchema enum.
 */
export const ZMK_MODULES: Record<ModuleId, ModuleMeta> = {
  "petejohanson/cirque": {
    name: "Cirque Pinnacle Driver",
    gitUrl: "https://github.com/petejohanson/cirque-input-module",
    revision: "0de55f36bc720b5be3d8880dc856d4d78baf5214",
    conflicts: [],
  },
  "badjeff/pmw3610": {
    name: "PMW3610 Driver",
    gitUrl: "https://github.com/badjeff/zmk-pmw3610-driver",
    revision: "ab43c664cf84c94bd6b9839f3e4aa9517773de82", // TODO: verify revision
    conflicts: ["pmw3610"], // Alternative PMW3610 drivers may exist
  },
  "badjeff/paw3395": {
    name: "PAW3395 Driver",
    gitUrl: "https://github.com/badjeff/zmk-paw3395-driver",
    revision: "ab43c664cf84c94bd6b9839f3e4aa9517773de82",
    conflicts: [],
  },
} as const;

/** Check whether two modules share any conflict key. */
export function modulesConflict(a: ModuleId, b: ModuleId): boolean {
  const conflictsA = ZMK_MODULES[a].conflicts;
  const conflictsB = ZMK_MODULES[b].conflicts;
  return conflictsA.some((key) => conflictsB.includes(key));
}
