import { unwrap } from "solid-js/store";
import { Controller, type KeyboardContext } from "../types";

export const workflows_build_yml = `name: Build ZMK firmware
on: [push, pull_request, workflow_dispatch]

jobs:
  build:
    uses: zmkfirmware/zmk/.github/workflows/build-user-config.yml@v0.3
`;

export const config_west_yml = `manifest:
  defaults:
    revision: v0.3
  remotes:
    - name: zmkfirmware
      url-base: https://github.com/zmkfirmware
    # Additional modules containing boards/shields/custom code can be listed here as well
    # See https://docs.zephyrproject.org/3.2.0/develop/west/manifest.html#projects
  projects:
    - name: zmk
      remote: zmkfirmware
      import: app/west.yml
  self:
    path: config
`;

export function zephyr_module_yml(keyboard: KeyboardContext): string {
  return `name: zmk-keyboard-${keyboard.info.shield.replaceAll('_', '-')}
build:
  settings:
    board_root: .
`;
}

export function build_yaml(keyboard: KeyboardContext): string {
  const header = `# This file generates the GitHub Actions matrix.
# For simple board + shield combinations, add them to the top level board and
# shield arrays, for more control, add individual board + shield combinations
# to the \`include\` property. You can also use the \`cmake-args\` property to
# pass flags to the build command, \`snippet\` to add a Zephyr snippet, and
# \`artifact-name\` to assign a name to distinguish build outputs from each other:
#
# board: [ "nice_nano_v2" ]
# shield: [ "corne_left", "corne_right" ]
# include:
#   - board: bdn9_rev2
#   - board: nice_nano_v2
#     shield: reviung41
#   - board: nice_nano_v2
#     shield: corne_left
#     snippet: studio-rpc-usb-uart
#     cmake-args: -DCONFIG_ZMK_STUDIO=y
#     artifact-name: corne_left_with_studio
#
---`;

  const boardMapping: Record<Controller, string> = {
    [Controller.enum.nice_nano_v2]: 'nice_nano_v2',
    [Controller.enum.seeed_xiao_ble]: 'seeeduino_xiao_ble',
    [Controller.enum.seeed_xiao_ble_plus]: 'seeeduino_xiao_ble',
  }

  if (keyboard.pinouts.length > 1) {
    return `${header}
include:

  - board: ${boardMapping[keyboard.info.controller]}
    shield: ${keyboard.info.shield}_left

# To build with ZMK Studio support, uncomment the following block
# by removing the leading '#' from each line.

#  - board: ${boardMapping[keyboard.info.controller]}
#    shield: ${keyboard.info.shield}_left
#    snippet: studio-rpc-usb-uart
#    cmake-args: -DCONFIG_ZMK_STUDIO=y
#    artifact-name: ${keyboard.info.shield}_left_with_studio

  - board: ${boardMapping[keyboard.info.controller]}
    shield: ${keyboard.info.shield}_right

  - board: ${boardMapping[keyboard.info.controller]}
    shield: settings_reset
`
  } else {
    return `${header}
include:

  - board: ${boardMapping[keyboard.info.controller]}
    shield: ${keyboard.info.shield}

# To build with ZMK Studio support, uncomment the following block
# by removing the leading '#' from each line.

#  - board: ${boardMapping[keyboard.info.controller]}
#    shield: ${keyboard.info.shield}
#    snippet: studio-rpc-usb-uart
#    cmake-args: -DCONFIG_ZMK_STUDIO=y
#    artifact-name: ${keyboard.info.shield}_with_studio

  - board: ${boardMapping[keyboard.info.controller]}
    shield: settings_reset
`;
  }
}

export function shield__kconfig_shield(keyboard: KeyboardContext): string {
  if (keyboard.pinouts.length > 1) {
    return `config SHIELD_${keyboard.info.shield.toUpperCase()}_LEFT
    def_bool $(shields_list_contains,${keyboard.info.shield}_left)

config SHIELD_${keyboard.info.shield.toUpperCase()}_RIGHT
    def_bool $(shields_list_contains,${keyboard.info.shield}_right)
`
  } else {
    return `config SHIELD_${keyboard.info.shield.toUpperCase()}
    def_bool $(shields_list_contains,${keyboard.info.shield})
`
  }
}

export function shield__kconfig_defconfig(keyboard: KeyboardContext): string {
  if (keyboard.pinouts.length > 1) {
    return `if SHIELD_${keyboard.info.shield.toUpperCase()}_LEFT

# Name must be less than 16 characters long!
config ZMK_KEYBOARD_NAME
  default "${keyboard.info.name}"

config ZMK_SPLIT_ROLE_CENTRAL
  default y

endif

if SHIELD_${keyboard.info.shield.toUpperCase()}_LEFT || SHIELD_${keyboard.info.shield.toUpperCase()}_RIGHT

config ZMK_SPLIT
  default y

endif
`
  } else {
    return `if SHIELD_${keyboard.info.shield.toUpperCase()}

# Name must be less than 16 characters long!
config ZMK_KEYBOARD_NAME
    default "${keyboard.info.name}"

endif
`
  }
}

export function config__keymap(keyboard: KeyboardContext): string {
  // TODO format keymap according to the layout
  const indexToAlphabet = (index: number): string => {
    return String.fromCharCode(65 + (index % 26)); // Loop back to 'A' after 'Z'
  }
  let lastRow = -1;
  const defaultLayer = keyboard.layout.map((key, index) => {
    let whitespace = ' ';
    if (key.row !== lastRow) {
      lastRow = key.row;
      whitespace = `\n                `;
    }
    return `${whitespace}&kp ${indexToAlphabet(index)}`;
  }).join('');

  return `#include <behaviors.dtsi>
#include <dt-bindings/zmk/keys.h>

/ {
    keymap {
        compatible = "zmk,keymap";

        default_layer {
            display-name = "Base";
            bindings = <${defaultLayer}
            >;
        };
    };
};
`
}

/**
 * json for keymap editor
 * @param keyboard
 */
export function config__json(keyboard: KeyboardContext): string {
  const layout = keyboard.layout.map((key) => {
    const mapped: any = {
      row: key.row,
      col: key.column,
      x: key.x,
      y: key.y,
    };
    if (key.width !== 1) mapped.w = key.width;
    if (key.height !== 1) mapped.h = key.height;
    if (key.r !== 0) mapped.r = key.r;
    if (key.rx !== 0) mapped.rx = key.rx;
    if (key.ry !== 0) mapped.ry = key.ry;
    return mapped;
  })

  return JSON.stringify({
    layouts: {
      [keyboard.info.shield]: {
        layout: layout,
      }
    }
  }, null, 2).replace(/(?<!},|\[)\n {7,}(?= )/gm, '') + '\n';
}

export function readme_md(keyboard: KeyboardContext): string {
  return `# ZMK Configuration for ${keyboard.info.name}

*Generated by Shield Wizard for ZMK*

Download compiled firmware from the Actions tab. <https://zmk.dev/docs/user-setup#installing-the-firmware>

Trigger the initial build by going to the **Actions** tab, select **Build ZMK firmware** workflow on the left, and clicking the **Run workflow** button.
All subsequent builds will be triggered automatically whenever a change is pushed to the repository.

Edit your keymap <https://zmk.dev/docs/keymaps>, or use <https://nickcoutsos.github.io/keymap-editor/> to edit it visually.
Your user keymap is located at [\`config/${keyboard.info.shield}.keymap\`](config/${keyboard.info.shield}.keymap).

-----

<details>
<summary>
debug information
</summary>

For the purpose of debugging Shield Wizard for ZMK in case of broken configuration, here is the data used to generate this configuration:

\`\`\`json
${JSON.stringify(unwrap(keyboard))}
\`\`\`


</details>

`
}
