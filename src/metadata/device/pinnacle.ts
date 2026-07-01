import { z } from "astro/zod";
import { DeviceIdSchema } from "~/types/utils";
import type { DeviceMeta } from "./type";

// ── Shared Pinnacle Properties ──────────────────────────
// Both I2C and SPI variants share the same touchpad configuration.

const pinnaclePropSchema = {
  rotate90: z.boolean().default(false),
  invertx: z.boolean().default(false),
  inverty: z.boolean().default(false),
  sleep: z.boolean().default(true),
  noSecondaryTap: z.boolean().default(true),
  noTaps: z.boolean().default(true),
  sensitivity: z
    .union([z.literal("1x"), z.literal("2x"), z.literal("3x"), z.literal("4x")])
    .default("2x"),
};

const pinnacleProps = {
  rotate90: {
    widget: "checkbox" as const,
    label: "Rotate 90°",
  },
  invertx: {
    widget: "checkbox" as const,
    label: "Invert X axis",
  },
  inverty: {
    widget: "checkbox" as const,
    label: "Invert Y axis",
  },
  sleep: {
    widget: "checkbox" as const,
    label: "Enable Sleep Mode",
  },
  noSecondaryTap: {
    widget: "checkbox" as const,
    label: "Disable Secondary Tap",
  },
  noTaps: {
    widget: "checkbox" as const,
    label: "Disable All Taps",
  },
  sensitivity: {
    widget: "stringOptions" as const,
    label: "Sensitivity",
    options: ["1x", "2x", "3x", "4x"] as readonly string[],
  },
};


// ── Pinnacle SPI ────────────────────────────────────────
export const pinnacleSpiDeviceSchema = z.object({
  id: DeviceIdSchema,
  type: z.literal("pinnacle_spi"),
  ...pinnaclePropSchema,
});
export type PinnacleSpiDevice = z.infer<typeof pinnacleSpiDeviceSchema>;

export const pinnacleSpiMeta = {
  type: "pinnacle_spi",
  schema: pinnacleSpiDeviceSchema,
  bus: "spi",
  class: "pointing",
  exclusive: false,
  module: "petejohanson/cirque",
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
    dr: {
      label: "Data Ready",
      desc: "Data Ready / Interrupt",
    },
  },
  visual: {
    name: "Cirque Pinnacle Trackpad (SPI)",
    short: "Pinnacle SPI",
    category: "pointing",
  },
  props: {
    ...pinnacleProps,
  },
  template: (args) => {
    const props = args.props;
    const index = args.csIndex ?? 0;
    const drPin = args.gpios.dr?.dtsRef ?? '';
    const rotate90 = props.rotate90 ? '\n        rotate-90;' : '';
    const invx = props.invertx ? '\n        x-invert;' : '';
    const invy = props.inverty ? '\n        y-invert;' : '';
    const sleep = props.sleep ? '\n        sleep;' : '';
    const noSecondaryTap = props.noSecondaryTap ? '\n        no-secondary-tap;' : '';
    const noTaps = props.noTaps ? '\n        no-taps;' : '';
    const sensitivity = props.sensitivity ?? '2x';

    const deviceDts = `
&${args.bus} {
    pinnacle_spi: pinnacle_spi@${index} {
        status = "okay";
        compatible = "cirque,pinnacle";
        reg = <${index}>;
        spi-max-frequency = <2000000>;
        dr-gpios = <${drPin} (GPIO_ACTIVE_HIGH | GPIO_PULL_DOWN)>;${rotate90}${invx}${invy}${sleep}${noSecondaryTap}${noTaps}
        sensitivity = "${sensitivity}";
    };
};
`;

    return { deviceDts };
  },
} satisfies DeviceMeta<"pinnacle_spi">;

// ── Pinnacle I2C ────────────────────────────────────────

export const pinnacleI2cDeviceSchema = z.object({
  id: DeviceIdSchema,
  type: z.literal("pinnacle_i2c"),
  add: z.number().min(0).max(0x7f).default(0x2a),
  ...pinnaclePropSchema,
});
export type PinnacleI2cDevice = z.infer<typeof pinnacleI2cDeviceSchema>;

export const pinnacleI2cMeta = {
  type: "pinnacle_i2c",
  schema: pinnacleI2cDeviceSchema,
  bus: "i2c",
  class: "pointing",
  exclusive: false,
  module: "petejohanson/cirque",
  requiredBusPins: {
    // I2C always needs SDA + SCL, but they're standard bus pins
    // — not listed here because the bus itself requires them.
  },
  gpio: {
    dr: {
      label: "Data Ready",
      desc: "Data ready / interrupt pin. Active high, requires pull-down.",
    },
  },
  visual: {
    name: "Cirque Pinnacle Trackpad (I2C)",
    short: "Pinnacle I2C",
    category: "pointing",
  },
  props: {
    add: {
      widget: "hex",
      label: "I2C Address",
      required: true,
      min: 0x00,
      max: 0x7f,
    },
    ...pinnacleProps,
  },
  template: (args) => {
    const props = args.props;
    const add = props.add as number ?? 0x2a;
    const addressHex = (add as number).toString(16).padStart(2, '0');
    const drPin = args.gpios.dr?.dtsRef ?? '';
    const rotate90 = props.rotate90 ? '\n        rotate-90;' : '';
    const invx = props.invertx ? '\n        x-invert;' : '';
    const invy = props.inverty ? '\n        y-invert;' : '';
    const sleep = props.sleep ? '\n        sleep;' : '';
    const noSecondaryTap = props.noSecondaryTap ? '\n        no-secondary-tap;' : '';
    const noTaps = props.noTaps ? '\n        no-taps;' : '';
    const sensitivity = props.sensitivity as string ?? '2x';

    const deviceDts = `
&${args.bus} {
    pinnacle_i2c: pinnacle_i2c@${addressHex} {
        status = "okay";
        compatible = "cirque,pinnacle";
        reg = <0x${addressHex}>;
        dr-gpios = <${drPin} (GPIO_ACTIVE_HIGH | GPIO_PULL_DOWN)>;${rotate90}${invx}${invy}${sleep}${noSecondaryTap}${noTaps}
        sensitivity = "${sensitivity}";
    };
};
`;

    return { deviceDts };
  },
} satisfies DeviceMeta<"pinnacle_i2c">;
