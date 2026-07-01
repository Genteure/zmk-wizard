import { z } from "astro/zod";
import { DeviceIdSchema } from "~/types/utils";
import type { DeviceMeta } from "./type";

// ── Zod Schema (data model — no pin refs) ───────────────

export const paw3395DeviceSchema = z.object({
  id: DeviceIdSchema,
  type: z.literal("paw3395"),
  cpi: z.number().min(0).max(26000).default(800),
  swapxy: z.boolean().default(false),
  invertx: z.boolean().default(false),
  inverty: z.boolean().default(false),
});
export type Paw3395Device = z.infer<typeof paw3395DeviceSchema>;

// ── Metadata ────────────────────────────────────────────

/**
 * PAW3395 Optical Sensor metadata.
 *
 * CPI options use a combined list: steps of 200 up to 3000, then
 * steps of 400 up to 12000, then steps of 1000 up to 26000.
 */
export const paw3395Meta = {
  type: "paw3395",
  schema: paw3395DeviceSchema,
  bus: "spi",
  class: "pointing",
  exclusive: false,
  module: "badjeff/paw3395",
  requiredBusPins: {
    mosi: true,
    miso: true,
    sck: true,
  },
  gpio: {
    cs: {
      label: "Chip Select",
      required: true,
    },
    irq: {
      label: "MOTION",
      desc: "Motion / Interrupt",
    },
  },
  visual: {
    name: "PAW3395 Optical Sensor",
    short: "PAW3395",
    category: "pointing",
  },
  props: {
    cpi: {
      widget: "numberOptions",
      label: "CPI",
      required: true,
      options: [
        ...Array.from({ length: 15 }, (_, i) => (i + 1) * 200),
        ...Array.from({ length: 22 }, (_, i) => 3000 + (i + 1) * 400),
        ...Array.from({ length: 14 }, (_, i) => 12000 + (i + 1) * 1000),
      ] as readonly number[],
    },
    swapxy: {
      widget: "checkbox",
      label: "Swap X/Y axes",
    },
    invertx: {
      widget: "checkbox",
      label: "Invert X axis",
    },
    inverty: {
      widget: "checkbox",
      label: "Invert Y axis",
    },
  },
  template: (args) => {
    const props = args.props;
    const cpi = props.cpi as number ?? 800;
    const swapxy = props.swapxy as boolean ?? false;
    const invertx = props.invertx as boolean ?? false;
    const inverty = props.inverty as boolean ?? false;
    const index = args.csIndex ?? 0;

    const irqPin = args.gpios.irq?.dtsRef ?? '';
    const swap = swapxy ? '\n        swap-xy;' : '';
    const invx = invertx ? '\n        invert-x;' : '';
    const invy = inverty ? '\n        invert-y;' : '';

    const deviceDts = `
#include <zephyr/dt-bindings/input/input-event-codes.h>

&${args.bus} {
    paw3395: paw3395@${index} {
        status = "okay";
        compatible = "pixart,paw3395";
        reg = <${index}>;
        spi-max-frequency = <4000000>;
        evt-type = <INPUT_EV_REL>;
        x-input-code = <INPUT_REL_X>;
        y-input-code = <INPUT_REL_Y>;
        irq-gpios = <${irqPin} (GPIO_ACTIVE_LOW | GPIO_PULL_UP)>;
        cpi = <${cpi}>;${swap}${invx}${invy}
    };
};
`;

    return {
      deviceDts,
      kconfig: ["\nconfig PAW3395\n    default y\n"],
    };
  },
} satisfies DeviceMeta<"paw3395">;
