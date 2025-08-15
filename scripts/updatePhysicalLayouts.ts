import * as fs from 'fs';
import * as path from 'path';

const args = process.argv.slice(2);

if (args.length != 1) {
  console.error('Usage: jiti updatePhysicalLayouts.ts <path-to-zmk>');
  process.exit(1);
}

const basePath = args[0];

if (!fs.existsSync(basePath)) {
  console.error(`Path does not exist: ${basePath}`);
  process.exit(1);
}

// check <base>/app/dts/physical_layouts.dtsi
const physicalLayoutsPath = path.join(basePath, 'app/dts/physical_layouts.dtsi');
if (!fs.existsSync(physicalLayoutsPath)) {
  console.error(`File does not exist: ${physicalLayoutsPath}, is this a ZMK repo?`);
  process.exit(1);
}

const layoutsPath = path.join(basePath, 'app/dts/layouts');
if (!fs.existsSync(layoutsPath)) {
  console.error(`Layouts directory does not exist: ${layoutsPath}, is this a ZMK repo?`);
  process.exit(1);
}

console.log(`SOURCE: ${basePath}`);

const outputPath = path.join(path.dirname(new URL(import.meta.url).pathname), '../src/lib/physicalLayouts.json');
console.log(`OUTPUT: ${outputPath}`);

/**
 * Row Column
 */
interface RC {
  r: number;
  c: number;
}

function rc(r: number, c: number): RC {
  return { r, c };
}

interface LayoutSourceDir {
  name: string;
  dir: string;
  rcOverride?: { [file: string]: RC[]; }
}

interface LayoutSourceFiles {
  name: string;
  dtsi: {
    name: string;
    file: string;
    rcOverride?: RC[];
  }[];
}

type LayoutSource = LayoutSourceDir | LayoutSourceFiles;

const layoutSources: LayoutSource[] = [
  {
    name: 'Popular Layouts',
    dtsi: [
      {
        name: 'Ferris',
        file: 'cuddlykeyboards/ferris.dtsi',
        rcOverride: [
          rc(0, 0), rc(0, 1), rc(0, 2), rc(0, 3), rc(0, 4), rc(0, 5), rc(0, 6), rc(0, 7), rc(0, 8), rc(0, 9),
          rc(1, 0), rc(1, 1), rc(1, 2), rc(1, 3), rc(1, 4), rc(1, 5), rc(1, 6), rc(1, 7), rc(1, 8), rc(1, 9),
          rc(2, 0), rc(2, 1), rc(2, 2), rc(2, 3), rc(2, 4), rc(2, 5), rc(2, 6), rc(2, 7), rc(2, 8), rc(2, 9),
          rc(3, 3), rc(3, 4), rc(3, 5), rc(3, 6),
        ],
      },
      {
        name: 'Reviung41',
        file: 'gtips/reviung41.dtsi',
        rcOverride: [
          rc(0, 0), rc(0, 1), rc(0, 2), rc(0, 3), rc(0, 4), rc(0, 5), rc(0, 7), rc(0, 8), rc(0, 9), rc(0, 10), rc(0, 11), rc(0, 12),
          rc(1, 0), rc(1, 1), rc(1, 2), rc(1, 3), rc(1, 4), rc(1, 5), rc(1, 7), rc(1, 8), rc(1, 9), rc(1, 10), rc(1, 11), rc(1, 12),
          rc(2, 0), rc(2, 1), rc(2, 2), rc(2, 3), rc(2, 4), rc(2, 5), rc(2, 7), rc(2, 8), rc(2, 9), rc(2, 10), rc(2, 11), rc(2, 12),
          rc(3, 4), rc(3, 5), rc(3, 6), rc(3, 7), rc(3, 8),
        ],
      },
      {
        name: 'Lily58',
        file: 'kata0510/lily58.dtsi',
        rcOverride: [
          // R1 Left
          rc(0, 0), rc(0, 1), rc(0, 2), rc(0, 3), rc(0, 4), rc(0, 5),
          // R1 Right, skip 2 in the middle
          rc(0, 8), rc(0, 9), rc(0, 10), rc(0, 11), rc(0, 12), rc(0, 13),
          // R2 Left
          rc(1, 0), rc(1, 1), rc(1, 2), rc(1, 3), rc(1, 4), rc(1, 5),
          // R2 Right
          rc(1, 8), rc(1, 9), rc(1, 10), rc(1, 11), rc(1, 12), rc(1, 13),
          // R3 Left
          rc(2, 0), rc(2, 1), rc(2, 2), rc(2, 3), rc(2, 4), rc(2, 5),
          // R3 Right
          rc(2, 8), rc(2, 9), rc(2, 10), rc(2, 11), rc(2, 12), rc(2, 13),
          // R4 Left
          rc(3, 0), rc(3, 1), rc(3, 2), rc(3, 3), rc(3, 4), rc(3, 5),
          // R4 Middle
          rc(3, 6), rc(3, 7),
          // R4 Right
          rc(3, 8), rc(3, 9), rc(3, 10), rc(3, 11), rc(3, 12), rc(3, 13),
          // R5
          rc(4, 3), rc(4, 4), rc(4, 5), rc(4, 6), rc(4, 7), rc(4, 8), rc(4, 9), rc(4, 10),
        ],
      },
      {
        name: 'Sofle',
        file: 'josefadamcik/sofle.dtsi',
        rcOverride: [
          // R1 Left
          rc(0, 0), rc(0, 1), rc(0, 2), rc(0, 3), rc(0, 4), rc(0, 5),
          // R1 Right, skip 2 in the middle
          rc(0, 8), rc(0, 9), rc(0, 10), rc(0, 11), rc(0, 12), rc(0, 13),
          // R2 Left
          rc(1, 0), rc(1, 1), rc(1, 2), rc(1, 3), rc(1, 4), rc(1, 5),
          // R2 Right
          rc(1, 8), rc(1, 9), rc(1, 10), rc(1, 11), rc(1, 12), rc(1, 13),
          // R3 Left
          rc(2, 0), rc(2, 1), rc(2, 2), rc(2, 3), rc(2, 4), rc(2, 5),
          // R3 Right
          rc(2, 8), rc(2, 9), rc(2, 10), rc(2, 11), rc(2, 12), rc(2, 13),
          // R4 Left
          rc(3, 0), rc(3, 1), rc(3, 2), rc(3, 3), rc(3, 4), rc(3, 5),
          // R4 Middle
          rc(3, 6), rc(3, 7),
          // R4 Right
          rc(3, 8), rc(3, 9), rc(3, 10), rc(3, 11), rc(3, 12), rc(3, 13),
          // R5
          rc(4, 2), rc(4, 3), rc(4, 4), rc(4, 5), rc(4, 6), rc(4, 7), rc(4, 8), rc(4, 9), rc(4, 10), rc(4, 11),
        ],
      }
    ]
  },
  {
    name: 'Corne',
    dir: 'foostan/corne',
  },
  {
    name: 'Jian',
    dir: 'kgoh/jian',
  },
  {
    name: '60%',
    dir: 'common/60percent',
  },
  {
    name: '65%',
    dir: 'common/65percent',
  },
  {
    name: '75%',
    dir: 'common/75percent',
  },
  {
    name: 'Numpad',
    dir: 'common/numpad',
  },
  {
    name: 'Ortholinear 4x10',
    dir: 'common/ortho_4x10',
  },
  {
    name: 'Ortholinear 4x12',
    dir: 'common/ortho_4x12',

  },
  {
    name: 'Ortholinear 5x12',
    dir: 'common/ortho_5x12',
  },
  {
    name: 'TKL',
    dir: 'common/tkl',
    rcOverride: {
      'ansi.dtsi': [
        // 17 col counting from 0
        // ESC
        rc(0, 0),
        // F1-F12
        rc(0, 2), rc(0, 3), rc(0, 4), rc(0, 5),
        rc(0, 6), rc(0, 7), rc(0, 8), rc(0, 9),
        rc(0, 10), rc(0, 11), rc(0, 12), rc(0, 13),
        // Print Screen, Scroll Lock, Pause
        rc(0, 15), rc(0, 16), rc(0, 17),

        // 1st row
        rc(1, 0), rc(1, 1), rc(1, 2), rc(1, 3), rc(1, 4), rc(1, 5), rc(1, 6),
        rc(1, 7), rc(1, 8), rc(1, 9), rc(1, 10), rc(1, 11), rc(1, 12),
        // Backspace
        rc(1, 13),
        // 1st row right side
        rc(1, 15), rc(1, 16), rc(1, 17),

        // 2nd row
        rc(2, 0), rc(2, 1), rc(2, 2), rc(2, 3), rc(2, 4), rc(2, 5), rc(2, 6),
        rc(2, 7), rc(2, 8), rc(2, 9), rc(2, 10), rc(2, 11), rc(2, 12),
        // 2nd row last key
        rc(2, 13),
        // 2nd row right side
        rc(2, 15), rc(2, 16), rc(2, 17),

        // 3rd row left side
        rc(3, 0),
        // 3rd row
        rc(3, 2), rc(3, 3), rc(3, 4), rc(3, 5), rc(3, 6), rc(3, 7), rc(3, 8),
        rc(3, 9), rc(3, 10), rc(3, 11), rc(3, 12),
        // Enter
        rc(3, 13),

        // 4th row left side
        rc(4, 0),
        // 4th row
        rc(4, 2), rc(4, 3), rc(4, 4), rc(4, 5), rc(4, 6), rc(4, 7), rc(4, 8),
        rc(4, 9), rc(4, 10), rc(4, 11),
        // 4th row last key
        rc(4, 13),
        // 4th row right side (up arrow)
        rc(4, 16),

        // 5th row left side
        rc(5, 0), rc(5, 1), rc(5, 2),
        // space
        rc(5, 7),
        // 5th row right side
        rc(5, 10), rc(5, 11), rc(5, 12), rc(5, 13),
        // left, down, right
        rc(5, 15), rc(5, 16), rc(5, 17),
      ],
    }
  },
];

interface Layout {
  displayName: string;
  keys: Key[];
}

interface Key {
  row: number;
  col: number;
  w: number;
  h: number;
  x: number;
  y: number;
  r: number;
  rx: number;
  ry: number;
}

type PhysicalLayoutKey = Omit<Key, 'row' | 'col'>;

const regexDisplayName = /display-name\s*=\s*"([^"]+)";/;
const regexKeyAttr = /<&key_physical_attrs\s*\(?(-?\d+)\)?\s*\(?(-?\d+)\)?\s*\(?(-?\d+)\)?\s*\(?(-?\d+)\)?\s*\(?(-?\d+)\)?\s*\(?(-?\d+)\)?\s*\(?(-?\d+)\)?\s*>/g;

function parseFile(filePath: string, rcOverride: RC[] | undefined): Layout {
  const content = fs.readFileSync(filePath, 'utf-8');

  const displayName = matchDisplayName(content);
  const pkeys = matchKeys(content);
  const keys = matchRC(pkeys, content);

  // console.log(`Parsed layout: ${displayName} with ${pkeys.length} keys from ${filePath}\n\n`);
  // console.log(`Keys: ${JSON.stringify(keys, null, 2)}`);

  return { displayName, keys, };

  function matchRC(pkeys: PhysicalLayoutKey[], content: string): Key[] {
    if (rcOverride) {
      if (rcOverride.length !== pkeys.length) {
        console.warn(`!!! RC override length mismatch in ${filePath}: expected ${pkeys.length}, got ${rcOverride.length}`);
      }
      return pkeys.map((key, index) => ({
        ...key,
        row: rcOverride[index].r,
        col: rcOverride[index].c,
      }));
    }

    // find position map
    const regexPositionMap = /positions[\s=,<>\d]+?;/
    const positionMapMatch = content.match(regexPositionMap);
    if (!positionMapMatch) {
      console.warn(`!!! No position map found in ${filePath}`);
      return pkeys.map((key, index) => ({
        ...key,
        row: 0,
        col: index,
      }));
    }

    const rcFromPM = parseRCfromPM(positionMapMatch[0]);
    if (rcFromPM.length < pkeys.length) {
      console.warn(`!!! Not enough positions found in ${filePath}: expected ${pkeys.length}, got ${rcFromPM.length}`);
    }

    // tirm excess
    if (rcFromPM.length > pkeys.length) {
      rcFromPM.length = pkeys.length;
    }

    // compact row and column
    const minRow = Math.min(...rcFromPM.map(p => p.row));
    const minCol = Math.min(...rcFromPM.map(p => p.col));
    rcFromPM.forEach(p => {
      p.row -= minRow;
      p.col -= minCol;
    });

    return pkeys.map((key, index) => ({
      ...key,
      row: rcFromPM[index].row,
      col: rcFromPM[index].col,
    }));
  }

  function matchKeys(content: string): PhysicalLayoutKey[] {
    const keys: PhysicalLayoutKey[] = [];
    let match;
    while ((match = regexKeyAttr.exec(content)) !== null) {
      const [w, h, x, y, r, rx, ry] = match.slice(1).map(Number);
      keys.push({ w, h, x, y, r, rx, ry });
    }

    if (keys.length === 0) {
      console.warn(`!!! No keys found in ${filePath}`);
    }

    // count amount of `&key_physical_attrs` matches
    const keyCount = (content.match(/&key_physical_attrs/g) || []).length;
    if (keyCount !== keys.length) {
      console.warn(`!!! Key count mismatch in ${filePath}: expected ${keyCount}, found ${keys.length}`);
    }
    return keys;
  }

  function matchDisplayName(content: string): string {
    const displayNameMatch = content.match(regexDisplayName);
    const displayName = displayNameMatch ? displayNameMatch[1] : '';
    if (!displayName) {
      console.warn(`!!! No display name found in ${filePath}`);
    }
    return displayName;
  }
}

interface RCP {
  pos: number;
  row: number;
  col: number;
}

function parseRCfromPM(input: string): RCP[] {
  const result: RCP[] = [];
  const lines = input.trim().split('\n');
  const chunkSize = 3;

  for (let rowIndex = 0; rowIndex < lines.length; rowIndex++) {
    const line = lines[rowIndex].trim();

    const match = line.match(/<([\s\d]+)>/);
    if (!match) continue;

    let content = match[1];
    while (content.length % chunkSize !== 0) {
      content += ' ';
    }

    const numChunks = content.length / chunkSize;

    for (let colIndex = 0; colIndex < numChunks; colIndex++) {
      const start = colIndex * chunkSize;
      const chunk = content.substring(start, start + chunkSize);
      const trimmed = chunk.trim();

      if (trimmed !== '') {
        const value = parseInt(trimmed, 10);
        if (!isNaN(value)) {
          result.push({ pos: value, row: rowIndex, col: colIndex });
        }
      }
    }
  }

  result.sort((a, b) => a.pos - b.pos).forEach((item, index) => {
    if (item.pos !== index) {
      console.warn(`!!! Position mismatch: expected ${index}, got ${item.pos} at row ${item.row}, column ${item.col}`);
    }
  });

  return result;
}

type CompactLayout = {
  name: string;
  keys: [number, number, number, number, number, number, number, number, number][];
};

interface LayoutsJson {
  [category: string]: CompactLayout[];
}

function toCompactLayout(layout: Layout): CompactLayout {
  return {
    name: layout.displayName,
    keys: layout.keys.map(key => [
      key.row,
      key.col,
      key.w,
      key.h,
      key.x,
      key.y,
      key.r,
      key.rx,
      key.ry,
    ]),
  };
}

function main() {
  const layouts: LayoutsJson = {};

  for (const source of layoutSources) {
    if ('dir' in source) {
      const dirPath = path.join(layoutsPath, source.dir);
      if (!fs.existsSync(dirPath)) {
        console.warn(`!!! Directory does not exist: ${dirPath}`);
        continue;
      }

      const files = fs.readdirSync(dirPath).filter(file => file.endsWith('.dtsi') && file !== 'position_map.dtsi');
      const rcOverride = source.rcOverride || null;

      layouts[source.name] = [];
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const layout = parseFile(filePath, rcOverride ? rcOverride[file] : undefined);
        layouts[source.name].push(toCompactLayout(layout));
      }
    } else if ('dtsi' in source) {
      layouts[source.name] = [];
      for (const dtsi of source.dtsi) {
        const filePath = path.join(layoutsPath, dtsi.file);
        if (!fs.existsSync(filePath)) {
          console.warn(`!!! DTSI file does not exist: ${filePath}`);
          continue;
        }
        const layout = parseFile(filePath, dtsi.rcOverride);
        layout.displayName = dtsi.name; // Override display name
        layouts[source.name].push(toCompactLayout(layout));
      }
    }
  }
  const replaceRegex = /\n {8,}/g
  fs.writeFileSync(outputPath, JSON.stringify(layouts, null, 2).replace(replaceRegex, ''), 'utf-8');

  console.log(`Layouts written to ${outputPath}`);
}

main()
