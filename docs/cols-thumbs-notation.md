# Cols+Thumbs Notation Specification

## 1. Overview

The Cols+Thumbs notation is a compact string format for describing ortholinear keyboard layouts parametrically. A notation string describes one or more **sections** (keyboard halves or groups), each containing a **column part** (the main key grid) and optional **thumb rows** (keys below the main grid).

The specification defines two output layouts:

- A **physical layout** with decimal coordinates, representing actual key positions.
- A **keymap layout** with integer coordinates, suitable for firmware key assignment, guaranteed to have no key collisions.

## 2. Grammar

```ebnf
notation     := section ( SEP section )*
section      := chunk ( '+' chunk )*
chunk        := entry ( entry )*
entry        := digit modifier*
digit        := '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
modifier     := 'v' | 'V' | 'd' | 'D' | '^' | 'u' | 'U'
             | '>' | 'r' | 'R' | '<' | 'l' | 'L'
SEP          := ( ' ' | '_' )+
```

### Entry boundary rule

Entries within a chunk are delimited implicitly. Each `digit` character begins a new entry; all subsequent `modifier` characters attach to that entry until the next `digit` or end-of-chunk.

**Example:** Chunk `2v333` produces four entries: `(2,[v])`, `(3,[])`, `(3,[])`, `(3,[])`.

## 3. Lexical Rules

| Rule | Detail |
|------|--------|
| Digit range | `1`–`9` only. `0` is not valid. |
| Multi-digit entries | Not supported. `12` is parsed as two entries: `1` and `2`. |
| Modifier case | Case-insensitive: `v`≡`V`, `d`≡`D`, `u`≡`U`, `r`≡`R`, `l`≡`L`. |
| Separator collapse | Consecutive spaces, underscores, or mixes are equivalent to a single separator. |
| Valid characters | Digits `1`–`9`, modifiers listed in the grammar, `+`, space, `_`. Any other character is invalid. |

## 4. Parsing Pipeline

### 4.1 Tokenization

Split notation on `SEP` to produce a list of **sections**. For each section, split on `'+'` to produce a list of **chunks**.

**Reject if:**

- Any chunk is empty (leading `+`, trailing `+`, or consecutive `+`).
- Any chunk's first character is not a digit.

### 4.2 Entry Extraction

Scan each chunk left-to-right. Each digit begins a new entry `(key_count, modifiers)`. Subsequent modifier characters append to that entry's modifier list.

**Reject if** any character is neither a recognized digit nor a recognized modifier.

### 4.3 Structural Classification

For each section with chunks C₁ … Cₙ, let **multi** = the set of chunks containing **2 or more** entries.

| Condition | Type | Column Part | Left Thumbs | Right Thumbs |
|---|---|---|---|---|
| n = 1 | `columns_only` | C₁ | — | — |
| n ≥ 2, \|multi\| = 1 | `cols_and_thumbs` | Unique multi-entry chunk | Single-entry chunks **before** column part, in order | Single-entry chunks **after** column part, in order |
| n ≥ 2, \|multi\| = 0 | `thumbs_only` | — | All chunks, in order | — |
| \|multi\| ≥ 2 | **REJECT** | — | — | — |

A single entry between `+` delimiters is always classified as a thumb row. There is no syntax to express a single column with attached thumb rows within one section; use multiple sections instead.

### 4.4 Modifier Validation

After classification, validate each entry's modifiers against its role:

- **Column entries** (entries within the column part): accept only **vertical** modifiers (`v`/`V`/`d`/`D`/`^`/`u`/`U`). Any horizontal modifier (`>`/`r`/`R`/`<`/`l`/`L`) → **REJECT**.
- **Thumb entries** (entries within thumb chunks): accept only **horizontal** modifiers (`>`/`r`/`R`/`<`/`l`/`L`). Any vertical modifier → **REJECT**.

### 4.5 Modifier Accumulation

For each entry, compute the net shift from its validated modifiers:

```txt
Column entry:  shift_y = (count of v/V/d/D − count of ^/u/U) × 0.5
Thumb entry:   shift_x = (count of >/r/R   − count of </l/L)  × 0.5
```

Modifiers of opposing directions cancel. Order is irrelevant. Multiple same-direction modifiers accumulate. A net shift of zero is valid (e.g., from `v^`).

## 5. Physical Layout Generation

### 5.1 Coordinate System

All coordinates are decimal values in **key units** (U). 1U = center-to-center distance between adjacent keys. Origin (0,0) is top-left; x grows rightward, y grows downward. Keys are treated as 1U × 1U squares; a key at center (x, y) occupies the square [x − 0.5, x + 0.5] × [y − 0.5, y + 0.5].

### 5.2 Key Data Model

Each key is represented as a 4-tuple:

```txt
key = (base_x, base_y, offset_x, offset_y)
```

- **base** = structural position from column centering, column index, or thumb row placement
- **offset** = accumulated modifier shift (from §4.5)

**Physical position** = `(base_x + offset_x,  base_y + offset_y)`

### 5.3 Per-Section Column Placement

Given c columns with heights h[0…c−1] and vertical shifts s[0…c−1]:

```txt
max_h = max(h[0], …, h[c−1])

For each column i = 0 … c−1:
    For each row j = 0 … h[i]−1:
        emit key(
            base_x   = i,
            base_y   = (max_h − h[i]) / 2 + j,
            offset_x = 0,
            offset_y = s[i]
        )
```

If the section has no column part (`thumbs_only`), set `c = 0` and skip this step.

### 5.4 Per-Section Thumb Placement

Compute **section_bottom** — the lowest physical y-coordinate of any column key:

```txt
section_bottom = max over all column keys of (base_y + offset_y)
```

If no columns exist, `section_bottom = −1`.

Process left-aligned thumb rows first, then right-aligned, each in notation order. Thumb rows stack top-to-bottom below section_bottom:

```txt
thumb_y = section_bottom + 1

── Left-aligned thumb rows ──
For each left thumb row with count = k and shift = s:
    For p = 0 … k−1:
        emit key(base_x = p,  base_y = thumb_y,  offset_x = s,  offset_y = 0)
    thumb_y += 1

── Right-aligned thumb rows ──
For each right thumb row with count = k and shift = s:
    x_start = c − k
    For p = 0 … k−1:
        emit key(base_x = x_start + p,  base_y = thumb_y,  offset_x = s,  offset_y = 0)
    thumb_y += 1
```

If no columns exist (thumb-only section), all thumb rows use left-alignment with `base_x = p` regardless of notation order.

### 5.5 Per-Section Negative-Coordinate Normalization

After all keys in a section are placed, ensure no physical coordinate is negative:

```txt
min_x = min over all keys of (base_x + offset_x)
min_y = min over all keys of (base_y + offset_y)
dx    = max(0, −min_x)
dy    = max(0, −min_y)

For every key in section:
    base_x += dx
    base_y += dy
```

Record the section's extent for arrangement:

```txt
max_x_phys = max over all keys of (base_x + offset_x)    // post-normalization
```

### 5.6 Global Section Arrangement

Sections are arranged left-to-right, top-aligned (all share y = 0 after per-section normalization). A **1U edge-to-edge gap** separates adjacent sections.

```txt
section_offset[0] = 0

For i = 1, 2, …:
    section_offset[i] = section_offset[i−1] + max_x_phys[i−1] + 2
```

Apply to every key in section i:

```txt
For every key in section i:
    base_x += section_offset[i]
```

**Gap verification:** If section i−1's rightmost key center is at absolute x = R, its right edge is at R + 0.5. Section i's leftmost key center (at relative x = 0 after normalization) becomes absolute x = section_offset[i], with left edge at section_offset[i] − 0.5. Gap = (section_offset[i] − 0.5) − (R + 0.5) = section_offset[i] − R − 1 = (section_offset[i−1] + max_x_phys[i−1] + 2) − (section_offset[i−1] + max_x_phys[i−1]) − 1 = **1U**. ✓

## 6. Keymap Layout (Collision-Free Integer Coordinates)

### 6.1 Overview and Key Principle

The keymap layout assigns an integer (x, y) coordinate to every key, suitable for firmware key mapping. **No two physically distinct keys may share the same keymap coordinate.**

The keymap is derived from the same parsing as the physical layout but uses **original (pre-normalization) base values**. Normalization shifts (§5.5) affect only the physical layout; the keymap references the structural positions computed in §5.3 and §5.4 before any normalization.

### 6.2 Formula

Let `base_x_orig` and `base_y_orig` denote a key's base coordinates as computed in §5.3/§5.4, **before** the normalization shift of §5.5. Let `section_offset[i]` be the arrangement offset for the key's section (from §5.6).

```txt
Physical:  (base_x + offset_x,               base_y + offset_y)
           (includes normalization dx/dy and section_offset)

Keymap:    (round(base_x_orig + section_offset[i]) + trunc(offset_x),
            round(base_y_orig)                      + trunc(offset_y))
```

Where:

- **round** = `Math.round` — half-up rounding (0.5 → 1, 1.5 → 2, −0.5 → 0, −1.5 → −1)
- **trunc** = `Math.trunc` — truncate toward zero (0.7 → 0, −0.7 → 0, 1.3 → 1, −1.3 → −1)

**Design rationale:** Structural positions (base) receive standard rounding to map to the nearest integer grid cell. Modifier shifts (offset) are truncated so that a single 0.5U modifier produces 0 keymap displacement — the key stays in its structural grid cell. Two same-direction modifiers (1.0U) produce ±1 displacement, moving the key one cell. This preserves directional symmetry.

### 6.3 Non-Negative Normalization

After computing all keymap coordinates, apply a single global integer shift if any values are negative:

```txt
keymap_dx = max(0, −min over all keys of keymap_x)
keymap_dy = max(0, −min over all keys of keymap_y)

For every key:
    keymap_x += keymap_dx
    keymap_y += keymap_dy
```

This integer shift is uniform across all keys and preserves the collision-free property (adding the same constant to all coordinates cannot create collisions).

### 6.4 Collision-Free Guarantee

**Theorem.** For any valid notation, the keymap formula produces no two keys at the same (x, y) coordinate.

The proof considers each possible collision type.

#### Type A — Two keys in the same column

Keys in column i have identical `base_x_orig = i` and `offset_x = s[i]`, so `keymap_x` is identical. Their `base_y_orig` values are consecutive values differing by exactly 1.0: `(max_h − h[i])/2`, `(max_h − h[i])/2 + 1`, …, `(max_h − h[i])/2 + h[i] − 1`.

Using the identity `round(x + 1) = round(x) + 1` (provable from `round(x) = floor(x + 0.5)`):

```txt
keymap_y(row j+1) − keymap_y(row j) = round(base_y + 1) + trunc(o) − round(base_y) − trunc(o) = 1
```

All keymap_y values within a column differ by exactly 1. **No collision.** ✓

#### Type B — Two keys in the same thumb row

Keys in a thumb row share `base_y_orig` and `offset_y = 0`, so `keymap_y` is identical. Their `base_x_orig` values are consecutive integers differing by 1. Same identity applies: consecutive keymap_x values differ by exactly 1. **No collision.** ✓

#### Type C — A column key and a thumb key in the same section

This is the critical case. Let `s = section_bottom` (the maximum physical y among all column keys, computed from original bases and offsets). The first thumb row has `base_y_orig = s + 1`.

**Thumb keymap_y** = `round(s + 1)` = `round(s) + 1`.

**Column keymap_y** = `round(b) + trunc(o)` where `b + o ≤ s`.

We prove `round(b) + trunc(o) ≤ round(s)` for all possible offset types:

**Case 1 — Integer offset (o = n):**
`round(b) + n = round(b + n) ≤ round(s)`, since `b + n = b + o ≤ s` and round is non-decreasing. ✓

**Case 2 — Positive half-integer offset (o = n + 0.5, n ≥ 0):**
`round(b) + n = round(b + n)`. Since `b + n < b + o ≤ s`, and round is non-decreasing: `round(b + n) ≤ round(s)`. ✓

**Case 3a — Negative half-integer offset (o = −n − 0.5, n ≥ 0), b is integer:**
`round(b) − n = b − n`. From `b + o = b − n − 0.5 ≤ s`: `b − n ≤ s + 0.5`. Since `b − n` is an integer: `b − n ≤ round(s)`. ✓

**Case 3b — Negative half-integer offset (o = −n − 0.5, n ≥ 0), b is a half-integer (b = m + 0.5):**
`round(b) − n = m + 1 − n`. From `b + o ≤ s`: `m − n ≤ s`.

The maximum half-integer `b` for any column of height `h` centered in `max_h` space is `(max_h + h)/2 − 1`. For this to be half-integer, `h` must have the opposite parity from `max_h`, and the maximum is achieved at `h = max_h − 1`, giving `b_max_halfint = max_h − 1.5`, so `m ≤ max_h − 2`.

The section bottom satisfies `s ≥ max_h − 1` (the tallest column's bottom key, at integer base `max_h − 1` with offset ≥ 0). Therefore `round(s) ≥ max_h − 1`.

Substituting: `m + 1 − n ≤ (max_h − 2) + 1 − n = max_h − 1 − n ≤ max_h − 1 ≤ round(s)`. ✓

**In all cases:** column `keymap_y ≤ round(s) < round(s) + 1` = thumb `keymap_y`. **No collision.** ✓

Subsequent thumb rows have `base_y_orig = s + 1 + row_index`, which is strictly greater than the first thumb row, so their keymap_y is also strictly greater than all column keymap_y values. ✓

#### Type D — Two keys in different sections

Section arrangement (§5.6) guarantees a 1U edge-to-edge physical gap between adjacent sections. Since `round` and `trunc` are monotonic and each section's `section_offset` differs by at least `max_x_phys + 2 ≥ 2`, the minimum keymap_x gap between sections is:

```txt
round(0 + section_offset[i]) − round(c_prev + section_offset[i−1])
≥ round(max_x_phys[i−1] + 2) − round(max_x_phys[i−1])
≥ 2
```

No two keys from different sections share the same keymap_x. **No collision.** ✓

## 7. Worked Examples

### Example 1: `33333+3 2+333331`

**Section 1** `33333+3` — chunks: `33333` (5 entries), `3` (1 entry)

Classification: `cols_and_thumbs`. Column part = `33333` (h=[3,3,3,3,3]). Right thumb = `3` (3 keys). No modifiers.

| Component | Keys | Physical positions |
|-----------|------|--------------------|
| Columns | 15 | (0–4, 0–2) |
| Right thumb | 3 | (2–4, 3) |

section_bottom = 2. No normalization needed. max_x_phys = 4.

**Section 2** `2+333331` — chunks: `2` (1 entry), `333331` (6 entries)

Classification: `cols_and_thumbs`. Left thumb = `2` (2 keys). Column part = `333331` (h=[3,3,3,3,3,1]). No modifiers.

| Component | Keys | Physical positions |
|-----------|------|--------------------|
| Left thumb | 2 | (0–1, 3) |
| Columns | 16 | cols 0–4 at (0–4, 0–2); col 5 at (5, 1) |

section_bottom = 2. No normalization needed. max_x_phys = 5.

**Arrangement:** `section_offset[0] = 0`, `section_offset[1] = 0 + 4 + 2 = 6`.

**Physical layout:**

```txt
x x x x x       x x x x x
x x x x x       x x x x x x
x x x x x       x x x x x
    x x x       x x
```

**Keymap layout:** All offsets are zero and all base values are integers, so keymap = physical. Output identical. No collisions (verified: all 31 keys occupy distinct coordinates).

### Example 2: `2v333+2> 3+13332^ 33`

**Section 1** `2v333+2>` — column part `2v333` (h=[2,3,3,3], col 0 shift_y=+0.5), right thumb `2>` (2 keys, shift_x=+0.5)

Column base_y (original): col 0 at 0.5, 1.5; cols 1–3 at 0, 1, 2.

| Key | base (orig) | offset | physical | keymap |
|-----|-------------|--------|----------|--------|
| Col 0 row 0 | (0, 0.5) | (0, +0.5) | (0, 1.0) | (0, 1) |
| Col 0 row 1 | (0, 1.5) | (0, +0.5) | (0, 2.0) | (0, 2) |
| Col 1 rows 0–2 | (1, 0/1/2) | (0, 0) | (1, 0/1/2) | (1, 0/1/2) |
| Col 2 rows 0–2 | (2, 0/1/2) | (0, 0) | (2, 0/1/2) | (2, 0/1/2) |
| Col 3 rows 0–2 | (3, 0/1/2) | (0, 0) | (3, 0/1/2) | (3, 0/1/2) |
| Thumb 0 | (2, 3) | (+0.5, 0) | (2.5, 3) | (2, 3) |
| Thumb 1 | (3, 3) | (+0.5, 0) | (3.5, 3) | (3, 3) |

section_bottom = 2. No normalization needed. max_x_phys = 3.5.

**Section 2** `3+13332^` — left thumb `3` (3 keys), column part `13332^` (h=[1,3,3,3,2], col 4 shift_y=−0.5)

| Key | base (orig) | offset | physical | keymap |
|-----|-------------|--------|----------|--------|
| Thumb 0–2 | (0–2, 3) | (0, 0) | (0–2, 3) | (0+5.5→6, 3), (7, 3), (8, 3) |
| Col 0 | (0, 1) | (0, 0) | (0, 1) | (6, 1) |
| Col 1 rows 0–2 | (1, 0/1/2) | (0, 0) | (1, 0/1/2) | (7, 0/1/2) |
| Col 2 rows 0–2 | (2, 0/1/2) | (0, 0) | (2, 0/1/2) | (8, 0/1/2) |
| Col 3 rows 0–2 | (3, 0/1/2) | (0, 0) | (3, 0/1/2) | (9, 0/1/2) |
| Col 4 row 0 | (4, 0.5) | (0, −0.5) | (4, 0.0) | (10, 1) |
| Col 4 row 1 | (4, 1.5) | (0, −0.5) | (4, 1.0) | (10, 2) |

section_bottom = 2. No normalization needed. max_x_phys = 4.

**Section 3** `33` — column part (h=[3,3]). No modifiers.

All keys at base integer positions, no offsets. max_x_phys = 1.

**Arrangement:**

```txt
section_offset[0] = 0
section_offset[1] = 0 + 3.5 + 2 = 5.5
section_offset[2] = 5.5 + 4 + 2 = 11.5
```

**Physical layout** (absolute coordinates):

```txt
  x x x       x x x x   x x
x x x x     x x x x x   x x
x x x x       x x x     x x
     x x    x x x
```

**Keymap layout** (round base_orig + section_offset, truncate offset):

| Section | Keymap coordinates |
|---------|-------------------|
| 1 | (0,1),(0,2),(1,0),(1,1),(1,2),(2,0),(2,1),(2,2),(3,0),(3,1),(3,2),(2,3),(3,3) |
| 2 | (6,3),(7,3),(8,3),(6,1),(7,0),(7,1),(7,2),(8,0),(8,1),(8,2),(9,0),(9,1),(9,2),(10,1),(10,2) |
| 3 | (12,0),(12,1),(12,2),(13,0),(13,1),(13,2) |

**Keymap ASCII art:**

```txt
  x x x         x x x x   x x
x x x x       x x x x x   x x
x x x x         x x x x   x x
     x x      x x x
```

**Differences from physical layout:** Column 4 of section 2 appears at keymap y = 1, 2 (its centered structural position) rather than physical y = 0, 1 (shifted up by `^`), because `trunc(−0.5) = 0` — a single 0.5U modifier shift does not move the key in the keymap grid. The thumb keys of section 1 appear at keymap x = 2, 3 (without the `>` shift) rather than physical x = 2.5, 3.5.

**Collision check:** All 34 keymap coordinates are distinct. ✓

## 8. Design Decisions

| Topic | Decision |
|-------|----------|
| Thumb–column overlap | Impossible by construction: thumbs are placed at `section_bottom + 1` after columns are finalized. |
| Section gap | 1U edge-to-edge, computed from actual physical key positions after all modifiers and normalization. |
| Negative coordinates | Allowed during computation; normalized to ≥ 0 per-section (physical) or globally (keymap) as a final step. |
| Single column with thumb | Not expressible in one section (`3+2` is thumb-only). Use separate sections. |
| Thumb-only sections | All rows left-aligned when no column part exists. |
| Multi-thumb sections | Left thumb rows before column part; right thumb rows after. Multiple `+` allowed. |
| Conflicting modifiers | Allowed and cancel: `v^` nets zero shift; `vv^` nets +0.5. |
| Cross-type modifiers | Rejected: column entry with `>` or thumb entry with `v` is a syntax error. |
| Keymap rounding | `round(base_orig) + trunc(offset)`: structural positions round; modifier shifts truncate. |
| Keymap collision prevention | Use original (pre-normalization) base values. Proven collision-free for all valid notations. |
| Max keys per column/row | 9 (single digit). |
| Segment separator | Space or underscore, collapsed when consecutive. |
