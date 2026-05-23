# Algorithm Specification: Neighbor Discovery

## 1. Coordinate System and Object Representation

- **Screen coordinate system**: origin at the top-left, x-axis points right (positive), y-axis points down (positive).
- **Rectangle objects**: each object `A` is defined by:
  - `id: ObjId` — unique identifier
  - `x: number` — x coordinate of the center point in screen space
  - `y: number` — y coordinate of the center point in screen space
  - `width: number` — rectangle width (> 0)
  - `height: number` — rectangle height (> 0)
  - `degree: number` — clockwise rotation angle around the object's own center, in degrees, consistent with the CSS `rotate` direction.

**Geometric interpretation:**
The closed region \( R_A \) occupied by an object on the plane is obtained by taking an axis-aligned rectangle \( [-\tfrac{w}{2},\tfrac{w}{2}] \times [-\tfrac{h}{2},\tfrac{h}{2}] \) centered at the origin, rotating it clockwise by `degree`, then translating it to screen coordinates `(x, y)`.

The object's own **local coordinate system** has its origin at the center, the x′-axis pointing along the width direction (right), and the y′-axis pointing along the height direction (down), both rotating with the object.

All numeric values including threshold, x, y, width, and height share the same virtual unit (not pixels); the algorithm does not perform actual pixel conversions.

## 2. Data Types

```typescript
type ObjId = string;
type Relation = [ObjId, ObjId];   // [from, to]

interface Rect {
  id: ObjId;
  x: number;
  y: number;
  width: number;
  height: number;
  degree: number; // clockwise angle in degrees
}

interface NeighborInput {
  objects: Rect[];    // no duplicate ids
  threshold: number;  // neighbor detection threshold, > 0
}

interface LayoutInput {
  objects: ObjId[];       // ids of all objects to place
  horizontal: Relation[]; // horizontal relations u -> v (u is left of v)
  vertical: Relation[];   // vertical relations u -> v (u is above v)
}

type NeighborOutput = LayoutInput;
```

## 3. Neighbor Zone Definition (Rotates with the Object)

For any object A, define four **neighbor zones**, each a rectangle with the same rotation angle as A, adjacent to the corresponding side of A.

### 3.1 Neighbor Zones in Local Coordinates

In A's local coordinate system (origin at center; x′ points right, y′ points down when unrotated):

- **Up zone** \( N_{up}(A) \)
  Size: width = `A.width`, height = `threshold`
  Local center: `(0, -A.height/2 - threshold/2)`

- **Down zone** \( N_{down}(A) \)
  Size: width = `A.width`, height = `threshold`
  Local center: `(0, A.height/2 + threshold/2)`

- **Left zone** \( N_{left}(A) \)
  Size: width = `threshold`, height = `A.height`
  Local center: `(-A.width/2 - threshold/2, 0)`

- **Right zone** \( N_{right}(A) \)
  Size: width = `threshold`, height = `A.height`
  Local center: `(A.width/2 + threshold/2, 0)`

### 3.2 Neighbor Zones in Screen Coordinates

Rotate each local rectangle above clockwise by `A.degree` around A's center, then translate to A's screen coordinate `(A.x, A.y)`. This yields the screen-space neighbor zone \( N_{dir}(A) \): a rotated rectangle with the same angle as A, flush against the corresponding outer side of A.

## 4. One-Way Neighbors and Overlap Criterion

For two distinct objects A and B (A ≠ B):

- **B is A's up one-way neighbor** ⇔ the region \( R_B \) and A's up zone \( N_{up}(A) \) have **intersection area > 0**.
- **B is A's down one-way neighbor** ⇔ \( R_B \cap N_{down}(A) \) has area > 0.
- **B is A's left one-way neighbor** ⇔ \( R_B \cap N_{left}(A) \) has area > 0.
- **B is A's right one-way neighbor** ⇔ \( R_B \cap N_{right}(A) \) has area > 0.

**Overlap criterion**: the intersection of two closed sets must have positive area (2-D Lebesgue measure > 0). Boundary-only contact (intersection is a line segment or point) **does not count** as a neighbor. An epsilon guard is applied in the implementation to prevent floating-point errors from causing false positives at boundaries.

## 5. Output Relations (Bidirectional Neighbors)

For any two distinct objects u and v:

- **Horizontal relation**:
  If **u is v's left one-way neighbor** AND **v is u's right one-way neighbor**, a horizontal relation `u -> v` is produced, meaning "u should be placed to the left of v".

- **Vertical relation**:
  If **u is v's up one-way neighbor** AND **v is u's down one-way neighbor**, a vertical relation `u -> v` is produced, meaning "u should be placed above v".

Relations are not transitively derived; only pairs that directly satisfy the bidirectional condition are output. A pair of objects may have both a horizontal and a vertical relation simultaneously.

## 6. Algorithm Function

```typescript
declare function findNeighbors(input: NeighborInput): NeighborOutput;
```

### Input Constraints

- `input.objects` contains no duplicate `id` values.
- `input.threshold` is a real number greater than 0.
- Each object's `width` and `height` are greater than 0.

### Output Specification

- `output.objects`: must contain the `id` of every object in `input.objects`.
- `output.horizontal`: contains all `[u, v]` pairs satisfying the horizontal bidirectional condition, no duplicates, and `u ≠ v`.
- `output.vertical`: contains all `[u, v]` pairs satisfying the vertical bidirectional condition, no duplicates, and `u ≠ v`.

