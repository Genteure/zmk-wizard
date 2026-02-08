/**
 * Layout editing state management for the graphics component.
 * 
 * This module provides rotation settings and clipboard for layout manipulation.
 * The unified mode signal is managed by the parent component.
 */

import { createSignal, type Accessor, type Setter } from "solid-js";
import type { Key } from "../../typedef";
import type { GraphicsMode } from "./types";

/**
 * Rotation sub-modes for the rotate tool
 * 
 * - "center": Rotate around key's own center (or rx,ry if set)
 * - "anchor": Rotate around anchor point, key points away from it
 */
export type RotateSubMode = "center" | "anchor";

/**
 * Anchor move modes for center rotation - determines what stays fixed when moving anchor
 * 
 * - "final": Keep final visual position fixed when moving anchor
 * - "original": Keep original x,y position fixed when moving anchor
 */
export type CenterAnchorMoveMode = "final" | "original";

/**
 * Snapping settings for movement and rotation
 */
export interface SnapSettings {
  moveSnap: number;   // Snap to units (0.1, 0.25, 0.5, 1)
  rotateSnap: number; // Snap to degrees (1, 5, 15)
}

/** Available movement snap options */
export const MOVE_SNAP_OPTIONS = [
  { value: 0.1, label: "0.1u" },
  { value: 0.25, label: "0.25u" },
  { value: 0.5, label: "0.5u" },
  { value: 1, label: "1u" },
] as const;

/** Available rotation snap options */
export const ROTATE_SNAP_OPTIONS = [
  { value: 1, label: "1°" },
  { value: 5, label: "5°" },
  { value: 15, label: "15°" },
] as const;

/** Default snap settings */
export const DEFAULT_SNAP_SETTINGS: SnapSettings = {
  moveSnap: 0.25,
  rotateSnap: 15,
};

/**
 * Layout editing state that lives at the graphics component level
 */
export interface LayoutEditState {
  // Unified graphics mode
  mode: Accessor<GraphicsMode>;
  setMode: Setter<GraphicsMode>;
  
  // Rotation sub-mode (only relevant when mode is "rotate")
  rotateSubMode: Accessor<RotateSubMode>;
  setRotateSubMode: Setter<RotateSubMode>;
  
  // Center anchor move mode (only relevant in center rotation mode)
  centerAnchorMoveMode: Accessor<CenterAnchorMoveMode>;
  setCenterAnchorMoveMode: Setter<CenterAnchorMoveMode>;
  
  // Clipboard for copy/paste
  clipboard: Accessor<Key[] | null>;
  setClipboard: Setter<Key[] | null>;
  
  // Snapping settings
  snapSettings: Accessor<SnapSettings>;
  setSnapSettings: Setter<SnapSettings>;
}

/**
 * Create layout editing state
 * @param initialMode - Initial graphics mode (default: "select")
 */
export function createLayoutEditState(initialMode: GraphicsMode = "select"): LayoutEditState {
  const [mode, setMode] = createSignal<GraphicsMode>(initialMode);
  const [rotateSubMode, setRotateSubMode] = createSignal<RotateSubMode>("center");
  const [centerAnchorMoveMode, setCenterAnchorMoveMode] = createSignal<CenterAnchorMoveMode>("final");
  const [clipboard, setClipboard] = createSignal<Key[] | null>(null);
  const [snapSettings, setSnapSettings] = createSignal<SnapSettings>(DEFAULT_SNAP_SETTINGS);

  return {
    mode,
    setMode,
    rotateSubMode,
    setRotateSubMode,
    centerAnchorMoveMode,
    setCenterAnchorMoveMode,
    clipboard,
    setClipboard,
    snapSettings,
    setSnapSettings,
  };
}

/**
 * Helper: Round to specified decimal places
 */
export function roundTo(value: number, decimals: number = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/**
 * Helper: Snap value to grid
 */
export function snapToGrid(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize;
}
