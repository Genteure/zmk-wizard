import type { KeyboardContext, VirtualTextFolder } from "../types";
import {
  build_yaml,
  config__json,
  config__keymap,
  config_west_yml,
  readme_md,
  shield__kconfig_defconfig,
  shield__kconfig_shield,
  workflows_build_yml,
  zephyr_module_yml,
} from "./contents";
import { createShieldOverlayFiles } from "./shield";

export function createZMKConfig(keyboard: KeyboardContext): VirtualTextFolder {
  if (keyboard.info.shield === 'throwerror') {
    throw new Error("Throwing error to test error handling in templating");
  }

  const files: VirtualTextFolder = {};

  const shieldPath = `boards/shields/${keyboard.info.shield}`;

  files['.github/workflows/build.yml'] = workflows_build_yml;
  files['config/west.yml'] = config_west_yml;
  files['zephyr/module.yml'] = zephyr_module_yml(keyboard);
  files['build.yaml'] = build_yaml(keyboard);
  files['README.md'] = readme_md(keyboard);

  files[`${shieldPath}/Kconfig.shield`] = shield__kconfig_shield(keyboard);
  files[`${shieldPath}/Kconfig.defconfig`] = shield__kconfig_defconfig(keyboard);

  addXiaoBlePlusExtraFiles(files, shieldPath, keyboard);

  const shieldFiles = createShieldOverlayFiles(keyboard);
  for (const [filePath, content] of Object.entries(shieldFiles)) {
    files[`${shieldPath}/${filePath}`] = content;
  }

  files[`config/${keyboard.info.shield}.conf`] = `\n`;
  files[`config/${keyboard.info.shield}.keymap`] = config__keymap(keyboard);
  files[`config/${keyboard.info.shield}.json`] = config__json(keyboard);

  return Object.fromEntries(
    Object.entries(files).map(([filePath, content]) => [
      filePath,
      content.replace(/\n{3,}/gm, '\n\n')
    ])
  );
}

function addXiaoBlePlusExtraFiles(files: VirtualTextFolder, shieldPath: string, keyboard: KeyboardContext): void {
  if (keyboard.info.controller !== "seeed_xiao_ble_plus") return;

  if (keyboard.pinouts.length === 1) {

    if (keyboard.pinouts[0]['d14'] || keyboard.pinouts[0]['d15']) {
      files[`${shieldPath}/${keyboard.info.shield}.conf`] = `# Enable NFC pins as GPIOs
CONFIG_NFCT_PINS_AS_GPIOS=y\n`;
    }

  } else if (keyboard.pinouts.length === 2) {

    if (keyboard.pinouts[0]['d14'] || keyboard.pinouts[0]['d15']) {
      files[`${shieldPath}/${keyboard.info.shield}_left.conf`] = `# Enable NFC pins as GPIOs
CONFIG_NFCT_PINS_AS_GPIOS=y\n`;

    }

    if (keyboard.pinouts[1]['d14'] || keyboard.pinouts[1]['d15']) {
      files[`${shieldPath}/${keyboard.info.shield}_right.conf`] = `# Enable NFC pins as GPIOs
CONFIG_NFCT_PINS_AS_GPIOS=y\n`;
    }

  }
}

