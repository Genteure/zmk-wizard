import { z } from "astro/zod";
import { DeviceIdSchema } from "~/types/utils";
import type { DeviceMeta } from "./type";

// ── Zod Schema (data model — no pin refs) ───────────────

export const pmw3610DeviceSchema = z.object({
  id: DeviceIdSchema,
  type: z.literal("pmw3610"),
  cpi: z.number().min(0).max(3200).default(600),
  swapxy: z.boolean().default(false),
  invertx: z.boolean().default(false),
  inverty: z.boolean().default(false),
});
export type Pmw3610Device = z.infer<typeof pmw3610DeviceSchema>;

// ── Metadata ────────────────────────────────────────────

/**
 * PMW3610 Optical Sensor metadata.
 *
 * NOTE: PMW3610 uses a 3-wire SPI mode — MISO and MOSI share the same
 * physical pin. This is handled at the bus level (via the "miosio"
 * BusPinRole). The bus metadata should flag this, not the device.
 */
export const pmw3610Meta = {
  type: "pmw3610",
  schema: pmw3610DeviceSchema,
  bus: "spi",
  class: "pointing",
  exclusive: true, // Half-duplex SPI — cannot share bus with any other device.
  module: "badjeff/pmw3610",
  requiredBusPins: {
    mosi: true,
    miso: true,
    sck: true,
  },
  gpio: {
    cs: {
      label: "Chip Select",
      desc: "SPI chip select pin",
      required: true,
    },
    irq: {
      label: "MOTION",
      desc: "Motion / interrupt pin. Active low, requires pull-up.",
    },
  },
  visual: {
    name: "PMW3610 Optical Sensor",
    short: "PMW3610",
    category: "pointing",
  },
  props: {
    cpi: {
      widget: "numberOptions",
      label: "CPI",
      required: true,
      options: Array.from({ length: 16 }, (_, i) => (i + 1) * 200) as readonly number[],
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
    const cpi = props.cpi as number ?? 600;
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
    pmw3610: pmw3610@${index} {
        status = "okay";
        compatible = "pixart,pmw3610";
        reg = <${index}>;
        spi-max-frequency = <2000000>;
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
      kconfig: ["\nconfig PMW3610\n    default y\n"],
    };
  },
} satisfies DeviceMeta<"pmw3610">;
