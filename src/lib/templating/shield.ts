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

// TODO refactor and cleanup this file?
// TODO add testing

// special cases for shifter pins in dts mapping
const shifterDtsMap: Record<string, string> = Object.fromEntries(Array.from({ length: 32 }, (_, i) => [`shifter${i}`, `&shifter ${i}`]));

export function createShieldOverlayFiles(keyboard: Keyboard): VirtualTextFolder {
  const files: VirtualTextFolder = {};

  files['Kconfig.shield'] = shield__kconfig_shield(keyboard);
  files['Kconfig.defconfig'] = shield__kconfig_defconfig(keyboard);

  // Build per-part kscan and local matrix transform data
  const partResults: KscanSinglePartResult[] = keyboard.parts.map((part, idx) => {
    const wiring = part.wiring;
    if (wiring === "direct_gnd" || wiring === "direct_vcc") {
      return buildDirectPart(keyboard, idx);
    } else if (wiring === "matrix_diode" || wiring === "matrix_no_diode") {
      return buildMatrixPart(keyboard, idx);
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

  if (keyboard.parts.length === 1) {
    // Single-part fast path: emit overlay with kscan and transform
    files[`${keyboard.shield}.overlay`] = `#include "${keyboard.shield}-layouts.dtsi"
#include <dt-bindings/zmk/matrix_transform.h>

${partResults[0].kscanDts}

${mtDts}

&physical_layout_${keyboard.shield} {
    kscan = <&kscan0>;
    transform = <&matrix_transform0>;
};
`;

    // pinctrl for single part
    const pinctrlContent = createShieldPinctrlFile(keyboard, 0);
    if (pinctrlContent) {
      // note: we explicitly use `boards/<name>/<board>.overlay` instead of just `boards/<board>.overlay`
      // to prevent problems with dongle, we can't treat unibody builds as true single-part keyboards.
      files[`boards/${keyboard.shield}/${controllerInfos[keyboard.parts[0].controller].board}.overlay`] = pinctrlContent.dts;
      if (pinctrlContent.defconfig) {
        files['Kconfig.defconfig'] += pinctrlContent.defconfig;
      }
    }

  } else {
    // Multi-part: global transform in .dtsi and per-part overlays with offsets
    files[`${keyboard.shield}.dtsi`] = `#include "${keyboard.shield}-layouts.dtsi"
#include <dt-bindings/zmk/matrix_transform.h>

${mtDts}

&physical_layout_${keyboard.shield} {
    transform = <&matrix_transform0>;
};
`;

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

      files[`${keyboard.shield}_${part.name}.overlay`] = `#include "${keyboard.shield}.dtsi"

${res.kscanDts}
${offsetBlock}
&physical_layout_${keyboard.shield} {
    kscan = <&kscan0>;
};
`;

      // pinctrl for this part (out of multi-part)
      const pinctrlContent = createShieldPinctrlFile(keyboard, idx);
      if (pinctrlContent) {
        files[`boards/${keyboard.shield}_${part.name}/${controllerInfos[part.controller].board}.overlay`] = pinctrlContent.dts;

        if (pinctrlContent.defconfig) {
          files['Kconfig.defconfig'] += pinctrlContent.defconfig;
        }
      }
    });
  }

  files[`${keyboard.shield}-layouts.dtsi`] = physicalLayoutKeyboard(keyboard);
  if (keyboard.dongle) {
    files[`${keyboard.shield}_dongle.overlay`] = dongleOverlayKeyboard(keyboard);
  }

  return files;
}

function dongleOverlayKeyboard(keyboard: Keyboard): string {
  if (keyboard.parts.length > 1) {
    return `#include "${keyboard.shield}.dtsi"

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
`;
  } else {
    return `#include "${keyboard.shield}.overlay"

/delete-node/ &kscan0;

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
`;
  }
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
    return `<&key_physical_attrs${num(key.w, 4)}${num(key.h, 4)}${num(key.x, 5)}${num(key.y, 5)}${num(key.r, 8)}${num(key.rx, 6)}${num(key.ry, 6)}>`;
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
