import { z } from "astro/zod";
import { DeviceIdSchema } from "~/types/utils";
import type { DeviceMeta } from "./type";

// ── Zod Schema (data model — no pin refs) ───────────────
// SSD1306 has no device-level GPIOs. Only bus-level pins
// (SDA + SCL for I2C) are needed — those go through PinUsageBus.

export const ssd1306DeviceSchema = z.object({
  id: DeviceIdSchema,
  type: z.literal("ssd1306"),
  add: z.number().min(0).max(0x7f).default(0x3c),
  width: z.number().min(1).default(128),
  height: z.number().min(1).default(64),
});
export type SSD1306Device = z.infer<typeof ssd1306DeviceSchema>;

// ── Metadata ────────────────────────────────────────────

export const ssd1306Meta = {
  type: "ssd1306",
  schema: ssd1306DeviceSchema,
  bus: "i2c",
  class: "display",
  exclusive: false,
  // No external module — SSD1306 driver is built into ZMK.
  requiredBusPins: {
    // I2C always needs SDA + SCL; the bus itself requires them.
  },
  gpio: {
    // SSD1306 has no device-level GPIOs.
  },
  visual: {
    name: "SSD1306 OLED Display",
    short: "SSD1306",
    category: "display",
  },
  props: {
    add: {
      widget: "hex",
      label: "I2C Address",
      min: 0x00,
      max: 0x7f,
      required: true,
    },
    width: {
      widget: "dec",
      label: "Width (px)",
      min: 1,
    },
    height: {
      widget: "dec",
      label: "Height (px)",
      min: 1,
    },
  },
  template: (args) => {
    const add = args.props.add ?? 0x3c;
    const width = args.props.width ?? 128;
    const height = args.props.height ?? 64;
    const addressHex = (add as number).toString(16).padStart(2, '0');

    const deviceDts = `
&${args.bus} {
    oled: ssd1306@${addressHex} {
        compatible = "solomon,ssd1306fb";
        reg = <0x${addressHex}>;
        width = <${width}>;
        height = <${height}>;

        segment-offset = <0>;
        page-offset = <0>;
        display-offset = <0>;
        multiplex-ratio = <31>;
        prechargep = <0x22>;
        segment-remap;
        com-invdir;
        com-sequential;
        inversion-on;
    };
};
/ {
    chosen {
        zephyr,display = &oled;
    };
};
`;

    const kconfig = [
      `
config ZMK_DISPLAY
    default y

if ZMK_DISPLAY

config I2C
    default y

config SSD1306
    default y

endif # ZMK_DISPLAY

if LVGL

config LV_Z_VDB_SIZE
    default 64

config LV_DPI_DEF
    default 148

config LV_Z_BITS_PER_PIXEL
    default 1

choice LV_COLOR_DEPTH
    default LV_COLOR_DEPTH_1
endchoice

endif # LVGL
`,
    ];

    return { deviceDts, kconfig };
  },
} satisfies DeviceMeta<"ssd1306">;
