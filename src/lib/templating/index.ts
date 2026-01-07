import type { Keyboard, VirtualTextFolder } from "../../typedef";
import {
  build_yaml,
  config__json,
  config__keymap,
  config_west_yml,
  readme_md,
  workflows_build_yml,
  zephyr_module_yml,
} from "./contents";
import { createShieldOverlayFiles } from "./shield";

export function createZMKConfig(keyboard: Keyboard): VirtualTextFolder {
  if (keyboard.shield === 'throwerror') {
    throw new Error("Throwing error to test error handling in templating");
  }

  const files: VirtualTextFolder = {};

  const shieldPath = `boards/shields/${keyboard.shield}`;

  files['.github/workflows/build.yml'] = workflows_build_yml;
  files['config/west.yml'] = config_west_yml;
  files['zephyr/module.yml'] = zephyr_module_yml(keyboard);
  files['build.yaml'] = build_yaml(keyboard);
  files['README.md'] = readme_md(keyboard);

  addXiaoBlePlusExtraFiles(files, shieldPath, keyboard);

  const shieldFiles = createShieldOverlayFiles(keyboard);
  for (const [filePath, content] of Object.entries(shieldFiles) as [string, string][]) {
    files[`${shieldPath}/${filePath}`] = content;
  }

  files[`config/${keyboard.shield}.conf`] = `\n`;
  files[`config/${keyboard.shield}.keymap`] = config__keymap(keyboard);
  files[`config/${keyboard.shield}.json`] = config__json(keyboard);

  return Object.fromEntries(
    (Object.entries(files) as [string, string][]).map(([filePath, content]) => [
      filePath,
      content.replace(/\n{3,}/gm, '\n\n')
    ])
  );
}

function addXiaoBlePlusExtraFiles(files: VirtualTextFolder, shieldPath: string, keyboard: Keyboard): void {
  const parts = keyboard.parts;
  if (parts.length === 0) return;

  // Single part
  if (parts.length === 1) {
    const p0 = parts[0];
    if (p0.controller === "xiao_ble_plus" && (p0.pins['d14'] || p0.pins['d15'])) {
      files[`${shieldPath}/${keyboard.shield}.conf`] = `# Enable NFC pins as GPIOs
CONFIG_NFCT_PINS_AS_GPIOS=y\n`;
    }
    return;
  }

  // loop over parts for multi-part keyboards
  for (const part of parts) {
    if (part.controller === "xiao_ble_plus" && (part.pins['d14'] || part.pins['d15'])) {
      files[`${shieldPath}/${keyboard.shield}_${part.name}.conf`] = `# Enable NFC pins as GPIOs
CONFIG_NFCT_PINS_AS_GPIOS=y\n`;
    }
  }
}

