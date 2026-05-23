import type { GridFitInput, LayoutOutput } from './types';
import { findNeighbors } from './neighbor';
import { bridgeSets } from './bridging';
import { layout } from './grid';

/**
 * One-shot pipeline: neighbor detection → disconnected-component bridging → grid layout.
 *
 * This is the primary entry point for most use-cases. It composes the three
 * lower-level functions into a single call:
 *
 * 1. **{@link findNeighbors}** — for each rectangle, four detection zones
 *    (up / down / left / right) of thickness `threshold` are generated and
 *    tested against every other rectangle using OBB/SAT overlap. A pair is
 *    recorded as a neighbor only when *both* objects detect the other — this
 *    bidirectional confirmation prevents spurious long-range relations.
 *
 * 2. **{@link bridgeSets}** — {@link findNeighbors} may leave spatially
 *    isolated objects (or clusters) with no relations to the rest. The grid
 *    layout step requires a single connected graph, so this step computes
 *    the minimum spanning tree over the disconnected components and adds the
 *    minimum necessary bridging relations.
 *
 * 3. **{@link layout}** — assigns every object a unique `(row, col)` cell in
 *    a compact 2-D grid, with `col(u) < col(v)` for every horizontal relation
 *    and `row(u) < row(v)` for every vertical relation.
 *
 * @param input - All objects to arrange, the neighbor-detection threshold, and
 *   an optional per-node placement preference.
 * @returns A {@link LayoutOutput} containing:
 *   - `grid`: 2-D array of object ids (ragged rows, `null` for empty cells).
 *   - `positions`: `Map<id, { row, col }>` for every input object.
 *
 * @throws When the combined constraint graph (neighbor + bridging relations)
 *   contains a directed cycle in either the horizontal or vertical direction.
 *   In practice this should not occur for inputs produced by {@link findNeighbors},
 *   but can arise if manually constructed relations are passed via
 *   `layoutPreference` callbacks that indirectly create cycles.
 */
export function gridfit(input: GridFitInput): LayoutOutput {
  const neighborOutput = findNeighbors({
    objects: input.objects,
    threshold: input.threshold,
  });

  const bridging = bridgeSets(neighborOutput, input.objects);

  return layout({
    nodes: neighborOutput.nodes,
    horizontal: [...neighborOutput.horizontal, ...bridging.horizontal],
    vertical: [...neighborOutput.vertical, ...bridging.vertical],
    layoutPreference: input.layoutPreference,
  });
}
