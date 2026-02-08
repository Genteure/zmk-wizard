import type { VoidComponent } from "solid-js";
import { keyToSvgPath } from "~/lib/geometry";
import { swpCssVar } from "~/lib/swpColors";
import type { GraphicsKey } from ".";

/**
 * Props for SVG key rendering.
 * State calculations (like pinActive) should be done outside this component.
 */
export type KeySvgProps = {
  keyData: GraphicsKey;
  isSelected: boolean;
  isFocused: boolean;
  activeEditPart: number | null;
  pinActive: boolean;
};

/**
 * SVG component for rendering key background and border.
 * Rendered as a path element within the parent SVG.
 */
export const KeySvgPath: VoidComponent<KeySvgProps> = (props) => {
  const keyData = () => props.keyData;
  const keyPart = () => keyData().part;
  const isCurrentPart = () => props.activeEditPart === null || props.activeEditPart === keyPart();
  const isWiringMode = () => props.activeEditPart !== null;

  // No offset needed - the container's position:relative offset handles coordinate transformation
  const pathData = () => keyToSvgPath(keyData());

  // Fill color: bg-base-300 for selected/pinActive/focused, bg-base-200 otherwise
  const fill = () => (props.isSelected || props.pinActive || props.isFocused)
    ? "var(--color-base-300)"
    : "var(--color-base-200)";

  // Stroke color based on state:
  // - focused: sky-500 (focus ring color)
  // - pinActive: amber
  // - selected: base-content
  // - layout mode (no active part): part color
  // - wiring mode, current part: base-content (solid border)
  // - wiring mode, other part: base-content with opacity (dashed)
  const stroke = () => {
    if (props.isFocused) return "var(--color-sky-500)";
    if (props.pinActive) return "var(--color-amber-500)";
    if (props.isSelected) return "var(--color-base-content)";
    if (!isWiringMode()) return swpCssVar(keyPart());
    return "var(--color-base-content)";
  };

  // Stroke width: 3 for focused, 2 for selected/pinActive, 1 otherwise
  const strokeWidth = () => {
    if (props.isFocused) return 3;
    if (props.isSelected || props.pinActive) return 2;
    return 1;
  };

  // Dashed pattern for inactive parts in wiring mode
  const strokeDasharray = () => (isWiringMode() && !isCurrentPart()) ? "4 2" : undefined;

  // Opacity: 50% for inactive parts in wiring mode
  const strokeOpacity = () => (isWiringMode() && !isCurrentPart()) ? 0.5 : 1;

  return (
    <path
      d={pathData()}
      fill={fill()}
      stroke={stroke()}
      stroke-width={strokeWidth()}
      stroke-dasharray={strokeDasharray()}
      stroke-opacity={strokeOpacity()} />
  );
};
