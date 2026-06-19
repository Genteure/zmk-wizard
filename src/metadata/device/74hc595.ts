import { z } from "astro/zod";
import { DeviceIdSchema } from "~/types/utils";
import type { DeviceMeta } from "./type";

// ── Zod Schema (data model — no pin refs) ───────────────
// 74HC595 shift register on SPI. ngpios determines how many
// shift registers are cascaded (each provides 8 GPIOs).

export const shifter595DeviceSchema = z.object({
  id: DeviceIdSchema,
  type: z.literal("74hc595"),
  ngpios: z
    .union([z.literal(8), z.literal(16), z.literal(24), z.literal(32)])
    .default(8),
});
export type Shifter595Device = z.infer<typeof shifter595DeviceSchema>;

// ── Metadata ────────────────────────────────────────────

export const shifter595Meta = {
  type: "74hc595",
  schema: shifter595DeviceSchema,
  bus: "spi",
  class: "shift_register",
  exclusive: false,
  requiredBusPins: {
    mosi: true,
    sck: true,
  },
  gpio: {
    cs: {
      label: "Chip Select",
      desc: "SPI chip select pin for the shift register chain",
      required: true,
    },
  },
  visual: {
    name: "74HC595 Shift Register",
    short: "74HC595",
    category: "shift_register",
  },
  props: {
    ngpios: {
      widget: "numberOptions",
      label: "Number of GPIOs",
      required: true,
      options: [8, 16, 24, 32] as readonly number[],
    },
  },
  template: (args) => {
    const ngpios = args.props.ngpios ?? 8;
    const index = args.csIndex ?? 0;

    const deviceDts = `
&${args.bus} {
    shifter: 595@${index} {
        compatible = "zmk,gpio-595";
        reg = <${index}>;
        status = "okay";
        gpio-controller;
        spi-max-frequency = <200000>;
        #gpio-cells = <2>;
        ngpios = <${ngpios}>;
    };
};
`;

    return { deviceDts };
  },
} satisfies DeviceMeta<"74hc595">;
