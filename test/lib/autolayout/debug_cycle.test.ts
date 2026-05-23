import { test } from "vitest";
import { findNeighbors } from "~/lib/autolayout/neighbor";
import { bridgeSets } from "~/lib/autolayout/bridging";
import { filterDiagonalEdges } from "~/lib/autolayout/gridfit";
import { layout } from "~/lib/autolayout/grid";
import { layouts } from "~/lib/physicalLayouts";
import { keyCenter } from "~/lib/geometry";

test("debug ferris bridging", () => {
  let counter = 0;
  const generateId = () => `keyId${(counter++).toString().padStart(3, '0')}AA`;

  const ferrisLayoutKeys = layouts["Popular Layouts"]
    .find(l => l.name === "Ferris")!.keys
    .map((k) => ({
      ...k,
      id: generateId(),
      row: -1,
      col: -1,
    }));

  const rects = ferrisLayoutKeys.map(k => {
    const kc = keyCenter(k, { keySize: 1 });
    return {
      id: k.id,
      x: kc.x,
      y: kc.y,
      width: k.w,
      height: k.h,
      degree: k.r,
    };
  });

  const neighborOutput = findNeighbors({
    objects: rects,
    threshold: 0.8,
  });

  const filtered = filterDiagonalEdges(
    neighborOutput.horizontal,
    neighborOutput.vertical,
    neighborOutput.nodes
  );

  const filteredOutput = {
    ...neighborOutput,
    horizontal: filtered.horizontal,
    vertical: filtered.vertical,
  };

  const bridging = bridgeSets(filteredOutput, rects);
  console.log("=== Bridging edges ===");
  console.log("Horizontal:", bridging.horizontal.map(([a,b]) => {
    const ar = rects.find(r => r.id === a)!;
    const br = rects.find(r => r.id === b)!;
    return `${a}(x=${ar.x.toFixed(2)},y=${ar.y.toFixed(2)}) -> ${b}(x=${br.x.toFixed(2)},y=${br.y.toFixed(2)})`;
  }));
  console.log("Vertical:", bridging.vertical.map(([a,b]) => {
    const ar = rects.find(r => r.id === a)!;
    const br = rects.find(r => r.id === b)!;
    return `${a}(x=${ar.x.toFixed(2)},y=${ar.y.toFixed(2)}) -> ${b}(x=${br.x.toFixed(2)},y=${br.y.toFixed(2)})`;
  }));

  // Now run layout
  const allH = [...filtered.horizontal, ...bridging.horizontal];
  const allV = [...filtered.vertical, ...bridging.vertical];
  
  const result = layout({
    nodes: neighborOutput.nodes,
    horizontal: allH,
    vertical: allV,
  });

  console.log("\n=== Layout result ===");
  for (const r of rects) {
    const pos = result.positions.get(r.id)!;
    console.log(`  ${r.id}(x=${r.x.toFixed(2)},y=${r.y.toFixed(2)}): row=${pos.row}, col=${pos.col}`);
  }
});
