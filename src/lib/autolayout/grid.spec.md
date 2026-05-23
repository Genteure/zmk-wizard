# Algorithm Specification: Object Grid Layout

## 1. Coordinate System

- The grid uses **row** and **col** indices to locate cells: `grid[row][col]`, in screen coordinates.
- The origin `(row=0, col=0)` is at the **top-left corner**.
- `row` corresponds to the **vertical direction (y-axis)**: positive downward; a larger `row` means further down.
- `col` corresponds to the **horizontal direction (x-axis)**: positive rightward; a larger `col` means further right.

## 2. Data Types

```typescript
type ObjId = string;
type Relation = [ObjId, ObjId];   // [from, to]
type Grid = (ObjId | undefined)[][];
```

## 3. Input

```typescript
interface LayoutInput {
  objects: ObjId[];          // All objects to place, no duplicates
  horizontal: Relation[];    // Horizontal relations u -> v (controls left/right position)
  vertical: Relation[];      // Vertical relations u -> v (controls top/bottom position)
}
```

- `objects` is the list of all object IDs to process; may be an empty array `[]`.
- Each tuple `[u, v]` in `horizontal` or `vertical` is a directed edge; `u` and `v` must belong to `objects`.
- The same pair `(u, v)` may appear in both `horizontal` and `vertical`.

## 4. Output

```typescript
declare function layout(input: LayoutInput): Grid[];
```

- Returns an array of `Grid` values. Each `Grid` is an independent 2-D grid.
- If `objects` is empty, returns an empty array `[]`.

## 5. Connected Components and Grid Assignment

Build an undirected graph `G` with `objects` as vertices and all edges from `horizontal` and `vertical` treated as undirected.

- **Each connected component** of `G` corresponds to one `Grid` in the output array.
- An isolated object (no relations at all) forms a single-node component and produces a `1×1` `Grid`.
- The order of `Grid` entries in the output array is not specified.

## 6. Cycle Detection and Error Handling

Define two directed graphs:

- `H`: vertex set = `objects`, edge set = `horizontal`.
- `V`: vertex set = `objects`, edge set = `vertical`.

Before laying out, both `H` and `V` must be checked for **directed cycles**.
If either graph contains a cycle, the algorithm **immediately throws an error** and returns no `Grid`.

## 7. Layout Constraints for a Single Grid

For a `Grid` whose connected component has object set `C ⊆ objects`:
let `pos(id) = [row, col]` be the coordinate of object `id` in the grid
(`row` is the row index, `col` is the column index, both starting from 0).

The following conditions must hold:

1. **Completeness**
   Every object in `C` appears **exactly once** in the `Grid`; all other cells are `undefined`.

2. **No empty rows or columns**
   - Every row contains at least one non-`undefined` object.
   - Every column contains at least one non-`undefined` object.
   (Entirely `undefined` rows or columns are forbidden.)

3. **Horizontal relations**
   For each `[u, v] ∈ horizontal` with `u, v ∈ C`:
   **`col(v) > col(u)`** must hold.
   (`v` has a strictly greater column index than `u`, meaning `v` is to the **right** of `u`;
   non-adjacent columns are allowed.)

4. **Vertical relations**
   For each `[u, v] ∈ vertical` with `u, v ∈ C`:
   **`row(v) > row(u)`** must hold.
   (`v` has a strictly greater row index than `u`, meaning `v` is **below** `u`;
   non-adjacent rows are allowed.)

5. **Unique coordinates**
   For any `u, v ∈ C` with `u ≠ v`: `pos(u) ≠ pos(v)`.

