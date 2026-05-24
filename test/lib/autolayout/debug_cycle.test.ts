import { test } from "vitest";
import { findNeighbors } from "~/lib/autolayout/neighbor";
import { bridgeSets } from "~/lib/autolayout/bridging";
import { layout } from "~/lib/autolayout/grid";
import { layouts } from "~/lib/physicalLayouts";
import { keyCenter } from "~/lib/geometry";

type EdgeKind = "H" | "V";
type Edge = { from: string; to: string; kind: EdgeKind; source: "neighbor" | "bridge" };
type Rect = { id: string; x: number; y: number; width: number; height: number; degree: number };

function countBy<T extends string>(items: T[]): Record<T, number> {
  const result = {} as Record<T, number>;
  for (const item of items) {
    result[item] = (result[item] ?? 0) + 1;
  }
  return result;
}

function buildAdjacency(nodes: string[], edges: Edge[]) {
  const out = new Map<string, string[]>();
  const inDeg = new Map<string, number>();
  for (const n of nodes) {
    out.set(n, []);
    inDeg.set(n, 0);
  }
  for (const e of edges) {
    if (!out.has(e.from)) {
      out.set(e.from, []);
      inDeg.set(e.from, 0);
    }
    if (!out.has(e.to)) {
      out.set(e.to, []);
      inDeg.set(e.to, 0);
    }
    out.get(e.from)!.push(e.to);
    inDeg.set(e.to, (inDeg.get(e.to) ?? 0) + 1);
  }
  return { out, inDeg };
}

function unsatisfiedByKahn(nodes: string[], edges: Edge[]): string[] {
  const { out, inDeg } = buildAdjacency(nodes, edges);
  const queue: string[] = [];
  for (const n of nodes) {
    if ((inDeg.get(n) ?? 0) === 0) queue.push(n);
  }

  let processed = 0;
  while (queue.length > 0) {
    const cur = queue.shift()!;
    processed++;
    for (const next of out.get(cur) ?? []) {
      const d = (inDeg.get(next) ?? 0) - 1;
      inDeg.set(next, d);
      if (d === 0) queue.push(next);
    }
  }

  if (processed >= new Set(nodes).size) return [];
  return [...new Set(nodes)].filter((n) => (inDeg.get(n) ?? 0) > 0);
}

function stronglyConnectedComponents(nodes: string[], edges: Edge[]): string[][] {
  const { out } = buildAdjacency(nodes, edges);
  const indexMap = new Map<string, number>();
  const lowLink = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const components: string[][] = [];
  let index = 0;

  function dfs(v: string) {
    indexMap.set(v, index);
    lowLink.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);

    for (const w of out.get(v) ?? []) {
      if (!indexMap.has(w)) {
        dfs(w);
        lowLink.set(v, Math.min(lowLink.get(v)!, lowLink.get(w)!));
      } else if (onStack.has(w)) {
        lowLink.set(v, Math.min(lowLink.get(v)!, indexMap.get(w)!));
      }
    }

    if (lowLink.get(v) === indexMap.get(v)) {
      const component: string[] = [];
      while (stack.length > 0) {
        const w = stack.pop()!;
        onStack.delete(w);
        component.push(w);
        if (w === v) break;
      }
      components.push(component);
    }
  }

  for (const n of new Set(nodes)) {
    if (!indexMap.has(n)) dfs(n);
  }
  return components;
}

function findCyclePath(componentNodes: string[], edges: Edge[]): string[] | null {
  const cset = new Set(componentNodes);
  const out = new Map<string, string[]>();
  for (const n of componentNodes) out.set(n, []);
  for (const e of edges) {
    if (cset.has(e.from) && cset.has(e.to)) out.get(e.from)!.push(e.to);
  }

  const color = new Map<string, 0 | 1 | 2>();
  const parent = new Map<string, string | null>();
  let cycle: string[] | null = null;

  function dfs(u: string): boolean {
    color.set(u, 1);
    for (const v of out.get(u) ?? []) {
      const cv = color.get(v) ?? 0;
      if (cv === 0) {
        parent.set(v, u);
        if (dfs(v)) return true;
      } else if (cv === 1) {
        const path: string[] = [v];
        let cur: string | null = u;
        while (cur !== null && cur !== v) {
          path.push(cur);
          cur = parent.get(cur) ?? null;
        }
        path.push(v);
        path.reverse();
        cycle = path;
        return true;
      }
    }
    color.set(u, 2);
    return false;
  }

  for (const n of componentNodes) {
    if ((color.get(n) ?? 0) !== 0) continue;
    parent.set(n, null);
    if (dfs(n)) return cycle;
  }
  return cycle;
}

function edgeSummary(edges: Edge[], rectById: Map<string, Rect>) {
  return edges.map((e) => {
    const from = rectById.get(e.from);
    const to = rectById.get(e.to);
    const dx = from && to ? (to.x - from.x).toFixed(2) : "n/a";
    const dy = from && to ? (to.y - from.y).toFixed(2) : "n/a";
    return `${e.kind}/${e.source}: ${e.from} -> ${e.to} (dx=${dx}, dy=${dy})`;
  });
}

function printCycleDiagnostics(nodes: string[], edges: Edge[], rectById: Map<string, Rect>) {
  const allNodeSet = new Set(nodes);
  for (const e of edges) {
    allNodeSet.add(e.from);
    allNodeSet.add(e.to);
  }
  const allNodes = [...allNodeSet];
  const { out, inDeg } = buildAdjacency(allNodes, edges);
  const outDeg = new Map<string, number>();
  for (const n of allNodes) outDeg.set(n, (out.get(n) ?? []).length);

  console.log("\n=== Cycle diagnostics ===");
  console.log("Graph stats:");
  console.log(`  nodes=${allNodes.length}, edges=${edges.length}`);
  console.log(`  edge kinds=${JSON.stringify(countBy(edges.map((e) => e.kind)))}`);
  console.log(`  edge sources=${JSON.stringify(countBy(edges.map((e) => e.source)))}`);

  const unsatisfied = unsatisfiedByKahn(allNodes, edges);
  console.log(`Kahn unsatisfied node count=${unsatisfied.length}`);
  if (unsatisfied.length > 0) {
    console.log("Kahn unsatisfied nodes:");
    for (const id of unsatisfied) {
      const rect = rectById.get(id);
      console.log(
        `  ${id} indeg=${inDeg.get(id) ?? 0} outdeg=${outDeg.get(id) ?? 0}` +
        (rect ? ` x=${rect.x.toFixed(2)} y=${rect.y.toFixed(2)}` : "")
      );
    }
  }

  const sccs = stronglyConnectedComponents(allNodes, edges);
  const cyclicSccs = sccs.filter((component) => {
    if (component.length > 1) return true;
    const n = component[0];
    return edges.some((e) => e.from === n && e.to === n);
  });

  console.log(`Strongly connected components=${sccs.length}, cyclic components=${cyclicSccs.length}`);
  if (cyclicSccs.length === 0) {
    console.log("No explicit SCC cycle found; issue may be from overlapping constraints across grouped nodes.");
    return;
  }

  cyclicSccs
    .sort((a, b) => b.length - a.length)
    .forEach((component, index) => {
      const cset = new Set(component);
      const inComponentEdges = edges.filter((e) => cset.has(e.from) && cset.has(e.to));
      console.log(`\nSCC #${index + 1} size=${component.length}, internalEdges=${inComponentEdges.length}`);
      console.log("Nodes:");
      for (const id of component) {
        const rect = rectById.get(id);
        console.log(
          `  ${id} indeg=${inDeg.get(id) ?? 0} outdeg=${outDeg.get(id) ?? 0}` +
          (rect ? ` x=${rect.x.toFixed(2)} y=${rect.y.toFixed(2)}` : "")
        );
      }
      console.log("Internal edge breakdown:");
      console.log(`  kind=${JSON.stringify(countBy(inComponentEdges.map((e) => e.kind)))}`);
      console.log(`  source=${JSON.stringify(countBy(inComponentEdges.map((e) => e.source)))}`);
      console.log("Internal edges:");
      for (const line of edgeSummary(inComponentEdges, rectById)) {
        console.log(`  ${line}`);
      }
      const cycle = findCyclePath(component, inComponentEdges);
      if (cycle) {
        console.log(`Example cycle path (${cycle.length - 1} edges): ${cycle.join(" -> ")}`);
      } else {
        console.log("Example cycle path: <not found>");
      }
    });
}

function debugIdFactory() {
  let counter = 0;
  return () => `debugKey${(counter++).toString().padStart(3, '0')}`;
}

test("debug ferris bridging", () => {
  const generateId = debugIdFactory();

  const ferrisLayout = layouts["Popular Layouts"]
    .find(layout => layout.name === "Ferris");
  if (!ferrisLayout) {
    throw new Error("Debug test requires 'Ferris' layout in layouts['Popular Layouts'].");
  }

  const ferrisLayoutKeys = ferrisLayout.keys
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
  const rectById = new Map(rects.map((r) => [r.id, r]));

  const neighborOutput = findNeighbors({
    objects: rects,
    threshold: 0.8,
  });

  const bridging = bridgeSets(neighborOutput, rects);
  console.log("=== Bridging edges ===");
  console.log("Horizontal:", bridging.horizontal.map(([a,b]) => {
    const ar = rectById.get(a)!;
    const br = rectById.get(b)!;
    return `${a}(x=${ar.x.toFixed(2)},y=${ar.y.toFixed(2)}) -> ${b}(x=${br.x.toFixed(2)},y=${br.y.toFixed(2)})`;
  }));
  console.log("Vertical:", bridging.vertical.map(([a,b]) => {
    const ar = rectById.get(a)!;
    const br = rectById.get(b)!;
    return `${a}(x=${ar.x.toFixed(2)},y=${ar.y.toFixed(2)}) -> ${b}(x=${br.x.toFixed(2)},y=${br.y.toFixed(2)})`;
  }));

  // Now run layout
  const allH = [...neighborOutput.horizontal, ...bridging.horizontal];
  const allV = [...neighborOutput.vertical, ...bridging.vertical];
  const edgeObjects: Edge[] = [
    ...neighborOutput.horizontal.map(([from, to]) => ({ from, to, kind: "H" as const, source: "neighbor" as const })),
    ...neighborOutput.vertical.map(([from, to]) => ({ from, to, kind: "V" as const, source: "neighbor" as const })),
    ...bridging.horizontal.map(([from, to]) => ({ from, to, kind: "H" as const, source: "bridge" as const })),
    ...bridging.vertical.map(([from, to]) => ({ from, to, kind: "V" as const, source: "bridge" as const })),
  ];

  try {
    const result = layout({
      nodes: neighborOutput.nodes,
      horizontal: allH,
      vertical: allV,
    });

    console.log("\n=== Layout result ===");
    for (const r of rects) {
      const pos = result.positions.get(r.id);
      if (!pos) {
        console.log(`  ${r.id}(x=${r.x.toFixed(2)},y=${r.y.toFixed(2)}): <missing position>`);
        continue;
      }
      console.log(`  ${r.id}(x=${r.x.toFixed(2)},y=${r.y.toFixed(2)}): row=${pos.row}, col=${pos.col}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`\nLayout failed: ${message}`);
    printCycleDiagnostics(neighborOutput.nodes, edgeObjects, rectById);
    throw error;
  }
});
