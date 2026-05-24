/**
 * Debug script: deep-dive into what splitNodes produces for the TKL 87 Key ANSI layout.
 *
 * Run with:  pnpm test:node test/lib/autolayout/debug_splitnodes.test.ts
 *
 * Prints:
 *   1. All entities that were split by splitNodes and their clone/assignment details.
 *   2. Every sub-entity vertical and horizontal edge, annotated with its origin
 *      (phase C1 vertical chain / C2 remapped / D horizontal chain / E remapped).
 *   3. Column-assignment groups (union-find over subVertical) and the inter-group
 *      ordering DAG (built from subHorizontal).
 *   4. Cycle detection on both the column-group DAG and the row-group DAG, including
 *      the full cycle path, which sub-entities belong to each cyclic group, and
 *      the original inter-group ordering edges that form the cycle.
 */

import { test } from "vitest";
import { findNeighbors } from "~/lib/autolayout/neighbor";
import { bridgeSets } from "~/lib/autolayout/bridging";
import { debugLayoutPipeline } from "~/lib/autolayout/grid";
import { layouts } from "~/lib/physicalLayouts";
import { keyCenter } from "~/lib/geometry";

// ======================== Helpers ========================

/** Kahn's topological sort; returns the nodes that could NOT be processed (cycle members). */
function kahnUnsatisfied(nodes: Iterable<string>, edges: [string, string][]): string[] {
  const allNodes = new Set(nodes);
  const inDeg = new Map<string, number>();
  const out = new Map<string, string[]>();
  for (const n of allNodes) { inDeg.set(n, 0); out.set(n, []); }
  for (const [u, v] of edges) {
    if (!allNodes.has(u) || !allNodes.has(v)) continue;
    out.get(u)!.push(v);
    inDeg.set(v, inDeg.get(v)! + 1);
  }
  const queue = [...allNodes].filter(n => inDeg.get(n) === 0);
  let processed = 0;
  while (queue.length > 0) {
    const u = queue.shift()!;
    processed++;
    for (const v of out.get(u)!) {
      const d = inDeg.get(v)! - 1;
      inDeg.set(v, d);
      if (d === 0) queue.push(v);
    }
  }
  return [...allNodes].filter(n => inDeg.get(n)! > 0);
}

/** Tarjan's SCC — returns only components with > 1 node (actual cycles). */
function cyclicSCCs(nodes: Iterable<string>, edges: [string, string][]): string[][] {
  const allNodes = new Set(nodes);
  const out = new Map<string, string[]>();
  for (const n of allNodes) out.set(n, []);
  for (const [u, v] of edges) {
    if (allNodes.has(u) && allNodes.has(v)) out.get(u)!.push(v);
  }
  const idx = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const result: string[][] = [];
  let counter = 0;

  function dfs(v: string) {
    idx.set(v, counter); low.set(v, counter++);
    stack.push(v); onStack.add(v);
    for (const w of out.get(v)!) {
      if (!idx.has(w)) { dfs(w); low.set(v, Math.min(low.get(v)!, low.get(w)!)); }
      else if (onStack.has(w)) low.set(v, Math.min(low.get(v)!, idx.get(w)!));
    }
    if (low.get(v) === idx.get(v)) {
      const comp: string[] = [];
      while (true) { const w = stack.pop()!; onStack.delete(w); comp.push(w); if (w === v) break; }
      if (comp.length > 1) result.push(comp);
    }
  }
  for (const n of allNodes) if (!idx.has(n)) dfs(n);
  return result;
}

/** Find a cycle path in a component by DFS. */
function findCyclePath(component: string[], edges: [string, string][]): string[] | null {
  const cset = new Set(component);
  const out = new Map<string, string[]>();
  for (const n of component) out.set(n, []);
  for (const [u, v] of edges) {
    if (cset.has(u) && cset.has(v)) out.get(u)!.push(v);
  }
  const color = new Map<string, 0 | 1 | 2>();
  const parent = new Map<string, string | null>();
  let cycleEnd: string | null = null;
  let cycleStart: string | null = null;

  function dfs(u: string): boolean {
    color.set(u, 1);
    for (const v of out.get(u)!) {
      if (!color.has(v)) {
        parent.set(v, u);
        if (dfs(v)) return true;
      } else if (color.get(v) === 1) {
        cycleEnd = u; cycleStart = v; return true;
      }
    }
    color.set(u, 2);
    return false;
  }
  for (const n of component) {
    if (!color.has(n)) { parent.set(n, null); if (dfs(n)) break; }
  }
  if (cycleStart === null || cycleEnd === null) return null;
  const path = [cycleStart];
  let cur: string | null = cycleEnd;
  while (cur !== null && cur !== cycleStart) { path.push(cur); cur = parent.get(cur) ?? null; }
  return path.reverse();
}

// ======================== Test ========================

test("debug splitNodes for TKL 87 Key ANSI", () => {
  // --- Load layout and detect neighbors ---
  const tklLayout = layouts["TKL"].find(l => l.name === "TKL 87 Key ANSI")!;
  let counter = 0;
  const idOf = new Map<number, string>(); // index → debugId
  const keys = tklLayout.keys.map((k, i) => {
    const id = `debugKey${(counter++).toString().padStart(3, "0")}`;
    idOf.set(i, id);
    return { ...k, id, row: -1, col: -1 };
  });
  const rects = keys.map(k => {
    const kc = keyCenter(k, { keySize: 1 });
    return { id: k.id, x: kc.x, y: kc.y, width: k.w, height: k.h, degree: k.r };
  });
  const rectById = new Map(rects.map(r => [r.id, r]));

  const neighborOutput = findNeighbors({ objects: rects, threshold: 0.8 });
  const bridging = bridgeSets(neighborOutput, rects);
  const horizontal = [...neighborOutput.horizontal, ...bridging.horizontal] as [string, string][];
  const vertical = [...neighborOutput.vertical, ...bridging.vertical] as [string, string][];

  // --- Run pipeline debug ---
  const dbg = debugLayoutPipeline({ nodes: rects.map(r => r.id), horizontal, vertical });

  // Helper: format a sub-entity key with its physical position
  const fmt = (seKey: string) => {
    const [entity] = seKey.split("#");
    const r = rectById.get(entity);
    return r
      ? `${seKey}(x=${r.x.toFixed(1)},y=${r.y.toFixed(1)})`
      : seKey;
  };

  // ======================== 1. Split entities ========================
  console.log(`\n${"=".repeat(70)}`);
  console.log(`SPLIT ENTITIES  (${dbg.splitEntities.length} of ${rects.length} total)`);
  console.log("=".repeat(70));
  for (const s of dbg.splitEntities) {
    const r = rectById.get(s.entity)!;
    console.log(
      `\n${s.entity}  x=${r.x.toFixed(2)}, y=${r.y.toFixed(2)}` +
      `  →  colClones=${s.numColClones}  rowClones=${s.numRowClones}`
    );
    console.log(`  clones: ${s.cloneKeys.join("  ")}`);
    if (s.vInAssignments.length > 0) {
      console.log("  V-in  assignments (src → tgtSubCol):");
      for (const a of s.vInAssignments)
        console.log(`    ${a.from} → ${s.entity}  tgtSubCol=${a.tgtSubCol}`);
    }
    if (s.vOutAssignments.length > 0) {
      console.log("  V-out assignments (srcSubCol → tgt):");
      for (const a of s.vOutAssignments)
        console.log(`    ${s.entity} → ${a.to}  srcSubCol=${a.srcSubCol}`);
    }
    if (s.hInAssignments.length > 0) {
      console.log("  H-in  assignments (src → tgtSubRow):");
      for (const a of s.hInAssignments)
        console.log(`    ${a.from} → ${s.entity}  tgtSubRow=${a.tgtSubRow}`);
    }
    if (s.hOutAssignments.length > 0) {
      console.log("  H-out assignments (srcSubRow → tgt):");
      for (const a of s.hOutAssignments)
        console.log(`    ${s.entity} → ${a.to}  srcSubRow=${a.srcSubRow}`);
    }
  }

  // ======================== 2. Sub-entity edges summary ========================
  console.log(`\n${"=".repeat(70)}`);
  console.log(`SUB-ENTITY EDGES`);
  console.log("=".repeat(70));
  console.log(`  subVertical:   ${dbg.subVertical.length} edges`);
  console.log(`  subHorizontal: ${dbg.subHorizontal.length} edges`);

  // Classify each sub-entity edge by phase
  const originalVSet = new Set(vertical.map(([a, b]) => `${a}#${b}`));
  const originalHSet = new Set(horizontal.map(([a, b]) => `${a}#${b}`));

  const phaseLabel = (from: string, to: string, isVertical: boolean): string => {
    const [fEnt, fRow, fCol] = from.split("#");
    const [tEnt, tRow, tCol] = to.split("#");
    if (fEnt === tEnt) {
      return isVertical ? "C1 (row-clone vertical chain)" : "D (col-clone horizontal chain)";
    }
    const origKey = `${fEnt}#${tEnt}`;
    return isVertical
      ? (originalVSet.has(origKey) ? "C2 (remapped V edge)" : "?V")
      : (originalHSet.has(origKey) ? "E  (remapped H edge)" : "?H");
  };

  // Print all subHorizontal edges with phase labels (most relevant for column cycles)
  console.log("\n--- subHorizontal edges by phase ---");
  const phaseGroups = new Map<string, [string, string][]>();
  for (const [from, to] of dbg.subHorizontal) {
    const label = phaseLabel(from, to, false);
    if (!phaseGroups.has(label)) phaseGroups.set(label, []);
    phaseGroups.get(label)!.push([from, to]);
  }
  for (const [phase, edges] of [...phaseGroups.entries()].sort()) {
    console.log(`\n  ${phase}  (${edges.length} edges):`);
    for (const [from, to] of edges) {
      console.log(`    ${fmt(from)}  →  ${fmt(to)}`);
    }
  }

  // ======================== 3. Column-group analysis ========================
  console.log(`\n${"=".repeat(70)}`);
  console.log(`COLUMN ASSIGNMENT GROUPS`);
  console.log("=".repeat(70));

  // Invert colGroupOf: root → members
  const colGroupMembers = new Map<string, string[]>();
  for (const [se, root] of dbg.colGroupOf) {
    if (!colGroupMembers.has(root)) colGroupMembers.set(root, []);
    colGroupMembers.get(root)!.push(se);
  }
  console.log(`  ${colGroupMembers.size} column groups  (${dbg.colGroupEdges.length} inter-group ordering edges)`);

  // ======================== 4. Cycle detection — column groups ========================
  const colNodes = [...colGroupMembers.keys()];
  const colCycleNodes = kahnUnsatisfied(colNodes, dbg.colGroupEdges);
  const colCycleSCCs = cyclicSCCs(colNodes, dbg.colGroupEdges);

  if (colCycleNodes.length === 0) {
    console.log("\n  ✓ Column-group DAG is acyclic.");
  } else {
    console.log(`\n  ✗ Column-group DAG has ${colCycleSCCs.length} cyclic SCC(s).`);
    console.log(`    Unsatisfied group roots (${colCycleNodes.length}): ${colCycleNodes.join(", ")}`);

    for (let i = 0; i < colCycleSCCs.length; i++) {
      const scc = colCycleSCCs[i];
      console.log(`\n  --- Cyclic SCC #${i + 1}  (${scc.length} groups) ---`);

      // Find the cycle path
      const cyclePath = findCyclePath(scc, dbg.colGroupEdges);
      if (cyclePath) {
        console.log(`  Cycle path: ${cyclePath.map(fmt).join("  →  ")} → (back to start)`);
      }

      // Print each group's members
      for (const root of scc) {
        const members = colGroupMembers.get(root) ?? [];
        const physInfo = members.map(se => {
          const [ent] = se.split("#");
          const r = rectById.get(ent);
          return r ? `${se}(x=${r.x.toFixed(1)},y=${r.y.toFixed(1)})` : se;
        });
        console.log(`\n    group root="${root}"  (${members.length} sub-entities):`);
        for (const p of physInfo) console.log(`      ${p}`);
      }

      // Print the cyclic inter-group edges with originating sub-entity edges
      console.log(`\n  Inter-group edges within this SCC:`);
      const sccSet = new Set(scc);
      const sccEdges = dbg.colGroupEdges.filter(([ga, gb]) => sccSet.has(ga) && sccSet.has(gb));
      console.log(`    (${sccEdges.length} edges within SCC)`);
      for (const [groupA, groupB] of sccEdges) {
        // Find which subHorizontal edges caused this inter-group edge
        const causes = dbg.subHorizontal.filter(([a, b]) => {
          const ra = dbg.colGroupOf.get(a);
          const rb = dbg.colGroupOf.get(b);
          return ra === groupA && rb === groupB;
        });
        console.log(`\n    ${fmt(groupA)} →group→ ${fmt(groupB)}`);
        console.log(`      Caused by subHorizontal (${causes.length} edge(s)):`);
        for (const [a, b] of causes) {
          const phase = phaseLabel(a, b, false);
          console.log(`        ${fmt(a)}  →  ${fmt(b)}  [${phase}]`);
        }
      }
    }
  }

  // ======================== 5. Row-group cycle detection ========================
  const rowGroupMembers = new Map<string, string[]>();
  for (const [se, root] of dbg.rowGroupOf) {
    if (!rowGroupMembers.has(root)) rowGroupMembers.set(root, []);
    rowGroupMembers.get(root)!.push(se);
  }
  const rowNodes = [...rowGroupMembers.keys()];
  const rowCycleNodes = kahnUnsatisfied(rowNodes, dbg.rowGroupEdges);
  const rowCycleSCCs = cyclicSCCs(rowNodes, dbg.rowGroupEdges);

  console.log(`\n${"=".repeat(70)}`);
  console.log(`ROW ASSIGNMENT GROUPS`);
  console.log("=".repeat(70));
  console.log(`  ${rowGroupMembers.size} row groups  (${dbg.rowGroupEdges.length} inter-group ordering edges)`);
  if (rowCycleNodes.length === 0) {
    console.log("\n  ✓ Row-group DAG is acyclic.");
  } else {
    console.log(`\n  ✗ Row-group DAG has ${rowCycleSCCs.length} cyclic SCC(s).`);
    for (let i = 0; i < rowCycleSCCs.length; i++) {
      const scc = rowCycleSCCs[i];
      console.log(`\n  --- Cyclic SCC #${i + 1} (${scc.length} groups) ---`);
      const cyclePath = findCyclePath(scc, dbg.rowGroupEdges);
      if (cyclePath) console.log(`  Cycle path: ${cyclePath.map(fmt).join(" → ")} → (back)`);
      for (const root of scc) {
        const members = rowGroupMembers.get(root) ?? [];
        console.log(`\n    group root="${root}"  (${members.length} sub-entities): ${members.join(", ")}`);
      }
      const sccSet = new Set(scc);
      console.log(`\n  Inter-group edges within this SCC:`);
      for (const [ga, gb] of dbg.rowGroupEdges) {
        if (!sccSet.has(ga) || !sccSet.has(gb)) continue;
        const causes = dbg.subVertical.filter(([a, b]) => {
          return dbg.rowGroupOf.get(a) === ga && dbg.rowGroupOf.get(b) === gb;
        });
        console.log(`\n    ${fmt(ga)} →group→ ${fmt(gb)}`);
        for (const [a, b] of causes) {
          const phase = phaseLabel(a, b, true);
          console.log(`      ${fmt(a)}  →  ${fmt(b)}  [${phase}]`);
        }
      }
    }
  }

  console.log("\n");
});
