import { unwrap } from "solid-js/store";
import { version } from "virtual:version";
import { controllerInfos } from "~/components/controllerInfo";
import type { Controller, Keyboard, KeyboardPart } from "~/typedef";

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

export function zephyr_module_yml(keyboard: Keyboard): string {
  return `name: zmk-keyboard-${keyboard.shield.replaceAll('_', '-')}
build:
  settings:
    board_root: .
`;
}

export function build_yaml(keyboard: Keyboard): string {
  const firstPart = keyboard.parts[0];
  if (!firstPart) throw new Error("Keyboard must have at least one part");

  let content = `# This file generates the GitHub Actions matrix.
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
---
include:
`;

  const boardName = (controller: Controller): string => controllerInfos[controller].board;
  const niceView = (part: KeyboardPart): string => (part.buses.some(bus => bus.devices.some(device => device.type === 'niceview')))
    ? ' nice_view'
    : '';

  if (keyboard.parts.length == 1) {
    // unibody

    content += `
  - board: ${boardName(firstPart.controller)}
    shield: ${keyboard.shield}${niceView(firstPart)}

## To build with ZMK Studio support, uncomment the following block
## by removing the leading '#' from each line.

#  - board: ${boardName(firstPart.controller)}
#    shield: ${keyboard.shield}${niceView(firstPart)}
#    snippet: studio-rpc-usb-uart
#    cmake-args: -DCONFIG_ZMK_STUDIO=y
#    artifact-name: ${keyboard.shield}_with_studio

  - board: ${boardName(firstPart.controller)}
    shield: settings_reset
  `;
    if (keyboard.dongle) {
      // dongle for unibody
      content += `

## See ZMK documentation on how to build and flash the firmware for dongle mode.
## The "board" for the dongle can be anything ZMK supports.

#  - board: ${boardName(firstPart.controller)}
#    shield: ${keyboard.shield}_dongle

#  - board: ${boardName(firstPart.controller)}
#    shield: ${keyboard.shield}${niceView(firstPart)}
#    cmake-args: -DCONFIG_ZMK_SPLIT=y -DCONFIG_ZMK_SPLIT_ROLE_CENTRAL=n
#    artifact-name: ${keyboard.shield}_as_peripheral

#  - board: ${boardName(firstPart.controller)}
#    shield: ${keyboard.shield}_dongle
#    snippet: studio-rpc-usb-uart
#    cmake-args: -DCONFIG_ZMK_STUDIO=y
#    artifact-name: ${keyboard.shield}_dongle_with_studio
`;
    }

  } else {
    // split keyboard with multiple parts

    // central (first part)
    content += `
  - board: ${boardName(firstPart.controller)}
    shield: ${keyboard.shield}_${firstPart.name}${niceView(firstPart)}

## To build with ZMK Studio support, uncomment the following block
## by removing the leading '#' from each line.

#  - board: ${boardName(firstPart.controller)}
#    shield: ${keyboard.shield}_${firstPart.name}${niceView(firstPart)}
#    snippet: studio-rpc-usb-uart
#    cmake-args: -DCONFIG_ZMK_STUDIO=y
#    artifact-name: ${keyboard.shield}_${firstPart.name}_with_studio
`;

    if (keyboard.dongle) {
      // dongle for central
      content += `

## See ZMK documentation on how to build and flash the firmware for dongle mode.
## The "board" for the dongle can be anything ZMK supports.

#  - board: ${boardName(firstPart.controller)}
#    shield: ${keyboard.shield}_dongle

#  - board: ${boardName(firstPart.controller)}
#    shield: ${keyboard.shield}_${firstPart.name}${niceView(firstPart)}
#    cmake-args: -DCONFIG_ZMK_SPLIT_ROLE_CENTRAL=n
#    artifact-name: ${keyboard.shield}_${firstPart.name}_as_peripheral

#  - board: ${boardName(firstPart.controller)}
#    shield: ${keyboard.shield}_dongle
#    snippet: studio-rpc-usb-uart
#    cmake-args: -DCONFIG_ZMK_STUDIO=y
#    artifact-name: ${keyboard.shield}_dongle_with_studio
`;
    }

    // peripherals (rest parts)
    for (const part of keyboard.parts.slice(1)) {
      content += `
  - board: ${boardName(part.controller)}
    shield: ${keyboard.shield}_${part.name}${niceView(part)}
`;
    }

    // settings reset
    const uniqueControllers = Array.from(new Set(keyboard.parts.map(part => part.controller)));
    for (const controller of uniqueControllers) {
      content += `
  - board: ${boardName(controller)}
    shield: settings_reset
`;
    }
  }

  return content;
}

export function shield__kconfig_shield(keyboard: Keyboard): string {
  let content = '';

  if (keyboard.parts.length > 1) {
    content = keyboard.parts
      .map(part => `config SHIELD_${keyboard.shield.toUpperCase()}_${part.name.toUpperCase()}
    def_bool $(shields_list_contains,${keyboard.shield}_${part.name})
  `)
      .join('\n');

  } else {
    content = `config SHIELD_${keyboard.shield.toUpperCase()}
    def_bool $(shields_list_contains,${keyboard.shield})
`
  }

  if (keyboard.dongle) {
    content += `
config SHIELD_${keyboard.shield.toUpperCase()}_DONGLE
    def_bool $(shields_list_contains,${keyboard.shield}_dongle)
`;
  }

  return content;
}

export function shield__kconfig_defconfig(keyboard: Keyboard): string {
  const partCount = keyboard.parts.length;
  let content = '';
  if (partCount > 1) {

    content = `if SHIELD_${keyboard.shield.toUpperCase()}_${keyboard.parts[0].name.toUpperCase()}

# Name must be less than 16 characters long!
config ZMK_KEYBOARD_NAME
    default "${keyboard.name}"

config ZMK_SPLIT_ROLE_CENTRAL
    default y

endif
`;


    content += `
if ${keyboard.parts.map(part => `SHIELD_${keyboard.shield.toUpperCase()}_${part.name.toUpperCase()}`).join(' || ')}

config ZMK_SPLIT
    default y

endif
`;
  } else {
    content = `if SHIELD_${keyboard.shield.toUpperCase()}

# Name must be less than 16 characters long!
config ZMK_KEYBOARD_NAME
    default "${keyboard.name}"

endif
`
  }

  if (keyboard.dongle) {
    content += `
if SHIELD_${keyboard.shield.toUpperCase()}_DONGLE

# Name must be less than 16 characters long!
config ZMK_KEYBOARD_NAME
    default "${keyboard.name}"

config ZMK_SPLIT
    default y

config ZMK_SPLIT_ROLE_CENTRAL
    default y

config ZMK_SPLIT_BLE_CENTRAL_PERIPHERALS
  default ${partCount}

config BT_MAX_CONN
  default ${partCount + 5}

config BT_MAX_PAIRED
  default ${partCount + 5}

endif
`
  }

  return content;
}

export function config__conf(keyboard: Keyboard): string {
  let conf = '# User Configuration for ${keyboard.name}\n\n';

  // // if any screen
  // const screens = ["ssd1306", "niceview"];
  // if (keyboard.parts.some(part => part.buses.some(bus => bus.devices.some(device => screens.includes(device.type))))) {
  //   conf += `CONFIG_ZMK_DISPLAY=y\n`; // TODO split into conf for each part
  // }

  // if any encoder
  if (keyboard.parts.some(part => part.encoders.length > 0)) {
    conf += `CONFIG_EC11=y
CONFIG_EC11_TRIGGER_GLOBAL_THREAD=y
`;
  }

  // TODO more

  return conf;
}
export function config__keymap(keyboard: Keyboard): string {
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

  const encoderCount = keyboard.parts.reduce((sum, part) => sum + part.encoders.length, 0);

  let sensorBindings = '';
  if (encoderCount > 0) {
    // &inc_dec_kp A B &inc_dec_kp C D ...
    sensorBindings = '\n            sensor-bindings = <';
    sensorBindings += Array.from({ length: encoderCount }).map((_, idx) => {
      const keyA = indexToAlphabet(idx * 2);
      const keyB = indexToAlphabet(idx * 2 + 1);
      return `&inc_dec_kp ${keyA} ${keyB}`;
    }).join(' ');
    sensorBindings += '>;';
  }

  return `#include <behaviors.dtsi>
#include <dt-bindings/zmk/keys.h>

/ {
    keymap {
        compatible = "zmk,keymap";

        default_layer {
            display-name = "Base";
            bindings = <${defaultLayer}
            >;${sensorBindings}
        };
    };
};
`
}

/**
 * json for keymap editor
 * @param keyboard
 */
export function config__json(keyboard: Keyboard): string {
  const layout = keyboard.layout.map((key) => {
    const mapped: any = {
      row: key.row,
      col: key.col,
      x: key.x,
      y: key.y,
    };
    if (key.w !== 1) mapped.w = key.w;
    if (key.h !== 1) mapped.h = key.h;
    if (key.r !== 0) mapped.r = key.r;
    if (key.rx !== 0) mapped.rx = key.rx;
    if (key.ry !== 0) mapped.ry = key.ry;
    return mapped;
  })

  return JSON.stringify({
    layouts: {
      [keyboard.shield]: {
        layout: layout,
      }
    }
  }, null, 2).replace(/(?<!},|\[)\n {7,}(?= )/gm, '') + '\n';
}

export function readme_md(keyboard: Keyboard): string {
  return `# ZMK Configuration for ${keyboard.name}

*Generated by Shield Wizard for ZMK*

Download compiled firmware from the Actions tab. <https://zmk.dev/docs/user-setup#installing-the-firmware>

Edit your keymap <https://zmk.dev/docs/keymaps>.
User keymap is located at [\`config/${keyboard.shield}.keymap\`](config/${keyboard.shield}.keymap).

-----

<details>
<summary>
Shield Wizard Debug Information
</summary>

In case of broken configuration, here is the Shield Wizard internal data used to generate this configuration:

Commit: ${version.commit || '(unknown)'}

\`\`\`json
${JSON.stringify(unwrap(keyboard))}
\`\`\`


</details>
`
}
