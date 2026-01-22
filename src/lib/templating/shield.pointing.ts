import type { AnyBus, AnyBusDevice, Keyboard } from "~/typedef";
import { isInputDevice } from "~/typehelper";
import {
  inputDeviceBaseName,
  inputDeviceNodeName,
  inputListenerNodeName,
  inputSplitNodeName,
} from "./utils";

export type PointingDeviceInfo = {
  partIndex: number;
  partName: string;
  deviceIndex: number;
  busName: string;
  busType: AnyBus["type"];
  device: AnyBusDevice;
  reg: number;
  baseName: string;
};

// Raw device nodes are created in pinctrl overlays, not here.

export function collectInputDevices(keyboard: Keyboard): PointingDeviceInfo[] {
  let regCounter = 0;

  return keyboard.parts.flatMap((part, partIndex) => {
    let deviceIndex = 0;
    const perPart: PointingDeviceInfo[] = [];

    part.buses.forEach((bus) => {
      bus.devices.forEach((device) => {
        if (!isInputDevice(device)) return;

        const baseName = inputDeviceBaseName(part.name, deviceIndex);

        perPart.push({
          partIndex,
          partName: part.name,
          deviceIndex,
          busName: bus.name,
          busType: bus.type,
          device,
          reg: regCounter++,
          baseName,
        });

        deviceIndex++;
      });
    });

    return perPart;
  });
}

export function inputDevicesDtsi(devices: PointingDeviceInfo[]): string {
  if (devices.length === 0) return "";

  const splitNodes = devices.map((device) => `${inputSplitNodeName(device.baseName)}: ${inputSplitNodeName(device.baseName)}@${device.reg} {
    compatible = "zmk,input-split";
    reg = <${device.reg}>;
    status = "disabled";
};`).join("\n\n");

  const listenerNodes = devices.map((device) => `${inputListenerNodeName(device.baseName)}: ${inputListenerNodeName(device.baseName)} {
    compatible = "zmk,input-listener";
    status = "disabled";
    device = <&${inputSplitNodeName(device.baseName)}>;
};`).join("\n\n");

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

export function inputDevicesOverlay(partIndex: number, devices: PointingDeviceInfo[]): string {
  if (devices.length === 0) return "";

  const isCentral = partIndex < 1; // 0 (central) or -1 (dongle)
  const localDevices = devices.filter((device) => device.partIndex === partIndex);
  const remoteDevices = isCentral ? devices.filter((device) => device.partIndex !== partIndex) : [];

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

export function centralToPeripheralInputOverlay(_keyboard: Keyboard, devices: PointingDeviceInfo[]): string {
  if (devices.length === 0) return "";

  const centralDevices = devices.filter((device) => device.partIndex === 0);
  const remoteDevices = devices.filter((device) => device.partIndex !== 0);

  const lines: string[] = [
    "// == Input devices ==",
    "// Converting this old central part to a peripheral part",
    "// - Disabling all input listeners",
    "// - Disabling input-split from other peripheral parts",
    "// - Enabling input-split for its own input devices",
    "// - Assigning devices to input-split",
  ];

  devices.forEach((device) => {
    lines.push(`&${inputListenerNodeName(device.baseName)} { status = "disabled"; };`);
  });

  remoteDevices.forEach((device) => {
    lines.push(`&${inputSplitNodeName(device.baseName)} { status = "disabled"; };`);
  });

  centralDevices.forEach((device) => {
    lines.push(splitBlock(device));
  });

  return lines.join("\n") + "\n";
}

function listenerBlock(device: PointingDeviceInfo): string {
  return `&${inputListenerNodeName(device.baseName)} {
    status = "okay";
    device = <&${inputDeviceNodeName(device.baseName)}>;
};`;
}

function splitBlock(device: PointingDeviceInfo): string {
  return `&${inputSplitNodeName(device.baseName)} {
    status = "okay";
    device = <&${inputDeviceNodeName(device.baseName)}>;
};`;
}

function peripheralRelayBlock(device: PointingDeviceInfo): string {
  return `&${inputSplitNodeName(device.baseName)} { status = "okay"; };
&${inputListenerNodeName(device.baseName)} { status = "okay"; };`;
}

function indent(block: string, spaces: number): string {
  const prefix = " ".repeat(spaces);
  return block
    .split("\n")
    .map((line) => (line ? prefix + line : line))
    .join("\n");
}
