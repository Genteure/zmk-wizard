import { niceNanoV2, xiaoBle, xiaoBlePlus } from "../controllers";
import { getKeysBoundingBox } from "../geometry";
import {
  WiringType,
  type Controller,
  type Key,
  type KeyboardContext,
  type KeyboardTemplatingContext,
  type PinMode,
  type VirtualTextFolder,
} from "../types";

// TODO refactor and cleanup this file?
// TODO add testing

export function createShieldOverlayFiles(keyboard: KeyboardContext): VirtualTextFolder {
  const context: KeyboardTemplatingContext = {
    name: keyboard.info.name,
    shield: keyboard.info.shield,
    controller: keyboard.info.controller,
    wiring: keyboard.info.wiring,
    keys: keyboard.layout.map((key, i) => ({
      ...key,
      inputPin: keyboard.wiring[i].input,
      outputPin: keyboard.wiring[i].output,
    })),
    pins: (() => {
      const pins: Record<string, { mode: PinMode, keys: number[] }>[] = keyboard.pinouts.map(_ => ({}));

      keyboard.wiring.forEach((wiring, index) => {
        const partOf = keyboard.layout[index].partOf;

        if (!pins[partOf]) {
          pins[partOf] = {};
        }
        const pinsForPart = pins[partOf];

        if (wiring.input) {
          if (!pinsForPart[wiring.input]) {
            pinsForPart[wiring.input] = { mode: 'input', keys: [] };
          }
          pinsForPart[wiring.input].keys.push(index);
        }
        if (wiring.output) {
          if (!pinsForPart[wiring.output]) {
            pinsForPart[wiring.output] = { mode: 'output', keys: [] };;
          }
          pinsForPart[wiring.output].keys.push(index);
        }
      });
      return pins;
    })()
  }

  const shieldFiles: VirtualTextFolder =
    ([WiringType.enum.matrix_diode, WiringType.enum.matrix_no_diode] as WiringType[]).includes(context.wiring)
      ? overlayMatrix(context)
      : overlayDirect(context);

  shieldFiles[`${keyboard.info.shield}-layouts.dtsi`] = physicalLayout(keyboard);

  return shieldFiles;
}

// ----------------
//     Direct
// ----------------

function overlayDirect(context: KeyboardTemplatingContext): VirtualTextFolder {
  const files: VirtualTextFolder = {};

  function kscanSinglePartDirect(part: number): KscanSinglePartResult {
    const pinFlag = (context.wiring === 'direct_gnd') ? '(GPIO_ACTIVE_LOW | GPIO_PULL_UP)' : '(GPIO_ACTIVE_HIGH | GPIO_PULL_DOWN)';
    const controllerPins = getControllerPins(context.controller);

    const pins = Object
      .entries(context.pins[part])
      .sort((a, b) => {
        const aIndex = Math.min(...a[1].keys);
        const bIndex = Math.min(...b[1].keys);
        return aIndex - bIndex;
      })
      .map(([pin, _]) => pin);

    const kscanDts = `/ {
    kscan0: kscan0 {
        compatible = "zmk,kscan-gpio-direct";
        wakeup-source;

        input-gpios
            = ${pins
        .map(pin => `<${controllerPins[pin].handle} ${pinFlag}>`)
        .join("\n            , ")}
            ;
    };
};
`;

    const mtMapping: MatrixTransformEntry[] = context.keys
      .map((key, index) => {
        if (key.partOf !== part) return null;
        const row = part;
        const col = pins.indexOf(key.inputPin!);

        if (row === -1 || col === -1) {
          throw new Error(`Key ${index} (${key.inputPin}, ${key.outputPin}) not found in kscan pins`);
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
      mtCols: pins.length,
      mtRows: 1,
      mtMapping,
    };
  }

  if (context.pins.length === 1) {

    const unibody = kscanSinglePartDirect(0);
    const mtDts = makeMatrixTransform(unibody.mtMapping);
    files[`${context.shield}.overlay`] = `#include "${context.shield}-layouts.dtsi"
#include <dt-bindings/zmk/matrix_transform.h>

${unibody.kscanDts}

${mtDts}

&physical_layout_${context.shield} {
    kscan = <&kscan0>;
    transform = <&matrix_transform0>;
};
`;

  } else if (context.pins.length === 2) {

    const left = kscanSinglePartDirect(0);
    const right = kscanSinglePartDirect(1);

    const mtData: MatrixTransformEntry[] = [...left.mtMapping, ...right.mtMapping]

    const mtDts = makeMatrixTransform(mtData);

    files[`${context.shield}.dtsi`] = `#include "${context.shield}-layouts.dtsi"
#include <dt-bindings/zmk/matrix_transform.h>

${mtDts}

&physical_layout_${context.shield} {
    transform = <&matrix_transform0>;
};
`;

    files[`${context.shield}_left.overlay`] = `#include "${context.shield}.dtsi"

${left.kscanDts}

&physical_layout_${context.shield} {
    kscan = <&kscan0>;
};
`;

    files[`${context.shield}_right.overlay`] = `#include "${context.shield}.dtsi"

${right.kscanDts}

&matrix_transform0 {
    row-offset = <1>;
};

&physical_layout_${context.shield} {
    kscan = <&kscan0>;
};
`;

  } else {
    throw new Error(`Unsupported number of parts: ${context.pins.length}`);
  }
  return files;
}

// ----------------
//     Matrix
// ----------------

function overlayMatrix(context: KeyboardTemplatingContext): VirtualTextFolder {
  const files: VirtualTextFolder = {};

  function kscanSinglePart(part: number): KscanSinglePartResult {
    const inputPinFlag = '(GPIO_ACTIVE_HIGH | GPIO_PULL_DOWN)';
    const outputPinFlag = context.wiring !== 'matrix_no_diode' ? 'GPIO_ACTIVE_HIGH' : 'GPIO_OPEN_SOURCE';

    const controllerPins = getControllerPins(context.controller)

    const inputIsRow = isInputRow(context, part);
    const kscan = matrixKscanOrder(context, inputIsRow, part);
    // console.log(`Input is row: ${inputIsRow}, a.k.a. diode-direction is ${inputIsRow ? "col2row" : "row2col"}`);

    const kscanDts = `/ {
    kscan0: kscan0 {
        compatible = "zmk,kscan-gpio-matrix";
        diode-direction = "${inputIsRow ? "col2row" : "row2col"}";
        wakeup-source;

        col-gpios
            = ${kscan.colPins
        .map(pin => `<${controllerPins[pin].handle} ${inputIsRow ? outputPinFlag : inputPinFlag}>`)
        .join("\n            , ")}
            ;

        row-gpios
            = ${kscan.rowPins
        .map(pin => `<${controllerPins[pin].handle} ${inputIsRow ? inputPinFlag : outputPinFlag}>`)
        .join("\n            , ")}
            ;
    };
};
`;

    const mtMapping: MatrixTransformEntry[] = context.keys
      .map((key, index) => {
        if (key.partOf !== part) return null;
        const row = kscan.rowPins.indexOf(key[inputIsRow ? 'inputPin' : 'outputPin']!);
        const col = kscan.colPins.indexOf(key[inputIsRow ? 'outputPin' : 'inputPin']!);

        if (row === -1 || col === -1) {
          throw new Error(`Key ${index} (${key.inputPin}, ${key.outputPin}) not found in kscan pins`);
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

  if (context.pins.length === 1) {

    const unibody = kscanSinglePart(0);
    const mtDts = makeMatrixTransform(unibody.mtMapping);
    files[`${context.shield}.overlay`] = `#include "${context.shield}-layouts.dtsi"
#include <dt-bindings/zmk/matrix_transform.h>

${unibody.kscanDts}

${mtDts}

&physical_layout_${context.shield} {
    kscan = <&kscan0>;
    transform = <&matrix_transform0>;
};
`;

  } else if (context.pins.length === 2) {

    const left = kscanSinglePart(0);
    const right = kscanSinglePart(1);

    const mtData: MatrixTransformEntry[] = [...left.mtMapping]
    right.mtMapping.forEach(entry => {
      mtData.push({
        ...entry,
        kscanCol: entry.kscanCol + left.mtCols, // offset the right side columns
      });
    })

    const mtDts = makeMatrixTransform(mtData);

    files[`${context.shield}.dtsi`] = `#include "${context.shield}-layouts.dtsi"
#include <dt-bindings/zmk/matrix_transform.h>

${mtDts}

&physical_layout_${context.shield} {
    transform = <&matrix_transform0>;
};
`;

    files[`${context.shield}_left.overlay`] = `#include "${context.shield}.dtsi"

${left.kscanDts}

&physical_layout_${context.shield} {
    kscan = <&kscan0>;
};
`;

    files[`${context.shield}_right.overlay`] = `#include "${context.shield}.dtsi"

${right.kscanDts}

&matrix_transform0 {
    col-offset = <${left.mtCols}>;
};

&physical_layout_${context.shield} {
    kscan = <&kscan0>;
};
`;

  } else {
    throw new Error(`Unsupported number of parts: ${context.pins.length}`);
  }

  return files;
}

function getControllerPins(controller: Controller): Record<string, { name: string; handle: string; }> {
  switch (controller) {
    case "nice_nano_v2":
      return niceNanoV2.pins;
    case "seeed_xiao_ble":
      return xiaoBle.pins;
    case "seeed_xiao_ble_plus":
      return xiaoBlePlus.pins;
    default:
      throw new Error(`Unsupported controller: ${controller}`);
  }
}

/**
 * Try our best to order the kscan pins following the matrix order.
 * @param keyboard
 */
export function matrixKscanOrder(context: KeyboardTemplatingContext, inputIsRow: boolean, part: number): {
  rowPins: string[];
  colPins: string[];
} {
  const popularIndexs = Object.entries(context.pins[part])
    .map(([pin, pinInfo]) => {
      const pinMode = pinInfo.mode;
      if (pinMode !== 'input' && pinMode !== 'output') return null;

      const readRow = inputIsRow ? pinMode === 'input' : pinMode === 'output';

      // aggregate the keys by their row or column, count them and sort
      const highestOccurrence = pinInfo.keys
        .reduce((acc, keyIndex) => {
          const key = context.keys[keyIndex];
          const index = readRow ? key.row : key.column;

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

function physicalLayout(keyboard: KeyboardContext): string {
  function num(n: number, pad: number): string {
    let text = Math.round(n * 100).toString();
    if (text.startsWith("-")) {
      text = `(${text})`;
    }
    return text.padStart(pad);
  }

  const keys = keyboard.layout.map((key) => {
    return `<&key_physical_attrs${num(key.width, 4)}${num(key.height, 4)}${num(key.x, 5)}${num(key.y, 5)}${num(key.r, 8)}${num(key.rx, 6)}${num(key.ry, 6)}>`;
  }).join("\n            , ");

  return `#include <physical_layouts.dtsi>

/ {
    physical_layout_${keyboard.info.shield}: physical_layout_${keyboard.info.shield} {
        compatible = "zmk,physical-layout";
        display-name = "${keyboard.info.name}";
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
export function isInputRow(context: KeyboardTemplatingContext, part: number): boolean {
  const inputShapeRatio: number[] = [];
  const outputShapeRatio: number[] = [];

  Object.values(context.pins[part]).forEach(pinInfo => {
    if (pinInfo.keys.length === 0) return;

    const bbox = getKeysBoundingBox(pinInfo.keys.map(index => context.keys[index] as Key));
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
