import { createTimer, makeTimer } from "@solid-primitives/timer";
import { createSignal } from "solid-js";
import { keyCenter } from "~/lib/geometry";
import type { KeyboardPart } from "~/typedef";
import type { GraphicsKey, WiringLine } from ".";

/**
 * Compute connection lines for keys sharing the same wiring pins.
 * Uses minimum spanning tree approach to show minimum number of lines.
 */
export function computeWiringLines(
  keys: GraphicsKey[],
  parts: KeyboardPart[],
  activeEditPart: number | null): WiringLine[] {
  const lines: WiringLine[] = [];

  // Group keys by their wiring pins (input and output separately)
  const inputGroups = new Map<string, GraphicsKey[]>();
  const outputGroups = new Map<string, GraphicsKey[]>();

  for (const gkey of keys) {
    // Only consider keys from the active edit part, or all if none selected
    if (activeEditPart !== null && gkey.part !== activeEditPart) continue;

    const wiring = parts[gkey.part]?.keys[gkey.key.id];
    if (!wiring) continue;

    if (wiring.input) {
      const group = inputGroups.get(wiring.input) || [];
      group.push(gkey);
      inputGroups.set(wiring.input, group);
    }

    if (wiring.output) {
      const group = outputGroups.get(wiring.output) || [];
      group.push(gkey);
      outputGroups.set(wiring.output, group);
    }
  }

  // Helper function to create minimum spanning tree lines for a group of keys
  const createMstLines = (
    keysInGroup: GraphicsKey[],
    type: 'input' | 'output',
    pinId: string
  ) => {
    if (keysInGroup.length < 2) return;

    // Get centers of all keys
    const centers = keysInGroup.map(k => keyCenter(k));

    // Simple MST using Prim's algorithm
    const visited = new Set<number>([0]);
    const remaining = new Set<number>(keysInGroup.map((_, i) => i).filter(i => i !== 0));

    while (remaining.size > 0) {
      let minDist = Infinity;
      let minFrom = -1;
      let minTo = -1;

      for (const from of visited) {
        for (const to of remaining) {
          const dx = centers[to].x - centers[from].x;
          const dy = centers[to].y - centers[from].y;
          const dist = dx * dx + dy * dy; // squared distance for comparison

          if (dist < minDist) {
            minDist = dist;
            minFrom = from;
            minTo = to;
          }
        }
      }

      // minFrom and minTo will always be valid when remaining.size > 0
      // but add defensive check just in case
      if (minFrom === -1 || minTo === -1) break;

      lines.push({
        from: centers[minFrom],
        to: centers[minTo],
        type,
        pinId,
      });
      visited.add(minTo);
      remaining.delete(minTo);
    }
  };

  // Create lines for each input group
  for (const [pinId, keysInGroup] of inputGroups) {
    createMstLines(keysInGroup, 'input', pinId);
  }

  // Create lines for each output group
  for (const [pinId, keysInGroup] of outputGroups) {
    createMstLines(keysInGroup, 'output', pinId);
  }

  return lines;
}

export function repeatTrigger(
  callback: () => void,
  delay: number = 500,
  interval: number = 100): [
    ((e?: Event) => void),
    ((e?: Event) => void)
  ] {
  const [timer, setTimer] = createSignal<number | false>(false);
  let failsafeCounter = 0;
  let cancelDelay: VoidFunction | null = null;

  createTimer(() => {
    if (failsafeCounter++ > 25) {
      stop();
      return;
    }
    callback();
  }, timer, setInterval);

  const start = (e?: Event) => {
    e?.preventDefault();

    callback();
    failsafeCounter = 0;
    cancelDelay = makeTimer(() => {
      callback();
      setTimer(interval);
    }, delay, setTimeout);
  };

  const stop = (e?: Event) => {
    e?.preventDefault();

    setTimer(false);
    cancelDelay?.();
    cancelDelay = null;
  };

  return [start, stop];
}
