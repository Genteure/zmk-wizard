// ─────────────────────────────────────────────────────────────
// Export Orchestrator — ZMK Config Repository Generator
//
// Entry point: createZMKConfig(keyboard) → Record<filename, content>
// Generates the complete set of files for a ZMK user config repo.
//
// Ported from main branch src/lib/templating/index.ts
// ─────────────────────────────────────────────────────────────

import type { Keyboard } from "~/types";
import {
  build_yaml,
  config_conf,
  config_json,
  config_keymap,
  config_west_yml,
  kconfig_defconfig,
  kconfig_shield,
  readme_md,
  WORKFLOWS_BUILD_YML,
  zephyr_module_yml,
} from "./contents";
import { createShieldOverlayFiles, type BuildFiles } from "./shield";
import { kconfigDefconfigPath, kconfigShieldPath } from "./paths";
import { generateLayoutSvg } from "./layoutSvg";

export { config_json } from "./contents";


/**
 * Generate the complete ZMK user config repository.
 * Returns a map of file paths to their content.
 */
export function createZMKConfig(keyboard: Keyboard): BuildFiles {
  const files: BuildFiles = {};

  // Standard boilerplate files
  files[".github/workflows/build.yml"] = WORKFLOWS_BUILD_YML;
  files["config/west.yml"] = config_west_yml(keyboard);
  files["zephyr/module.yml"] = zephyr_module_yml(keyboard);
  files["build.yaml"] = build_yaml(keyboard);
  files["README.md"] = readme_md(keyboard);

  // Shield overlay files (kscan, matrix transform, physical layout,
  // pinctrl, encoders, pointing devices)
  const shieldFiles = createShieldOverlayFiles(keyboard);
  Object.assign(files, shieldFiles);

  // Kconfig files
  files[kconfigShieldPath(keyboard.shield)] = kconfig_shield(keyboard);

  // Kconfig.defconfig starts with the base content, then gets additional
  // kconfig from pinctrl appended by createShieldOverlayFiles
  // (which appends to the same path). If it was already set, skip base.
  const defconfigPath = kconfigDefconfigPath(keyboard.shield);
  if (!files[defconfigPath]) {
    files[defconfigPath] = kconfig_defconfig(keyboard, []);
  }

  // Config files for the user
  files[`config/${keyboard.shield}.conf`] = config_conf(keyboard);
  files[`config/${keyboard.shield}.keymap`] = config_keymap(keyboard);
  files[`config/${keyboard.shield}.json`] = config_json(keyboard);

  // SVG layout visualization
  files[".github/shield-wizard-layout.svg"] = generateLayoutSvg(keyboard);

  return Object.fromEntries(
    (Object.entries(files) as [string, string][]).map(
      ([filePath, content]) => [
        filePath,
        content.replace(/\n{3,}/g, "\n\n"),
      ],
    ),
  );
}
