import { test } from "vitest";
import { findNeighbors } from "~/lib/autolayout/neighbor";
import { bridgeSets } from "~/lib/autolayout/bridging";
import { layouts } from "~/lib/physicalLayouts";
import { keyCenter } from "~/lib/geometry";

test("trace the cycle cause", () => {
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
  const bridging = bridgeSets(neighborOutput, rects);

  const allH = [...neighborOutput.horizontal, ...bridging.horizontal];
  const allV = [...neighborOutput.vertical, ...bridging.vertical];

  // Find "diagonal" horizontal edges - where both endpoints are also vertically related
  // to the same column of nodes
  console.log("=== Diagonal H edges (where V edge exists between the H neighbors) ===");
  const vSet = new Set(allV.map(([a, b]) => `${a}|${b}`));
  
  // For each pair of H edges from the same source going to the same direction
  const hBySource = new Map<string, string[]>();
  for (const [a, b] of allH) {
    if (!hBySource.has(a)) hBySource.set(a, []);
    hBySource.get(a)!.push(b);
  }
  
  for (const [src, targets] of hBySource) {
    if (targets.length <= 1) continue;
    const srcRect = rects.find(r => r.id === src)!;
    for (let i = 0; i < targets.length; i++) {
      for (let j = i + 1; j < targets.length; j++) {
        const t1 = targets[i], t2 = targets[j];
        const hasVert = vSet.has(`${t1}|${t2}`) || vSet.has(`${t2}|${t1}`);
        if (hasVert) {
          const r1 = rects.find(r => r.id === t1)!;
          const r2 = rects.find(r => r.id === t2)!;
          console.log(`  ${src}(y=${srcRect.y.toFixed(2)}) -> [${t1}(y=${r1.y.toFixed(2)}), ${t2}(y=${r2.y.toFixed(2)})] (V: ${vSet.has(`${t1}|${t2}`) ? `${t1}->${t2}` : `${t2}->${t1}`})`);
        }
      }
    }
  }

  // Same for H edges by target
  const hByTarget = new Map<string, string[]>();
  for (const [a, b] of allH) {
    if (!hByTarget.has(b)) hByTarget.set(b, []);
    hByTarget.get(b)!.push(a);
  }
  
  console.log("\n=== Diagonal H edges (same target, sources vertically related) ===");
  for (const [tgt, sources] of hByTarget) {
    if (sources.length <= 1) continue;
    const tgtRect = rects.find(r => r.id === tgt)!;
    for (let i = 0; i < sources.length; i++) {
      for (let j = i + 1; j < sources.length; j++) {
        const s1 = sources[i], s2 = sources[j];
        const hasVert = vSet.has(`${s1}|${s2}`) || vSet.has(`${s2}|${s1}`);
        if (hasVert) {
          const r1 = rects.find(r => r.id === s1)!;
          const r2 = rects.find(r => r.id === s2)!;
          console.log(`  [${s1}(y=${r1.y.toFixed(2)}), ${s2}(y=${r2.y.toFixed(2)})] -> ${tgt}(y=${tgtRect.y.toFixed(2)}) (V: ${vSet.has(`${s1}|${s2}`) ? `${s1}->${s2}` : `${s2}->${s1}`})`);
        }
      }
    }
  }
});
