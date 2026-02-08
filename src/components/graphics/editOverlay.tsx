/**
 * Layout edit overlay component for the graphics view.
 * 
 * Renders SVG handles and indicators for layout editing:
 * - Move mode: move handles at key centers, resize handles at bottom-right corners
 * - Rotate mode: rotation rings, anchor points, rotation arcs
 */

import { createMemo, For, Show, type Accessor, type VoidComponent } from "solid-js";
import { keyCenter, keyToPolygon, type Point } from "~/lib/geometry";
import { useWizardContext } from "../context";
import type { GraphicsKey } from "./index";
import type { LayoutEditState, RotateSubMode } from "./editState";
import type { GraphicsMode } from "./types";

const KEY_SIZE = 70;

/** Handle size in pixels */
const HANDLE_SIZE = 10;
const HANDLE_HALF = HANDLE_SIZE / 2;

/** Rotation ring radius */
const ROTATION_RING_RADIUS = 55;

/** Common rotation ring additional offset */
const COMMON_ROTATION_RING_OFFSET = 10;

/** Hit area stroke width for rotation ring */
const ROTATION_RING_HIT_AREA_STROKE = 20;

/** Rotation ring stroke width */
const ROTATION_RING_STROKE = 4;

/** Rotation ring opacity */
const ROTATION_RING_OPACITY = 0.8;

/** Rotation arc arrow size */
const ROTATION_ARROW_SIZE = 8;

/** Rotation arc start circle radius */
const ROTATION_ARC_START_CIRCLE_RADIUS = 4;

/** Minimum radius to show rotation arc */
const MIN_ROTATION_ARC_RADIUS = 10;

/** Color constants */
const COLORS = {
  handle: "#3b82f6", // blue-500
  anchor: "#f59e0b", // amber-500
  rotationArc: "#8b5cf6", // violet-500
  origin: "#22c55e", // green-500
  guideLine: "#94a3b8", // slate-400
  ghostOutline: "#94a3b8", // slate-400
};

interface LayoutEditOverlayProps {
  keys: Accessor<GraphicsKey[]>;
  editState: LayoutEditState;
  v2c: (x: number, y: number) => { x: number; y: number };
  contentBbox: () => { min: { x: number; y: number }; width: number; height: number };
}

/**
 * SVG overlay component for layout editing visual feedback.
 */
export const LayoutEditOverlay: VoidComponent<LayoutEditOverlayProps> = (props) => {
  const context = useWizardContext();

  const selectedKeys = createMemo(() => {
    const selectedIds = context.nav.selectedKeys;
    return props.keys().filter(k => selectedIds.includes(k.key.id));
  });

  const shouldShowOverlay = createMemo(() => {
    const mode = props.editState.mode();
    return (mode === "move" || mode === "rotate") && context.nav.selectedKeys.length > 0;
  });

  const mode = () => props.editState.mode();

  return (
    <Show when={shouldShowOverlay()}>
      <svg
        class="absolute inset-0 pointer-events-none overflow-visible"
        style={{ "z-index": 15 }}
      >
        {/* Per-key overlays */}
        <For each={selectedKeys()}>
          {(gkey, index) => (
            <KeyOverlay
              gkey={gkey}
              mode={mode}
              rotateSubMode={props.editState.rotateSubMode}
              v2c={props.v2c}
              contentBbox={props.contentBbox}
              isMultiSelect={selectedKeys().length > 1}
              keyIndex={index()}
            />
          )}
        </For>

        {/* Common center rotation ring for multi-select in rotate mode */}
        <Show when={mode() === "rotate" && props.editState.rotateSubMode() === "center" && selectedKeys().length > 1}>
          <CommonCenterRotationRing
            keys={selectedKeys}
            v2c={props.v2c}
            contentBbox={props.contentBbox}
          />
        </Show>
      </svg>
    </Show>
  );
};

/**
 * Common center rotation ring for multiple selected keys
 */
const CommonCenterRotationRing: VoidComponent<{
  keys: Accessor<GraphicsKey[]>;
  v2c: (x: number, y: number) => { x: number; y: number };
  contentBbox: () => { min: { x: number; y: number }; width: number; height: number };
}> = (props) => {
  const commonCenter = createMemo(() => {
    const keys = props.keys();
    if (keys.length === 0) return null;
    
    let sumX = 0, sumY = 0;
    for (const k of keys) {
      const center = keyCenter(k);
      sumX += center.x;
      sumY += center.y;
    }
    return { x: sumX / keys.length, y: sumY / keys.length };
  });

  const screenCenter = () => {
    const center = commonCenter();
    if (!center) return { x: 0, y: 0 };
    const bbox = props.contentBbox();
    return props.v2c(center.x - bbox.min.x - bbox.width / 2, center.y - bbox.min.y - bbox.height / 2);
  };

  return (
    <Show when={commonCenter()}>
      <g>
        {/* Invisible hit area */}
        <circle
          cx={screenCenter().x}
          cy={screenCenter().y}
          r={ROTATION_RING_RADIUS + COMMON_ROTATION_RING_OFFSET}
          fill="none"
          stroke="transparent"
          stroke-width={ROTATION_RING_HIT_AREA_STROKE}
          style={{ "pointer-events": "auto" }}
          class="cursor-grab"
          data-handle="rotate-center-common"
        />
        {/* Visible ring */}
        <circle
          cx={screenCenter().x}
          cy={screenCenter().y}
          r={ROTATION_RING_RADIUS + COMMON_ROTATION_RING_OFFSET}
          fill="none"
          stroke={COLORS.rotationArc}
          stroke-width={ROTATION_RING_STROKE}
          stroke-dasharray="6,4"
          opacity={ROTATION_RING_OPACITY}
          style={{ "pointer-events": "none" }}
        />
        {/* Center dot */}
        <circle
          cx={screenCenter().x}
          cy={screenCenter().y}
          r={6}
          fill={COLORS.rotationArc}
          stroke="white"
          stroke-width={2}
        />
        {/* Direction arrow */}
        <path
          d={`M ${screenCenter().x + ROTATION_RING_RADIUS + COMMON_ROTATION_RING_OFFSET} ${screenCenter().y}
              L ${screenCenter().x + ROTATION_RING_RADIUS + 5} ${screenCenter().y - 5}
              M ${screenCenter().x + ROTATION_RING_RADIUS + COMMON_ROTATION_RING_OFFSET} ${screenCenter().y}
              L ${screenCenter().x + ROTATION_RING_RADIUS + 5} ${screenCenter().y + 5}`}
          stroke={COLORS.rotationArc}
          stroke-width={2}
          fill="none"
        />
        <text
          x={screenCenter().x}
          y={screenCenter().y - ROTATION_RING_RADIUS - 15}
          font-size="9"
          fill={COLORS.rotationArc}
          text-anchor="middle"
          class="select-none font-mono"
        >
          common center
        </text>
      </g>
    </Show>
  );
};

/**
 * Per-key overlay showing handles based on current mode
 */
const KeyOverlay: VoidComponent<{
  gkey: GraphicsKey;
  mode: Accessor<GraphicsMode>;
  rotateSubMode: Accessor<RotateSubMode>;
  v2c: (x: number, y: number) => { x: number; y: number };
  contentBbox: () => { min: { x: number; y: number }; width: number; height: number };
  isMultiSelect?: boolean;
  keyIndex: number;
}> = (props) => {
  const screenCorners = createMemo(() => {
    const polygon = keyToPolygon(props.gkey);
    const bbox = props.contentBbox();
    return polygon.map(p => props.v2c(p.x - bbox.min.x - bbox.width / 2, p.y - bbox.min.y - bbox.height / 2));
  });

  const screenCenter = createMemo(() => {
    const center = keyCenter(props.gkey);
    const bbox = props.contentBbox();
    return props.v2c(center.x - bbox.min.x - bbox.width / 2, center.y - bbox.min.y - bbox.height / 2);
  });

  const screenOrigin = createMemo(() => {
    const bbox = props.contentBbox();
    const originX = props.gkey.x * KEY_SIZE;
    const originY = props.gkey.y * KEY_SIZE;
    return props.v2c(originX - bbox.min.x - bbox.width / 2, originY - bbox.min.y - bbox.height / 2);
  });

  const screenRotationAnchor = createMemo(() => {
    const k = props.gkey.key;
    if (k.rx === 0 && k.ry === 0) return null;

    const bbox = props.contentBbox();
    const anchorX = k.rx * KEY_SIZE;
    const anchorY = k.ry * KEY_SIZE;
    return props.v2c(anchorX - bbox.min.x - bbox.width / 2, anchorY - bbox.min.y - bbox.height / 2);
  });

  const rotationRingCenter = createMemo(() => {
    const k = props.gkey.key;
    const bbox = props.contentBbox();

    if (k.rx !== 0 || k.ry !== 0) {
      return props.v2c(k.rx * KEY_SIZE - bbox.min.x - bbox.width / 2, k.ry * KEY_SIZE - bbox.min.y - bbox.height / 2);
    }
    const center = keyCenter(props.gkey);
    return props.v2c(center.x - bbox.min.x - bbox.width / 2, center.y - bbox.min.y - bbox.height / 2);
  });

  // Ghost outline for rotation visualization
  const originalKeyOutline = createMemo(() => {
    const k = props.gkey.key;
    if (props.mode() !== "rotate" || k.r === 0) return null;

    const x = k.x * KEY_SIZE;
    const y = k.y * KEY_SIZE;
    const w = k.w * KEY_SIZE;
    const h = k.h * KEY_SIZE;

    const corners = [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ];

    const bbox = props.contentBbox();
    return corners.map(p => props.v2c(p.x - bbox.min.x - bbox.width / 2, p.y - bbox.min.y - bbox.height / 2));
  });

  return (
    <g>
      {/* Ghost outline showing original key position */}
      <Show when={originalKeyOutline()}>
        {(outline) => {
          const points = () => outline().map(p => `${p.x},${p.y}`).join(" ");
          return (
            <g>
              <polygon
                points={points()}
                fill="none"
                stroke={COLORS.ghostOutline}
                stroke-width={1.5}
                stroke-dasharray="4,3"
                opacity={0.6}
              />
              <text
                x={outline()[0].x + 4}
                y={outline()[0].y + 14}
                font-size="11"
                fill={COLORS.ghostOutline}
                class="select-none font-mono font-semibold"
              >
                {props.keyIndex}
              </text>
            </g>
          );
        }}
      </Show>

      {/* Move mode handles */}
      <Show when={props.mode() === "move"}>
        {/* Move handle at center */}
        <circle
          cx={screenCenter().x}
          cy={screenCenter().y}
          r={10}
          fill={COLORS.handle}
          stroke="white"
          stroke-width={1.5}
          class="cursor-move"
          style={{ "pointer-events": "auto" }}
          data-handle="move"
          data-key-id={props.gkey.key.id}
        />
        <g stroke="white" stroke-width={2} fill="none" style={{ "pointer-events": "none" }}>
          <line x1={screenCenter().x} y1={screenCenter().y - 3} x2={screenCenter().x} y2={screenCenter().y - 6} />
          <line x1={screenCenter().x} y1={screenCenter().y + 3} x2={screenCenter().x} y2={screenCenter().y + 6} />
          <line x1={screenCenter().x - 3} y1={screenCenter().y} x2={screenCenter().x - 6} y2={screenCenter().y} />
          <line x1={screenCenter().x + 3} y1={screenCenter().y} x2={screenCenter().x + 6} y2={screenCenter().y} />
        </g>

        {/* Resize handle at bottom-right corner */}
        {(() => {
          const corner = () => screenCorners()[2];
          return (
            <rect
              x={corner().x - HANDLE_HALF}
              y={corner().y - HANDLE_HALF}
              width={HANDLE_SIZE}
              height={HANDLE_SIZE}
              fill={COLORS.handle}
              stroke="white"
              stroke-width={1}
              rx={1}
              class="cursor-nwse-resize"
              style={{ "pointer-events": "auto" }}
              data-handle="resize"
              data-key-id={props.gkey.key.id}
            />
          );
        })()}
      </Show>

      {/* Rotate mode handles */}
      <Show when={props.mode() === "rotate"}>
        {/* Origin point indicator */}
        <circle
          cx={screenOrigin().x}
          cy={screenOrigin().y}
          r={4}
          fill={COLORS.origin}
          stroke="white"
          stroke-width={1.5}
        />
        <text
          x={screenOrigin().x + 8}
          y={screenOrigin().y + 4}
          font-size="10"
          fill={COLORS.origin}
          class="select-none font-mono"
        >
          x,y
        </text>

        {/* Center rotation ring (single key only) */}
        <Show when={props.rotateSubMode() === "center" && !props.isMultiSelect}>
          <circle
            cx={rotationRingCenter().x}
            cy={rotationRingCenter().y}
            r={ROTATION_RING_RADIUS}
            fill="none"
            stroke="transparent"
            stroke-width={ROTATION_RING_HIT_AREA_STROKE}
            style={{ "pointer-events": "auto" }}
            class="cursor-grab"
            data-handle="rotate-center"
            data-key-id={props.gkey.key.id}
          />
          <circle
            cx={rotationRingCenter().x}
            cy={rotationRingCenter().y}
            r={ROTATION_RING_RADIUS}
            fill="none"
            stroke={COLORS.rotationArc}
            stroke-width={ROTATION_RING_STROKE}
            stroke-dasharray="4,4"
            opacity={ROTATION_RING_OPACITY}
            style={{ "pointer-events": "none" }}
          />
          <circle
            cx={rotationRingCenter().x}
            cy={rotationRingCenter().y}
            r={5}
            fill={COLORS.rotationArc}
            stroke="white"
            stroke-width={1.5}
          />
          <path
            d={`M ${rotationRingCenter().x + ROTATION_RING_RADIUS} ${rotationRingCenter().y}
                L ${rotationRingCenter().x + ROTATION_RING_RADIUS - 5} ${rotationRingCenter().y - 5}
                M ${rotationRingCenter().x + ROTATION_RING_RADIUS} ${rotationRingCenter().y}
                L ${rotationRingCenter().x + ROTATION_RING_RADIUS - 5} ${rotationRingCenter().y + 5}`}
            stroke={COLORS.rotationArc}
            stroke-width={2}
            fill="none"
          />
        </Show>

        {/* Rotation anchor point (if set) */}
        <Show when={screenRotationAnchor()}>
          {(anchor) => (
            <g>
              <line
                x1={screenCenter().x}
                y1={screenCenter().y}
                x2={anchor().x}
                y2={anchor().y}
                stroke={COLORS.guideLine}
                stroke-width={1}
                stroke-dasharray="3,3"
              />
              <circle
                cx={anchor().x}
                cy={anchor().y}
                r={8}
                fill={COLORS.anchor}
                stroke="white"
                stroke-width={1.5}
                style={{ "pointer-events": "auto" }}
                class="cursor-move"
                data-handle="rotate-anchor"
                data-key-id={props.gkey.key.id}
              />
              <text
                x={anchor().x + 12}
                y={anchor().y + 4}
                font-size="10"
                fill={COLORS.anchor}
                class="select-none font-mono"
              >
                rx,ry
              </text>
              <Show when={props.gkey.key.r !== 0}>
                <RotationArc
                  center={anchor()}
                  startPoint={screenCenter()}
                  angle={props.gkey.key.r}
                />
              </Show>
            </g>
          )}
        </Show>
      </Show>
    </g>
  );
};

/**
 * Normalize angle to shortest path (-180 to 180)
 * 
 * Formula: ((angle % 360) + 540) % 360 - 180
 * - First % 360 brings angle to -360..360 range
 * - Adding 540 (180 + 360) shifts to 180..900 range for positive values
 * - Second % 360 brings to 0..360 range
 * - Subtracting 180 shifts to -180..180 range
 */
function normalizeToShortestAngle(angle: number): number {
  return ((angle % 360) + 540) % 360 - 180;
}

/**
 * Rotation arc indicator showing angle and direction
 */
const RotationArc: VoidComponent<{
  center: Point;
  startPoint: Point;
  angle: number;
}> = (props) => {
  const displayAngle = () => normalizeToShortestAngle(props.angle);

  const arcPath = createMemo(() => {
    const { x: cx, y: cy } = props.center;
    const { x: sx, y: sy } = props.startPoint;

    const dx = sx - cx;
    const dy = sy - cy;
    const radius = Math.sqrt(dx * dx + dy * dy);

    if (radius < MIN_ROTATION_ARC_RADIUS) return "";

    const normalizedAngle = displayAngle();
    const currentAngle = Math.atan2(dy, dx);
    const originalAngle = currentAngle - (normalizedAngle * Math.PI / 180);

    const startX = cx + radius * Math.cos(originalAngle);
    const startY = cy + radius * Math.sin(originalAngle);
    const endX = cx + radius * Math.cos(currentAngle);
    const endY = cy + radius * Math.sin(currentAngle);

    const largeArc = 0;
    const sweep = normalizedAngle > 0 ? 1 : 0;

    return `M ${startX} ${startY} A ${radius} ${radius} 0 ${largeArc} ${sweep} ${endX} ${endY}`;
  });

  const arrowPath = createMemo(() => {
    const { x: cx, y: cy } = props.center;
    const { x: sx, y: sy } = props.startPoint;

    const dx = sx - cx;
    const dy = sy - cy;
    const radius = Math.sqrt(dx * dx + dy * dy);

    if (radius < MIN_ROTATION_ARC_RADIUS) return "";

    const normalizedAngle = displayAngle();
    const currentAngle = Math.atan2(dy, dx);
    const endX = cx + radius * Math.cos(currentAngle);
    const endY = cy + radius * Math.sin(currentAngle);

    const tangentAngle = currentAngle + (normalizedAngle > 0 ? -Math.PI / 2 : Math.PI / 2);
    const arrowLen = ROTATION_ARROW_SIZE;

    const ax1 = endX + arrowLen * Math.cos(tangentAngle - 0.5);
    const ay1 = endY + arrowLen * Math.sin(tangentAngle - 0.5);
    const ax2 = endX + arrowLen * Math.cos(tangentAngle + 0.5);
    const ay2 = endY + arrowLen * Math.sin(tangentAngle + 0.5);

    return `M ${ax1} ${ay1} L ${endX} ${endY} L ${ax2} ${ay2}`;
  });

  const arcStartPoint = createMemo(() => {
    const { x: cx, y: cy } = props.center;
    const { x: sx, y: sy } = props.startPoint;

    const dx = sx - cx;
    const dy = sy - cy;
    const radius = Math.sqrt(dx * dx + dy * dy);

    if (radius < MIN_ROTATION_ARC_RADIUS) return null;

    const normalizedAngle = displayAngle();
    const currentAngle = Math.atan2(dy, dx);
    const originalAngle = currentAngle - (normalizedAngle * Math.PI / 180);

    return {
      x: cx + radius * Math.cos(originalAngle),
      y: cy + radius * Math.sin(originalAngle),
    };
  });

  return (
    <Show when={arcPath()}>
      <g>
        <path
          d={arcPath()}
          fill="none"
          stroke={COLORS.rotationArc}
          stroke-width={2}
          stroke-dasharray="4,2"
        />
        <Show when={arcStartPoint()}>
          {(startPoint) => (
            <circle
              cx={startPoint().x}
              cy={startPoint().y}
              r={ROTATION_ARC_START_CIRCLE_RADIUS}
              fill={COLORS.rotationArc}
            />
          )}
        </Show>
        <path
          d={arrowPath()}
          fill="none"
          stroke={COLORS.rotationArc}
          stroke-width={2}
        />
        <text
          x={props.center.x}
          y={props.center.y - 30}
          font-size="11"
          fill={COLORS.rotationArc}
          text-anchor="middle"
          class="select-none font-mono font-bold"
        >
          {props.angle.toFixed(1)}°
        </text>
      </g>
    </Show>
  );
};
