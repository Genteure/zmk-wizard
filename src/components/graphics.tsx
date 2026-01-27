import { createKeyHold } from "@solid-primitives/keyboard";
import { createElementSize } from "@solid-primitives/resize-observer";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  Match,
  Show,
  Switch,
  type Accessor,
  type JSX,
  type VoidComponent,
} from "solid-js";

import Check from "lucide-solid/icons/check";
import Move from "lucide-solid/icons/move";
import Pencil from "lucide-solid/icons/pencil";
import RotateCcw from "lucide-solid/icons/rotate-ccw";
import ZoomIn from "lucide-solid/icons/zoom-in";
import ZoomOut from "lucide-solid/icons/zoom-out";

import { Button } from "@kobalte/core/button";
import { createTimer, makeTimer } from "@solid-primitives/timer";
import ArrowBigUp from "lucide-solid/icons/arrow-big-up";
import { produce } from "solid-js/store";
import {
  getKeysBoundingBox,
  getKeyStyles,
  keyCenter,
  type KeyGeometry,
  type Point,
} from "~/lib/geometry";
import { swpBgClass, swpBorderClass } from "~/lib/swpColors";
import type { Key, KeyboardPart, SingleKeyWiring, WiringType } from "../typedef";
import { normalizeKeys, useWizardContext } from "./context";
import { controllerInfos } from "./controllerInfo";
import {
  createDragSelectEventHandlers,
  createPanEventHandlers,
  createWiringEventHandlers,
  type GraphicState,
  type InteractionEventHandlers
} from "./graphics.events";

export type GraphicsKey = KeyGeometry & {
  index: number,
  key: Key,
  part: number, // index of the part this key belongs to
}

/**
 * Represents a connection line between two keys sharing a wiring pin.
 */
type WiringLine = {
  from: Point;
  to: Point;
  type: 'input' | 'output';
  pinId: string;
};

/**
 * Compute connection lines for keys sharing the same wiring pins.
 * Uses minimum spanning tree approach to show minimum number of lines.
 */
function computeWiringLines(
  keys: GraphicsKey[],
  parts: KeyboardPart[],
  activeEditPart: number | null
): WiringLine[] {
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

type KeyRendererProps = {
  keyData: GraphicsKey;
  parts: KeyboardPart[];
  isSelected: boolean;
  activeEditPart: number | null;
  activeWiringPin: string | null;
  wiring?: SingleKeyWiring;
  wiringType?: WiringType;
  showWiringPins: boolean;
  onClick?: ((key: GraphicsKey) => void) | undefined;
};

const shiftRegisterPinLabels: Record<string, string> = Object.fromEntries(Array.from({ length: 32 }, (_, i) => [`shifter${i}`, `SR${i}`]))

const KeyRenderer: VoidComponent<KeyRendererProps> = (props) => {
  const keyData = () => props.keyData;
  const partName = () => props.parts[keyData().part]?.name;
  const showOutputPin = () => props.wiringType === "matrix_diode" || props.wiringType === "matrix_no_diode";
  const pinActive = () => {
    if (!props.activeWiringPin) return false;
    const { input, output } = props.wiring || {};
    return input === props.activeWiringPin || output === props.activeWiringPin;
  };
  const pinLabel = (pinId?: string): string => {
    if (!pinId) return "????";

    // special case for shift register pins, if it exists in our labels map
    if (pinId in shiftRegisterPinLabels) {
      return shiftRegisterPinLabels[pinId];
    }

    const controllerId = props.parts[keyData().part]?.controller;
    if (!controllerId) return pinId;
    const info = controllerInfos[controllerId];
    if (!info) return pinId;

    return info.pins[pinId]?.displayName || pinId;
  };

  return (<Button
    style={getKeyStyles(keyData())}
    classList={{
      "z-10": props.isSelected,
    }}
    aria-label={`Key ${keyData().index} (${partName() || "Unnamed Part"})`}
    onClick={() => props.onClick?.(keyData())}
  >
    <div
      class="w-full h-full rounded-sm select-none p-0.5 border " // transition duration-300
      classList={{
        "bg-base-200": (props.activeEditPart === keyData().part || props.activeEditPart === null),
        "bg-base-300 border-2": props.isSelected,
        "border-amber-500 bg-base-300 border-2": props.activeEditPart === keyData().part && pinActive(),
        [swpBorderClass(keyData().part)]: props.activeEditPart === null,
        "border-dashed border-base-content/50": props.activeEditPart !== null && props.activeEditPart !== keyData().part,
      }}
    >

      {/* Key Index */}
      <div
        classList={{
          "absolute font-mono z-[2]": true,
          "transition-all duration-200 ease-out": true,
          "top-0.5 left-0.5 text-sm/tight": props.activeEditPart === keyData().part,
          "top-2/5 left-1/2 -translate-x-1/2 -translate-y-1/2 text-2xl font-bold": props.activeEditPart === null,
          "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-2xl font-bold opacity-25": props.activeEditPart !== null && props.activeEditPart !== keyData().part,
        }}
      >
        {keyData().index}
      </div>

      {/* Selection Marker */}
      <Show when={props.isSelected}>
        <div class="absolute top-0 right-0 w-7 h-7 pointer-events-none overflow-clip rounded-sm z-[2]">
          <div class="absolute top-0 right-0 rotate-45 bg-success w-7 h-7 -translate-y-1/2 translate-x-1/2"></div>
          <Check strokeWidth="4" class="w-2 h-2 absolute top-0.5 right-0.5 text-success-content" />
        </div>
      </Show>

      {/* Key Content */}
      <Show when={props.activeEditPart === null}>
        <div
          class="absolute top-3/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full p-1 text-xs text-center opacity-75 truncate z-[2]"
        >
          <span
            class="inline-block rounded-full w-2 h-2 mr-1"
            classList={{ [swpBgClass(keyData().part)]: true }} />
          <span>{partName()}</span>
        </div>
      </Show>

      {/* Wiring pins while wiring this part */}
      <Show when={props.showWiringPins}>
        <div class="absolute inset-0 flex flex-col items-center justify-center text-lg/tight font-bold leading-tight pointer-events-none text-center z-[2]">
          <div
            class="text-emerald-500"
            classList={{ "opacity-50 italic": !props.wiring?.input }}
          >
            {pinLabel(props.wiring?.input)}
          </div>
          <Show when={showOutputPin()}>
            <div
              class="text-red-500"
              classList={{ "opacity-50 italic": !props.wiring?.output }}
            >
              {pinLabel(props.wiring?.output)}
            </div>
          </Show>
        </div>
      </Show>
    </div>
  </Button>);
};

// TODO add support for arbitrary extra elements in display area

export const KeyboardPreview: VoidComponent<{
  title: string,
  keys: Accessor<GraphicsKey[]>,
  onKeySetWiring?: (key: GraphicsKey) => void,
  // Parent controls which edit tool is active when not in Pan mode
  editMode?: Accessor<"select" | "wiring">,
  moveSelectedKey: "physical" | "logical",
}> = (props) => {
  const context = useWizardContext();
  const [containerRef, setContainerRef] = createSignal<HTMLDivElement>();
  const containerSize = createElementSize(containerRef);

  // Local toggle between Pan and Edit (Select/Wiring)
  const [panMode, setPanMode] = createSignal(false);
  const [isPanning, setIsPanning] = createSignal(false);
  const [isWiringDragging, setIsWiringDragging] = createSignal(false);
  const ctrlHeld = createKeyHold("Control", { preventDefault: false });
  // if control is held, flip the edit mode
  const effectiveIsPan = createMemo(() => ctrlHeld() ? !panMode() : panMode())

  const [autoZoom, setAutoZoom] = createSignal(true);
  const activeMode = createMemo<"pan" | "select" | "wiring">(() => {
    if (effectiveIsPan()) return "pan";
    return (props.editMode?.() === "wiring") ? "wiring" : "select";
  });

  // Auto zoom effect
  createEffect(() => {
    if (!autoZoom()) return;

    const bbox = contentBbox();
    if (bbox.keyCount === 0) {
      setTransform({ s: 1, x: 0, y: 0 });
      return;
    }

    const containerWidth = containerSize.width;
    const containerHeight = containerSize.height;
    if (containerWidth === null || containerHeight === null) return;

    const paddingScreen = 10;
    const paddingContent = 2 * 50;

    const scaleX = (containerWidth - paddingScreen) / (bbox.width + paddingContent);
    const scaleY = (containerHeight - paddingScreen) / (bbox.height + paddingContent);
    const scale = Math.min(scaleX, scaleY, 1.5); // Don't auto scale above 1.5

    setTransform({ s: scale, x: 0, y: 0 });
  })

  const [transform, setTransform] = createSignal({ s: 1, x: 0, y: 0 });

  // Drag selection state
  const [overlay, setOverlay] = createSignal<{
    start: Point,
    end: Point | null
  } | null>(null);

  const contentBbox = createMemo(() => {
    const bbox = getKeysBoundingBox(props.keys());
    return {
      keyCount: props.keys().length,
      width: bbox.max.x - bbox.min.x,
      height: bbox.max.y - bbox.min.y,
      ...bbox
    };
  });

  // Compute wiring connection lines (only when in wiring mode)
  const wiringLines = createMemo(() => {
    if (props.editMode?.() !== "wiring") return [];
    return computeWiringLines(
      props.keys(),
      context.keyboard.parts,
      context.nav.activeEditPart
    );
  });

  const scaleAtOrigin = (scaleUp: boolean, originX: number, originY: number) => {
    setAutoZoom(false);
    setTransform(t => {
      const newScale = t.s * (scaleUp ? 1.2 : (1 / 1.2));
      if (newScale < 0.2 || newScale > 5 || newScale === t.s) return t;

      if (containerSize.width === null || containerSize.height === null) {
        return { ...t, s: newScale };
      }

      const centerX = containerSize.width / 2;
      const centerY = containerSize.height / 2;

      const pointX = (originX - centerX) / t.s - t.x;
      const pointY = (originY - centerY) / t.s - t.y;

      const newX = (originX - centerX) / newScale - pointX;
      const newY = (originY - centerY) / newScale - pointY;

      return { s: newScale, x: newX, y: newY };
    });
  }

  /**
   * Convert virtual coordinates to container (screen) coordinates
   *
   * container coordinates: (0,0) is top-left of container, in px, browser display pixels
   */
  const v2c = (virtualX: number, virtualY: number): { x: number; y: number; } => {
    const t = transform();
    if (containerSize.height === null || containerSize.height === null) return { x: 0, y: 0 };

    const centerX = containerSize.width / 2;
    const centerY = containerSize.height / 2;

    const screenX = centerX + (virtualX + t.x) * t.s;
    const screenY = centerY + (virtualY + t.y) * t.s;

    return { x: screenX, y: screenY };
  }

  const eventHandlerStates: GraphicState = {
    context,
    c2v: (clientX: number, clientY: number): { x: number; y: number; } => {
      // Client to virtual
      // Convert client coordinates to virtual coordinates
      // virtual coordinates: (0,0) is center of container, in px, before scaling (a.k.a 70px always = 1U)
      // client coordinates: (0,0) is top-left of viewport, in px, browser display pixels

      const rect = containerRef()?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };

      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const t = transform();
      const virtualX = (clientX - centerX) / t.s - t.x;
      const virtualY = (clientY - centerY) / t.s - t.y;

      return { x: virtualX, y: virtualY };
    },
    contentBbox,
    keys: props.keys,
    onKeySetWiring: props.onKeySetWiring,
    transform,
    setTransform,
    overlay,
    setOverlay,
    setAutoZoom,
    setIsPanning,
    isWiringDragging,
    setIsWiringDragging,
  }

  const panHandler: InteractionEventHandlers = createPanEventHandlers(eventHandlerStates);
  const selectionHandler: InteractionEventHandlers = createDragSelectEventHandlers(eventHandlerStates);
  const wiringHandler: InteractionEventHandlers = createWiringEventHandlers(eventHandlerStates);

  // Current active handlers based on mode
  const activeHandlers = createMemo<InteractionEventHandlers>(() => {
    if (effectiveIsPan()) return panHandler;
    return (props.editMode?.() === "wiring") ? wiringHandler : selectionHandler;
  });

  // Reset previous handler state when switching modes
  let previousHandlers: InteractionEventHandlers | null = null;
  createEffect(() => {
    const current = activeHandlers();
    if (previousHandlers && previousHandlers !== current) {
      previousHandlers.reset();
    }
    previousHandlers = current;
  });

  const onWheelHandler: JSX.EventHandler<HTMLDivElement, WheelEvent> = (e) => {
    if (e.deltaY === 0) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const originX = e.clientX - rect.left;
    const originY = e.clientY - rect.top;
    scaleAtOrigin(e.deltaY < 0, originX, originY);
  };

  const onEachKeyClicked = (key: GraphicsKey) => {
    switch (activeMode()) {
      case "pan":
        // do nothing
        break;
      case "select":
        // toggle selection of this key
        context.setNav("selectedKeys", produce(draft => {
          const idx = context.nav.selectedKeys.indexOf(key.key.id);
          if (idx === -1) {
            draft.push(key.key.id);
          } else {
            draft.splice(idx, 1);
          }
        }));
        break;
      case "wiring":
        // set wiring for this key
        props.onKeySetWiring?.(key);
        break;
    }
  };

  const moveKeys = (callback: (k: Key) => void) => repeatTrigger(() => {
    context.setKeyboard("layout", produce((layout) => {
      context.nav.selectedKeys.forEach(id => {
        const k = layout.find(kk => kk.id === id);
        if (k) callback(k);
      });
    }));
    normalizeKeys(context);
  })

  const [moveUpStart, moveUpEnd] = moveKeys((k) => {
    if (props.moveSelectedKey === "logical") { k.row -= 1; return; }
    k.y -= 0.25; if (k.ry !== 0) k.ry -= 0.25;
  });
  const [moveDownStart, moveDownEnd] = moveKeys((k) => {
    if (props.moveSelectedKey === "logical") { k.row += 1; return; }
    k.y += 0.25; if (k.ry !== 0) k.ry += 0.25;
  });
  const [moveLeftStart, moveLeftEnd] = moveKeys((k) => {
    if (props.moveSelectedKey === "logical") { k.col -= 1; return; }
    k.x -= 0.25; if (k.rx !== 0) k.rx -= 0.25;
  });
  const [moveRightStart, moveRightEnd] = moveKeys((k) => {
    if (props.moveSelectedKey === "logical") { k.col += 1; return; }
    k.x += 0.25; if (k.rx !== 0) k.rx += 0.25;
  });

  return (
    <div
      ref={setContainerRef}
      role="application"
      aria-label={props.title}
      class="keyboard-editor w-full h-full relative overflow-clip"
      classList={{
        "cursor-grab": effectiveIsPan() && !isPanning(),
        "cursor-grabbing": effectiveIsPan() && isPanning(),
        "cursor-crosshair": !effectiveIsPan() && (props.editMode?.() !== "wiring"),
        "cursor-cell": !effectiveIsPan() && (props.editMode?.() === "wiring"),
      }}
      onWheel={onWheelHandler}
      onMouseDown={e => {
        // Ignore clicks on controls
        if (e.target && (e.target as HTMLElement).closest("[data-controls]")) {
          return;
        }
        activeHandlers().onMouseDown(e);
      }}
      onTouchStart={e => {
        // Ignore touches on controls
        if (e.target && (e.target as HTMLElement).closest("[data-controls]")) {
          return;
        }
        activeHandlers().onTouchStart(e);
      }}
      onMouseMove={e => activeHandlers().onMouseMove(e)}
      onMouseUp={e => activeHandlers().onMouseUp(e)}
      onMouseLeave={e => activeHandlers().onMouseUp(e)}
      onTouchMove={e => activeHandlers().onTouchMove(e)}
      onTouchEnd={e => activeHandlers().onTouchEnd(e)}
    >

      {/* Main area */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: `translate(-50%, -50%) scale(${transform().s}) translate(${transform().x}px, ${transform().y}px)`,
          'transform-origin': 'center center',
        }}
      >
        <div
          style={{
            position: 'relative',
            top: contentBbox().keyCount ? `${-contentBbox().min.y}px` : undefined,
            left: contentBbox().keyCount ? `${-contentBbox().min.x}px` : undefined,
            width: contentBbox().keyCount ? `${contentBbox().width}px` : undefined,
            height: contentBbox().keyCount ? `${contentBbox().height}px` : undefined,
          }}
          classList={{
            // inherit cursor by default
            '[&>button]:cursor-[inherit]': true,
            // use pointer when wiring tool is active AND we're not dragging
            '[&>button]:cursor-pointer': !effectiveIsPan() && (props.editMode?.() === "wiring") && !isWiringDragging(),
          }}
        >
          {/* Wiring connection lines - rendered above key backgrounds but below key labels */}
          <Show when={props.editMode?.() === "wiring" && wiringLines().length > 0}>
            <svg
              class="absolute inset-0 overflow-visible pointer-events-none z-[1]"
              style={{
                width: `${contentBbox().width}px`,
                height: `${contentBbox().height}px`,
              }}
            >
              <For each={wiringLines()}>
                {(line) => (
                  <line
                    x1={line.from.x - (contentBbox().min.x || 0)}
                    y1={line.from.y - (contentBbox().min.y || 0)}
                    x2={line.to.x - (contentBbox().min.x || 0)}
                    y2={line.to.y - (contentBbox().min.y || 0)}
                    stroke={line.type === 'input' ? '#10b981' : '#ef4444'}
                    stroke-width={line.pinId === context.nav.activeWiringPin ? 4 : 2}
                    stroke-opacity={line.pinId === context.nav.activeWiringPin ? 0.6 : 0.3}
                    stroke-linecap="round"
                  />
                )}
              </For>
            </svg>
          </Show>

          <For
            each={props.keys()}
            fallback={<div class="text-base-content/65 select-none">No keys to see here</div>}
          >
            {(gkey) => (
              <KeyRenderer
                keyData={gkey}
                parts={context.keyboard.parts}
                isSelected={context.nav.selectedKeys.includes(gkey.key.id)}
                activeEditPart={context.nav.activeEditPart}
                activeWiringPin={context.nav.activeWiringPin}
                wiring={context.keyboard.parts[gkey.part]?.keys[gkey.key.id]}
                wiringType={context.keyboard.parts[gkey.part]?.wiring}
                showWiringPins={(props.editMode?.() === "wiring") && context.nav.activeEditPart === gkey.part}
                onClick={onEachKeyClicked}
              />
            )}
          </For>
          {/* TODO add support for arbitrary extra elements */}
        </div>
      </div>

      {/* Selection rectangle */}
      <Show when={overlay()?.end}>
        {(() => {
          const pos = overlay();
          if (!pos) return null;
          const { start, end } = pos;
          if (!end) return null;

          const screenStart = v2c(start.x, start.y);
          const screenEnd = v2c(end.x, end.y);

          const left = Math.min(screenStart.x, screenEnd.x);
          const top = Math.min(screenStart.y, screenEnd.y);
          const width = Math.abs(screenEnd.x - screenStart.x);
          const height = Math.abs(screenEnd.y - screenStart.y);

          return (
            <div
              class="bg-sky-500/20 border-2 border-sky-500/80 pointer-events-none"
              style={{
                position: 'absolute',
                left: `${left}px`,
                top: `${top}px`,
                width: `${width}px`,
                height: `${height}px`,
                'z-index': 10,
              }}
            />
          );
        })()}
      </Show>

      {/* Title and status */}
      <div class="absolute top-2 left-2 bg-base-200/50 backdrop-blur-sm px-2 py-0.5 select-none rounded-lg text-xs md:text-sm font-medium shadow-md">
        {(() => {
          const mode = activeMode();
          const label = mode === "pan" ? "Pan" : mode === "wiring" ? "Wiring" : "Select";
          return `${props.title} • ${label} • ${(transform().s * 100).toFixed(0)}%`;
        })()}
      </div>

      {/* Tooltip / instructions */}
      <div
        class="absolute bottom-1 left-1 pointer-events-none select-none backdrop-blur-sm bg-base-200/60 rounded p-1 shadow-md text-xs/tight font-mono"
      >
        <Switch>
          <Match when={activeMode() === "wiring"}>
            <div>Click or drag on keys to assign a pin</div>
            <div>Select a pin in the controller panel</div>
          </Match>
          <Match when={activeMode() === "select"}>
            <div>{context.nav.selectedKeys.length} selected</div>
            <div>Drag to box-select keys</div>
            <div>Shift: Add • Alt: Toggle</div>
          </Match>
          <Match when={true}>
            <div>Scroll to zoom in/out</div>
            <div>Drag, pinch to pan and zoom</div>
            <div>Hold Ctrl to temporarily switch modes</div>
          </Match>
        </Switch>
      </div>

      {/* Control buttons (bottom right) */}
      <div
        class="absolute bottom-1 right-1 select-none flex flex-col items-end gap-1 pointer-coarse:gap-2"
        data-controls
      >
        <Show when={context.nav.activeEditPart === null}>
          {/* Edit buttons for moving the keys */}
          <div class="flex flex-col items-center gap-1 pointer-coarse:gap-2 rounded ">
            <div class="flex items-center gap-1 pointer-coarse:gap-2">
              <Button
                title="Move selected keys Up"
                disabled={context.nav.selectedKeys.length === 0}
                class="rounded-sm text-base-600 bg-base-200/60 hover:text-primary cursor-pointer border border-zinc-600/50 hover:border-primary/30 backdrop-blur-sm disabled:text-base-content/20 disabled:cursor-default"

                onMouseDown={moveUpStart}
                onMouseUp={moveUpEnd}
                onMouseLeave={moveUpEnd}

                onTouchStart={moveUpStart}
                onTouchEnd={moveUpEnd}
                onTouchCancel={moveUpEnd}
              >
                <ArrowBigUp aria-hidden class="w-6 h-6" />
              </Button>
            </div>
            <div class="flex items-center gap-1 pointer-coarse:gap-2">
              <Button
                title="Move selected keys Left"
                disabled={context.nav.selectedKeys.length === 0}
                class="rounded-sm text-base-600 bg-base-200/60 hover:text-primary cursor-pointer border border-zinc-600/50 hover:border-primary/30 backdrop-blur-sm  disabled:text-base-content/20 disabled:cursor-default"

                onMouseDown={moveLeftStart}
                onMouseUp={moveLeftEnd}
                onMouseLeave={moveLeftEnd}

                onTouchStart={moveLeftStart}
                onTouchEnd={moveLeftEnd}
                onTouchCancel={moveLeftEnd}
              >
                <ArrowBigUp aria-hidden class="w-6 h-6 -rotate-90" />
              </Button>
              <Button
                title="Move selected keys Down"
                disabled={context.nav.selectedKeys.length === 0}
                class="rounded-sm text-base-600 bg-base-200/60 hover:text-primary cursor-pointer border border-zinc-600/50 hover:border-primary/30 backdrop-blur-sm  disabled:text-base-content/20 disabled:cursor-default"

                onMouseDown={moveDownStart}
                onMouseUp={moveDownEnd}
                onMouseLeave={moveDownEnd}

                onTouchStart={moveDownStart}
                onTouchEnd={moveDownEnd}
                onTouchCancel={moveDownEnd}
              >
                <ArrowBigUp aria-hidden class="w-6 h-6 rotate-180" />
              </Button>
              <Button
                title="Move selected keys Right"
                disabled={context.nav.selectedKeys.length === 0}
                class="rounded-sm text-base-600 bg-base-200/60 hover:text-primary cursor-pointer border border-zinc-600/50 hover:border-primary/30 backdrop-blur-sm  disabled:text-base-content/20 disabled:cursor-default"

                onMouseDown={moveRightStart}
                onMouseUp={moveRightEnd}
                onMouseLeave={moveRightEnd}

                onTouchStart={moveRightStart}
                onTouchEnd={moveRightEnd}
                onTouchCancel={moveRightEnd}
              >
                <ArrowBigUp aria-hidden class="w-6 h-6 rotate-90" />
              </Button>
            </div>
          </div>
        </Show>
        <div class="flex items-center gap-1 pointer-coarse:gap-2 rounded">
          <Button
            aria-label="Toggle Mode"
            aria-description={`Current mode: ${effectiveIsPan() ? "Pan" : (props.editMode?.() === "wiring" ? "Wiring" : "Select")}. Hold Ctrl to temporarily switch modes.`}
            class="rounded-sm text-base-600 bg-base-200/60 hover:text-primary cursor-pointer border border-zinc-600/50 hover:border-primary/30 backdrop-blur-sm"
            title={`Toggle Mode (current: ${effectiveIsPan() ? "Pan" : (props.editMode?.() === "wiring" ? "Wiring" : "Select")}, hold Ctrl to temporarily switch)`}
            onClick={() => setPanMode(!panMode())}
          >
            {effectiveIsPan() ? <Move aria-hidden class="w-6 h-6" /> : <Pencil aria-hidden class="w-6 h-6" />}
          </Button>
          <Button
            aria-label="Zoom In"
            class="rounded-sm text-base-600 bg-base-200/60 hover:text-primary cursor-pointer border border-zinc-600/50 hover:border-primary/30 backdrop-blur-sm"
            title="Zoom In"
            onClick={() => scaleAtOrigin(true, (containerSize.width || 0) / 2, (containerSize.height || 0) / 2)}
          >
            <ZoomIn aria-hidden class="w-6 h-6" />
          </Button>
          <Button
            class="rounded-sm text-base-600 bg-base-200/60 hover:text-primary cursor-pointer border border-zinc-600/50 hover:border-primary/30 backdrop-blur-sm"
            title="Zoom Out"
            onClick={() => scaleAtOrigin(false, (containerSize.width || 0) / 2, (containerSize.height || 0) / 2)}
          >
            <ZoomOut aria-hidden class="w-6 h-6" />
          </Button>
          <Button
            class="rounded-sm text-base-600 bg-base-200/60 hover:text-primary cursor-pointer border border-zinc-600/50 hover:border-primary/30 backdrop-blur-sm disabled:text-base-content/20 disabled:cursor-default"
            title="Reset Zoom"
            disabled={autoZoom()}
            onClick={() => setAutoZoom(true)}
          >
            <RotateCcw aria-hidden class="w-6 h-6" />
          </Button>
        </div>
      </div>
    </div >
  );
}

function repeatTrigger(
  callback: () => void,
  delay: number = 500,
  interval: number = 100
): [
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
  }

  const stop = (e?: Event) => {
    e?.preventDefault();

    setTimer(false);
    cancelDelay?.();
    cancelDelay = null;
  }

  return [start, stop];
}
