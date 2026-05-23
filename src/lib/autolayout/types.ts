/**
 * Unique string identifier for a positioned object.
 * Used as the node key throughout the neighbor-detection ({@link findNeighbors}),
 * bridging ({@link bridgeSets}), and grid-layout ({@link layout}) pipelines.
 */
export type ObjId = string;

/**
 * A directed relationship between two objects, expressed as `[u, v]`.
 *
 * The meaning depends on the list it belongs to:
 * - In {@link LayoutInput.horizontal}: `u` must be placed in a **strictly smaller
 *   column** than `v` (i.e. `u` is to the left of `v`).
 * - In {@link LayoutInput.vertical}: `u` must be placed in a **strictly smaller
 *   row** than `v` (i.e. `u` is above `v`).
 *
 * Produced by {@link findNeighbors} and optionally extended by {@link bridgeSets}.
 */
export type Relation = [ObjId, ObjId];

/**
 * A positioned, optionally-rotated rectangle in screen coordinates.
 *
 * Used as input to {@link findNeighbors} to describe each object's physical
 * location and orientation. All coordinates reference the **center** of the
 * rectangle, not the top-left corner.
 *
 * Screen coordinate system: the x-axis points right and the y-axis points
 * downward (standard 2-D screen/canvas space).
 */
export interface Rect {
  /** Unique identifier. Must be unique across all objects in a single call. */
  id: ObjId;
  /** X coordinate of the rectangle's center in screen space. */
  x: number;
  /** Y coordinate of the rectangle's center in screen space. */
  y: number;
  /**
   * Width of the rectangle before rotation, in the same virtual unit as `x`
   * and `y`. Must be greater than 0.
   */
  width: number;
  /**
   * Height of the rectangle before rotation, in the same virtual unit as `x`
   * and `y`. Must be greater than 0.
   */
  height: number;
  /**
   * Clockwise rotation in **degrees** applied around the rectangle's own center.
   * Follows the CSS `rotate()` direction. `0` means the rectangle is axis-aligned.
   * The neighbor-detection zones rotate with the object, so adjacency is always
   * relative to the object's local up / down / left / right axes.
   */
  degree: number;
}

/**
 * Input for {@link findNeighbors}.
 */
export interface NeighborInput {
  /**
   * The set of rectangles to analyze. Each `id` must be unique within this
   * array. An empty array is valid and produces an empty {@link NeighborOutput}.
   */
  objects: Rect[];
  /**
   * Detection range, in the same virtual unit as {@link Rect.x} / {@link Rect.y}.
   *
   * A detection zone of this thickness is placed flush against each of an
   * object's four sides. Any other object whose body overlaps a zone (with
   * positive area — boundary contact is excluded) becomes a neighbor candidate
   * in that direction. Must be greater than 0.
   */
  threshold: number;
}

/**
 * Vertical placement preference for a node that has multiple valid row
 * positions after fan-in/fan-out splitting.
 *
 * - `'top'` — prefer the lower-median row (visually higher on screen, smaller `row` index).
 * - `'bottom'` — prefer the upper-median row (visually lower on screen, larger `row` index).
 *
 * @see {@link EntityLayoutPreferenceCallback}
 */
export type LayoutVerticalPreference = 'top' | 'bottom';

/**
 * Horizontal placement preference for a node that has multiple valid column
 * positions after fan-in/fan-out splitting.
 *
 * - `'left'` — prefer the lower-median column (visually further left, smaller `col` index).
 * - `'right'` — prefer the upper-median column (visually further right, larger `col` index).
 *
 * @see {@link EntityLayoutPreferenceCallback}
 */
export type LayoutHorizontalPreference = 'left' | 'right';

/**
 * A callback that lets callers express a per-node placement preference for
 * nodes that have been split into multiple clone positions.
 *
 * Fan-in / fan-out nodes can legitimately occupy a range of rows and columns.
 * This callback gives the caller control over which position is chosen when
 * collapsing those clones back to a single grid cell.
 *
 * Return `null` to accept the default `['top', 'left']` preference.
 *
 * @param node - The id of the node being placed.
 * @returns A `[vertical, horizontal]` preference tuple, or `null` for the default.
 */
export type EntityLayoutPreferenceCallback = (node: ObjId)
  => readonly [LayoutVerticalPreference, LayoutHorizontalPreference] | null;

/**
 * Input for {@link layout}.
 *
 * Together, `horizontal` and `vertical` form a directed constraint graph over
 * `nodes`. The algorithm assigns each node a unique `(row, col)` cell such
 * that every constraint is satisfied:
 * - `[u, v]` in `horizontal` → `col(u) < col(v)`
 * - `[u, v]` in `vertical`   → `row(u) < row(v)`
 *
 * A cycle in either constraint graph causes {@link layout} to throw. The graph
 * must form a single connected component; pass the output of {@link bridgeSets}
 * to handle cases where objects are spatially isolated.
 */
export interface LayoutInput {
  /**
   * All nodes to be placed. Any node that appears only in `horizontal` or
   * `vertical` but not in this list is still placed — the union of `nodes` and
   * all edge endpoints is used internally.
   */
  nodes: ObjId[];
  /**
   * Horizontal ordering constraints. Each `[left, right]` pair requires
   * `col(left) < col(right)` in the output.
   */
  horizontal: Relation[];  // [left, right]
  /**
   * Vertical ordering constraints. Each `[top, bottom]` pair requires
   * `row(top) < row(bottom)` in the output.
   */
  vertical: Relation[];    // [top, bottom]
  /**
   * Optional per-node placement preference. When a node occupies multiple
   * clone positions due to fan-in/fan-out splitting, this callback decides
   * which position is selected as the final grid cell.
   * Pass `null` or omit to use the default `['top', 'left']`.
   *
   * @see {@link EntityLayoutPreferenceCallback}
   */
  layoutPreference?: EntityLayoutPreferenceCallback;
}

/**
 * Result returned by {@link layout} and {@link gridfit}.
 *
 * The `grid` and `positions` views are consistent: for every placed node,
 * `grid[row][col] === id` and `positions.get(id)` returns `{ row, col }`.
 * Empty cells in `grid` are `null`. Row and column indices start at 0, with
 * `(0, 0)` at the top-left.
 */
export interface LayoutOutput {
  /**
   * 2-D array of placed node ids. Rows may differ in length (ragged array)
   * — trailing `null` padding is not added past the last occupied cell.
   * Empty (unoccupied) cells within a row are `null`.
   */
  grid: (ObjId | null)[][];
  /**
   * Map from each node id to its `(row, col)` position in {@link grid}.
   * Every node in the input is guaranteed to have exactly one entry.
   */
  positions: Map<ObjId, { row: number; col: number }>;
}

/**
 * Output of {@link findNeighbors}, structured as a {@link LayoutInput}-compatible object.
 *
 * - `nodes`: ids of all input rectangles, in the same order as the input array.
 * - `horizontal`: bidirectionally confirmed left-right pairs `[left, right]`, where
 *   each object's body overlaps the other object's left/right detection zone.
 * - `vertical`: bidirectionally confirmed top-bottom pairs `[top, bottom]`, where
 *   each object's body overlaps the other object's up/down detection zone.
 *
 * Can be passed directly to {@link layout}, or first extended by {@link bridgeSets}
 * when disconnected components need to be joined into a single graph.
 */
export type NeighborOutput = LayoutInput;

/**
 * Top-level input for {@link gridfit}.
 * Combines neighbor-detection parameters with an optional layout preference.
 */
export interface GridFitInput {
  /** The set of objects to arrange. */
  objects: Rect[];
  /**
   * Detection threshold used by {@link findNeighbors} to determine adjacency.
   * A larger value widens the detection zone around each object.
   */
  threshold: number;
  /** Optional per-node placement preference forwarded to the grid layout step. */
  layoutPreference?: EntityLayoutPreferenceCallback;
}
