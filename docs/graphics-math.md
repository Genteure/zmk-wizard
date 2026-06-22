# Math reference for geometric transformations of keys

## Representation of keys

See `src/types/keyboard.ts` for the full definition of the `Key` type.

`col` and `row` are not considered in this discussion, they *are* used in keymap layout/matrix generation. We are only concerned with the geometric properties of keys on the (physical layout) canvas, which are defined by `x`, `y`, `w`, `h`, `r`, `rx`, and `ry`.

Units are all in "key units" (U). In real life, 1U is usually around 19.05mm. For the purposes of this discussion, 1U is just an abstract unit of measurement.

We use screen coordinates (same as SVG/HTML/CSS), so the origin (0,0) is at the top-left corner of the screen, `x` increases to the right, and `y` increases downward. Rotation is in degrees, and positive rotation is clockwise.

**Important:** Trigonometric functions in standard math libraries expect radians. Always convert degrees to radians before using `sin()`, `cos()`, etc.

**Important:** Because the y-axis points downward in screen coordinates, the clockwise rotation matrix is:

```latex
x' = x·cos(θ) − y·sin(θ)
y' = x·sin(θ) + y·cos(θ)
```

This is the **standard 2D rotation matrix** (counterclockwise in a y-up math coordinate system, but clockwise in our y-down screen coordinate system). Every formula in this document uses this matrix for forward rotation, and its inverse (negate the angle, or equivalently transpose the matrix) for undoing a rotation:

```latex
x' = x·cos(θ) + y·sin(θ)      ← inverse (counterclockwise in screen space)
y' = −x·sin(θ) + y·cos(θ)
```

`x`, `y` are the top-left corner of the key, in U. This is very important to note, as it is not the centre of the key.

`w`, `h` are the width and height of the key, in U. 1U is the most common size, but keys can be larger (e.g. a 2U spacebar would have `w: 2`, numpad enter is usually 1U wide and 2U tall, so `w: 1, h: 2`). Users can set arbitrary sizes for keys, so we should not assume any particular values.

`r` is the rotation of the key, in degrees. 0deg is the default upright orientation. We use screen coordinates, so positive rotation is clockwise, and negative rotation is counterclockwise.

`rx`, `ry` are the rotation origin, in U. This is the point around which the key rotates. If a value is `0`, `rx` falls back to `x`, and `ry` falls back to `y`. This fallback is applied **per coordinate** and must be resolved before any calculation that uses `rx` or `ry`. When `rx=0`, `ry=0`, we are not rotating around the canvas origin `(0,0)`, but around the top-left corner of the key.

The position of the key is: 1. place the key at `x`, `y` without rotation, 2. then rotate the key by `r` degrees around the point `rx`, `ry`. This means that the final position of the key after rotation is not just a simple function of `x`, `y`, and `r`, but also depends on the rotation origin `rx`, `ry`.

## Common position calculations

For the same final position of the key, there are infinitely many combinations of `x`, `y`, `r`, `rx`, and `ry` that can achieve it.

### Convert canonical representation to key-centered representation

#### Without rotation

To calculate the centre of the key (cx, cy) from the top-left corner (x, y) and size (w, h):

```latex
cx = x + w/2
cy = y + h/2
```

Reverse calculation to get top-left corner from centre:

```latex
x = cx - w/2
y = cy - h/2
```

#### With rotation

**Before applying the formulas below, always apply the fallback for `rx` and `ry`:**
if `rx == 0` then `rx = x`
if `ry == 0` then `ry = y`

To calculate the centre of the key (cx, cy) from the top-left corner (x, y), size (w, h), rotation (r), and rotation origin (rx, ry):

1. First, calculate the centre of the key without rotation
2. Then, calculate the offset from the rotation origin to the centre
3. Finally, rotate the offset by r degrees (clockwise) and add it back to the rotation origin to get the final centre position

```latex
cx = x + w/2
cy = y + h/2
offsetX = cx - rx
offsetY = cy - ry
rotatedOffsetX = offsetX * cos(r) - offsetY * sin(r)
rotatedOffsetY = offsetX * sin(r) + offsetY * cos(r)
finalCx = rx + rotatedOffsetX
finalCy = ry + rotatedOffsetY
```

Reverse calculation to get top-left corner from centre:

**Again, resolve the fallback for `rx` and `ry` first (use the same resolved values from the forward calculation above).**

```latex
offsetX = finalCx - rx
offsetY = finalCy - ry
unrotatedOffsetX = offsetX * cos(-r) - offsetY * sin(-r)
unrotatedOffsetY = offsetX * sin(-r) + offsetY * cos(-r)
cx = rx + unrotatedOffsetX
cy = ry + unrotatedOffsetY
x = cx - w/2
y = cy - h/2
```

### Move key by dx, dy

#### Without rotation

Since the key is not rotated, we can simply add dx to x and dy to y. When `r` is 0, `rx` and `ry` do not affect the position of the key, so we can ignore them.

```latex
x = x + dx
y = y + dy
```

#### With rotation

When the key is rotated, we need to take into account the rotation when moving the key. We can move both the key's position and its rotation origin by the same amount to achieve the desired movement.

```latex
x = x + dx
y = y + dy
rx = rx + dx   (only if rx != 0; if rx == 0 leave it as 0)
ry = ry + dy   (only if ry != 0; if ry == 0 leave it as 0)
```

Important: Because `rx` and `ry` fall back to `x` and `y` when they are `0`, we must treat them per coordinate. If `rx` is `0`, adding `dx` would break the "same as top-left corner" semantics. Similarly, if `ry` is `0`, adding `dy` would break it. So we only add the deltas when the origin coordinate is not zero. (If both are non‑zero, we add `dx` and `dy` as shown.)

### Transform rotation origin

There are infinitely many combinations of `(x, y, rx, ry)` that represent the
same visual key position and rotation. Two common operations are:

1. **Moving the rotation origin to an arbitrary point** (explicit `rx, ry`).
2. **Normalizing** the rotation origin to `0`, meaning "rotate around the
   key's own top‑left corner".

In both cases, the key's final (on‑screen) position and orientation must remain
unchanged.

**Remember:** degrees must be converted to radians before calling `sin()` / `cos()`.
**Also:** before any calculation, apply the per‑coordinate fallback for `rx`
and `ry`: `effective_rx = (rx == 0) ? x : rx`, `effective_ry = (ry == 0) ? y : ry`.

#### Change rotation origin to an arbitrary point

Given a key with current `(x, y, w, h, r, rx, ry)` and a desired new rotation
origin `(new_rx, new_ry)` – where both are non‑zero (explicit coordinates) –
calculate the new `(x, y)` that keeps the key's final appearance unchanged.

**Steps:**

1. Compute the current effective rotation origin.
2. Compute the current final centre of the key **after rotation** using the
   standard clockwise formula (screen coordinates).
3. Using the same final centre and the new rotation origin, invert the rotation
   to find the required unrotated centre, then calculate the new top‑left corner.
4. Update `x`, `y`, `rx`, `ry`.

**Pseudocode (new_rx ≠ 0, new_ry ≠ 0):**

```js
// Apply fallback to current rx, ry
ox = (rx == 0) ? x : rx
oy = (ry == 0) ? y : ry

// Current unrotated centre
cx0 = x + w/2
cy0 = y + h/2

// Current final centre after rotation about (ox, oy)
// Clockwise in screen coordinates: [cos, -sin; sin, cos]
fx = ox + (cx0 - ox)*cos(r) - (cy0 - oy)*sin(r)
fy = oy + (cx0 - ox)*sin(r) + (cy0 - oy)*cos(r)

// Invert rotation to get unrotated centre relative to new origin
// Inverse (counterclockwise in screen space): [cos, sin; -sin, cos]
dx = (fx - new_rx)*cos(r) + (fy - new_ry)*sin(r)
dy = -(fx - new_rx)*sin(r) + (fy - new_ry)*cos(r)

new_cx0 = new_rx + dx
new_cy0 = new_ry + dy

// Update x, y (top‑left) and the rotation origin fields
x = new_cx0 - w/2
y = new_cy0 - h/2
rx = new_rx
ry = new_ry
```

**Note:** Normalization below handles the `(0,0)` case (both `rx` and `ry` set to 0).
A mixed origin with one zero and one non-zero coordinate (e.g. `new_rx=0, new_ry≠0`)
is not covered here; due to the fallback rule it would require solving a circular
equation (the zero coordinate becomes the new `x` or `y`, which is itself being solved for).

#### Normalize rotation origin to (0, 0)

Normalizing means making `rx = 0, ry = 0` while keeping the key's final position
and orientation unchanged. After normalization, the key rotates around its own
top‑left corner (the fallback makes `rx` effectively equal to `x`, `ry` to `y`).

**Steps:**

1. Apply the fallback to get the current effective origin.
2. Compute the current final centre (same as above).
3. Solve for the new top‑left `(x', y')` such that when the key rotates about
   itself by `r`, the final centre matches the original one.
4. Set `rx = 0`, `ry = 0`.

**Pseudocode:**

```js
// Apply fallback
ox = (rx == 0) ? x : rx
oy = (ry == 0) ? y : ry

// If already normalized (effective origin = top-left), nothing to do
if (ox == x and oy == y) {
  // rx and ry might already be 0, but ensure they are
  rx = 0
  ry = 0
  return
}

// Current unrotated centre
cx0 = x + w/2
cy0 = y + h/2

// Current final centre after rotation (clockwise in screen coordinates)
fx = ox + (cx0 - ox)*cos(r) - (cy0 - oy)*sin(r)
fy = oy + (cx0 - ox)*sin(r) + (cy0 - oy)*cos(r)

// New top‑left: rotation about itself, so origin = (x', y')
// Forward formula: fx = x' + (w/2)*cos(r) - (h/2)*sin(r)
//                  fy = y' + (w/2)*sin(r) + (h/2)*cos(r)
// Solve for x' and y':
x = fx - (w/2)*cos(r) + (h/2)*sin(r)
y = fy - (w/2)*sin(r) - (h/2)*cos(r)

rx = 0
ry = 0
```

### Rotate keys around a point

Given a key (or array of keys) and a pivot point `P = (px, py)` in world
coordinates, along with a delta angle `Δr` (in degrees, positive clockwise),
this operation rotates the entire key as a rigid body around `P` by `Δr`.

The key's shape, size, and internal geometry remain unchanged. Its rotation
angle increases by `Δr`, and both its final position and its effective rotation
origin are rotated around the pivot.

**Input:**

- One or more key objects (each with `x, y, w, h, r, rx, ry`)
- Pivot point `(px, py)` in key units
- Delta angle `Δr` in degrees (clockwise = positive)

**Steps for one key:**

1. **Resolve fallback** for the current rotation origin:
   `ox = (rx == 0) ? x : rx`
   `oy = (ry == 0) ? y : ry`

2. **Compute current final centre `C`** (clockwise rotation in screen coordinates):
   `cx0 = x + w/2`
   `cy0 = y + h/2`
   `Cx = ox + (cx0 - ox)*cos(r) - (cy0 - oy)*sin(r)`
   `Cy = oy + (cx0 - ox)*sin(r) + (cy0 - oy)*cos(r)`

3. **Rotate `C` and the effective origin `O = (ox, oy)` around `P` by `Δr`** (clockwise):
   `Cx' = px + (Cx - px)*cos(Δr) - (Cy - py)*sin(Δr)`
   `Cy' = py + (Cx - px)*sin(Δr) + (Cy - py)*cos(Δr)`

   `Ox' = px + (ox - px)*cos(Δr) - (oy - py)*sin(Δr)`
   `Oy' = py + (ox - px)*sin(Δr) + (oy - py)*cos(Δr)`

4. **New key rotation:**
   `r' = (r + Δr) mod 360`   (or keep as raw degrees, depending on implementation; see note below about negative angles)

5. **Set explicit new rotation origin** (no longer zero):
   `rx' = Ox'`
   `ry' = Oy'`

6. **Solve for new top‑left `(x', y')`** that places the key correctly with
   the new centre and origin. Let `u, v` be the unrotated centre relative to
   the new origin:
   `A = Cx' - Ox'`
   `B = Cy' - Oy'`
   `u = A*cos(r') + B*sin(r')`
   `v = -A*sin(r') + B*cos(r')`
   (This is the counterclockwise rotation by `r'`, which is the inverse of the clockwise rotation.)
   Then:
   `cx0' = Ox' + u`
   `cy0' = Oy' + v`
   `x' = cx0' - w/2`
   `y' = cy0' - h/2`

7. **Update the key:**
   `x = x'`
   `y = y'`
   `r = r'`
   `rx = rx'`
   `ry = ry'`

**Pseudocode (with explicit trig, assuming degrees → radians conversion):**

```js
function rotateKeyAroundPoint(key, px, py, delta) {
    // Convert degrees to radians
    r_rad = radians(key.r)
    d_rad = radians(delta)

    // 1. Fallback
    ox = (key.rx == 0) ? key.x : key.rx
    oy = (key.ry == 0) ? key.y : key.ry

    // 2. Current final centre (clockwise in screen coordinates)
    cx0 = key.x + key.w/2
    cy0 = key.y + key.h/2
    Cx = ox + (cx0 - ox)*cos(r_rad) - (cy0 - oy)*sin(r_rad)
    Cy = oy + (cx0 - ox)*sin(r_rad) + (cy0 - oy)*cos(r_rad)

    // 3. Rotate centre and effective origin around pivot (clockwise)
    Cx2 = px + (Cx - px)*cos(d_rad) - (Cy - py)*sin(d_rad)
    Cy2 = py + (Cx - px)*sin(d_rad) + (Cy - py)*cos(d_rad)

    Ox2 = px + (ox - px)*cos(d_rad) - (oy - py)*sin(d_rad)
    Oy2 = py + (ox - px)*sin(d_rad) + (oy - py)*cos(d_rad)

    // 4. New rotation — normalize to [0, 360)
    // Use ((r + delta) % 360 + 360) % 360 to handle negative angles correctly
    key.r = ((key.r + delta) % 360 + 360) % 360

    // 5. New explicit origin
    key.rx = Ox2
    key.ry = Oy2

    // 6. New top-left (inverse of clockwise = counterclockwise)
    r2_rad = radians(key.r)
    A = Cx2 - Ox2
    B = Cy2 - Oy2
    u = A*cos(r2_rad) + B*sin(r2_rad)
    v = -A*sin(r2_rad) + B*cos(r2_rad)
    new_cx0 = Ox2 + u
    new_cy0 = Oy2 + v
    key.x = new_cx0 - key.w/2
    key.y = new_cy0 - key.h/2
}
```

**Batch operation:**
To rotate multiple keys around the same pivot by the same delta, apply the
function above to each key individually. The keys maintain their relative
positions and orientations with respect to each other, behaving as a single
rigid group.

**Edge cases:**

- `Δr = 0` → the key is not modified.
- If the original `rx` and `ry` were both zero, after the operation they will
  become explicit non‑zero coordinates (except when `Δr = 0`). This is expected
  because the effective rotation origin moves away from the key's top‑left when
  the key is rotated around an external pivot.
