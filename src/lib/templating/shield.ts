import type {
  Controller,
  Keyboard,
  PinMode,
  VirtualTextFolder,
} from "~/typedef";
import { controllerInfos } from "../../components/controllerInfo";
import { getKeysBoundingBox } from "../geometry";
import { shield__kconfig_defconfig, shield__kconfig_shield } from "./contents";
import { createShieldPinctrlFile } from "./shield.pinctrl";
import {
  centralToPeripheralInputOverlay,
  collectInputDevices,
  inputDevicesDtsi,
  inputDevicesOverlay,
  type PointingDeviceInfo,
} from "./shield.pointing";
import {
  boardOverlayPath,
  centralToPeripheralSnippetName,
  centralToPeripheralSnippetRoot,
  dongleOverlayPath,
  kconfigDefconfigPath,
  kconfigShieldPath,
  partOverlayPath,
  shieldDtsiFilename,
  shieldDtsiPath,
  shieldLayoutsFilename,
  shieldLayoutsPath,
} from "./utils";

// TODO refactor and cleanup this file?
// TODO add testing

// special cases for shifter pins in dts mapping
const shifterDtsMap: Record<string, string> = Object.fromEntries(Array.from({ length: 32 }, (_, i) => [`shifter${i}`, `&shifter ${i}`]));

export function createShieldOverlayFiles(keyboard: Keyboard): VirtualTextFolder {
  const files: VirtualTextFolder = {};

  const inputDevices = collectInputDevices(keyboard);

  files[kconfigShieldPath(keyboard.shield)] = shield__kconfig_shield(keyboard);
  files[kconfigDefconfigPath(keyboard.shield)] = shield__kconfig_defconfig(keyboard);

  // Build per-part kscan and local matrix transform data
  const partResults: KscanSinglePartResult[] = keyboard.parts.map((part, idx) => {
    // If kscanConfig has multiple kscans, use composite builder
    if (part.kscanConfig && part.kscanConfig.kscans.length > 1) {
      return buildCompositePart(keyboard, idx);
    }

    const wiring = part.wiring;
    if (wiring === "direct_gnd" || wiring === "direct_vcc") {
      return buildDirectPart(keyboard, idx);
    } else if (wiring === "matrix_diode" || wiring === "matrix_no_diode") {
      return buildMatrixPart(keyboard, idx);
    } else if (wiring === "charlieplex") {
      return buildCharlieplexPart(keyboard, idx);
    }
    throw new Error(`Unsupported wiring type: ${wiring}`);
  });

  // Decide stacking axis: if any direct → use row-offset; else col-offset
  const anyDirect = keyboard.parts.some(p => p.wiring === "direct_gnd" || p.wiring === "direct_vcc");
  const useRowOffset = anyDirect;

  // Compute cumulative offsets and merge global matrix transform map
  let rowAcc = 0;
  let colAcc = 0;
  const perPartOffsets = partResults.map((res) => {
    const offsets = useRowOffset
      ? { rowOffset: rowAcc, colOffset: 0 }
      : { rowOffset: 0, colOffset: colAcc };
    if (useRowOffset) {
      rowAcc += res.mtRows;
    } else {
      colAcc += res.mtCols;
    }
    return offsets;
  });

  const globalMte: MatrixTransformEntry[] = [];
  partResults.forEach((res, i) => {
    const { rowOffset, colOffset } = perPartOffsets[i];
    res.mtMapping.forEach(entry => {
      globalMte.push({
        ...entry,
        kscanRow: entry.kscanRow + rowOffset,
        kscanCol: entry.kscanCol + colOffset,
      });
    });
  });

  const mtDts = makeMatrixTransform(globalMte);
  const inputDtsi = inputDevicesDtsi(inputDevices);

  // global transform in .dtsi and per-part overlays with offsets
  files[shieldDtsiPath(keyboard.shield)] = `#include "${shieldLayoutsFilename(keyboard.shield)}"
#include <dt-bindings/zmk/matrix_transform.h>

${mtDts}

&physical_layout_${keyboard.shield} {
    transform = <&matrix_transform0>;
};

${encoderDtsi(keyboard)}
${inputDtsi}
`.replace(/\n{3,}/g, "\n\n");

  keyboard.parts.forEach((part, idx) => {
    const res = partResults[idx];
    const { rowOffset, colOffset } = perPartOffsets[idx];
    const offsetBlock = (useRowOffset && rowOffset !== 0) || (!useRowOffset && colOffset !== 0)
      ? `
&matrix_transform0 {
    ${useRowOffset ? `row-offset = <${rowOffset}>;` : `col-offset = <${colOffset}>;`}
};
`
      : "";

    // Use just the keyboard shield name for unibody, multi-part uses part name suffix
    files[(partOverlayPath(keyboard, idx))] = `#include "${shieldDtsiFilename(keyboard.shield)}"

${res.kscanDts}
${offsetBlock}
&physical_layout_${keyboard.shield} {
    kscan = <&kscan0>;
};
${inputDevicesOverlay(idx, inputDevices)}
${encoderOverlay(keyboard, idx)}
`.replace(/\n{3,}/g, "\n\n");

    // pinctrl for this part (out of multi-part)
    const pinctrlContent = createShieldPinctrlFile(keyboard, idx);
    if (pinctrlContent) {
      files[boardOverlayPath(keyboard, controllerInfos[part.controller].board, idx)] = pinctrlContent.dts;

      if (pinctrlContent.defconfig) {
        files[kconfigDefconfigPath(keyboard.shield)] += pinctrlContent.defconfig;
      }
    }
  });

  files[shieldLayoutsPath(keyboard.shield)] = physicalLayoutKeyboard(keyboard);
  if (keyboard.dongle) {
    files[dongleOverlayPath(keyboard.shield)] = dongleOverlayKeyboard(keyboard, inputDevices);

    const snippetName = centralToPeripheralSnippetName(keyboard);
    const snippetRoot = centralToPeripheralSnippetRoot(keyboard);

    files[`${snippetRoot}/snippet.yml`] = `name: ${snippetName}
append:
  EXTRA_CONF_FILE: ${snippetName}.conf
  EXTRA_DTC_OVERLAY_FILE: ${snippetName}.overlay
`;

    files[`${snippetRoot}/${snippetName}.conf`] = `CONFIG_ZMK_SPLIT=y
CONFIG_ZMK_SPLIT_ROLE_CENTRAL=n
`;

    // TODO add input device changes in devicetree
    files[`${snippetRoot}/${snippetName}.overlay`] = centralToPeripheralInputOverlay(keyboard, inputDevices);

  }

  return files;
}

/**
 * Create encoder devicetree for the shared dtsi file.
 * To be included in all overlays.
 * @param keyboard The keyboard
 */
function encoderDtsi(keyboard: Keyboard): string {
  if (keyboard.parts.every(part => part.encoders.length === 0)) {
    return "";
  }

  /**
   * devicetree snippets
   */
  const dts: string[] = [];
  /**
   * encoder node labels
   */
  const names: string[] = [];

  keyboard.parts.forEach((part, _partIndex) => {
    part.encoders.forEach((_enc, encIndex) => {
      const encoderLabel = (keyboard.parts.length > 1)
        ? `encoder_${part.name}${encIndex}`
        : `encoder${encIndex}`;

      names.push(`&${encoderLabel}`);
      dts.push(`${encoderLabel}: ${encoderLabel} {
    compatible = "alps,ec11";
    steps = <80>;
    status = "disabled";
};`);
    });
  });

  return `
// Encoders for all parts of the keyboard.
// If the encoder(s) are not behaving as expected,
// update steps and triggers-per-rotation to match your hardware.
// All pin assignments are done in the part overlays.

/ {
${dts.join("\n").split("\n").map(line => "    " + line).join("\n")}

    sensors: sensors {
        compatible = "zmk,keymap-sensors";
        sensors = <${names.join(" ")}>;
        triggers-per-rotation = <20>;
    };
};
`;
}

/**
 * Create encoder overlay for a specific part.
 * For encoders on current part, enable them and assign pins.
 * For other parts, assign placeholder pins.
 * @param keyboard The keyboard
 * @param partIndex The part index
 */
function encoderOverlay(keyboard: Keyboard, partIndex: number): string {
  const otherPartHasEncoders = keyboard.parts.some((part, idx) => idx !== partIndex && part.encoders.length > 0);
  const part = partIndex < 0 ? null : keyboard.parts[partIndex];
  let dts = "";
  if (part) {
    part.encoders.forEach((enc, encIndex) => {
      const encoderLabel = (keyboard.parts.length > 1)
        ? `encoder_${part.name}${encIndex}`
        : `encoder${encIndex}`;

      dts += `&${encoderLabel} {
    a-gpios = <${dtsPinHandle(part.controller, enc.pinA!)} (GPIO_ACTIVE_HIGH | GPIO_PULL_UP)>;
    b-gpios = <${dtsPinHandle(part.controller, enc.pinB!)} (GPIO_ACTIVE_HIGH | GPIO_PULL_UP)>;
    status = "okay";
};
`;
    })
  }

  if (otherPartHasEncoders) {
    // assign dummy pins to other part's encoders
    let dummyPin: string;
    if (part) {
      const info = controllerInfos[part.controller];
      dummyPin = info.pins[Object.keys(info.pins)[0]].dtsRef;
    } else {
      dummyPin = "&gpio0 0"; // TODO this only works for nRF-based controllers
    }

    dts += `
// Assigning dummy pins to other part's encoders
// just to satisfy the devicetree requirements.
// No code will be compiled for these disabled encoders.
`;
    keyboard.parts.forEach((otherPart, idx) => {
      if (idx === partIndex) return;
      otherPart.encoders.forEach((_, encIndex) => {
        const encoderLabel = (keyboard.parts.length > 1)
          ? `encoder_${otherPart.name}${encIndex}`
          : `encoder${encIndex}`;

        dts += `&${encoderLabel} {
    a-gpios = <${dummyPin} (GPIO_ACTIVE_HIGH | GPIO_PULL_UP)>;
    b-gpios = <${dummyPin} (GPIO_ACTIVE_HIGH | GPIO_PULL_UP)>;
};
`;
      });
    });
  }
  return dts;
}

function dongleOverlayKeyboard(keyboard: Keyboard, inputDevices: PointingDeviceInfo[]): string {
  return `#include "${shieldDtsiFilename(keyboard.shield)}"

/ {
    kscan_dongle: kscan_dongle {
        compatible = "zmk,kscan-mock";
        columns = <0>;
        rows = <0>;
        events = <0>;
    };
};

&physical_layout_${keyboard.shield} {
    kscan = <&kscan_dongle>;
};
${inputDevicesOverlay(-1, inputDevices)}
${encoderOverlay(keyboard, -1)}
`;
}

// TODO remove support for using D16 on XIAO nRF52840 Plus
const seeeduino_xiao_ble_plus_disable_vbatt = `
/*
 * D16/P0.31 on Seeeduino XIAO nRF52840 Plus is the the same pin as AIN7,
 * it's connected to the BAT+ through a 1M resistor for measuring the
 * battery voltage.
 * See https://wiki.seeedstudio.com/XIAO_BLE/ for schematics.
 *
 * To use D16 (P0.31, AIN7) as GPIO in kscan, you must:
 * - Hardware: DO NOT connect battery to VBAT pin, it may fry your pins due
 *   to high voltage since sink side of the voltage divider is disabled.
 * - Firmware: Configured for you below.
 */
&adc { status = "disabled"; };
&vbatt { status = "disabled"; };
/ { chosen { /delete-property/ zmk,battery; }; };
`;

// ----------------
//     Direct
// ----------------

// ----------------
//  Per-part builders
// ----------------

function buildDirectPart(keyboard: Keyboard, part: number): KscanSinglePartResult {
  const thisPart = keyboard.parts[part];
  const pinFlag = (thisPart.wiring === "direct_gnd") ? "(GPIO_ACTIVE_LOW | GPIO_PULL_UP)" : "(GPIO_ACTIVE_HIGH | GPIO_PULL_DOWN)";
  const pinsForPart = getPinsForPart(keyboard, part);

  const pins = Object
    .entries(pinsForPart)
    .sort((a, b) => {
      const aIndex = Math.min(...a[1].keys);
      const bIndex = Math.min(...b[1].keys);
      return aIndex - bIndex;
    })
    .map(([pin, _]) => pin);

  let kscanDts = `/ {
    kscan0: kscan0 {
        compatible = "zmk,kscan-gpio-direct";
        wakeup-source;

        input-gpios
            = ${pins
      .map(pin => `<${dtsPinHandle(thisPart.controller, pin)} ${pinFlag}>`)
      .join("\n            , ")}
            ;
    };
};
`;

  if (thisPart.controller === "xiao_ble_plus" && pinsForPart['d16']) {
    kscanDts += seeeduino_xiao_ble_plus_disable_vbatt;
  }

  const mtMapping: MatrixTransformEntry[] = keyboard.layout
    .map((key, index) => {
      if (key.part !== part) return null;
      const wiring = (keyboard.parts[key.part].keys[key.id] ?? {});
      const col = pins.indexOf(wiring.input!);

      if (col === -1) {
        throw new Error(`Key ${index} (${wiring.input}, ${wiring.output}) not found in kscan pins`);
      }

      return {
        pinIndex: index,
        logicalRow: key.row,
        kscanRow: 0,
        kscanCol: col,
      } satisfies MatrixTransformEntry;
    })
    .filter((entry) => entry !== null);

  return {
    kscanDts,
    mtCols: pins.length,
    mtRows: 1,
    mtMapping,
  };
}

// ----------------
//   Charlieplex
// ----------------

function buildCharlieplexPart(keyboard: Keyboard, part: number): KscanSinglePartResult {
  const thisPart = keyboard.parts[part];
  const kscanConfig = thisPart.kscanConfig;

  // Collect charlieplex pins - they are stored in kscanConfig if available,
  // otherwise fall back to pins marked as "kscan" in the pin selection
  let charlieplexPins: string[] = [];
  let interruptPin: string | undefined;

  if (kscanConfig && kscanConfig.kscans.length > 0) {
    const cpKscan = kscanConfig.kscans.find(k => k.type === "charlieplex");
    if (cpKscan) {
      charlieplexPins = cpKscan.pins
        .filter(p => p.role === "charlieplex")
        .map(p => p.pin);
      interruptPin = cpKscan.interruptPin;
    }
  }

  // Fallback: use all "kscan" pins from pin selection
  if (charlieplexPins.length === 0) {
    charlieplexPins = Object.entries(thisPart.pins)
      .filter(([_, mode]) => mode === "kscan")
      .map(([pin]) => pin);
  }

  if (charlieplexPins.length < 2) {
    throw new Error(`Charlieplex wiring requires at least 2 pins, got ${charlieplexPins.length}`);
  }

  // Sort charlieplex pins by their associated key indices for deterministic output
  const pinsForPart = getCharlieplexPinsForPart(keyboard, part, charlieplexPins);
  const sortedPins = Object.entries(pinsForPart)
    .sort((a, b) => {
      const aMin = Math.min(...a[1].keys);
      const bMin = Math.min(...b[1].keys);
      return aMin - bMin;
    })
    .map(([pin]) => pin);

  // If sorting didn't produce all pins (e.g. some pins have no keys yet), include remaining
  const orderedPins = [
    ...sortedPins,
    ...charlieplexPins.filter(p => !sortedPins.includes(p)),
  ];

  let kscanDts = `/ {
    kscan0: kscan0 {
        compatible = "zmk,kscan-gpio-charlieplex";
        wakeup-source;

        gpios
            = ${orderedPins
    .map(pin => `<${dtsPinHandle(thisPart.controller, pin)} GPIO_ACTIVE_HIGH>`)
    .join("\n            , ")}
            ;
    };
};
`;

  if (interruptPin) {
    kscanDts = kscanDts.replace(
      "wakeup-source;",
      `wakeup-source;\n        interrupt-gpios = <${dtsPinHandle(thisPart.controller, interruptPin)} (GPIO_ACTIVE_HIGH | GPIO_PULL_DOWN)>;`
    );
  }

  // For charlieplex with n pins, we can have n*(n-1) keys
  // The matrix is organized as n rows × (n-1) columns
  // Row i, Col j means: drive pin i, sense pin j (where j >= i means j+1 in actual pin index)
  const numPins = orderedPins.length;
  const numRows = numPins;
  const numCols = numPins - 1;

  const mtMapping: MatrixTransformEntry[] = keyboard.layout
    .map((key, index) => {
      if (key.part !== part) return null;
      const wiring = (keyboard.parts[key.part].keys[key.id] ?? {});

      // For charlieplex: input is the sense pin, output is the drive pin
      const drivePin = wiring.output;
      const sensePin = wiring.input;

      if (!drivePin || !sensePin) {
        throw new Error(`Key ${index} is missing charlieplex wiring (drive/sense pins)`);
      }

      const row = orderedPins.indexOf(drivePin);
      let col = orderedPins.indexOf(sensePin);

      if (row === -1 || col === -1) {
        throw new Error(`Key ${index} (drive: ${drivePin}, sense: ${sensePin}) not found in charlieplex pins`);
      }

      // Adjust column index: skip the drive pin position
      if (col > row) {
        col = col - 1;
      }

      return {
        pinIndex: index,
        logicalRow: key.row,
        kscanRow: row,
        kscanCol: col,
      } satisfies MatrixTransformEntry;
    })
    .filter((entry) => entry !== null);

  return {
    kscanDts,
    mtCols: numCols,
    mtRows: numRows,
    mtMapping,
  };
}

/**
 * Get pin info for charlieplex part.
 * Since charlieplex pins serve as both input and output,
 * we track which keys reference each pin.
 */
function getCharlieplexPinsForPart(
  keyboard: Keyboard,
  partIndex: number,
  charlieplexPins: string[]
): Record<string, { keys: number[] }> {
  const pins: Record<string, { keys: number[] }> = {};
  const pinSet = new Set(charlieplexPins);
  const part = keyboard.parts[partIndex];

  keyboard.layout.forEach((key, index) => {
    if (key.part !== partIndex) return;
    const wiring = part.keys[key.id] ?? {};
    if (wiring.input && pinSet.has(wiring.input)) {
      if (!pins[wiring.input]) pins[wiring.input] = { keys: [] };
      pins[wiring.input].keys.push(index);
    }
    if (wiring.output && pinSet.has(wiring.output)) {
      if (!pins[wiring.output]) pins[wiring.output] = { keys: [] };
      pins[wiring.output].keys.push(index);
    }
  });
  return pins;
}

// ----------------
//     Matrix
// ----------------

function buildMatrixPart(keyboard: Keyboard, part: number): KscanSinglePartResult {
  const thisPart = keyboard.parts[part];
  const inputPinFlag = "(GPIO_ACTIVE_HIGH | GPIO_PULL_DOWN)";
  const outputPinFlag = thisPart.wiring !== "matrix_no_diode" ? "GPIO_ACTIVE_HIGH" : "GPIO_OPEN_SOURCE";

  const inputIsRow = isInputRowKeyboard(keyboard, part);
  const kscan = matrixKscanOrderKeyboard(keyboard, inputIsRow, part);

  let kscanDts = `/ {
    kscan0: kscan0 {
        compatible = "zmk,kscan-gpio-matrix";
        diode-direction = "${inputIsRow ? "col2row" : "row2col"}";
        wakeup-source;

        col-gpios
            = ${kscan.colPins
      .map(pin => `<${dtsPinHandle(thisPart.controller, pin)} ${inputIsRow ? outputPinFlag : inputPinFlag}>`)
      .join("\n            , ")}
            ;

        row-gpios
            = ${kscan.rowPins
      .map(pin => `<${dtsPinHandle(thisPart.controller, pin)} ${inputIsRow ? inputPinFlag : outputPinFlag}>`)
      .join("\n            , ")}
            ;
    };
};
`;

  const pinsForPart = getPinsForPart(keyboard, part);
  if (thisPart.controller === "xiao_ble_plus" && pinsForPart['d16']) {
    kscanDts += seeeduino_xiao_ble_plus_disable_vbatt;
  }

  const mtMapping: MatrixTransformEntry[] = keyboard.layout
    .map((key, index) => {
      if (key.part !== part) return null;
      const wiring = (keyboard.parts[key.part].keys[key.id] ?? {});
      const row = kscan.rowPins.indexOf((inputIsRow ? wiring.input : wiring.output)!);
      const col = kscan.colPins.indexOf((inputIsRow ? wiring.output : wiring.input)!);

      if (row === -1 || col === -1) {
        throw new Error(`Key ${index} (${wiring.input}, ${wiring.output}) not found in kscan pins`);
      }

      return {
        pinIndex: index,
        logicalRow: key.row,
        kscanRow: row,
        kscanCol: col,
      } satisfies MatrixTransformEntry;
    })
    .filter((entry) => entry !== null);

  return {
    kscanDts,
    mtCols: kscan.colPins.length,
    mtRows: kscan.rowPins.length,
    mtMapping,
  };
}

// ----------------
//    Composite
// ----------------

/**
 * Build a composite kscan from multiple kscan definitions in kscanConfig.
 * Sorts kscans by row count descending (direct pins last with 1 row).
 * Composes by shifting columns: height = max row count of all kscans.
 */
function buildCompositePart(keyboard: Keyboard, partIndex: number): KscanSinglePartResult {
  const thisPart = keyboard.parts[partIndex];
  const kscanConfig = thisPart.kscanConfig!;
  const kscans = kscanConfig.kscans;

  // Build individual kscan results for each sub-kscan
  interface SubKscanResult {
    kscanDef: typeof kscans[number];
    label: string;
    dts: string;
    rows: number;
    cols: number;
    mtMapping: MatrixTransformEntry[];
  }

  const subResults: SubKscanResult[] = kscans.map((kscanDef, kscanIdx) => {
    const label = kscanDef.id || `kscan_sub${kscanIdx}`;
    const result = buildSubKscan(keyboard, partIndex, kscanDef, label);
    return {
      kscanDef,
      label,
      ...result,
    };
  });

  // Sort by row count descending (direct/1-row kscans last per issue #22)
  subResults.sort((a, b) => b.rows - a.rows);

  // Compute composite dimensions:
  // Height = max row count, compose by shifting columns
  const compositeRows = Math.max(...subResults.map(r => r.rows));
  let colOffset = 0;
  const compositeMtMapping: MatrixTransformEntry[] = [];

  const childDtsNodes: string[] = [];
  subResults.forEach((sub) => {
    // Shift each sub-kscan's column positions
    sub.mtMapping.forEach(entry => {
      compositeMtMapping.push({
        ...entry,
        kscanRow: entry.kscanRow,
        kscanCol: entry.kscanCol + colOffset,
      });
    });

    childDtsNodes.push(`        ${sub.label} {
            kscan = <&${sub.label}>;
            row-offset = <0>;
            col-offset = <${colOffset}>;
        };`);

    colOffset += sub.cols;
  });

  const compositeCols = colOffset;

  // Build composite DTS
  const subKscanDts = subResults.map(sub => sub.dts).join("\n");

  const compositeDts = `/ {
${subKscanDts}

    kscan0: kscan0 {
        compatible = "zmk,kscan-composite";
        rows = <${compositeRows}>;
        columns = <${compositeCols}>;

${childDtsNodes.join("\n\n")}
    };
};
`;

  return {
    kscanDts: compositeDts,
    mtCols: compositeCols,
    mtRows: compositeRows,
    mtMapping: compositeMtMapping,
  };
}

/**
 * Build a single sub-kscan's DTS and matrix transform for use within a composite.
 */
function buildSubKscan(
  keyboard: Keyboard,
  partIndex: number,
  kscanDef: { type: string; pins: { pin: string; role: string }[]; interruptPin?: string },
  label: string
): { dts: string; rows: number; cols: number; mtMapping: MatrixTransformEntry[] } {
  const thisPart = keyboard.parts[partIndex];
  const controller = thisPart.controller;

  if (kscanDef.type === "direct_gnd" || kscanDef.type === "direct_vcc") {
    const pinFlag = kscanDef.type === "direct_gnd"
      ? "(GPIO_ACTIVE_LOW | GPIO_PULL_UP)"
      : "(GPIO_ACTIVE_HIGH | GPIO_PULL_DOWN)";

    const directPins = kscanDef.pins
      .filter(p => p.role === "direct")
      .map(p => p.pin);

    const dts = `    ${label}: ${label} {
        compatible = "zmk,kscan-gpio-direct";
        wakeup-source;

        input-gpios
            = ${directPins
      .map(pin => `<${dtsPinHandle(controller, pin)} ${pinFlag}>`)
      .join("\n            , ")}
            ;
    };`;

    // Find keys associated with these direct pins
    const mtMapping: MatrixTransformEntry[] = [];
    keyboard.layout.forEach((key, index) => {
      if (key.part !== partIndex) return;
      const wiring = thisPart.keys[key.id] ?? {};
      if (!wiring.input) return;
      const col = directPins.indexOf(wiring.input);
      if (col === -1) return;

      mtMapping.push({
        pinIndex: index,
        logicalRow: key.row,
        kscanRow: 0,
        kscanCol: col,
      });
    });

    return { dts, rows: 1, cols: directPins.length, mtMapping };
  }

  if (kscanDef.type === "matrix_diode" || kscanDef.type === "matrix_no_diode") {
    const inputPinFlag = "(GPIO_ACTIVE_HIGH | GPIO_PULL_DOWN)";
    const outputPinFlag = kscanDef.type === "matrix_diode" ? "GPIO_ACTIVE_HIGH" : "GPIO_OPEN_SOURCE";

    const rowPins = kscanDef.pins.filter(p => p.role === "row").map(p => p.pin);
    const colPins = kscanDef.pins.filter(p => p.role === "col").map(p => p.pin);

    // Determine diode direction: assume col2row (rows are input/sense, cols are output/drive)
    // In col2row: row-gpios get input flags, col-gpios get output flags
    const dts = `    ${label}: ${label} {
        compatible = "zmk,kscan-gpio-matrix";
        diode-direction = "col2row";
        wakeup-source;

        col-gpios
            = ${colPins
      .map(pin => `<${dtsPinHandle(controller, pin)} ${outputPinFlag}>`)
      .join("\n            , ")}
            ;

        row-gpios
            = ${rowPins
      .map(pin => `<${dtsPinHandle(controller, pin)} ${inputPinFlag}>`)
      .join("\n            , ")}
            ;
    };`;

    const mtMapping: MatrixTransformEntry[] = [];
    keyboard.layout.forEach((key, index) => {
      if (key.part !== partIndex) return;
      const wiring = thisPart.keys[key.id] ?? {};
      if (!wiring.input || !wiring.output) return;

      const row = rowPins.indexOf(wiring.input);
      const col = colPins.indexOf(wiring.output);
      if (row === -1 || col === -1) return;

      mtMapping.push({
        pinIndex: index,
        logicalRow: key.row,
        kscanRow: row,
        kscanCol: col,
      });
    });

    return { dts, rows: rowPins.length, cols: colPins.length, mtMapping };
  }

  if (kscanDef.type === "charlieplex") {
    const cpPins = kscanDef.pins
      .filter(p => p.role === "charlieplex")
      .map(p => p.pin);

    const numPins = cpPins.length;
    const numRows = numPins;
    const numCols = numPins - 1;

    let dts = `    ${label}: ${label} {
        compatible = "zmk,kscan-gpio-charlieplex";
        wakeup-source;

        gpios
            = ${cpPins
      .map(pin => `<${dtsPinHandle(controller, pin)} GPIO_ACTIVE_HIGH>`)
      .join("\n            , ")}
            ;
    };`;

    if (kscanDef.interruptPin) {
      dts = dts.replace(
        "wakeup-source;",
        `wakeup-source;\n        interrupt-gpios = <${dtsPinHandle(controller, kscanDef.interruptPin)} (GPIO_ACTIVE_HIGH | GPIO_PULL_DOWN)>;`
      );
    }

    const mtMapping: MatrixTransformEntry[] = [];
    keyboard.layout.forEach((key, index) => {
      if (key.part !== partIndex) return;
      const wiring = thisPart.keys[key.id] ?? {};
      if (!wiring.output || !wiring.input) return;

      const row = cpPins.indexOf(wiring.output);
      let col = cpPins.indexOf(wiring.input);
      if (row === -1 || col === -1) return;
      if (col > row) col = col - 1;

      mtMapping.push({
        pinIndex: index,
        logicalRow: key.row,
        kscanRow: row,
        kscanCol: col,
      });
    });

    return { dts, rows: numRows, cols: numCols, mtMapping };
  }

  throw new Error(`Unsupported sub-kscan type: ${kscanDef.type}`);
}

function dtsPinHandle(controller: Controller, pinId: string): string {
  const pins = controllerInfos[controller].pins;
  if (pins[pinId]) {
    return pins[pinId].dtsRef;
  } else if (shifterDtsMap[pinId]) {
    return shifterDtsMap[pinId];
  } else {
    throw new Error(`Pin ${pinId} not found in controller ${controller} dts map`);
  }
}

/**
 * Try our best to order the kscan pins following the matrix order.
 * @param keyboard
 */
export function matrixKscanOrderKeyboard(keyboard: Keyboard, inputIsRow: boolean, part: number): {
  rowPins: string[];
  colPins: string[];
} {
  const pinMap = getPinsForPart(keyboard, part);
  const popularIndexs = Object.entries(pinMap)
    .map(([pin, pinInfo]) => {
      const pinMode = pinInfo.mode;
      if (pinMode !== 'input' && pinMode !== 'output') return null;

      const readRow = inputIsRow ? pinMode === 'input' : pinMode === 'output';

      // aggregate the keys by their row or column, count them and sort
      const highestOccurrence = pinInfo.keys
        .reduce((acc, keyIndex) => {
          const key = keyboard.layout[keyIndex];
          const index = readRow ? key.row : key.col;

          if (!acc[index]) {
            acc[index] = 0;
          }
          acc[index]++;
          return acc;
        }, {} as Record<number, number>);

      const sortedOccurrences = Object.entries(highestOccurrence)
        .map(([rowOrCol, count]) => ({ rowOrCol: parseInt(rowOrCol, 10), count }))
        .sort((a, b) => b.count - a.count);

      return {
        pin,
        indexs: sortedOccurrences.map((item) => item.rowOrCol),
        weight: sortedOccurrences.length ? sortedOccurrences[0].count : 0,
        isRow: readRow,
      };
    })
    .filter((item) => item !== null)
    .sort((a, b) => b.weight - a.weight);

  const rowPins: string[] = preferenceSort(
    popularIndexs
      .filter(item => item.isRow)
      .map(item => ({
        value: item.pin,
        pref: item.indexs,
      }))
  );

  const colPins: string[] = preferenceSort(
    popularIndexs
      .filter(item => !item.isRow)
      .map(item => ({
        value: item.pin,
        pref: item.indexs,
      }))
  );

  return {
    rowPins,
    colPins,
  };
}

export function physicalLayoutKeyboard(keyboard: Keyboard): string {
  function num(n: number, pad: number): string {
    let text = Math.round(n * 100).toString();
    if (text.startsWith("-")) {
      text = `(${text})`;
    }
    return text.padStart(pad);
  }
  const keys = keyboard.layout.map((key) => {
    const rx = key.rx === 0 ? key.x : key.rx;
    const ry = key.ry === 0 ? key.y : key.ry;
    return `<&key_physical_attrs${num(key.w, 4)}${num(key.h, 4)}${num(key.x, 5)}${num(key.y, 5)}${num(key.r, 8)}${num(rx, 6)}${num(ry, 6)}>`;
  }).join("\n            , ");

  return `#include <physical_layouts.dtsi>

/ {
    physical_layout_${keyboard.shield}: physical_layout_${keyboard.shield} {
        compatible = "zmk,physical-layout";
        display-name = "${keyboard.name}";
        keys  //                     w   h    x    y     rot    rx    ry
            = ${keys}
            ;
    };
};
`;
}

/**
 * Determines the diode direction of a matrix,
 * by calculating the shape of all the keys each row and column is connected to.
 * The wider shape is row oriented, the narrower shape is column oriented.
 * @param keyboard
 * @param filter callback to filter keys
 */
export function isInputRowKeyboard(keyboard: Keyboard, part: number): boolean {
  const inputShapeRatio: number[] = [];
  const outputShapeRatio: number[] = [];

  const pinEntries = Object.values(getPinsForPart(keyboard, part)) satisfies { mode: PinMode; keys: number[] }[];

  pinEntries.forEach((pinInfo) => {
    if (pinInfo.keys.length === 0) return;

    const bbox = getKeysBoundingBox(pinInfo.keys.map((index) => keyboard.layout[index]));
    const width = bbox.max.x - bbox.min.x;
    const height = bbox.max.y - bbox.min.y;

    if (pinInfo.mode === 'input') {
      // number is bigger than 1 if the shape is wider than it is tall
      inputShapeRatio.push(width / height);
    } else if (pinInfo.mode === 'output') {
      outputShapeRatio.push(width / height);
    }
  })

  const REASONABLE_RATIO = 25;

  // filter out NaN and extreme ratios
  const filteredInput = inputShapeRatio.filter(r => !isNaN(r) && (r > (1 / REASONABLE_RATIO)) && (r < REASONABLE_RATIO));
  const filteredOutput = outputShapeRatio.filter(r => !isNaN(r) && (r > (1 / REASONABLE_RATIO)) && (r < REASONABLE_RATIO));

  const inputAvg = filteredInput.reduce((a, b) => a + b, 0) / filteredInput.length || 1;
  const outputAvg = filteredOutput.reduce((a, b) => a + b, 0) / filteredOutput.length || 1;

  // console.log(`[IsInputRow] Input shape average: ${inputAvg}, Output shape average: ${outputAvg}`);

  // if the input average is greater than the output average, it's input row
  return inputAvg >= outputAvg;
}

// Removed uniform parts validation: support heterogeneous controller/wiring per part

function getPinsForPart(keyboard: Keyboard, partIndex: number): Record<string, { mode: PinMode; keys: number[] }> {
  const pins: Record<string, { mode: PinMode; keys: number[] }> = {};
  const part = keyboard.parts[partIndex];
  keyboard.layout.forEach((key, index) => {
    if (key.part !== partIndex) return;
    const wiring = part.keys[key.id] ?? {};
    if (wiring.input) {
      if (!pins[wiring.input]) pins[wiring.input] = { mode: 'input', keys: [] };
      pins[wiring.input].keys.push(index);
    }
    if (wiring.output) {
      if (!pins[wiring.output]) pins[wiring.output] = { mode: 'output', keys: [] };
      pins[wiring.output].keys.push(index);
    }
  });
  return pins;
}

/**
 * Sort items based on their preferences of positions.
 * @param input
 * @returns
 */
function preferenceSort(input: { value: string; pref: number[] }[]): string[] {
  interface PreferenceSortItem {
    value: string;
    pref: number[];
    nextIndex: number;
    assignedPosition: number | null;
    usedPreferenceIndex: number;
  }

  const n = input.length;
  const positions: (PreferenceSortItem | null)[] = Array(n).fill(null);
  const items: PreferenceSortItem[] = input.map(p => ({
    ...p,
    nextIndex: 0,
    assignedPosition: null,
    usedPreferenceIndex: -1
  }));

  const queue: PreferenceSortItem[] = [...items];

  while (queue.length > 0) {
    const p = queue.shift()!;
    if (p.assignedPosition !== null) continue;

    if (p.nextIndex >= p.pref.length) {
      for (let i = 0; i < n; i++) {
        if (positions[i] === null) {
          positions[i] = p;
          p.assignedPosition = i;
          break;
        }
      }
    } else {
      const pos = p.pref[p.nextIndex];
      if (pos < 0 || pos >= n) {
        p.nextIndex++;
        queue.push(p);
        continue;
      }

      const currentOccupant = positions[pos];
      if (currentOccupant === null) {
        positions[pos] = p;
        p.assignedPosition = pos;
        p.usedPreferenceIndex = p.nextIndex;
      } else {
        if (currentOccupant.usedPreferenceIndex === -1) {
          p.nextIndex++;
          queue.push(p);
        } else {
          if (p.nextIndex < currentOccupant.usedPreferenceIndex) {
            positions[pos] = null;
            currentOccupant.assignedPosition = null;
            currentOccupant.nextIndex = currentOccupant.usedPreferenceIndex + 1;
            currentOccupant.usedPreferenceIndex = -1;
            queue.push(currentOccupant);

            positions[pos] = p;
            p.assignedPosition = pos;
            p.usedPreferenceIndex = p.nextIndex;
          } else {
            p.nextIndex++;
            queue.push(p);
          }
        }
      }
    }
  }

  return positions.map(p => p!.value);
}

//-----

interface KscanSinglePartResult {
  /**
   * Kscan devicetree, to be put into the shield overlay.
   */
  kscanDts: string;
  /**
   * Matrix transform width.
   * For calculating col-offset/row-offset
   * and the matrix transform size.
   */
  mtCols: number;
  /**
   * Matrix transform height.
   */
  mtRows: number;
  /**
   * Matrix transform mapping.
   */
  mtMapping: MatrixTransformEntry[];
}

interface MatrixTransformEntry {
  pinIndex: number;
  logicalRow: number;
  /**
   * Electrical row before any offset.
   * The number to be used in `RC(row,col)`.
   */
  kscanRow: number;
  /**
   * Electrical column before any offset.
   */
  kscanCol: number;
};

function makeMatrixTransform(mte: MatrixTransformEntry[]): string {
  const maxRow = Math.max(...mte.map(entry => entry.kscanRow));
  const maxCol = Math.max(...mte.map(entry => entry.kscanCol));

  let lastRow = -1;
  return `/ {
    matrix_transform0: matrix_transform0 {
        compatible = "zmk,matrix-transform";
        columns = <${maxCol + 1}>;
        rows = <${maxRow + 1}>;
        map = <${mte
      .sort((a, b) => a.pinIndex - b.pinIndex)
      .map(entry => {
        let rc = ` RC(${entry.kscanRow},${entry.kscanCol})`;
        if (entry.logicalRow !== lastRow) {
          lastRow = entry.logicalRow;
          rc = `\n           ${rc}`;
        }
        return rc;
      })
      .join("")
    // TODO format according to layout
    }
        >;
    };
};
`;
}
