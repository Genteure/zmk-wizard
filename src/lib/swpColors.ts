// Shield Wizard Part color classes (swp0..swp4)

export const SWP_BG_CLASSES = ["bg-swp0", "bg-swp1", "bg-swp2", "bg-swp3", "bg-swp4"] as const;
export const SWP_BORDER_CLASSES = ["border-swp0", "border-swp1", "border-swp2", "border-swp3", "border-swp4"] as const;
export const SWP_OUTLINE_CLASSES = ["outline-swp0", "outline-swp1", "outline-swp2", "outline-swp3", "outline-swp4"] as const;

export const swpBgClass = (idx: number) => SWP_BG_CLASSES[idx % SWP_BG_CLASSES.length];
export const swpBorderClass = (idx: number) => SWP_BORDER_CLASSES[idx % SWP_BORDER_CLASSES.length];
export const swpOutlineClass = (idx: number) => SWP_OUTLINE_CLASSES[idx % SWP_OUTLINE_CLASSES.length];
