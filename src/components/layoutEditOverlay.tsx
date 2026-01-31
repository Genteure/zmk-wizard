import { createMemo, For, Show, type Accessor, type VoidComponent } from "solid-js";
import { getKeysBoundingBox, keyCenter, keyToPolygon, type Point } from "~/lib/geometry";
import { useWizardContext } from "./context";
import type { GraphicsKey } from "./graphics";
import type { LayoutEditState, LayoutEditTool, RotateMode } from "./layoutEditing";

const KEY_SIZE = 70; // pixels per unit

/** Handle size in pixels */
const HANDLE_SIZE = 10;
const HANDLE_HALF = HANDLE_SIZE / 2;

/** Minimum radius in pixels to show rotation arc (avoid cluttered display for small rotations) */
const MIN_ROTATION_ARC_RADIUS = 10;

/** Color constants */
const COLORS = {
  handle: "#3b82f6", // blue-500
  handleHover: "#2563eb", // blue-600
  anchor: "#f59e0b", // amber-500
  rotationArc: "#8b5cf6", // violet-500
  origin: "#22c55e", // green-500
  guideLine: "#94a3b8", // slate-400
};

interface LayoutEditOverlayProps {
  /** Selected keys from the layout */
  keys: Accessor<GraphicsKey[]>;
  /** Current layout editing state */
  editState: LayoutEditState;
  /** Transform coordinates from content to screen */
  v2c: (x: number, y: number) => { x: number; y: number };
  /** Content bounding box */
  contentBbox: () => { min: { x: number; y: number }; width: number; height: number };
}

/**
 * SVG overlay component for layout editing visual feedback.
 * Shows handles, anchor points, and rotation indicators for selected keys.
 */
export const LayoutEditOverlay: VoidComponent<LayoutEditOverlayProps> = (props) => {
  const context = useWizardContext();
  
  // Get selected keys
  const selectedKeys = createMemo(() => {
    const selectedIds = context.nav.selectedKeys;
    return props.keys().filter(k => selectedIds.includes(k.key.id));
  });

  // Get bounding box of selected keys in content coordinates
  const selectionBbox = createMemo(() => {
    const keys = selectedKeys();
    if (keys.length === 0) return null;
    return getKeysBoundingBox(keys);
  });

  // Check if we should show the overlay based on tool and selection
  const shouldShowOverlay = createMemo(() => {
    const tool = props.editState.tool();
    return tool !== "select" && context.nav.selectedKeys.length > 0;
  });

  // Calculate anchor point for rotation (in content coordinates)
  const rotationAnchor = createMemo((): Point | null => {
    if (props.editState.tool() !== "rotate") return null;
    
    const keys = selectedKeys();
    if (keys.length === 0) return null;

    const mode = props.editState.rotateMode();
    
    if (mode === "center") {
      // Each key rotates around its own center - no single anchor
      return null;
    }

    // Anchor mode - use common anchor point
    if (keys.length === 1) {
      const k = keys[0].key;
      // Use existing anchor if set (rx,ry != 0), otherwise key center
      if (k.rx !== 0 || k.ry !== 0) {
        return { x: k.rx * KEY_SIZE, y: k.ry * KEY_SIZE };
      }
      return keyCenter(keys[0]);
    }

    // Multiple keys - use center of selection
    const bbox = selectionBbox();
    if (!bbox) return null;
    return {
      x: (bbox.min.x + bbox.max.x) / 2,
      y: (bbox.min.y + bbox.max.y) / 2,
    };
  });

  return (
    <Show when={shouldShowOverlay()}>
      <svg
        class="absolute inset-0 pointer-events-none overflow-visible"
        style={{ "z-index": 15 }}
      >
        {/* Per-key overlays */}
        <For each={selectedKeys()}>
          {(gkey) => (
            <KeyOverlay
              gkey={gkey}
              tool={props.editState.tool}
              rotateMode={props.editState.rotateMode}
              v2c={props.v2c}
              contentBbox={props.contentBbox}
            />
          )}
        </For>

        {/* Rotation anchor point (for anchor mode with single point) */}
        <Show when={rotationAnchor()}>
          {(anchor) => {
            const screenPos = () => {
              const a = anchor();
              const bbox = props.contentBbox();
              return props.v2c(a.x - bbox.min.x - bbox.width / 2, a.y - bbox.min.y - bbox.height / 2);
            };
            return (
              <g>
                {/* Anchor point marker */}
                <circle
                  cx={screenPos().x}
                  cy={screenPos().y}
                  r={6}
                  fill={COLORS.anchor}
                  stroke="white"
                  stroke-width={2}
                  class="drop-shadow"
                />
                {/* Crosshair */}
                <line
                  x1={screenPos().x - 10}
                  y1={screenPos().y}
                  x2={screenPos().x + 10}
                  y2={screenPos().y}
                  stroke={COLORS.anchor}
                  stroke-width={1.5}
                  stroke-dasharray="2,2"
                />
                <line
                  x1={screenPos().x}
                  y1={screenPos().y - 10}
                  x2={screenPos().x}
                  y2={screenPos().y + 10}
                  stroke={COLORS.anchor}
                  stroke-width={1.5}
                  stroke-dasharray="2,2"
                />
              </g>
            );
          }}
        </Show>
      </svg>
    </Show>
  );
};

/**
 * Overlay for a single key showing handles based on current tool
 */
const KeyOverlay: VoidComponent<{
  gkey: GraphicsKey;
  tool: Accessor<LayoutEditTool>;
  rotateMode: Accessor<RotateMode>;
  v2c: (x: number, y: number) => { x: number; y: number };
  contentBbox: () => { min: { x: number; y: number }; width: number; height: number };
}> = (props) => {
  // Get the key's polygon corners in screen coordinates
  const screenCorners = createMemo(() => {
    const polygon = keyToPolygon(props.gkey);
    const bbox = props.contentBbox();
    return polygon.map(p => props.v2c(p.x - bbox.min.x - bbox.width / 2, p.y - bbox.min.y - bbox.height / 2));
  });

  // Get key center in screen coordinates
  const screenCenter = createMemo(() => {
    const center = keyCenter(props.gkey);
    const bbox = props.contentBbox();
    return props.v2c(center.x - bbox.min.x - bbox.width / 2, center.y - bbox.min.y - bbox.height / 2);
  });

  // Get key origin (x,y) in screen coordinates
  const screenOrigin = createMemo(() => {
    const bbox = props.contentBbox();
    const originX = props.gkey.x * KEY_SIZE;
    const originY = props.gkey.y * KEY_SIZE;
    return props.v2c(originX - bbox.min.x - bbox.width / 2, originY - bbox.min.y - bbox.height / 2);
  });

  // Get rotation anchor (rx,ry) in screen coordinates
  const screenRotationAnchor = createMemo(() => {
    const k = props.gkey.key;
    if (k.rx === 0 && k.ry === 0) return null;
    
    const bbox = props.contentBbox();
    const anchorX = k.rx * KEY_SIZE;
    const anchorY = k.ry * KEY_SIZE;
    return props.v2c(anchorX - bbox.min.x - bbox.width / 2, anchorY - bbox.min.y - bbox.height / 2);
  });

  return (
    <g>
      {/* Resize handle (show on resize tool) - only bottom-right corner */}
      <Show when={props.tool() === "resize"}>
        {(() => {
          // Bottom-right corner is index 2 in the polygon (after rotation)
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

      {/* Rotation handle (show on rotate tool) */}
      <Show when={props.tool() === "rotate"}>
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

        {/* Center point (for center rotation mode) */}
        <Show when={props.rotateMode() === "center"}>
          <circle
            cx={screenCenter().x}
            cy={screenCenter().y}
            r={5}
            fill={COLORS.anchor}
            stroke="white"
            stroke-width={1.5}
            style={{ "pointer-events": "auto" }}
            data-handle="rotate-center"
            data-key-id={props.gkey.key.id}
          />
          {/* Rotation indicator circle - draggable for rotation */}
          <circle
            cx={screenCenter().x}
            cy={screenCenter().y}
            r={25}
            fill="none"
            stroke={COLORS.rotationArc}
            stroke-width={8}
            stroke-dasharray="4,4"
            opacity={0.3}
            style={{ "pointer-events": "auto" }}
            data-handle="rotate-center"
            data-key-id={props.gkey.key.id}
          />
          {/* Rotation direction arrow */}
          <path
            d={`M ${screenCenter().x + 25} ${screenCenter().y} 
                L ${screenCenter().x + 20} ${screenCenter().y - 5}
                M ${screenCenter().x + 25} ${screenCenter().y}
                L ${screenCenter().x + 20} ${screenCenter().y + 5}`}
            stroke={COLORS.rotationArc}
            stroke-width={2}
            fill="none"
          />
        </Show>

        {/* Rotation anchor point (if rx,ry is set) */}
        <Show when={screenRotationAnchor()}>
          {(anchor) => (
            <g>
              {/* Line from origin to anchor */}
              <line
                x1={screenOrigin().x}
                y1={screenOrigin().y}
                x2={anchor().x}
                y2={anchor().y}
                stroke={COLORS.guideLine}
                stroke-width={1}
                stroke-dasharray="3,3"
              />
              {/* Anchor point - draggable in anchor mode */}
              <circle
                cx={anchor().x}
                cy={anchor().y}
                r={8}
                fill={COLORS.anchor}
                stroke="white"
                stroke-width={1.5}
                style={{ "pointer-events": "auto" }}
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
              {/* Rotation angle arc */}
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

      {/* Move handle (show on move tool) - simple crosshair at center */}
      <Show when={props.tool() === "move"}>
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
        {/* Move arrows */}
        <g stroke="white" stroke-width={2} fill="none" style={{ "pointer-events": "none" }}>
          <line x1={screenCenter().x} y1={screenCenter().y - 3} x2={screenCenter().x} y2={screenCenter().y - 6} />
          <line x1={screenCenter().x} y1={screenCenter().y + 3} x2={screenCenter().x} y2={screenCenter().y + 6} />
          <line x1={screenCenter().x - 3} y1={screenCenter().y} x2={screenCenter().x - 6} y2={screenCenter().y} />
          <line x1={screenCenter().x + 3} y1={screenCenter().y} x2={screenCenter().x + 6} y2={screenCenter().y} />
        </g>
      </Show>
    </g>
  );
};

/**
 * Rotation arc indicator showing angle and direction
 */
const RotationArc: VoidComponent<{
  center: Point;
  startPoint: Point;
  angle: number;
}> = (props) => {
  const arcPath = createMemo(() => {
    const { x: cx, y: cy } = props.center;
    const { x: sx, y: sy } = props.startPoint;
    
    // Calculate radius
    const dx = sx - cx;
    const dy = sy - cy;
    const radius = Math.sqrt(dx * dx + dy * dy);
    
    if (radius < MIN_ROTATION_ARC_RADIUS) return ""; // Too small to show
    
    // Calculate start and end angles
    const startAngle = Math.atan2(dy, dx);
    const endAngle = startAngle + (props.angle * Math.PI / 180);
    
    // Arc parameters
    const startX = cx + radius * Math.cos(startAngle);
    const startY = cy + radius * Math.sin(startAngle);
    const endX = cx + radius * Math.cos(endAngle);
    const endY = cy + radius * Math.sin(endAngle);
    
    const largeArc = Math.abs(props.angle) > 180 ? 1 : 0;
    const sweep = props.angle > 0 ? 1 : 0;
    
    return `M ${startX} ${startY} A ${radius} ${radius} 0 ${largeArc} ${sweep} ${endX} ${endY}`;
  });

  const arrowPath = createMemo(() => {
    const { x: cx, y: cy } = props.center;
    const { x: sx, y: sy } = props.startPoint;
    
    const dx = sx - cx;
    const dy = sy - cy;
    const radius = Math.sqrt(dx * dx + dy * dy);
    
    if (radius < MIN_ROTATION_ARC_RADIUS) return "";
    
    const startAngle = Math.atan2(dy, dx);
    const endAngle = startAngle + (props.angle * Math.PI / 180);
    
    const endX = cx + radius * Math.cos(endAngle);
    const endY = cy + radius * Math.sin(endAngle);
    
    // Arrow direction perpendicular to radius at end point
    const arrowAngle = endAngle + (props.angle > 0 ? Math.PI / 2 : -Math.PI / 2);
    const arrowLen = 6;
    
    const ax1 = endX + arrowLen * Math.cos(arrowAngle - 0.5);
    const ay1 = endY + arrowLen * Math.sin(arrowAngle - 0.5);
    const ax2 = endX + arrowLen * Math.cos(arrowAngle + 0.5);
    const ay2 = endY + arrowLen * Math.sin(arrowAngle + 0.5);
    
    return `M ${ax1} ${ay1} L ${endX} ${endY} L ${ax2} ${ay2}`;
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
        <path
          d={arrowPath()}
          fill="none"
          stroke={COLORS.rotationArc}
          stroke-width={2}
        />
        {/* Angle label */}
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
