// ─────────────────────────────────────────────────────────────
// Shield Overlay File Generation
//
// Ported from main branch src/lib/templating/shield.ts
// Generates per-part kscan DTS, matrix transforms, physical
// layout .dtsi, per-part overlays, encoder DTS, and wires
// pinctrl via the existing src/metadata/templates layer.

import type { Key, Keyboard, EncoderId, ControllerId } from "~/types";
import { Controllers } from "~/metadata/controllers";
import { generatePartTemplates } from "~/metadata/templates";
import {
  collectInputDevices,
  inputDevicesDtsi,
  inputDevicesOverlay,
  centralToPeripheralInputOverlay,
  type PointingDeviceInfo,
} from "./pointing";
import {
  boardOverlayPath,
  dongleOverlayPath,
  kconfigDefconfigPath,
  partOverlayPath,
  shieldDtsiFilename,
  shieldDtsiPath,
  shieldLayoutsFilename,
  shieldLayoutsPath,
  centralToPeripheralSnippetName,
  centralToPeripheralSnippetRoot,
} from "./paths";

/** Record of generated file paths → content */
export type BuildFiles = Record<string, string>;
// ── Entry: Create all shield overlay files ────────────────

export function createShieldOverlayFiles(
  keyboard: Keyboard,
): BuildFiles {
  const files: BuildFiles = {};
  const partCount = keyboard.parts.length;
  const inputDevices = collectInputDevices(keyboard);

  // Build per-part kscan data
  const partResults: KscanSinglePartResult[] = keyboard.parts.map(
    (_, idx) => buildPartKscans(keyboard, idx),
  );

  // Always use row-offset to stack parts vertically (shift down)
  let rowAcc = 0;
  const perPartRowOffsets = partResults.map((res) => {
    const offset = rowAcc;
    rowAcc += res.mtRows;
    return offset;
  });

  // Merge global matrix transform with row offsets
  const globalMte: MatrixTransformEntry[] = [];
  partResults.forEach((res, i) => {
    const rowOff = perPartRowOffsets[i];
    for (const entry of res.mtMapping) {
      globalMte.push({
        ...entry,
        kscanRow: entry.kscanRow + rowOff,
        kscanCol: entry.kscanCol,
      });
    }
  });

  const mtDts = makeMatrixTransform(globalMte);
  const inputDtsi = inputDevicesDtsi(inputDevices);

  // Global .dtsi file
  files[shieldDtsiPath(keyboard.shield)] = `#include "${shieldLayoutsFilename(keyboard.shield)}"
#include <dt-bindings/zmk/matrix_transform.h>

${mtDts}

&physical_layout_${keyboard.shield} {
    transform = <&matrix_transform0>;
};

${encoderDtsi(keyboard)}
${inputDtsi}
`.replace(/\n{3,}/g, "\n\n");

  // Per-part overlays
  for (let idx = 0; idx < partCount; idx++) {
    const res = partResults[idx];
    const rowOff = perPartRowOffsets[idx];

    const offsetBlock = rowOff !== 0
      ? `
&matrix_transform0 {
    row-offset = <${rowOff}>;
};
`
      : "";

    files[partOverlayPath(keyboard, idx)] = `#include "${shieldDtsiFilename(keyboard.shield)}"

${res.kscanDts}
${offsetBlock}
&physical_layout_${keyboard.shield} {
    kscan = <&kscan0>;
};
${inputDevicesOverlay(idx, inputDevices)}
${encoderOverlay(keyboard, idx)}
`.replace(/\n{3,}/g, "\n\n");

    // Pinctrl overlay for this part
    const part = keyboard.parts[idx];
    const pinctrlResult = generatePartTemplates(
      idx,
      part.name,
      part.buses,
      part.pins,
      part.controller,
      idx === 0,
    );

    const pinctrlPath = boardOverlayPath(
      keyboard,
      Controllers[part.controller]?.board ?? part.controller,
      idx,
    );
    if (pinctrlResult.pinctrlDts) {
      files[pinctrlPath] = pinctrlResult.pinctrlDts;
    }
    if (pinctrlResult.kconfig.length > 0) {
      const defconfigPath = kconfigDefconfigPath(keyboard.shield);
      const existing = (files[defconfigPath] ?? "") as string;
      const boardKconfig =
        Controllers[part.controller]?.boardKconfig ?? `BOARD_${part.controller.toUpperCase()}`;
      const upper = keyboard.shield.toUpperCase();
      const shieldCondef =
        partCount > 1
          ? `SHIELD_${upper}_${part.name.toUpperCase()}`
          : `SHIELD_${upper}`;
      const block = `
# --- Pinctrl Kconfig for part "${part.name}" ---
if ${boardKconfig} && ${shieldCondef}

${pinctrlResult.kconfig.join("\n")}

endif
`;
      files[defconfigPath] = existing + block;
    }
  }

  // Physical layout .dtsi
  files[shieldLayoutsPath(keyboard.shield)] = exportPhysicalLayoutDts({
    shield: keyboard.shield,
    name: keyboard.name,
    layout: keyboard.layout,
  });

  // Dongle overlay
  if (keyboard.dongle) {
    files[dongleOverlayPath(keyboard.shield)] = dongleOverlayKeyboard(
      keyboard,
      inputDevices,
    );

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

    files[`${snippetRoot}/${snippetName}.overlay`] =
      centralToPeripheralInputOverlay(inputDevices);
  }

  return files;
}

// ── Part-level empty builder ─────────────────────────

function buildEmptyPart(): KscanSinglePartResult {
  return {
    kscanDts: "",
    mtCols: 0,
    mtRows: 0,
    mtMapping: [],
  };
}


// ── Helpers ────────────────────────────────────────────────

function dtsPinHandle(controller: ControllerId, pinId: string): string {
  const pinMeta = Controllers[controller]?.gpios[pinId as never];
  if (pinMeta) return pinMeta.dtsRef;
  // Check for shifter pins
  if (pinId.startsWith("shifter")) {
    return `&shifter ${pinId.replace("shifter", "")}`;
  }
  throw new Error(
    `Pin ${pinId} not found in controller ${controller} dts map`,
  );
}

function seeeduinoDisableVBatt(): string {
  return `
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
}



// ── Preference sort (stable pin ordering) ─────────────────

function preferenceSort(
  input: { value: string; pref: number[] }[],
): string[] {
  interface Item {
    value: string;
    pref: number[];
    nextIndex: number;
    assignedPosition: number | null;
    usedPreferenceIndex: number;
  }

  const n = input.length;
  const positions: (Item | null)[] = Array(n).fill(null);
  const items: Item[] = input.map((p) => ({
    ...p,
    nextIndex: 0,
    assignedPosition: null,
    usedPreferenceIndex: -1,
  }));

  const queue: Item[] = [...items];

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

  return positions.map((p) => p!.value);
}

// ── Physical layout helpers ───────────────────────────────

interface BoundingBox2D {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function getKeysBoundingBox(
  keys: { x: number; y: number; w: number; h: number }[],
): BoundingBox2D {
  const minX = Math.min(...keys.map((k) => k.x));
  const minY = Math.min(...keys.map((k) => k.y));
  const maxX = Math.max(...keys.map((k) => k.x + k.w));
  const maxY = Math.max(...keys.map((k) => k.y + k.h));
  return { minX, minY, maxX, maxY };
}


/** Format a number for DTS physical layout (hundredths of a unit) */
function dtsNum(n: number, pad: number): string {
  let text = Math.round(n * 100).toString();
  if (text.startsWith('-')) {
    text = `(${text})`;
  }
  return text.padStart(pad);
}

/**
 * Export keyboard layout to ZMK Physical Layout DTS string.
 */
export function exportPhysicalLayoutDts(
  keyboard: { shield: string; name: string; layout: Key[] },
): string {
  const keys = keyboard.layout.map((key) => {
    const rx = key.rx === 0 ? key.x : key.rx;
    const ry = key.ry === 0 ? key.y : key.ry;
    return `<&key_physical_attrs${dtsNum(key.w, 4)}${dtsNum(key.h, 4)}${dtsNum(key.x, 5)}${dtsNum(key.y, 5)}${dtsNum(key.r, 8)}${dtsNum(rx, 6)}${dtsNum(ry, 6)}>`;
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
// ── DTS generation helpers ────────────────────────────────

function makeMatrixTransform(mte: MatrixTransformEntry[]): string {
  if (mte.length === 0) return "";

  const maxRow = Math.max(...mte.map((e) => e.kscanRow));
  const maxCol = Math.max(...mte.map((e) => e.kscanCol));

  let lastRow = -1;
  const mapEntries = mte
    .sort((a, b) => a.pinIndex - b.pinIndex)
    .map((entry) => {
      let rc = ` RC(${entry.kscanRow},${entry.kscanCol})`;
      if (entry.logicalRow !== lastRow) {
        lastRow = entry.logicalRow;
        rc = `\n           ${rc}`;
      }
      return rc;
    })
    .join("");

  return `/ {
    matrix_transform0: matrix_transform0 {
        compatible = "zmk,matrix-transform";
        columns = <${maxCol + 1}>;
        rows = <${maxRow + 1}>;
        map = <${mapEntries}
        >;
    };
};
`;
}

// ── Encoders ──────────────────────────────────────────────

function encoderDtsi(keyboard: Keyboard): string {
  if (keyboard.parts.every((p) => p.encoders.length === 0)) {
    return "";
  }

  const dts: string[] = [];
  const names: string[] = [];

  for (let pi = 0; pi < keyboard.parts.length; pi++) {
    const part = keyboard.parts[pi];
    for (let ei = 0; ei < part.encoders.length; ei++) {
      const label =
        keyboard.parts.length > 1
          ? `encoder_${part.name}${ei}`
          : `encoder${ei}`;

      names.push(`&${label}`);
      dts.push(`${label}: ${label} {
    compatible = "alps,ec11";
    steps = <80>;
    status = "disabled";
};`);
    }
  }

  return `
// Encoders for all parts of the keyboard.
// If the encoder(s) are not behaving as expected,
// update steps and triggers-per-rotation to match your hardware.
// All pin assignments are done in the part overlays.

/ {
${dts.join("\n").split("\n").map((line) => "    " + line).join("\n")}

    sensors: sensors {
        compatible = "zmk,keymap-sensors";
        sensors = <${names.join(" ")}>;
        triggers-per-rotation = <20>;
    };
};
`;
}

function encoderOverlay(keyboard: Keyboard, partIndex: number): string {
  const otherPartHasEncoders = keyboard.parts.some(
    (p, idx) => idx !== partIndex && p.encoders.length > 0,
  );
  const part = partIndex >= 0 ? keyboard.parts[partIndex] : null;
  let dts = "";

  /** Look up an encoder pin from part.pins by encoder ID and role */
  function encoderPin(pid: EncoderId, role: "pinA" | "pinB"): string | undefined {
    if (!part) return undefined;
    for (const [pinId, usage] of Object.entries(part.pins)) {
      if (
        usage &&
        usage.usage === "encoder" &&
        usage.encoderId === pid &&
        usage.role === role
      ) {
        return pinId;
      }
    }
    return undefined;
  }

  if (part) {
    for (let ei = 0; ei < part.encoders.length; ei++) {
      const enc = part.encoders[ei];
      const label =
        keyboard.parts.length > 1
          ? `encoder_${part.name}${ei}`
          : `encoder${ei}`;
      const pinA = encoderPin(enc.id, "pinA");
      const pinB = encoderPin(enc.id, "pinB");
      if (!pinA || !pinB) continue;

      dts += `&${label} {
    a-gpios = <${dtsPinHandle(part.controller, pinA)} (GPIO_ACTIVE_HIGH | GPIO_PULL_UP)>;
    b-gpios = <${dtsPinHandle(part.controller, pinB)} (GPIO_ACTIVE_HIGH | GPIO_PULL_UP)>;
    status = "okay";
};
`;
    }
  }

  if (otherPartHasEncoders && part) {
    let dummyPin: string;
    const controllerMeta = Controllers[part.controller];
    const firstPin = Object.keys(controllerMeta?.gpios ?? {})[0];
    dummyPin = firstPin
      ? controllerMeta.gpios[firstPin as never].dtsRef
      : "&gpio0 0";

    dts += `
// Assigning dummy pins to other part's encoders
// just to satisfy the devicetree requirements.
// No code will be compiled for these disabled encoders.
`;
    for (let pi = 0; pi < keyboard.parts.length; pi++) {
      if (pi === partIndex) continue;
      const otherPart = keyboard.parts[pi];
      for (let ei = 0; ei < otherPart.encoders.length; ei++) {
        const label =
          keyboard.parts.length > 1
            ? `encoder_${otherPart.name}${ei}`
            : `encoder${ei}`;
        dts += `&${label} {
    a-gpios = <${dummyPin} (GPIO_ACTIVE_HIGH | GPIO_PULL_UP)>;
    b-gpios = <${dummyPin} (GPIO_ACTIVE_HIGH | GPIO_PULL_UP)>;
};
`;
      }
    }
  }

  return dts;
}

function dongleOverlayKeyboard(
  keyboard: Keyboard,
  inputDevices: PointingDeviceInfo[],
): string {
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
`;
}

// ── Types ─────────────────────────────────────────────────

export interface MatrixTransformEntry {
  pinIndex: number;
  logicalRow: number;
  kscanRow: number;
  kscanCol: number;
}

interface KscanSinglePartResult {
  kscanDts: string;
  mtCols: number;
  mtRows: number;
  mtMapping: MatrixTransformEntry[];
}

// ── Per-kscan types ─────────────────────────────────

interface KscanUnitResult {
  /** Label for this kscan node (e.g. "kscan0", "kscan1") */
  label: string;
  /** Full DTS for this kscan node */
  kscanDts: string;
  rows: number;
  cols: number;
  /** Per-key mapping within this kscan's local matrix */
  keyMappings: Array<{
    keyIndex: number;
    kscanRow: number;
    kscanCol: number;
  }>;
}

// ── Kscan-scoped pin helpers ────────────────────────

/**
 * Get pins assigned to a specific kscan, grouped by their role.
 * Includes which keys use each pin.
 */
function pinsForKscan(
  keyboard: Keyboard,
  partIndex: number,
  kscanId: string,
): Record<string, { mode: "input" | "output" | "interrupt"; keys: number[] }> {
  const part = keyboard.parts[partIndex];
  const pins: Record<string, { mode: "input" | "output" | "interrupt"; keys: number[] }> = {};

  for (const [pinId, usage] of Object.entries(part.pins)) {
    if (!usage || usage.usage !== "kscan" || usage.kscan !== kscanId) continue;
    pins[pinId] = { mode: usage.role, keys: [] };
  }

  for (let i = 0; i < keyboard.layout.length; i++) {
    const key = keyboard.layout[i];
    if (key.part !== partIndex) continue;
    const wiring = part.keys[key.id];
    if (!wiring) continue;
    if (wiring.input && pins[wiring.input]) pins[wiring.input].keys.push(i);
    if (wiring.output && pins[wiring.output]) pins[wiring.output].keys.push(i);
  }

  return pins;
}

// ── Kscan-scoped matrix ordering ────────────────────

function isInputRowKscan(
  keyboard: Keyboard,
  partIndex: number,
  kscanId: string,
): boolean {
  const inputShapeRatio: number[] = [];
  const outputShapeRatio: number[] = [];

  const pinEntries = Object.values(pinsForKscan(keyboard, partIndex, kscanId));

  for (const pinInfo of pinEntries) {
    if (pinInfo.keys.length === 0 || pinInfo.mode === "interrupt") continue;
    const bbox = getKeysBoundingBox(
      pinInfo.keys.map((index) => keyboard.layout[index]),
    );
    const width = bbox.maxX - bbox.minX;
    const height = bbox.maxY - bbox.minY;
    if (pinInfo.mode === "input") {
      inputShapeRatio.push(width / height);
    } else if (pinInfo.mode === "output") {
      outputShapeRatio.push(width / height);
    }
  }

  const REASONABLE_RATIO = 25;
  const filteredInput = inputShapeRatio.filter(
    (r) => !isNaN(r) && r > 1 / REASONABLE_RATIO && r < REASONABLE_RATIO,
  );
  const filteredOutput = outputShapeRatio.filter(
    (r) => !isNaN(r) && r > 1 / REASONABLE_RATIO && r < REASONABLE_RATIO,
  );
  const inputAvg =
    filteredInput.reduce((a, b) => a + b, 0) / filteredInput.length || 1;
  const outputAvg =
    filteredOutput.reduce((a, b) => a + b, 0) / filteredOutput.length || 1;

  return inputAvg >= outputAvg;
}

function matrixKscanOrderKscan(
  keyboard: Keyboard,
  inputIsRow: boolean,
  partIndex: number,
  kscanId: string,
): {
  rowPins: string[];
  colPins: string[];
} {
  const pinMap = pinsForKscan(keyboard, partIndex, kscanId);
  const popularIndexs = Object.entries(pinMap)
    .map(([pin, pinInfo]) => {
      if (pinInfo.mode !== "input" && pinInfo.mode !== "output") return null;

      const readRow = inputIsRow ? pinInfo.mode === "input" : pinInfo.mode === "output";
      const highestOccurrence: Record<number, number> = {};

      for (const keyIndex of pinInfo.keys) {
        const key = keyboard.layout[keyIndex];
        const index = readRow ? key.row : key.col;
        highestOccurrence[index] = (highestOccurrence[index] ?? 0) + 1;
      }

      const sortedOccurrences = Object.entries(highestOccurrence)
        .map(([rowOrCol, count]) => ({
          rowOrCol: Number(rowOrCol),
          count,
        }))
        .sort((a, b) => b.count - a.count);

      return {
        pin,
        indexs: sortedOccurrences.map((item) => item.rowOrCol),
        weight: sortedOccurrences.length ? sortedOccurrences[0].count : 0,
        isRow: readRow,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => b.weight - a.weight);

  const rowPins: string[] = preferenceSort(
    popularIndexs
      .filter((item) => item.isRow)
      .map((item) => ({
        value: item.pin,
        pref: item.indexs,
      })),
  );

  const colPins: string[] = preferenceSort(
    popularIndexs
      .filter((item) => !item.isRow)
      .map((item) => ({
        value: item.pin,
        pref: item.indexs,
      })),
  );

  return { rowPins, colPins };
}

// ── Per-kscan DTS builders ───────────────────────────

function buildDirectKscanUnit(
  keyboard: Keyboard,
  partIndex: number,
  _kscanIndex: number,
  label: string,
): KscanUnitResult | null {
  const part = keyboard.parts[partIndex];
  const kscan = part.kscans[_kscanIndex];
  if (!kscan || kscan.kind !== "direct") return null;

  const pinFlag = kscan.mode === "gnd"
    ? "(GPIO_ACTIVE_LOW | GPIO_PULL_UP)"
    : "(GPIO_ACTIVE_HIGH | GPIO_PULL_DOWN)";

  const pinData = pinsForKscan(keyboard, partIndex, kscan.id);
  const pins = Object.entries(pinData)
    .filter(([_, info]) => info.mode === "input")
    .sort((a, b) => {
      const aIndex = Math.min(...a[1].keys, 99999);
      const bIndex = Math.min(...b[1].keys, 99999);
      return aIndex - bIndex;
    })
    .map(([pin]) => pin);

  if (pins.length === 0) return null;

  const dtsRefs = pins.map((pin) => dtsPinHandle(part.controller, pin));

  let kscanDts = `/ {
    ${label}: ${label} {
        compatible = "zmk,kscan-gpio-direct";
        wakeup-source;

        input-gpios
            = ${dtsRefs.map((ref) => `<${ref} ${pinFlag}>`).join("\n            , ")}
            ;
    };
};
`;

  if (part.controller === "xiao_ble" && pinData["d16"]) {
    kscanDts += seeeduinoDisableVBatt();
  }

  const keyMappings: KscanUnitResult["keyMappings"] = keyboard.layout
    .map((key, index) => {
      if (key.part !== partIndex) return null;
      const wiring = part.keys[key.id];
      if (!wiring?.input) return null;
      const col = pins.indexOf(wiring.input);
      if (col === -1) return null;
      return { keyIndex: index, kscanRow: 0, kscanCol: col };
    })
    .filter((e): e is NonNullable<typeof e> => e !== null);

  return { label, kscanDts, rows: 1, cols: pins.length, keyMappings };
}

function buildMatrixKscanUnit(
  keyboard: Keyboard,
  partIndex: number,
  _kscanIndex: number,
  label: string,
): KscanUnitResult | null {
  const part = keyboard.parts[partIndex];
  const kscan = part.kscans[_kscanIndex];
  if (!kscan || kscan.kind !== "matrix") return null;

  const inputPinFlag = "(GPIO_ACTIVE_HIGH | GPIO_PULL_DOWN)";
  const outputPinFlag = kscan.diodes ? "GPIO_ACTIVE_HIGH" : "GPIO_OPEN_SOURCE";
  const inputIsRow = isInputRowKscan(keyboard, partIndex, kscan.id);
  const kscanOrder = matrixKscanOrderKscan(keyboard, inputIsRow, partIndex, kscan.id);

  const colPins = kscanOrder.colPins.map((pin) =>
    dtsPinHandle(part.controller, pin),
  );
  const rowPins = kscanOrder.rowPins.map((pin) =>
    dtsPinHandle(part.controller, pin),
  );

  if (colPins.length === 0 || rowPins.length === 0) return null;

  const diodeProp = kscan.diodes
    ? `        diode-direction = "${inputIsRow ? "col2row" : "row2col"}";\n`
    : "";

  let kscanDts = `/ {
    ${label}: ${label} {
        compatible = "zmk,kscan-gpio-matrix";
        ${diodeProp}        wakeup-source;

        col-gpios
            = ${colPins.map((ref) => `<${ref} ${inputIsRow ? outputPinFlag : inputPinFlag}>`).join("\n            , ")}
            ;

        row-gpios
            = ${rowPins.map((ref) => `<${ref} ${inputIsRow ? inputPinFlag : outputPinFlag}>`).join("\n            , ")}
            ;
    };
};
`;

  const pinData = pinsForKscan(keyboard, partIndex, kscan.id);
  if (part.controller === "xiao_ble" && pinData["d16"]) {
    kscanDts += seeeduinoDisableVBatt();
  }

  const keyMappings: KscanUnitResult["keyMappings"] = keyboard.layout
    .map((key, index) => {
      if (key.part !== partIndex) return null;
      const wiring = part.keys[key.id];
      if (!wiring?.input && !wiring?.output) return null;
      const row = kscanOrder.rowPins.indexOf(
        inputIsRow ? (wiring.input ?? "") : (wiring.output ?? ""),
      );
      const col = kscanOrder.colPins.indexOf(
        inputIsRow ? (wiring.output ?? "") : (wiring.input ?? ""),
      );
      if (row === -1 || col === -1) return null;
      return { keyIndex: index, kscanRow: row, kscanCol: col };
    })
    .filter((e): e is NonNullable<typeof e> => e !== null);

  return { label, kscanDts, rows: rowPins.length, cols: colPins.length, keyMappings };
}

function buildCharlieplexKscanUnit(
  keyboard: Keyboard,
  partIndex: number,
  _kscanIndex: number,
  label: string,
): KscanUnitResult | null {
  const part = keyboard.parts[partIndex];
  const kscan = part.kscans[_kscanIndex];
  if (!kscan || kscan.kind !== "charlieplex") return null;

  const pinData = pinsForKscan(keyboard, partIndex, kscan.id);
  const gpios = Object.entries(pinData)
    .filter(([_, info]) => info.mode === "input" || info.mode === "output")
    .sort((a, b) => {
      const aIndex = Math.min(...a[1].keys, 99999);
      const bIndex = Math.min(...b[1].keys, 99999);
      return aIndex - bIndex;
    })
    .map(([pin]) => pin);

  if (gpios.length < 2) return null;

  const interruptPin = Object.entries(pinData).find(
    ([_, info]) => info.mode === "interrupt",
  );
  const dtsRefs = gpios.map((pin) => dtsPinHandle(part.controller, pin));
  const interruptDts = interruptPin
    ? `\n        interrupt-gpios = <${dtsPinHandle(part.controller, interruptPin[0])} (GPIO_ACTIVE_HIGH | GPIO_PULL_DOWN)>;`
    : "";

  const kscanDts = `/ {
    ${label}: ${label} {
        compatible = "zmk,kscan-gpio-charlieplex";
        wakeup-source;

        gpios
            = ${dtsRefs.map((ref) => `<${ref} GPIO_ACTIVE_HIGH>`).join("\n            , ")}
            ;${interruptDts}
    };
};
`;

  // Charlieplex: row = driven pin (output), col = receiving pin (input)
  // RC(r, c): r != c (same pin can't be both)
  const n = gpios.length;
  const keyMappings: KscanUnitResult["keyMappings"] = keyboard.layout
    .map((key, index) => {
      if (key.part !== partIndex) return null;
      const wiring = part.keys[key.id];
      if (!wiring?.input || !wiring?.output) return null;
      const row = gpios.indexOf(wiring.output);
      const col = gpios.indexOf(wiring.input);
      if (row === -1 || col === -1 || row === col) return null;
      return { keyIndex: index, kscanRow: row, kscanCol: col };
    })
    .filter((e): e is NonNullable<typeof e> => e !== null);

  return { label, kscanDts, rows: n, cols: n, keyMappings };
}

// ── Part-level composer ──────────────────────────────

/**
 * Build all kscans for a keyboard part.
 * 
 * If the part has 0 kscans → empty result.
 * If the part has 1 kscan → single kscan0 node.
 * If the part has N kscans → individual sub-nodes (kscan1..N) + composite kscan0 wrapper
 *   with col-offset to place sub-kscans side by side (shift right).
 */
function buildPartKscans(
  keyboard: Keyboard,
  partIndex: number,
): KscanSinglePartResult {
  const part = keyboard.parts[partIndex];
  const kscans = part.kscans;
  if (kscans.length === 0) return buildEmptyPart();

  // Build individual kscan units with placeholder labels
  const rawUnits: Array<{ unit: KscanUnitResult }> = [];
  for (let i = 0; i < kscans.length; i++) {
    const placeholder = `_ks${i}`;
    let unit: KscanUnitResult | null = null;
    switch (kscans[i].kind) {
      case "direct":
        unit = buildDirectKscanUnit(keyboard, partIndex, i, placeholder);
        break;
      case "matrix":
        unit = buildMatrixKscanUnit(keyboard, partIndex, i, placeholder);
        break;
      case "charlieplex":
        unit = buildCharlieplexKscanUnit(keyboard, partIndex, i, placeholder);
        break;
    }
    if (unit) rawUnits.push({ unit });
  }

  if (rawUnits.length === 0) return buildEmptyPart();

  // Assign final labels based on actual surviving unit count
  const multiple = rawUnits.length > 1;
  const units: KscanUnitResult[] = rawUnits.map(({ unit }, idx) => {
    const newLabel = multiple ? `kscan${idx + 1}` : "kscan0";
    const dtsFixed = unit.kscanDts.replaceAll(unit.label, newLabel);
    return { ...unit, label: newLabel, kscanDts: dtsFixed };
  });

  const totalRows = Math.max(...units.map((u) => u.rows), 0);
  let kscanDts: string;
  const subDts = units.map((u) => u.kscanDts).join("\n");

  if (!multiple) {
    kscanDts = subDts;
  } else {
    let colAcc = 0;
    const subNodes: string[] = [];
    for (const unit of units) {
      subNodes.push(`        ${unit.label} {
            col-offset = <${colAcc}>;
            kscan = <&${unit.label}>;
        };`);
      colAcc += unit.cols;
    }

    const compositeDts = `/ {
    kscan0: kscan0 {
        compatible = "zmk,kscan-composite";
        rows = <${totalRows}>;
        columns = <${colAcc}>;

${subNodes.join("\n")}
    };
};
`;
    kscanDts = subDts + "\n" + compositeDts;
  }

  // Merge per-kscan mappings into part-level mtMapping with col offsets
  let colAcc = 0;
  const mtMapping: MatrixTransformEntry[] = [];
  for (const unit of units) {
    for (const mk of unit.keyMappings) {
      mtMapping.push({
        pinIndex: mk.keyIndex,
        logicalRow: keyboard.layout[mk.keyIndex]?.row ?? 0,
        kscanRow: mk.kscanRow,
        kscanCol: mk.kscanCol + colAcc,
      });
    }
    colAcc += unit.cols;
  }

  return { kscanDts, mtCols: colAcc, mtRows: totalRows, mtMapping };
}
