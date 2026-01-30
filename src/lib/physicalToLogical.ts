import type { Key } from "~/typedef";

interface Point {
  x: number;
  y: number;
}

// Direction type for rays: right = +col, left = -col, down = +row, up = -row
type Direction = "right" | "left" | "down" | "up";

interface Neighbor {
  keyIndex: number;
  score: number; // lower is better (closer, more aligned)
}

interface KeyInfo {
  index: number;
  key: Key;
  center: Point;
  localRight: Point; // unit vector in key's local "right" direction
  localDown: Point;  // unit vector in key's local "down" direction
  neighbors: {
    right: Neighbor | null;
    left: Neighbor | null;
    down: Neighbor | null;
    up: Neighbor | null;
  };
}

// ============ Constants ============

// Threshold for considering keys as having a large gap (1.5U)
// This creates an empty row/column in the logical layout
const GAP_THRESHOLD = 1.5;

// Minimum distance between key centers to be considered different positions
// Guards against overlapping/duplicate keys
const MIN_DISTANCE_THRESHOLD = 0.001;

// Minimum forward distance for a key to be considered "ahead" in ray-casting
// Prevents selecting keys that are barely in front or behind
const MIN_FORWARD_DISTANCE = 0.1;

// Maximum alignment ratio (perpendicular/forward distance)
// tan(60°) ≈ 1.73 - keys more than 60 degrees off-axis are skipped
const MAX_ALIGNMENT_RATIO = 1.73;

// Weight for forward distance in neighbor scoring
// Lower values prefer closer keys; higher values prefer aligned keys
const FORWARD_DISTANCE_WEIGHT = 0.3;

// Threshold for considering keys aligned on the perpendicular axis (0.5U)
const ALIGNMENT_THRESHOLD = 0.5;

// Threshold for considering a key as "axis-aligned" (cos(30°) ≈ 0.87)
// Keys with localDown.y or localRight.x below this are considered rotated
const AXIS_ALIGNED_THRESHOLD = 0.87;

// Keys wider/taller than this threshold use center-based column/row assignment
const LARGE_KEY_THRESHOLD = 2;

/**
 * Convert physical layout positions to logical row/column assignments.
 * Uses ray-casting and clustering to determine key relationships.
 */
export function physicalToLogical(keys: Key[]): void {
  if (keys.length === 0) return;

  // Compute key info with centers and local axes
  const keyInfos = computeKeyInfos(keys);

  // Step 1: Ray-cast to find neighbor candidates
  findNeighbors(keyInfos);

  // Step 2: Build column and row clusters using Union-Find
  const { colGroups, rowGroups } = buildClusters(keyInfos);

  // Step 3: Order clusters and assign final row/column values
  assignGridPositions(keys, keyInfos, colGroups, rowGroups);
}

/**
 * Compute center point and local axes for each key.
 */
function computeKeyInfos(keys: Key[]): KeyInfo[] {
  return keys.map((key, index) => {
    const rad = (key.r * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    // Key center in physical space (accounting for rotation)
    const localCenterX = key.w / 2;
    const localCenterY = key.h / 2;

    // Transform local center to global position
    // Use nullish coalescing to properly handle rx/ry of 0
    const originX = key.rx ?? key.x;
    const originY = key.ry ?? key.y;
    const dx = key.x - originX + localCenterX;
    const dy = key.y - originY + localCenterY;

    const center: Point = {
      x: originX + dx * cos - dy * sin,
      y: originY + dx * sin + dy * cos,
    };

    // Local axis unit vectors (right and down in key's local space)
    const localRight: Point = { x: cos, y: sin };
    const localDown: Point = { x: -sin, y: cos };

    return {
      index,
      key,
      center,
      localRight,
      localDown,
      neighbors: {
        right: null,
        left: null,
        down: null,
        up: null,
      },
    };
  });
}

/**
 * Find the best neighbor for each key in each direction using ray-casting.
 */
function findNeighbors(keyInfos: KeyInfo[]): void {
  const directions: Direction[] = ["right", "left", "down", "up"];

  for (const info of keyInfos) {
    for (const dir of directions) {
      info.neighbors[dir] = findBestNeighbor(info, dir, keyInfos);
    }
  }
}

/**
 * Find the best neighbor for a key in a given direction.
 */
function findBestNeighbor(
  source: KeyInfo,
  direction: Direction,
  keyInfos: KeyInfo[]
): Neighbor | null {
  // Get the direction vector in source key's local space
  let dirVector: Point;
  switch (direction) {
    case "right":
      dirVector = source.localRight;
      break;
    case "left":
      dirVector = { x: -source.localRight.x, y: -source.localRight.y };
      break;
    case "down":
      dirVector = source.localDown;
      break;
    case "up":
      dirVector = { x: -source.localDown.x, y: -source.localDown.y };
      break;
  }

  let bestNeighbor: Neighbor | null = null;

  for (const target of keyInfos) {
    if (target.index === source.index) continue;

    // Vector from source center to target center
    const toTarget: Point = {
      x: target.center.x - source.center.x,
      y: target.center.y - source.center.y,
    };

    const distance = Math.sqrt(toTarget.x ** 2 + toTarget.y ** 2);
    if (distance < MIN_DISTANCE_THRESHOLD) continue; // Skip if too close (same position)

    // Calculate forward distance (projection onto direction vector)
    const forwardDist = toTarget.x * dirVector.x + toTarget.y * dirVector.y;
    
    // Skip if target is behind us (not in the forward direction)
    if (forwardDist < MIN_FORWARD_DISTANCE) continue;

    // Calculate the perpendicular distance (how far off-axis the target is)
    const perpendicularDist = Math.abs(
      toTarget.x * (-dirVector.y) + toTarget.y * dirVector.x
    );

    // Score: lower is better
    // The key metric is the perpendicular distance normalized by forward distance
    // A key directly ahead (perp=0) is ideal
    // A key at an angle gets penalized proportionally
    // We also add forward distance to prefer closer keys when alignment is similar
    const alignmentRatio = perpendicularDist / forwardDist;
    
    // Skip if the key is too far off-axis
    if (alignmentRatio > MAX_ALIGNMENT_RATIO) continue;
    
    // Score: prefer keys with low perpendicular distance first, then closer
    const score = perpendicularDist + forwardDist * FORWARD_DISTANCE_WEIGHT;

    if (!bestNeighbor || score < bestNeighbor.score) {
      bestNeighbor = {
        keyIndex: target.index,
        score,
      };
    }
  }

  return bestNeighbor;
}

/**
 * Get the opposite direction.
 */
function oppositeDirection(dir: Direction): Direction {
  switch (dir) {
    case "right": return "left";
    case "left": return "right";
    case "down": return "up";
    case "up": return "down";
  }
}

/**
 * Check if a neighbor relationship is bidirectional in the correct sense.
 * That is, source's dir neighbor is target, and target's opposite(dir) neighbor is source.
 */
function isBidirectional(keyInfos: KeyInfo[], sourceIdx: number, targetIdx: number, dir: Direction): boolean {
  const reverseDir = oppositeDirection(dir);
  const targetNeighbor = keyInfos[targetIdx].neighbors[reverseDir];
  return targetNeighbor !== null && targetNeighbor.keyIndex === sourceIdx;
}

/**
 * Check if a neighbor relationship would create an invalid loop.
 * This happens when both keys see each other in the SAME direction (e.g., both as DOWN),
 * which indicates rotation confusion due to very different key orientations.
 */
function isConflictingRelationship(keyInfos: KeyInfo[], sourceIdx: number, targetIdx: number, dir: Direction): boolean {
  // Check if target also sees source in the same direction (not opposite)
  const targetNeighborSameDir = keyInfos[targetIdx].neighbors[dir];
  return targetNeighborSameDir !== null && targetNeighborSameDir.keyIndex === sourceIdx;
}

/**
 * Simple Union-Find data structure.
 */
class UnionFind {
  private parent: number[];
  private rank: number[];

  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, i) => i);
    this.rank = Array(size).fill(0);
  }

  find(x: number): number {
    if (this.parent[x] !== x) {
      this.parent[x] = this.find(this.parent[x]); // Path compression
    }
    return this.parent[x];
  }

  union(x: number, y: number): void {
    const rootX = this.find(x);
    const rootY = this.find(y);
    if (rootX === rootY) return;

    // Union by rank
    if (this.rank[rootX] < this.rank[rootY]) {
      this.parent[rootX] = rootY;
    } else if (this.rank[rootX] > this.rank[rootY]) {
      this.parent[rootY] = rootX;
    } else {
      this.parent[rootY] = rootX;
      this.rank[rootX]++;
    }
  }

  getGroups(): Map<number, number[]> {
    const groups = new Map<number, number[]>();
    for (let i = 0; i < this.parent.length; i++) {
      const root = this.find(i);
      if (!groups.has(root)) {
        groups.set(root, []);
      }
      groups.get(root)!.push(i);
    }
    return groups;
  }
}

/**
 * Build column and row clusters using Union-Find based on neighbor relationships.
 * Keys in the same column share up/down neighbors.
 * Keys in the same row share left/right neighbors.
 */
function buildClusters(keyInfos: KeyInfo[]): { colGroups: Map<number, number[]>; rowGroups: Map<number, number[]> } {
  const n = keyInfos.length;
  const colUF = new UnionFind(n);
  const rowUF = new UnionFind(n);

  // Check if layout is a standard grid (keys at integer x,y positions and axis-aligned)
  const isStandardGrid = keyInfos.every(info => 
    Number.isInteger(info.key.x) && 
    Number.isInteger(info.key.y) &&
    Math.abs(info.localDown.y) > AXIS_ALIGNED_THRESHOLD &&
    Math.abs(info.localRight.x) > AXIS_ALIGNED_THRESHOLD
  );

  if (isStandardGrid) {
    // For standard grids, determine column based on key position and width
    // For normal keys: column = key.x
    // For large keys (>2U): column = floor(center.x) 
    const getKeyColumn = (info: KeyInfo): number => {
      if (info.key.w > LARGE_KEY_THRESHOLD) {
        // Large key - use center position
        return Math.floor(info.center.x);
      } else {
        // Normal key - use x position
        return info.key.x;
      }
    };
    
    // Group keys by their logical column
    const colPositions = new Map<number, number[]>();
    for (const info of keyInfos) {
      const colKey = getKeyColumn(info);
      if (!colPositions.has(colKey)) {
        colPositions.set(colKey, []);
      }
      colPositions.get(colKey)!.push(info.index);
    }
    
    // Union keys with the same column
    for (const members of colPositions.values()) {
      for (let i = 1; i < members.length; i++) {
        colUF.union(members[0], members[i]);
      }
    }
    
    // For rows, determine based on key position and height
    const getKeyRow = (info: KeyInfo): number => {
      if (info.key.h > LARGE_KEY_THRESHOLD) {
        // Large key - use center position
        return Math.floor(info.center.y);
      } else {
        // Normal key - use y position
        return info.key.y;
      }
    };
    
    // Group keys by their logical row
    const rowPositions = new Map<number, number[]>();
    for (const info of keyInfos) {
      const rowKey = getKeyRow(info);
      if (!rowPositions.has(rowKey)) {
        rowPositions.set(rowKey, []);
      }
      rowPositions.get(rowKey)!.push(info.index);
    }
    
    // Union keys with the same row
    for (const members of rowPositions.values()) {
      for (let i = 1; i < members.length; i++) {
        rowUF.union(members[0], members[i]);
      }
    }
  } else {
    // For non-standard layouts (rotated or staggered), use neighbor-based clustering
    
    // Threshold for considering keys aligned
    // Union keys that are vertically adjacent (same column)
    for (const info of keyInfos) {
      for (const dir of ["up", "down"] as const) {
        const neighbor = info.neighbors[dir];
        if (neighbor && !isConflictingRelationship(keyInfos, info.index, neighbor.keyIndex, dir)) {
          if (isBidirectional(keyInfos, info.index, neighbor.keyIndex, dir)) {
            const target = keyInfos[neighbor.keyIndex];
            
            const isSourceAxisAligned = Math.abs(info.localDown.y) > AXIS_ALIGNED_THRESHOLD;
            const isTargetAxisAligned = Math.abs(target.localDown.y) > AXIS_ALIGNED_THRESHOLD;
            
            if (isSourceAxisAligned && isTargetAxisAligned) {
              const xDiff = Math.abs(info.center.x - target.center.x);
              if (xDiff <= ALIGNMENT_THRESHOLD) {
                colUF.union(info.index, neighbor.keyIndex);
              }
            } else {
              colUF.union(info.index, neighbor.keyIndex);
            }
          }
        }
      }
    }

    // Union keys that are horizontally adjacent (same row)
    for (const info of keyInfos) {
      for (const dir of ["left", "right"] as const) {
        const neighbor = info.neighbors[dir];
        if (neighbor && !isConflictingRelationship(keyInfos, info.index, neighbor.keyIndex, dir)) {
          if (isBidirectional(keyInfos, info.index, neighbor.keyIndex, dir)) {
            const target = keyInfos[neighbor.keyIndex];
            
            const isSourceAxisAligned = Math.abs(info.localRight.x) > AXIS_ALIGNED_THRESHOLD;
            const isTargetAxisAligned = Math.abs(target.localRight.x) > AXIS_ALIGNED_THRESHOLD;
            
            if (isSourceAxisAligned && isTargetAxisAligned) {
              const yDiff = Math.abs(info.center.y - target.center.y);
              if (yDiff <= ALIGNMENT_THRESHOLD) {
                rowUF.union(info.index, neighbor.keyIndex);
              }
            } else {
              rowUF.union(info.index, neighbor.keyIndex);
            }
          }
        }
      }
    }
  }

  return {
    colGroups: colUF.getGroups(),
    rowGroups: rowUF.getGroups(),
  };
}

/**
 * Assign grid positions based on column and row clusters.
 */
function assignGridPositions(
  keys: Key[],
  keyInfos: KeyInfo[],
  colGroups: Map<number, number[]>,
  rowGroups: Map<number, number[]>
): void {
  // For each column group, compute the average X position (using key centers)
  const colGroupPositions = new Map<number, number>();
  for (const [root, members] of colGroups) {
    const avgX = members.reduce((sum, i) => sum + keyInfos[i].center.x, 0) / members.length;
    colGroupPositions.set(root, avgX);
  }

  // For each row group, compute the average Y position
  const rowGroupPositions = new Map<number, number>();
  for (const [root, members] of rowGroups) {
    const avgY = members.reduce((sum, i) => sum + keyInfos[i].center.y, 0) / members.length;
    rowGroupPositions.set(root, avgY);
  }

  // Sort column groups by their average X position
  const sortedColGroups = [...colGroups.entries()].sort(
    (a, b) => colGroupPositions.get(a[0])! - colGroupPositions.get(b[0])!
  );

  // Sort row groups by their average Y position
  const sortedRowGroups = [...rowGroups.entries()].sort(
    (a, b) => rowGroupPositions.get(a[0])! - rowGroupPositions.get(b[0])!
  );

  // Assign column numbers with gap detection
  const colAssignment = new Map<number, number>();
  let colNum = 0;
  for (let i = 0; i < sortedColGroups.length; i++) {
    const [root] = sortedColGroups[i];
    
    // Check for large gap from previous column
    if (i > 0) {
      const prevRoot = sortedColGroups[i - 1][0];
      const prevX = colGroupPositions.get(prevRoot)!;
      const currX = colGroupPositions.get(root)!;
      
      // Estimate gap by comparing center distances
      // Average key width is roughly 1U
      if (currX - prevX >= 1 + GAP_THRESHOLD) {
        colNum++; // Add extra column for the gap
      }
    }
    
    colAssignment.set(root, colNum);
    colNum++;
  }

  // Assign row numbers with gap detection
  const rowAssignment = new Map<number, number>();
  let rowNum = 0;
  for (let i = 0; i < sortedRowGroups.length; i++) {
    const [root] = sortedRowGroups[i];
    
    // Check for large gap from previous row
    if (i > 0) {
      const prevRoot = sortedRowGroups[i - 1][0];
      const prevY = rowGroupPositions.get(prevRoot)!;
      const currY = rowGroupPositions.get(root)!;
      
      // Average key height is roughly 1U
      if (currY - prevY >= 1 + GAP_THRESHOLD) {
        rowNum++; // Add extra row for the gap
      }
    }
    
    rowAssignment.set(root, rowNum);
    rowNum++;
  }

  // Apply assignments to keys
  for (let i = 0; i < keys.length; i++) {
    const colRoot = [...colGroups.entries()].find(([_, members]) => members.includes(i))![0];
    const rowRoot = [...rowGroups.entries()].find(([_, members]) => members.includes(i))![0];
    
    keys[i].col = colAssignment.get(colRoot)!;
    keys[i].row = rowAssignment.get(rowRoot)!;
  }

  // Sort keys by row then column
  keys.sort((a, b) => (a.row - b.row) || (a.col - b.col));
}
