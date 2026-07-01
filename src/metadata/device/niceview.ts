import { z } from "astro/zod";
import { DeviceIdSchema } from "~/types/utils";
import type { DeviceMeta } from "./type";

// ── Zod Schema (data model — no pin refs) ───────────────
// nice!view is a display shield that uses an SPI bus.
// Its only device-level GPIO is CS (chip select).
// The actual display node is defined in the nice_view shield;
// we only need to label the SPI bus as nice_view_spi.

export const niceViewDeviceSchema = z.object({
  id: DeviceIdSchema,
  type: z.literal("niceview"),
});
export type NiceViewDevice = z.infer<typeof niceViewDeviceSchema>;

// ── Metadata ────────────────────────────────────────────

export const niceViewMeta = {
  type: "niceview",
  schema: niceViewDeviceSchema,
  bus: "spi",
  class: "display",
  exclusive: false,
  requiredBusPins: {
    mosi: true,
    sck: true,
  },
  gpio: {
    cs: {
      label: "Chip Select",
      required: true,
    },
  },
  visual: {
    name: "nice!view",
    short: "nice!view",
    category: "display",
  },
  props: {
    // nice!view has no configurable properties beyond CS (which is a GPIO).
  },
  template: (args) => {
    // nice!view is a pre-defined shield; we just label the SPI bus.
    const deviceDts = `nice_view_spi: &${args.bus} { };\n`;
    return { deviceDts };
  },
} satisfies DeviceMeta<"niceview">;
