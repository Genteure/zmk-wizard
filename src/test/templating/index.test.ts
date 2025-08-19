import { describe, expect, test } from "vitest";
import { createZMKConfig } from "~/lib/templating";
import type { KeyboardContext, VirtualTextFolder } from "~/lib/types";

import Parser from 'tree-sitter';

import TreeSitterYAML from "@tree-sitter-grammars/tree-sitter-yaml";
import TreeSitterDevicetree from "tree-sitter-devicetree";
import TreeSitterJSON from "tree-sitter-json";
import TreeSitterKconfig from "tree-sitter-kconfig";

// TODO more tests

function loadParsers(): Record<string, Parser | true> {
  const jsonParser = new Parser();
  jsonParser.setLanguage(TreeSitterJSON as any)

  const yamlParser = new Parser();
  yamlParser.setLanguage(TreeSitterYAML as any);

  const devicetreeParser = new Parser();
  devicetreeParser.setLanguage(TreeSitterDevicetree as any);

  const kconfigParser = new Parser();
  kconfigParser.setLanguage(TreeSitterKconfig as any);

  return {
    "json": jsonParser,

    "yml": yamlParser,
    "yaml": yamlParser,

    "dtsi": devicetreeParser,
    "overlay": devicetreeParser,
    "keymap": devicetreeParser,

    "defconfig": kconfigParser,
    "shield": kconfigParser,

    "conf": true,
    "md": true,
  };
}

const parsers = loadParsers();

function validateFileSyntax(files: VirtualTextFolder) {
  for (const [fileName, content] of Object.entries(files)) {
    const ext = fileName.split('.').pop();
    if (ext && parsers[ext]) {
      const parser = parsers[ext];
      if (parser === true) continue;
      const tree = parser.parse(content);

      expect(tree?.rootNode).toBeDefined();
      expect(tree.rootNode.hasError, `${fileName} syntax error`).toBe(false);
    } else {
      expect.unreachable(`No parser for file extension: ${ext} (file: ${fileName})`);
    }
  }
}

describe("unibody", () => {
  const unibodyConfig: KeyboardContext = {
    "info": { "name": "UnitTest", "shield": "unittest", "controller": "nice_nano_v2", "wiring": "matrix_diode", "dongle": false },
    "layout": [{ "partOf": 0, "row": 0, "column": 0, "width": 1, "height": 1, "x": 0, "y": 0, "r": 0, "rx": 0, "ry": 0 }, { "partOf": 0, "row": 0, "column": 1, "width": 1, "height": 1, "x": 1, "y": 0, "r": 0, "rx": 0, "ry": 0 }, { "partOf": 0, "row": 0, "column": 2, "width": 1, "height": 1, "x": 2, "y": 0, "r": 0, "rx": 0, "ry": 0 }, { "partOf": 0, "row": 0, "column": 3, "width": 1, "height": 1, "x": 3, "y": 0, "r": 0, "rx": 0, "ry": 0 }, { "partOf": 0, "row": 1, "column": 0, "width": 1, "height": 1, "x": 0, "y": 1, "r": 0, "rx": 0, "ry": 0 }, { "partOf": 0, "row": 1, "column": 1, "width": 1, "height": 1, "x": 1, "y": 1, "r": 0, "rx": 0, "ry": 0 }, { "partOf": 0, "row": 1, "column": 2, "width": 1, "height": 1, "x": 2, "y": 1, "r": 0, "rx": 0, "ry": 0 }, { "partOf": 0, "row": 1, "column": 3, "width": 1, "height": 1, "x": 3, "y": 1, "r": 0, "rx": 0, "ry": 0 }, { "partOf": 0, "row": 2, "column": 0, "width": 1, "height": 1, "x": 0, "y": 2, "r": 0, "rx": 0, "ry": 0 }, { "partOf": 0, "row": 2, "column": 1, "width": 1, "height": 1, "x": 1, "y": 2, "r": 0, "rx": 0, "ry": 0 }, { "partOf": 0, "row": 2, "column": 2, "width": 1, "height": 1, "x": 2, "y": 2, "r": 0, "rx": 0, "ry": 0 }, { "partOf": 0, "row": 2, "column": 3, "width": 1, "height": 1, "x": 3, "y": 2, "r": 0, "rx": 0, "ry": 0 }, { "partOf": 0, "row": 3, "column": 0, "width": 1, "height": 1, "x": 0, "y": 3, "r": 0, "rx": 0, "ry": 0 }, { "partOf": 0, "row": 3, "column": 1, "width": 1, "height": 1, "x": 1, "y": 3, "r": 0, "rx": 0, "ry": 0 }, { "partOf": 0, "row": 3, "column": 2, "width": 1, "height": 1, "x": 2, "y": 3, "r": 0, "rx": 0, "ry": 0 }, { "partOf": 0, "row": 3, "column": 3, "width": 1, "height": 1, "x": 3, "y": 3, "r": 0, "rx": 0, "ry": 0 }, { "partOf": 0, "row": 4, "column": 0, "width": 1, "height": 1, "x": 0, "y": 4, "r": 0, "rx": 0, "ry": 0 }, { "partOf": 0, "row": 4, "column": 1, "width": 1, "height": 1, "x": 1, "y": 4, "r": 0, "rx": 0, "ry": 0 }, { "partOf": 0, "row": 4, "column": 2, "width": 1, "height": 1, "x": 2, "y": 4, "r": 0, "rx": 0, "ry": 0 }, { "partOf": 0, "row": 4, "column": 3, "width": 1, "height": 1, "x": 3, "y": 4, "r": 0, "rx": 0, "ry": 0 }],
    "pinouts": [{ "d1": "output", "d0": "output", "d2": "output", "d3": "output", "d4": "output", "d20": "input", "d19": "input", "d18": "input", "d15": "input" }],
    "wiring": [{ "input": "d20", "output": "d1" }, { "input": "d19", "output": "d1" }, { "input": "d18", "output": "d1" }, { "input": "d15", "output": "d1" }, { "input": "d20", "output": "d2" }, { "input": "d19", "output": "d2" }, { "input": "d18", "output": "d2" }, { "input": "d15", "output": "d2" }, { "input": "d20", "output": "d0" }, { "input": "d19", "output": "d0" }, { "input": "d18", "output": "d0" }, { "input": "d15", "output": "d0" }, { "input": "d20", "output": "d4" }, { "input": "d19", "output": "d4" }, { "input": "d18", "output": "d4" }, { "input": "d15", "output": "d4" }, { "input": "d20", "output": "d3" }, { "input": "d19", "output": "d3" }, { "input": "d18", "output": "d3" }, { "input": "d15", "output": "d3" }]
  };

  test("have expected files", () => {
    const files = createZMKConfig(unibodyConfig);
    const fileNames = Object.keys(files).sort();

    expect(fileNames).toEqual([
      ".github/workflows/build.yml",
      "README.md",
      "boards/shields/unittest/Kconfig.defconfig",
      "boards/shields/unittest/Kconfig.shield",
      "boards/shields/unittest/unittest-layouts.dtsi",
      "boards/shields/unittest/unittest.overlay",
      "build.yaml",
      "config/unittest.conf",
      "config/unittest.json",
      "config/unittest.keymap",
      "config/west.yml",
      "zephyr/module.yml",
    ]);

    validateFileSyntax(files);
  })

  test("have expected files w/ dongle", () => {
    const config = structuredClone(unibodyConfig);
    config.info.dongle = true;
    const files = createZMKConfig(config);
    const fileNames = Object.keys(files).sort();

    expect(fileNames).toEqual([
      ".github/workflows/build.yml",
      "README.md",
      "boards/shields/unittest/Kconfig.defconfig",
      "boards/shields/unittest/Kconfig.shield",
      "boards/shields/unittest/unittest-layouts.dtsi",
      "boards/shields/unittest/unittest.overlay",
      "boards/shields/unittest/unittest_dongle.overlay",
      "build.yaml",
      "config/unittest.conf",
      "config/unittest.json",
      "config/unittest.keymap",
      "config/west.yml",
      "zephyr/module.yml",
    ]);

    validateFileSyntax(files);
  })
})

describe("split", () => {
  const splitConfig: KeyboardContext = {
    "info": { "name": "UnitTest", "shield": "unittest", "controller": "nice_nano_v2", "wiring": "matrix_diode", "dongle": false },
    "layout": [{ "partOf": 0, "row": 0, "column": 0, "width": 1, "height": 1, "x": 0, "y": 0, "r": 0, "rx": 0, "ry": 0 }, { "partOf": 0, "row": 0, "column": 1, "width": 1, "height": 1, "x": 1, "y": 0, "r": 0, "rx": 0, "ry": 0 }, { "partOf": 1, "row": 0, "column": 2, "width": 1, "height": 1, "x": 2, "y": 0, "r": 0, "rx": 0, "ry": 0 }, { "partOf": 1, "row": 0, "column": 3, "width": 1, "height": 1, "x": 3, "y": 0, "r": 0, "rx": 0, "ry": 0 }, { "partOf": 0, "row": 1, "column": 0, "width": 1, "height": 1, "x": 0, "y": 1, "r": 0, "rx": 0, "ry": 0 }, { "partOf": 0, "row": 1, "column": 1, "width": 1, "height": 1, "x": 1, "y": 1, "r": 0, "rx": 0, "ry": 0 }, { "partOf": 1, "row": 1, "column": 2, "width": 1, "height": 1, "x": 2, "y": 1, "r": 0, "rx": 0, "ry": 0 }, { "partOf": 1, "row": 1, "column": 3, "width": 1, "height": 1, "x": 3, "y": 1, "r": 0, "rx": 0, "ry": 0 }, { "partOf": 0, "row": 2, "column": 0, "width": 1, "height": 1, "x": 0, "y": 2, "r": 0, "rx": 0, "ry": 0 }, { "partOf": 0, "row": 2, "column": 1, "width": 1, "height": 1, "x": 1, "y": 2, "r": 0, "rx": 0, "ry": 0 }, { "partOf": 1, "row": 2, "column": 2, "width": 1, "height": 1, "x": 2, "y": 2, "r": 0, "rx": 0, "ry": 0 }, { "partOf": 1, "row": 2, "column": 3, "width": 1, "height": 1, "x": 3, "y": 2, "r": 0, "rx": 0, "ry": 0 }],
    "pinouts": [{ "d1": "output", "d0": "input", "d2": "output", "d3": "input", "d4": "output" }, { "d0": "output", "d2": "input", "d3": "output", "d4": "input", "d5": "output" }],
    "wiring": [{ "input": "d0", "output": "d1" }, { "input": "d3", "output": "d1" }, { "input": "d4", "output": "d0" }, { "input": "d2", "output": "d0" }, { "input": "d0", "output": "d2" }, { "input": "d3", "output": "d2" }, { "input": "d4", "output": "d3" }, { "input": "d2", "output": "d3" }, { "input": "d0", "output": "d4" }, { "input": "d3", "output": "d4" }, { "input": "d4", "output": "d5" }, { "input": "d2", "output": "d5" }]
  };

  test("have expected files", () => {
    const files = createZMKConfig(splitConfig);
    const fileNames = Object.keys(files).sort();

    expect(fileNames).toEqual([
      ".github/workflows/build.yml",
      "README.md",
      "boards/shields/unittest/Kconfig.defconfig",
      "boards/shields/unittest/Kconfig.shield",
      "boards/shields/unittest/unittest-layouts.dtsi",
      "boards/shields/unittest/unittest.dtsi",
      "boards/shields/unittest/unittest_left.overlay",
      "boards/shields/unittest/unittest_right.overlay",
      "build.yaml",
      "config/unittest.conf",
      "config/unittest.json",
      "config/unittest.keymap",
      "config/west.yml",
      "zephyr/module.yml",
    ]);

    validateFileSyntax(files);
  })

  test("have expected files w/ dongle", () => {
    const config = structuredClone(splitConfig);
    config.info.dongle = true;
    const files = createZMKConfig(config);
    const fileNames = Object.keys(files).sort();

    expect(fileNames).toEqual([
      ".github/workflows/build.yml",
      "README.md",
      "boards/shields/unittest/Kconfig.defconfig",
      "boards/shields/unittest/Kconfig.shield",
      "boards/shields/unittest/unittest-layouts.dtsi",
      "boards/shields/unittest/unittest.dtsi",
      "boards/shields/unittest/unittest_dongle.overlay",
      "boards/shields/unittest/unittest_left.overlay",
      "boards/shields/unittest/unittest_right.overlay",
      "build.yaml",
      "config/unittest.conf",
      "config/unittest.json",
      "config/unittest.keymap",
      "config/west.yml",
      "zephyr/module.yml",
    ]);

    validateFileSyntax(files);
  })
})
