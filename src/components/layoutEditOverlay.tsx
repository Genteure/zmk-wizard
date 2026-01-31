import { createMemo, For, Show, type Accessor, type VoidComponent } from "solid-js";
import { getKeysBoundingBox, keyCenter, keyToPolygon, type Point } from "~/lib/geometry";
import { useWizardContext } from "./context";
import type { GraphicsKey } from "./graphics";
import type { LayoutEditState, LayoutEditTool, RotateMode } from "./layoutEditing";

const KEY_SIZE = 70; // pixels per unit

/** Handle size in pixels */
const HANDLE_SIZE = 10;
const HANDLE_HALF = HANDLE_SIZE / 2;

/** Rotation ring radius for center rotation mode */
const ROTATION_RING_RADIUS = 35;

/** Additional radius for common center rotation ring (multi-select) */
const COMMON_ROTATION_RING_OFFSET = 10;

/** Arrow head offset for rotation direction indicator */
const ROTATION_ARROW_OFFSET = 5;

/** Minimum radius in pixels to show rotation arc (avoid cluttered display for small rotations) */
const MIN_ROTATION_ARC_RADIUS = 10;

/** Rotation indicator stroke width for draggable rotation ring (visual) */
const ROTATION_INDICATOR_STROKE = 8;

/** Hit area stroke width for rotation ring (larger than visual for easier clicking) */
const ROTATION_RING_HIT_AREA_STROKE = 20;

/** Color constants */
const COLORS = {
  handle: "#3b82f6", // blue-500
  handleHover: "#2563eb", // blue-600
  anchor: "#f59e0b", // amber-500
  rotationArc: "#8b5cf6", // violet-500
  origin: "#22c55e", // green-500
  guideLine: "#94a3b8", // slate-400
  ghostOutline: "#94a3b8", // slate-400 - for original position outline
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
          {(gkey, index) => (
            <KeyOverlay
              gkey={gkey}
              tool={props.editState.tool}
              rotateMode={props.editState.rotateMode}
              v2c={props.v2c}
              contentBbox={props.contentBbox}
              isMultiSelect={selectedKeys().length > 1}
              keyIndex={index()}
            />
          )}
        </For>

        {/* Common center rotation ring for multi-select in center mode */}
        <Show when={props.editState.tool() === "rotate" && props.editState.rotateMode() === "center" && selectedKeys().length > 1}>
          {(() => {
            // Calculate common center of all selected keys
            const commonCenter = createMemo(() => {
              const keys = selectedKeys();
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
                  {/* Invisible hit area for easier clicking */}
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
                  {/* Visible common rotation ring */}
                  <circle
                    cx={screenCenter().x}
                    cy={screenCenter().y}
                    r={ROTATION_RING_RADIUS + COMMON_ROTATION_RING_OFFSET}
                    fill="none"
                    stroke={COLORS.rotationArc}
                    stroke-width={ROTATION_INDICATOR_STROKE}
                    stroke-dasharray="6,4"
                    opacity={0.4}
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
                  {/* Rotation direction indicator arrow */}
                  <path
                    d={`M ${screenCenter().x + ROTATION_RING_RADIUS + COMMON_ROTATION_RING_OFFSET} ${screenCenter().y} 
                        L ${screenCenter().x + ROTATION_RING_RADIUS + ROTATION_ARROW_OFFSET} ${screenCenter().y - ROTATION_ARROW_OFFSET}
                        M ${screenCenter().x + ROTATION_RING_RADIUS + COMMON_ROTATION_RING_OFFSET} ${screenCenter().y}
                        L ${screenCenter().x + ROTATION_RING_RADIUS + ROTATION_ARROW_OFFSET} ${screenCenter().y + ROTATION_ARROW_OFFSET}`}
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
          })()}
        </Show>

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
  isMultiSelect?: boolean;
  /** Key index for display in ghost outline */
  keyIndex: number;
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

  // Get rotation ring center for center mode: use rotation anchor (rx,ry) if set, otherwise key center
  // ZMK data model: rx=0,ry=0 means "use x,y as rotation origin" (no explicit origin set)
  const rotationRingCenter = createMemo(() => {
    const k = props.gkey.key;
    const bbox = props.contentBbox();
    
    if (k.rx !== 0 || k.ry !== 0) {
      // Use rotation anchor if explicitly set (non-zero)
      return props.v2c(k.rx * KEY_SIZE - bbox.min.x - bbox.width / 2, k.ry * KEY_SIZE - bbox.min.y - bbox.height / 2);
    }
    // Otherwise use key center (rx,ry not set means use x,y as origin)
    const center = keyCenter(props.gkey);
    return props.v2c(center.x - bbox.min.x - bbox.width / 2, center.y - bbox.min.y - bbox.height / 2);
  });

  // Calculate original (unrotated) key outline for rotation visualization
  const originalKeyOutline = createMemo(() => {
    const k = props.gkey.key;
    if (props.tool() !== "rotate" || k.r === 0) return null;
    
    // Get the key's unrotated corners (at x,y position, before rotation)
    const x = k.x * KEY_SIZE;
    const y = k.y * KEY_SIZE;
    const w = k.w * KEY_SIZE;
    const h = k.h * KEY_SIZE;
    
    // These are the corners before rotation
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
      {/* Ghost outline showing original (unrotated) key position */}
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
              {/* Key index label at original position */}
              <text
                x={outline()[0].x + 4}
                y={outline()[0].y + 14}
                font-size="11"
                fill={COLORS.ghostOutline}
                class="select-none font-mono font-semibold"
              >
                {props.gkey.key.id}
              </text>
            </g>
          );
        }}
      </Show>

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

        {/* Center point with rotation ring (for center rotation mode - single key only) */}
        <Show when={props.rotateMode() === "center" && !props.isMultiSelect}>
          {/* Invisible hit area for easier clicking */}
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
          {/* Visible rotation ring */}
          <circle
            cx={rotationRingCenter().x}
            cy={rotationRingCenter().y}
            r={ROTATION_RING_RADIUS}
            fill="none"
            stroke={COLORS.rotationArc}
            stroke-width={ROTATION_INDICATOR_STROKE}
            stroke-dasharray="4,4"
            opacity={0.4}
            style={{ "pointer-events": "none" }}
          />
          {/* Center dot */}
          <circle
            cx={rotationRingCenter().x}
            cy={rotationRingCenter().y}
            r={5}
            fill={COLORS.rotationArc}
            stroke="white"
            stroke-width={1.5}
          />
          {/* Rotation direction arrow on the ring */}
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

        {/* Rotation anchor point (if rx,ry is set) */}
        <Show when={screenRotationAnchor()}>
          {(anchor) => (
            <g>
              {/* Line from key center to anchor (more intuitive than x,y to anchor) */}
              <line
                x1={screenCenter().x}
                y1={screenCenter().y}
                x2={anchor().x}
                y2={anchor().y}
                stroke={COLORS.guideLine}
                stroke-width={1}
                stroke-dasharray="3,3"
              />
              {/* Anchor point - draggable in both anchor and center modes */}
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
 * Normalize angle to the shortest path (-180 to 180)
 * e.g., 270° -> -90°, -270° -> 90°
 */
function normalizeToShortestAngle(angle: number): number {
  // Normalize to -180 to 180 range
  let normalized = ((angle % 360) + 540) % 360 - 180;
  return normalized;
}

/**
 * Rotation arc indicator showing angle and direction
 * The arc shows the direction from original position to current rotated position.
 * For angles > 180°, the arc takes the short way (e.g., 270° shows as -90°)
 */
const RotationArc: VoidComponent<{
  center: Point;
  startPoint: Point;
  angle: number;
}> = (props) => {
  // Normalize angle to take the short way around for >180°
  const displayAngle = () => normalizeToShortestAngle(props.angle);

  const arcPath = createMemo(() => {
    const { x: cx, y: cy } = props.center;
    const { x: sx, y: sy } = props.startPoint;
    
    // Calculate radius
    const dx = sx - cx;
    const dy = sy - cy;
    const radius = Math.sqrt(dx * dx + dy * dy);
    
    if (radius < MIN_ROTATION_ARC_RADIUS) return ""; // Too small to show
    
    const normalizedAngle = displayAngle();
    
    // The arc shows the rotation path from the ORIGINAL position to the CURRENT position.
    // - currentAngle: where the key center is now (after rotation)
    // - originalAngle: where the key center was before rotation (computed by subtracting the rotation angle)
    // The arc starts at originalAngle and ends at currentAngle, showing the rotation direction.
    const currentAngle = Math.atan2(dy, dx);
    const originalAngle = currentAngle - (normalizedAngle * Math.PI / 180);
    
    // Arc parameters - start from original position, end at current position
    const startX = cx + radius * Math.cos(originalAngle);
    const startY = cy + radius * Math.sin(originalAngle);
    const endX = cx + radius * Math.cos(currentAngle);
    const endY = cy + radius * Math.sin(currentAngle);
    
    // For normalized angles, we always take the short way (largeArc = 0)
    const largeArc = 0;
    // In screen coords (Y down), positive angle = clockwise = sweep=1
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
    
    // Arrow points at the current position (end of the arc)
    const currentAngle = Math.atan2(dy, dx);
    const endX = cx + radius * Math.cos(currentAngle);
    const endY = cy + radius * Math.sin(currentAngle);
    
    // Arrow direction: tangent to the arc at the end point, pointing in direction of rotation
    // For clockwise (positive angle), arrow points in the direction the rotation went (+90° from radius toward end)
    // For counter-clockwise (negative angle), arrow points the other way (-90° from radius toward end)
    // We want the arrow to point backward along the arc (showing where it came from)
    const tangentAngle = currentAngle + (normalizedAngle > 0 ? -Math.PI / 2 : Math.PI / 2);
    const arrowLen = 6;
    
    const ax1 = endX + arrowLen * Math.cos(tangentAngle - 0.5);
    const ay1 = endY + arrowLen * Math.sin(tangentAngle - 0.5);
    const ax2 = endX + arrowLen * Math.cos(tangentAngle + 0.5);
    const ay2 = endY + arrowLen * Math.sin(tangentAngle + 0.5);
    
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
        {/* Angle label - shows actual angle, not normalized */}
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
