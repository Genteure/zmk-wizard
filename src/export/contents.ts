// ─────────────────────────────────────────────────────────────
// Content Generators — Kconfig, build.yaml, west.yml, keymap, etc.
//
// Ported from main branch src/lib/templating/contents.ts
// Adapted to the new Zod-based type system.
// All Kconfig belongs in Kconfig.defconfig, not name.conf.
// ─────────────────────────────────────────────────────────────

import type { ControllerId, Keyboard, KeyboardPart } from "~/types";
import { Controllers } from "~/metadata/controllers";
import { getDeviceMeta } from "~/metadata/device";
import { centralToPeripheralSnippetName } from "./paths";
import { version } from "virtual:version";

// ── build.yaml ──────────────────────────────────────────────

export function build_yaml(keyboard: Keyboard): string {
  const firstPart = keyboard.parts[0];
  const boardName = (controller: ControllerId): string =>
    Controllers[controller]?.board ?? controller;

  const niceView = (part: KeyboardPart): string =>
    Object.values(part.buses).some((bus) =>
      bus.devices.some((d) => d.type === "niceview"),
    )
      ? " nice_view"
      : "";

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

  if (keyboard.parts.length === 1) {
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
      content += `

## See ZMK documentation on how to build and flash the firmware for dongle mode.
## The "board" for the dongle can be anything ZMK supports.

#  - board: ${boardName(firstPart.controller)}
#    shield: ${keyboard.shield}_dongle

#  - board: ${boardName(firstPart.controller)}
#    shield: ${keyboard.shield}${niceView(firstPart)}
#    snippet: ${centralToPeripheralSnippetName(keyboard)}
#    artifact-name: ${keyboard.shield}_as_peripheral

#  - board: ${boardName(firstPart.controller)}
#    shield: ${keyboard.shield}_dongle
#    snippet: studio-rpc-usb-uart
#    cmake-args: -DCONFIG_ZMK_STUDIO=y
#    artifact-name: ${keyboard.shield}_dongle_with_studio
`;
    }
  } else {
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
      content += `

## See ZMK documentation on how to build and flash the firmware for dongle mode.
## The "board" for the dongle can be anything ZMK supports.

#  - board: ${boardName(firstPart.controller)}
#    shield: ${keyboard.shield}_dongle

#  - board: ${boardName(firstPart.controller)}
#    shield: ${keyboard.shield}_${firstPart.name}${niceView(firstPart)}
#    snippet: ${centralToPeripheralSnippetName(keyboard)}
#    artifact-name: ${keyboard.shield}_${firstPart.name}_as_peripheral

#  - board: ${boardName(firstPart.controller)}
#    shield: ${keyboard.shield}_dongle
#    snippet: studio-rpc-usb-uart
#    cmake-args: -DCONFIG_ZMK_STUDIO=y
#    artifact-name: ${keyboard.shield}_dongle_with_studio
`;
    }

    for (const part of keyboard.parts.slice(1)) {
      content += `
  - board: ${boardName(part.controller)}
    shield: ${keyboard.shield}_${part.name}${niceView(part)}
`;
    }

    const uniqueControllers = Array.from(
      new Set(keyboard.parts.map((p) => p.controller)),
    );
    for (const controller of uniqueControllers) {
      content += `
  - board: ${boardName(controller)}
    shield: settings_reset
`;
    }
  }

  return content;
}

// ── west.yml ────────────────────────────────────────────────

export function config_west_yml(keyboard: Keyboard): string {
  const extraRemotes: string[] = [];
  const extraModules: { repo: string; remote: string; rev: string }[] = [];

  const uniqueDeviceTypes = Array.from(
    new Set(
      keyboard.parts.flatMap((part) =>
        Object.values(part.buses).flatMap((bus) =>
          bus.devices.map((d) => d.type),
        ),
      ),
    ),
  );

  for (const deviceType of uniqueDeviceTypes) {
    const meta = getDeviceMeta(deviceType as never);
    if (!meta?.module) continue;
    const moduleInfo = ZmkModuleInfo[meta.module];
    if (!moduleInfo) continue;
    if (!extraRemotes.includes(moduleInfo.remote)) {
      extraRemotes.push(moduleInfo.remote);
    }
    if (
      !extraModules.some(
        (m) =>
          m.repo === moduleInfo.repo &&
          m.rev === moduleInfo.rev &&
          m.remote === moduleInfo.remote,
      )
    ) {
      extraModules.push({
        repo: moduleInfo.repo,
        remote: moduleInfo.remote,
        rev: moduleInfo.rev,
      });
    }
  }

  const extraRemotesYml = extraRemotes
    .map(
      (remote) =>
        `
    - name: ${remote}
      url-base: ${ZmkRemoteBases[remote]}`,
    )
    .join("");

  const extraModulesYml = extraModules
    .map(
      (m) =>
        `
    - name: ${m.repo}
      remote: ${m.remote}
      revision: ${m.rev}`,
    )
    .join("");

  return `manifest:
  defaults:
    revision: v0.3
  remotes:
    - name: zmkfirmware
      url-base: https://github.com/zmkfirmware${extraRemotesYml}
    # Additional modules containing boards/shields/custom code can be listed here as well
    # See https://docs.zephyrproject.org/3.2.0/develop/west/manifest.html#projects
  projects:
    - name: zmk
      remote: zmkfirmware
      import: app/west.yml${extraModulesYml}
  self:
    path: config
`;
}

const ZmkRemoteBases: Record<string, string> = {
  petejohanson: "https://github.com/petejohanson",
  badjeff: "https://github.com/badjeff",
};

const ZmkModuleInfo: Record<
  string,
  { remote: string; repo: string; rev: string }
> = {
  "petejohanson/cirque": {
    remote: "petejohanson",
    repo: "cirque-input-module",
    rev: "0de55f36bc720b5be3d8880dc856d4d78baf5214",
  },
  "badjeff/pmw3610": {
    remote: "badjeff",
    repo: "zmk-pmw3610-driver",
    rev: "zmk-0.3",
  },
  "badjeff/paw3395": {
    remote: "badjeff",
    repo: "zmk-paw3395-driver",
    rev: "ab43c664cf84c94bd6b9839f3e4aa9517773de82",
  },
};

// ── zephyr/module.yml ───────────────────────────────────────

export function zephyr_module_yml(keyboard: Keyboard): string {
  return `name: zmk-keyboard-${keyboard.shield.replaceAll("_", "-")}
build:
  settings:
    board_root: .
${keyboard.dongle ? "    snippet_root: .\n" : ""}`;
}

// ── workflows/build.yml ─────────────────────────────────────

export const WORKFLOWS_BUILD_YML = `name: Build ZMK firmware
on: [push, pull_request, workflow_dispatch]

jobs:
  build:
    uses: zmkfirmware/zmk/.github/workflows/build-user-config.yml@v0.3
`;

// ── Kconfig.shield ─────────────────────────────────────────

export function kconfig_shield(keyboard: Keyboard): string {
  if (keyboard.parts.length > 1) {
    return (
      keyboard.parts
        .map(
          (part) =>
            `config SHIELD_${keyboard.shield.toUpperCase()}_${part.name.toUpperCase()}
    def_bool $(shields_list_contains,${keyboard.shield}_${part.name})
`,
        )
        .join("\n") +
      (keyboard.dongle
        ? `
config SHIELD_${keyboard.shield.toUpperCase()}_DONGLE
    def_bool $(shields_list_contains,${keyboard.shield}_dongle)
`
        : "")
    );
  }

  let content = `config SHIELD_${keyboard.shield.toUpperCase()}
    def_bool $(shields_list_contains,${keyboard.shield})
`;
  if (keyboard.dongle) {
    content += `
config SHIELD_${keyboard.shield.toUpperCase()}_DONGLE
    def_bool $(shields_list_contains,${keyboard.shield}_dongle)
`;
  }
  return content;
}

// ── Kconfig.defconfig ─────────────────────────────────────

export function kconfig_defconfig(keyboard: Keyboard): string {
  const partCount = keyboard.parts.length;
  const upper = keyboard.shield.toUpperCase();
  const part0 = keyboard.parts[0];
  const shieldUpper0 = `${upper}_${part0.name.toUpperCase()}`;

  const enablePointing = keyboard.parts.some((part) =>
    Object.values(part.buses).some((bus) =>
      bus.devices.some(
        (d) => getDeviceMeta(d.type as never)?.class === "pointing",
      ),
    ),
  );

  const pointingConfig = enablePointing
    ? `
config ZMK_POINTING
    default y
`
    : "";

  let content = "";

  if (partCount > 1) {
    content = `if SHIELD_${shieldUpper0}

# Name must be less than 16 characters long!
config ZMK_KEYBOARD_NAME
    default "${keyboard.name}"

config ZMK_SPLIT_ROLE_CENTRAL
    default y

config ZMK_SPLIT_BLE_CENTRAL_PERIPHERALS
  default ${partCount - 1}

config BT_MAX_CONN
  default ${partCount - 1 + 5}

config BT_MAX_PAIRED
  default ${partCount - 1 + 5}

endif

if ${keyboard.parts
  .map((p) => `SHIELD_${upper}_${p.name.toUpperCase()}`)
  .join(" || ")}

config ZMK_SPLIT
    default y
${pointingConfig}
endif
`;
  } else {
    content = `if SHIELD_${upper}

# Name must be less than 16 characters long!
config ZMK_KEYBOARD_NAME
    default "${keyboard.name}"
${pointingConfig}
endif
`;
  }

  if (keyboard.dongle) {
    content += `
if SHIELD_${upper}_DONGLE

# Name must be less than 16 characters long!
config ZMK_KEYBOARD_NAME
    default "${keyboard.name}"
${pointingConfig}
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
`;
  }

  return content;
}

// ── Empty placeholder for config/<shield>.conf ─────────────

export function config_conf(_keyboard: Keyboard): string {
  // User-facing config file — kept empty intentionally.
  // All Kconfig goes into Kconfig.defconfig.
  return "# User Configuration\n# All driver Kconfig is in Kconfig.defconfig\n";
}

// ── config/<shield>.keymap ─────────────────────────────────

export function config_keymap(keyboard: Keyboard): string {
  const indexToAlphabet = (index: number): string =>
    String.fromCharCode(65 + (index % 26));

  let lastRow = -1;
  const defaultLayer = keyboard.layout
    .map((key, index) => {
      const whitespace = key.row !== lastRow
        ? `\n                `
        : " ";
      lastRow = key.row;
      return `${whitespace}&kp ${indexToAlphabet(index)}`;
    })
    .join("");

  const encoderCount = keyboard.parts.reduce(
    (sum, p) => sum + p.encoders.length,
    0,
  );

  let sensorBindings = "";
  if (encoderCount > 0) {
    const bindings = Array.from({ length: encoderCount })
      .map((_, idx) => {
        const a = indexToAlphabet(idx * 2);
        const b = indexToAlphabet(idx * 2 + 1);
        return `&inc_dec_kp ${a} ${b}`;
      })
      .join(" ");
    sensorBindings = `\n            sensor-bindings = <${bindings}>;`;
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
`;
}

// ── config/<shield>.json (keymap editor) ────────────────────

export function config_json(keyboard: Keyboard): string {
  const layout = keyboard.layout.map((key) => {
    const mapped: Record<string, number> = {
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
  });

  return (
    JSON.stringify(
      {
        layouts: {
          [keyboard.shield]: {
            layout,
          },
        },
      },
      null,
      2,
    ).replace(/(?<!},|\[)\n {7,}(?= )/gm, "") + "\n"
  );
}

// ── README.md ───────────────────────────────────────────────

export function readme_md(keyboard: Keyboard): string {
  return `# ZMK Configuration for ${keyboard.name}

*Generated by Shield Wizard for ZMK*

![Keyboard Layout](.github/shield-wizard-layout.svg)

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
${JSON.stringify(keyboard)}
\`\`\`


</details>
`;
}
