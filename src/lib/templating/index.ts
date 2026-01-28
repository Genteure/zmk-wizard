import type { Keyboard, VirtualTextFolder } from "../../typedef";
import {
  build_yaml,
  config__conf,
  config__json,
  config__keymap,
  config_west_yml,
  readme_md,
  workflows_build_yml,
  zephyr_module_yml,
} from "./contents";
import { createShieldOverlayFiles } from "./shield";
import { generateKeyboardSvg } from "./svg";
import { shieldRootPath } from "./utils";
export { config__json } from "./contents";
export { physicalLayoutKeyboard } from "./shield";
export { generateKeyboardSvg } from "./svg";

export function createZMKConfig(keyboard: Keyboard): VirtualTextFolder {
  if (keyboard.shield === 'throwerror') {
    throw new Error("Throwing error to test error handling in templating");
  }

  const files: VirtualTextFolder = {};

  files['.github/workflows/build.yml'] = workflows_build_yml;
  files['.github/shield-wizard-layout.svg'] = generateKeyboardSvg(keyboard);
  files['config/west.yml'] = config_west_yml(keyboard);
  files['zephyr/module.yml'] = zephyr_module_yml(keyboard);
  files['build.yaml'] = build_yaml(keyboard);
  files['README.md'] = readme_md(keyboard);

  addXiaoBlePlusExtraFiles(files, keyboard);

  const shieldFiles = createShieldOverlayFiles(keyboard);
  Object.assign(files, shieldFiles);

  files[`config/${keyboard.shield}.conf`] = config__conf(keyboard);
  files[`config/${keyboard.shield}.keymap`] = config__keymap(keyboard);
  files[`config/${keyboard.shield}.json`] = config__json(keyboard);

  return Object.fromEntries(
    (Object.entries(files) as [string, string][]).map(([filePath, content]) => [
      filePath,
      content.replace(/\n{3,}/gm, '\n\n')
    ])
  );
}

function addXiaoBlePlusExtraFiles(files: VirtualTextFolder, keyboard: Keyboard): void {
  const parts = keyboard.parts;
  if (parts.length === 0) return;

  const shieldRoot = shieldRootPath(keyboard.shield);

  // Single part
  if (parts.length === 1) {
    const p0 = parts[0];
    if (p0.controller === "xiao_ble_plus" && (p0.pins['d14'] || p0.pins['d15'])) {
      files[`${shieldRoot}/${keyboard.shield}.conf`] = `# Enable NFC pins as GPIOs
CONFIG_NFCT_PINS_AS_GPIOS=y\n`;
    }
    return;
  }

  // loop over parts for multi-part keyboards
  for (const part of parts) {
    if (part.controller === "xiao_ble_plus" && (part.pins['d14'] || part.pins['d15'])) {
      files[`${shieldRoot}/${keyboard.shield}_${part.name}.conf`] = `# Enable NFC pins as GPIOs
CONFIG_NFCT_PINS_AS_GPIOS=y\n`;
    }
  }
}

