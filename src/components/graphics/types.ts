import type { Accessor, JSX, Setter } from "solid-js";
import type { Point } from "~/lib/geometry";
import type { GraphicsKey } from ".";
import type { WizardContextType } from "../context";

export interface InteractionEventHandlers {
  onMouseDown: JSX.EventHandler<HTMLDivElement, MouseEvent>;
  onMouseMove: JSX.EventHandler<HTMLDivElement, MouseEvent>;
  onMouseUp: JSX.EventHandler<HTMLDivElement, MouseEvent>;
  onTouchStart: JSX.EventHandler<HTMLDivElement, TouchEvent>;
  onTouchMove: JSX.EventHandler<HTMLDivElement, TouchEvent>;
  onTouchEnd: JSX.EventHandler<HTMLDivElement, TouchEvent>;
  reset: () => void;
}

export interface TransformValues {
  s: number;
  x: number;
  y: number;
}

export interface SelectionOverlay {
  start: Point;
  end: Point | null;
}

export interface GraphicState {
  c2v: (clientX: number, clientY: number) => { x: number; y: number; };
  contentBbox: () => { min: { x: number; y: number; }; width: number; height: number; };
  keys: Accessor<GraphicsKey[]>,
  context: WizardContextType,
  onKeySetWiring?: ((key: GraphicsKey) => void) | undefined;

  setAutoZoom: Setter<boolean>;
  transform: Accessor<TransformValues>;
  setTransform: Setter<TransformValues>;
  overlay: Accessor<SelectionOverlay | null>;
  setOverlay: Setter<SelectionOverlay | null>;
  setIsPanning: Setter<boolean>;
  isWiringDragging: Accessor<boolean>;
  setIsWiringDragging: Setter<boolean>;
}
