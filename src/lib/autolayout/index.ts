/**
 * gridfit2 — 2-D grid layout from positioned, optionally-rotated rectangles.
 *
 * ### Typical usage
 *
 * ```ts
 * import { gridfit } from 'gridfit2';
 *
 * const result = gridfit({
 *   objects: [
 *     { id: 'A', x: 0,   y: 0, width: 100, height: 100, degree: 0 },
 *     { id: 'B', x: 120, y: 0, width: 100, height: 100, degree: 0 },
 *   ],
 *   threshold: 20,
 * });
 *
 * // result.grid[0]  → ['A', 'B']
 * // result.positions.get('A')  → { row: 0, col: 0 }
 * // result.positions.get('B')  → { row: 0, col: 1 }
 * ```
 *
 * ### Module exports
 *
 * | Symbol | Description |
 * |--------|-------------|
 * | {@link gridfit} | Full pipeline (neighbor detection + bridging + layout). |
 * | {@link findNeighbors} | Detect pairwise adjacency from rotated rectangles. |
 * | {@link layout} | Grid layout from explicit directional constraints. |
 * | {@link groupSets} | Assign connected-component ids to nodes. |
 * | {@link connectSets} | Find the MST edges that span disconnected components. |
 * | {@link bridgeSets} | Synthesize bridging relations for disconnected components. |
 * | {@link GridFitInput} | Input type for {@link gridfit}. |
 * | {@link LayoutInput} | Input type for {@link layout}. |
 * | {@link LayoutOutput} | Output type for {@link layout} and {@link gridfit}. |
 * | {@link Rect} | Positioned rectangle type used as input to {@link findNeighbors}. |
 * | {@link Relation} | Directed pair `[from, to]` expressing an ordering constraint. |
 */
export * from './bridging';
export * from './grid';
export * from './gridfit';
export * from './neighbor';
export * from './types';
