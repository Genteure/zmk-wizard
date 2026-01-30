import type { Key } from "~/typedef";

export function physicalToLogical(keys: Key[]): void {
  if (keys.length === 0) return;

  // Step 1: raycast from each key's local origin to find neighbor candidates
  // Each key make 3x4 rays (4 directions, center + edges) and find "nearest" neighbor in each direction
  // "nearest" is defined as a proximity score based on angle and distance.
  // The ideal neighbor is directly in line (same angle) and directly adjacent (edge touching).
  // Neighbors that are further away or at an angle are penalized.
  // Each key ends up with up to 12 neighbor candidates (some rays may not hit any key).

  // Step 2: build clusters of connected keys based on best neighbor candidates.
  // Each cluster represents a "contiguous" area of the keyboard.
  // Start from keys with the best neighbor scores (as they are likely more trustworthy and tightly packed).
  // For each key, confirm its relationships with its best neighbors to form clusters. At this time we do not assign rows/cols yet.
  // If conflicts arise (two keys want the same neighbor), use the proximity scores to resolve them.
  // If a key is really far away from all others (no good neighbors), it may form its own cluster.

  // Step 3: connect and pack clusters
  // Once clusters are formed, we need to arrange them into a coherent grid.
  // For clusters that are far apart (at least 1.5U gap between member keys), add empty rows/columns as needed to separate them.
  // Align and connect close by clusters using key neighbor candidates that span clusters, adjusting positions to minimize unnecessary gaps.
  // Finally, assign global rows and columns to all keys based on their final positions in the grid.

  // set columns and rows to the keys passed in, we don't return new array
}
