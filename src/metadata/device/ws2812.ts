import { z } from "astro/zod";
import { DeviceIdSchema } from "~/types/utils";
import type { DeviceMeta } from "./type";

// ── Zod Schema (data model — no pin refs) ───────────────
// WS2812 LED strip uses SPI MOSI only. No device-level GPIOs.

export const ws2812DeviceSchema = z.object({
  id: DeviceIdSchema,
  type: z.literal("ws2812"),
  len: z.number().min(1).max(256).default(8),
});
export type WS2812Device = z.infer<typeof ws2812DeviceSchema>;

// ── Metadata ────────────────────────────────────────────

export const ws2812Meta = {
  type: "ws2812",
  schema: ws2812DeviceSchema,
  bus: "spi",
  class: "rgb",
  exclusive: true, // Only one WS2812 strip per bus
  requiredBusPins: {
    mosi: true,
  },
  gpio: {
    // WS2812 has no device-level GPIOs.
  },
  visual: {
    name: "WS2812 LED Strip",
    short: "WS2812",
    category: "rgb",
  },
  props: {
    len: {
      widget: "dec",
      label: "Number of LEDs",
      min: 1,
      max: 256,
      required: true,
    },
  },
  template: (args) => {
    const len = args.props.len ?? 8;
    const index = args.csIndex ?? 0;

    const deviceDts = `
#include <dt-bindings/led/led.h>
&${args.bus} {
    led_strip: ws2812@${index} {
        compatible = "worldsemi,ws2812-spi";
        reg = <${index}>;
        spi-max-frequency = <4000000>;

        chain-length = <${len}>;
        spi-one-frame = <0x70>;
        spi-zero-frame = <0x40>;
        color-mapping = <LED_COLOR_ID_GREEN
                         LED_COLOR_ID_RED
                         LED_COLOR_ID_BLUE>;
    };
};
/ {
    chosen {
        zmk,underglow = &led_strip;
    };
};
`;

    return {
      deviceDts,
      kconfig: ["\nconfig WS2812_STRIP\n    default y\n"],
    };
  },
} satisfies DeviceMeta<"ws2812">;
