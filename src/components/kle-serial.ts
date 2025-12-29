// Based on https://github.com/adamws/kle-serial2/blob/d6b89acf351a4a9dce7f3ffa198a385b74cc7393/index.ts
// Licensed under MIT License

// Fixed-length 12-element array type for labels, textColor, and textSize
export type Array12<T> = [T, T, T, T, T, T, T, T, T, T, T, T];

export class Key {
  color: string = "#cccccc";
  labels: Array12<string>;
  textColor: Array12<string>;
  textSize: Array12<number>;
  default: { textColor: string; textSize: number } = {
    textColor: "#000000",
    textSize: 3,
  };
  x: number = 0;
  y: number = 0;
  width: number = 1;
  height: number = 1;
  x2: number = 0;
  y2: number = 0;
  width2: number = 1;
  height2: number = 1;
  rotation_x: number = 0;
  rotation_y: number = 0;
  rotation_angle: number = 0;
  decal: boolean = false;
  ghost: boolean = false;
  stepped: boolean = false;
  nub: boolean = false;
  profile: string = "";
  sm: string = ""; // switch mount
  sb: string = ""; // switch brand
  st: string = ""; // switch type

  constructor() {
    // Initialize all arrays to 12 elements
    // labels and colors are initialized to empty strings, textColor to 0
    this.labels = Array(12).fill("") as Array12<string>;
    this.textColor = Array(12).fill("") as Array12<string>;
    this.textSize = Array(12).fill(0) as Array12<number>;
  }
}

export class KeyboardMetadata {
  author: string = "";
  backcolor: string = "#eeeeee";
  background: { name: string; style: string } | null = null;
  name: string = "";
  notes: string = "";
  radii: string = "";
  switchBrand: string = "";
  switchMount: string = "";
  switchType: string = "";
  // Store custom metadata fields that aren't part of standard KLE format
  [key: string]: any;
}

export class Keyboard {
  meta: KeyboardMetadata = new KeyboardMetadata();
  keys: Key[] = [];
}

export namespace Serial {
  // Helper to create a 12-element array filled with a default value
  function createArray12<T>(defaultValue: T): Array12<T> {
    return Array(12).fill(defaultValue) as Array12<T>;
  }

  // Map from serialized label position to normalized position,
  // depending on the alignment flags.
  // prettier-ignore
  let labelMap: Array<Array<number>> = [
    //0  1  2  3  4  5  6  7  8  9 10 11   // align flags
    [0, 6, 2, 8, 9, 11, 3, 5, 1, 4, 7, 10], // 0 = no centering
    [1, 7, -1, -1, 9, 11, 4, -1, -1, -1, -1, 10], // 1 = center x
    [3, -1, 5, -1, 9, 11, -1, -1, 4, -1, -1, 10], // 2 = center y
    [4, -1, -1, -1, 9, 11, -1, -1, -1, -1, -1, 10], // 3 = center x & y
    [0, 6, 2, 8, 10, -1, 3, 5, 1, 4, 7, -1], // 4 = center front (default)
    [1, 7, -1, -1, 10, -1, 4, -1, -1, -1, -1, -1], // 5 = center front & x
    [3, -1, 5, -1, 10, -1, -1, -1, 4, -1, -1, -1], // 6 = center front & y
    [4, -1, -1, -1, 10, -1, -1, -1, -1, -1, -1, -1], // 7 = center front & x & y
  ];

  function reorderLabelsIn<T>(labels: T[], align: number, defaultval: T): Array12<T> {
    var ret = createArray12(defaultval);
    for (var i = 0; i < labels.length; ++i) {
      if (labels[i]) {
        const index = labelMap[align][i];
        if (index !== -1) {
          ret[index] = labels[i];
        }
      }
    }
    return ret;
  }

  function findMostCommonColor(colors: string[]): string {
    // Count occurrences of each non-empty color
    const counts: Record<string, number> = {};
    let maxCount = 0;
    let mostCommon = "";

    for (const color of colors) {
      if (color && color.trim() !== "") {
        counts[color] = (counts[color] || 0) + 1;
        if (counts[color] > maxCount) {
          maxCount = counts[color];
          mostCommon = color;
        }
      }
    }

    return mostCommon || "#000000"; // Default to black if no colors found
  }

  function deserializeError(msg: string, data?: any): never {
    throw new Error("Error: " + msg + (data ? ":\n  " + JSON.stringify(data) : ""));
  }

  export function deserialize(rows: Array<any>): Keyboard {
    if (!(rows instanceof Array))
      deserializeError("expected an array of objects");

    // Initialize with defaults
    let current: Key = new Key();
    let kbd = new Keyboard();
    let cluster = { x: 0, y: 0 };
    var align = 4;

    for (var r = 0; r < rows.length; ++r) {
      if (rows[r] instanceof Array) {
        for (var k = 0; k < rows[r].length; ++k) {
          var item = rows[r][k];
          if (typeof item === "string") {
            var newKey: Key = {
              ...current,
              labels: [...current.labels],
              textColor: [...current.textColor],
              textSize: [...current.textSize],
              default: { ...current.default },
            };

            // Calculate some generated values
            newKey.width2 =
              newKey.width2 === 0 ? current.width : current.width2;
            newKey.height2 =
              newKey.height2 === 0 ? current.height : current.height2;
            newKey.labels = reorderLabelsIn(item.split("\n"), align, "");
            // textSize is already in normalized format (from f/f2/fa), don't reorder it
            // textColor is also already normalized, don't reorder it

            // Clean up: set textSize/textColor to 0/"" for positions without labels
            for (var i = 0; i < 12; ++i) {
              if (!newKey.labels[i]) {
                newKey.textSize[i] = 0;
                newKey.textColor[i] = "";
              }
            }

            // Add the key!
            kbd.keys.push(newKey);

            // Set up for the next key
            current.x += current.width;
            current.width = current.height = 1;
            current.x2 = current.y2 = current.width2 = current.height2 = 0;
            current.nub = current.stepped = current.decal = false;
          } else {
            if (
              k != 0 &&
              (item.r != null || item.rx != null || item.ry != null)
            ) {
              deserializeError(
                "rotation can only be specified on the first key in a row",
                item,
              );
            }
            if (item.r != null) current.rotation_angle = item.r;
            if (item.rx != null) {
              current.rotation_x = cluster.x = item.rx;
              current.x = cluster.x;
              current.y = cluster.y;
            }
            if (item.ry != null) {
              current.rotation_y = cluster.y = item.ry;
              current.x = cluster.x;
              current.y = cluster.y;
            }
            if (item.rx != null) current.rotation_x = item.rx;
            if (item.ry != null) current.rotation_y = item.ry;
            if (item.a != null) align = item.a;
            if (item.f) {
              current.default.textSize = item.f;
              current.textSize = createArray12(0);
            }
            if (item.f2) {
              // f2 applies to serialized positions 1-11, need to reorder to normalized format
              var tempTextSize = createArray12(current.default.textSize);
              for (var i = 1; i < 12; ++i) tempTextSize[i] = item.f2;
              current.textSize = reorderLabelsIn(tempTextSize, align, 0);
            }
            if (item.fa) {
              // fa is in serialized format, need to reorder to normalized format
              current.textSize = reorderLabelsIn(item.fa, align, 0);
            }
            // Clean up textSize values that equal the default to enable serialization optimization
            if (item.f || item.f2 || item.fa) {
              for (var j = 0; j < 12; ++j) {
                if (current.textSize[j] === current.default.textSize) {
                  current.textSize[j] = 0;
                }
              }
            }
            if ("p" in item) current.profile = item.p;
            if (item.c) current.color = item.c;
            // Handle text color: 't' for default, 'ta' for per-label array
            if ("t" in item) {
              if (item.t.indexOf("\n") === -1) {
                // New format: 't' is just the default color (single value)
                current.default.textColor = item.t;
              } else {
                // Legacy format: 't' contains both default and per-label colors
                var split = item.t.split("\n");
                // Set default: if first value is non-empty, use most common color
                // (to handle cases like "#111111\n#222222\n#222222" where #222222 is most common)
                // If first value is empty, don't change default (backward compatible)
                if (split[0] && split[0].trim() !== "") {
                  current.default.textColor = findMostCommonColor(split);
                }
                current.textColor = reorderLabelsIn(
                  split,
                  align,
                  current.default.textColor,
                );
                // Clean up values that equal the default
                for (var j = 0; j < 12; ++j) {
                  if (current.textColor[j] === current.default.textColor) {
                    current.textColor[j] = "";
                  }
                }
              }
            }
            if ("ta" in item) {
              // New format: 'ta' is per-label colors (newline-delimited string)
              var taSplit = item.ta.split("\n");
              current.textColor = reorderLabelsIn(taSplit, align, "");
              // Clean up values that equal the default
              for (var j = 0; j < 12; ++j) {
                if (current.textColor[j] === current.default.textColor) {
                  current.textColor[j] = "";
                }
              }
            }
            if (item.x) current.x += item.x;
            if (item.y) current.y += item.y;
            if (item.w) current.width = current.width2 = item.w;
            if (item.h) current.height = current.height2 = item.h;
            if (item.x2) current.x2 = item.x2;
            if (item.y2) current.y2 = item.y2;
            if (item.w2) current.width2 = item.w2;
            if (item.h2) current.height2 = item.h2;
            if (item.n) current.nub = item.n;
            if (item.l) current.stepped = item.l;
            if (item.d) current.decal = item.d;
            if (item.g != null) current.ghost = item.g;
            if ("sm" in item) current.sm = item.sm;
            if ("sb" in item) current.sb = item.sb;
            if ("st" in item) current.st = item.st;
          }
        }

        // End of the row
        current.y++;
        current.x = current.rotation_x;
      } else if (typeof rows[r] === "object") {
        if (r != 0) {
          deserializeError(
            "keyboard metadata must the be first element",
            rows[r],
          );
        }
        // Copy all properties from input, including unrecognized ones
        for (let prop in rows[r]) {
          if (rows[r][prop]) kbd.meta[prop] = rows[r][prop];
        }
      } else {
        deserializeError("unexpected", rows[r]);
      }
    }
    return kbd;
  }

  // prettier-ignore
  let reverseLabelMap: Array<Array<number>> = [
    //0  1  2  3  4  5  6  7  8  9 10 11   // align flags
    [0, 8, 2, 6, 9, 7, 1, 10, 3, 4, 11, 5], // 0 = no centering
    [-1, 0, -1, -1, 6, -1, -1, 1, -1, 4, 11, 5], // 1 = center x
    [-1, -1, -1, 0, 8, 2, -1, -1, -1, 4, 11, 5], // 2 = center y
    [-1, -1, -1, -1, 0, -1, -1, -1, -1, 4, 11, 5], // 3 = center x & y
    [0, 8, 2, 6, 9, 7, 1, 10, 3, -1, 4, -1], // 4 = center front (default)
    [-1, 0, -1, -1, 6, -1, -1, 1, -1, -1, 4, -1], // 5 = center front & x
    [-1, -1, -1, 0, 8, 2, -1, -1, -1, -1, 4, -1], // 6 = center front & y
    [-1, -1, -1, -1, 0, -1, -1, -1, -1, -1, 4, -1], // 7 = center front & x & y
  ];

  function reorderLabelsKle(labels: any[], align: number, defaultval: any): any[] {
    let ret: any[] = new Array(12).fill(defaultval);
    for (let i = 0; i < labels.length; i++) {
      if (labels[i]) {
        const index = reverseLabelMap[align][i];
        if (index === -1) {
          return [];
        }
        ret[index] = labels[i];
      }
    }
    while (ret.length > 0 && ret[ret.length - 1] === defaultval) {
      ret.pop();
    }
    return ret;
  }

  function findBestLabelAlignment(labels: any[]): [number, any[]] {
    let results: Record<number, any[]> = {}; // Explicitly type results
    for (let align = 7; align >= 0; align--) {
      const ret = reorderLabelsKle(labels, align, "");
      if (ret.length > 0) {
        results[align] = ret;
      }
    }
    if (Object.keys(results).length > 0) {
      const best: [string, any[]] = Object.entries(results).reduce(
        (a: [string, any[]], b: [string, any[]]) =>
          a[1].length < b[1].length ? a : b,
      );
      return [parseInt(best[0]), best[1]];
    }
    return [0, []];
  }


  export function serialize(kbd: Keyboard): Array<any> {
    let rows: any[] = [];
    let row: any[] = [];
    let current = new Key();
    let current_textColor_str: string = "";
    let current_textSize_arr: number[] = [];
    let current_alignment = 4;
    let cluster = { r: 0, rx: 0, ry: 0 };
    let new_row = true;
    current.y -= 1;

    for (const k of kbd.keys) {
      let props: Record<string, any> = {};

      // Lightweight clone: shallow copy + clone only the arrays we'll mutate
      // Much faster than structuredClone for property tests with thousands of iterations
      const key = {
        ...k,
        labels: [...k.labels],
        textColor: [...k.textColor],
        textSize: [...k.textSize],
      };

      const add_prop = (name: string, value: any, def: any) => {
        let different = false;

        if (Array.isArray(value) && Array.isArray(def)) {
          if (value.length != def.length) {
            different = true;
          } else {
            for (let i = 0; i < value.length; ++i) {
              if (value[i] !== def[i]) {
                different = true;
                break;
              }
            }
          }
        } else {
          if (value !== def) {
            different = true;
          }
        }
        if (different) {
          props[name] = value;
        }
        return value;
      };

      // Clean up the data (skipping this step will cause unexpected
      // serialization if textColor/textSize defined for undefined label)
      // Also remove values that equal the default to enable serialization optimization
      for (var i = 0; i < 12; ++i) {
        if (!key.labels[i]) {
          delete key.textSize[i];
          delete key.textColor[i];
        } else {
          // Also delete values equal to default to optimize serialization
          if (key.textSize[i] === key.default.textSize) {
            delete key.textSize[i];
          }
          if (key.textColor[i] === key.default.textColor) {
            delete key.textColor[i];
          }
        }
      }

      const [alignment, labels] = findBestLabelAlignment(key.labels);

      const new_cluster =
        key.rotation_angle !== cluster.r ||
        key.rotation_x !== cluster.rx ||
        key.rotation_y !== cluster.ry;

      // Don't overwrite new_row for the first key to allow proper y normalization
      if (!(rows.length === 0 && row.length === 0)) {
        new_row = key.y !== current.y;
      }
      if (row.length > 0 && (new_cluster || new_row)) {
        rows.push(row);
        row = [];
        new_row = true;
      }

      if (new_row) {
        current.y = current.y + 1;
        if (key.rotation_y !== cluster.ry || key.rotation_x !== cluster.rx) {
          current.y = key.rotation_y;
        }
        current.x = key.rotation_x;
        cluster.r = key.rotation_angle;
        cluster.rx = key.rotation_x;
        cluster.ry = key.rotation_y;
        new_row = false;
      }

      current.rotation_angle = add_prop(
        "r",
        key.rotation_angle,
        current.rotation_angle,
      );
      current.rotation_x = add_prop("rx", key.rotation_x, current.rotation_x);
      current.rotation_y = add_prop("ry", key.rotation_y, current.rotation_y);

      const x_offset = add_prop("x", key.x - current.x, 0);
      const y_offset = add_prop("y", key.y - current.y, 0);
      current.x = current.x + key.width + x_offset;
      current.y = current.y + y_offset;

      current.color = add_prop("c", key.color, current.color);

      // Output 't' when default changes
      current.default.textColor = add_prop(
        "t",
        key.default.textColor,
        current.default.textColor,
      );

      // Output 'ta' when per-label colors exist
      let textColor = reorderLabelsKle(key.textColor, alignment, "");
      let textColorStr = textColor.join("\n").replace(/\n+$/, "");
      current_textColor_str = add_prop(
        "ta",
        textColorStr,
        current_textColor_str,
      );

      current.ghost = add_prop("g", key.ghost, current.ghost);
      current.profile = add_prop("p", key.profile, current.profile);
      current.sm = add_prop("sm", key.sm, current.sm);
      current.sb = add_prop("sb", key.sb, current.sb);
      current.st = add_prop("st", key.st, current.st);
      current_alignment = add_prop("a", alignment, current_alignment);

      // Output 'f' when default changes
      current.default.textSize = add_prop(
        "f",
        key.default.textSize,
        current.default.textSize,
      );

      // Output 'fa' when per-label size exist
      let textSize = reorderLabelsKle(key.textSize, alignment, 0);
      while (textSize.length > 0 && textSize[textSize.length - 1] === 0) {
        // remove trailing 0 values
        textSize.pop();
      }
      current_textSize_arr = add_prop("fa", textSize, current_textSize_arr);

      add_prop("w", key.width, 1);
      add_prop("h", key.height, 1);
      add_prop("w2", key.width2, key.width);
      add_prop("h2", key.height2, key.height);
      add_prop("x2", key.x2, 0);
      add_prop("y2", key.y2, 0);
      add_prop("l", key.stepped, false);
      add_prop("n", key.nub, false);
      add_prop("d", key.decal, false);

      if (Object.keys(props).length > 0) {
        row.push(props);
      }

      current.labels = labels as Array12<string>;
      row.push(
        labels
          .map((l) => l || "")
          .join("\n")
          .replace(/\n+$/, ""),
      );
    }

    if (row.length > 0) {
      rows.push(row);
    }

    const defaultMeta = new KeyboardMetadata();
    let meta: Record<string, any> = {};
    // Export all metadata properties, including unrecognized ones
    for (const prop in kbd.meta) {
      // Only skip if it's a default standard property with default value
      // Always include custom properties (those not in defaultMeta)
      if (!(prop in defaultMeta) || kbd.meta[prop] !== defaultMeta[prop]) {
        meta[prop] = kbd.meta[prop];
      }
    }
    if (Object.keys(meta).length > 0) {
      rows.unshift(meta);
    }

    return rows;
  }
}
