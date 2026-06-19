// ─────────────────────────────────────────────────────────────
// Pointing / Input Device Overlay Generation
//
// Ported from main branch src/lib/templating/shield.pointing.ts
// Generates input-split and input-listener nodes for pointing
// devices (trackpads, optical sensors, etc).
// ─────────────────────────────────────────────────────────────

import type { Bus, Keyboard } from "~/types";
import { getDeviceMeta } from "~/metadata/device";
import {
  inputDeviceBaseName,
  inputDeviceNodeName,
  inputListenerNodeName,
  inputSplitNodeName,
} from "./paths";

export type PointingDeviceInfo = {
  partIndex: number;
  partName: string;
  deviceIndex: number;
  busName: string;
  busType: Bus["type"];
  device: { type: string };
  reg: number;
  baseName: string;
};

export function collectInputDevices(keyboard: Keyboard): PointingDeviceInfo[] {
  let regCounter = 0;

  return keyboard.parts.flatMap((part, partIndex) => {
    let deviceIndex = 0;
    const perPart: PointingDeviceInfo[] = [];

    for (const bus of Object.values(part.buses)) {
      for (const device of bus.devices) {
        const meta = getDeviceMeta(device.type as never);
        if (!meta || meta.class !== "pointing") continue;

        const baseName = inputDeviceBaseName(part.name, deviceIndex);

        perPart.push({
          partIndex,
          partName: part.name,
          deviceIndex,
          busName: "", // not used in output
          busType: bus.type,
          device: { type: device.type },
          reg: regCounter++,
          baseName,
        });

        deviceIndex++;
      }
    }

    return perPart;
  });
}

export function inputDevicesDtsi(devices: PointingDeviceInfo[]): string {
  if (devices.length === 0) return "";

  const splitNodes = devices
    .map(
      (d) =>
        `${inputSplitNodeName(d.baseName)}: ${inputSplitNodeName(d.baseName)}@${d.reg} {
    compatible = "zmk,input-split";
    reg = <${d.reg}>;
    status = "disabled";
};`,
    )
    .join("\n\n");

  const listenerNodes = devices
    .map(
      (d) =>
        `${inputListenerNodeName(d.baseName)}: ${inputListenerNodeName(d.baseName)} {
    compatible = "zmk,input-listener";
    status = "disabled";
    device = <&${inputSplitNodeName(d.baseName)}>;
};`,
    )
    .join("\n\n");

  return `// Input devices
/ {
    split_inputs {
        #address-cells = <1>;
        #size-cells = <0>;

${indent(splitNodes, 8)}
    };

${indent(listenerNodes, 4)}
};
`;
}

export function inputDevicesOverlay(
  partIndex: number,
  devices: PointingDeviceInfo[],
): string {
  if (devices.length === 0) return "";

  const isCentral = partIndex < 1;
  const localDevices = devices.filter((d) => d.partIndex === partIndex);
  const remoteDevices = isCentral
    ? devices.filter((d) => d.partIndex !== partIndex)
    : [];

  const sections: string[] = ["// == Input devices =="];

  if (isCentral && localDevices.length > 0) {
    sections.push("// Input devices on this central part");
    sections.push("// Enabling input listeners and pointing them to the input devices");
    sections.push(localDevices.map(listenerBlock).join("\n"));
  } else if (!isCentral && localDevices.length > 0) {
    sections.push("// Enabling input-split for its own input devices");
    sections.push("// Adding input devices and assigning them to input-split");
    sections.push(localDevices.map(splitBlock).join("\n"));
  }

  if (isCentral && remoteDevices.length > 0) {
    sections.push("// Input devices on peripheral parts");
    sections.push("// Enabling input listeners and input-split to receive input events from peripherals");
    sections.push(remoteDevices.map(peripheralRelayBlock).join("\n"));
  }

  return sections.filter(Boolean).join("\n") + "\n";
}

export function centralToPeripheralInputOverlay(
  devices: PointingDeviceInfo[],
): string {
  if (devices.length === 0) return "";

  const centralDevices = devices.filter((d) => d.partIndex === 0);
  const remoteDevices = devices.filter((d) => d.partIndex !== 0);

  const lines: string[] = [
    "// == Input devices ==",
    "// Converting this old central part to a peripheral part",
    "// - Disabling all input listeners",
    "// - Disabling input-split from other peripheral parts",
    "// - Enabling input-split for its own input devices",
    "// - Assigning devices to input-split",
  ];

  for (const d of devices) {
    lines.push(
      `&${inputListenerNodeName(d.baseName)} { status = "disabled"; };`,
    );
  }
  for (const d of remoteDevices) {
    lines.push(
      `&${inputSplitNodeName(d.baseName)} { status = "disabled"; };`,
    );
  }
  for (const d of centralDevices) {
    lines.push(splitBlock(d));
  }

  return lines.join("\n") + "\n";
}

function listenerBlock(d: PointingDeviceInfo): string {
  return `&${inputListenerNodeName(d.baseName)} {
    status = "okay";
    device = <&${inputDeviceNodeName(d.baseName)}>;
};`;
}

function splitBlock(d: PointingDeviceInfo): string {
  return `&${inputSplitNodeName(d.baseName)} {
    status = "okay";
    device = <&${inputDeviceNodeName(d.baseName)}>;
};`;
}

function peripheralRelayBlock(d: PointingDeviceInfo): string {
  return `&${inputSplitNodeName(d.baseName)} { status = "okay"; };
&${inputListenerNodeName(d.baseName)} { status = "okay"; };`;
}

function indent(block: string, spaces: number): string {
  const prefix = " ".repeat(spaces);
  return block
    .split("\n")
    .map((line) => (line ? prefix + line : line))
    .join("\n");
}
