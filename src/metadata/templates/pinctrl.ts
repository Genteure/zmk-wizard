import type { BusPinRole } from "~/types";
import type { PinTemplateInfo } from "~/metadata/device/type";
import type { ControllerMetadata } from "~/metadata/controllers";

// ─────────────────────────────────────────────────────────────
// Pinctrl Generation — SoC-specific pinctrl nodes + bus enable
//
// Each SoC has a different pinctrl syntax:
//   nRF52840: uses NRF_PSEL() with groups (default + low-power sleep)
//   RP2040:   uses pinmux entries with pinmux = <...>
//
// These generate a &pinctrl { ... } block plus &<bus> { ... } enable.
// ─────────────────────────────────────────────────────────────

export interface PinctrlArgs {
  busName: string;
  busType: "i2c" | "spi";
  busPins: Partial<Record<BusPinRole, PinTemplateInfo>>;
  controller: ControllerMetadata;
}

/**
 * Generate the pinctrl node + bus enable node for a given bus,
 * dispatching to the correct SoC-specific implementation.
 */
export function generateBusPinctrl(args: PinctrlArgs): string {
  const { controller } = args;

  switch (controller.soc) {
    case "nrf52840":
      return nrf52840Pinctrl(args);
    case "rp2040":
      return rp2040Pinctrl(args);
    default:
      return "";
  }
}

// ── nRF52840 ────────────────────────────────────────────────

function nrf52840Pinctrl(args: PinctrlArgs): string {
  const { busName, busType, busPins } = args;
  const pselsArray: string[] = [];
  const pselsComments: string[] = [];

  if (busType === "i2c") {
    if (busPins.sda) {
      pselsArray.push(`<NRF_PSEL(TWIM_SDA, ${busPins.sda.pinctrlRef})>`);
      pselsComments.push(`SDA on ${busPins.sda.displayName}`);
    }
    if (busPins.scl) {
      pselsArray.push(`<NRF_PSEL(TWIM_SCL, ${busPins.scl.pinctrlRef})>`);
      pselsComments.push(`SCL on ${busPins.scl.displayName}`);
    }
  } else {
    if (busPins.sck) {
      pselsArray.push(`<NRF_PSEL(SPIM_SCK, ${busPins.sck.pinctrlRef})>`);
      pselsComments.push(`SCK on ${busPins.sck.displayName}`);
    }
    if (busPins.mosi) {
      pselsArray.push(`<NRF_PSEL(SPIM_MOSI, ${busPins.mosi.pinctrlRef})>`);
      pselsComments.push(`MOSI on ${busPins.mosi.displayName}`);
    }
    if (busPins.miso) {
      pselsArray.push(`<NRF_PSEL(SPIM_MISO, ${busPins.miso.pinctrlRef})>`);
      pselsComments.push(`MISO on ${busPins.miso.displayName}`);
    }
    // miosio = 3-wire SPI: a single pin shared between MOSI and MISO,
    // so we emit both NRF_PSEL entries for the same pin.
    if (busPins.miosio) {
      pselsArray.push(`<NRF_PSEL(SPIM_MOSI, ${busPins.miosio.pinctrlRef})>`);
      pselsComments.push(`MOSI on ${busPins.miosio.displayName}`);
      pselsArray.push(`<NRF_PSEL(SPIM_MISO, ${busPins.miosio.pinctrlRef})>`);
      pselsComments.push(`MISO on ${busPins.miosio.displayName}`);
    }
  }
  if (pselsArray.length === 0) {
    throw new Error(`No PSEL entries generated for ${busName}`);
  }

  const psels = pselsArray.join(",\n                    ");

  const compatible =
    busType === "i2c" ? "nordic,nrf-twim" : "nordic,nrf-spim";
  const clockFreq =
    busType === "i2c" ? `\n    clock-frequency = <I2C_BITRATE_FAST>;` : "";

  const comments = pselsComments
    .map((c) => `// - ${c}`)
    .join("\n");

  return `
// pin control for ${busName}
${comments}
&pinctrl {
    /* configuration for ${busName} device, default state */
    ${busName}_default: ${busName}_default {
        group1 {
            psels = ${psels};
        };
    };
    /* configuration for ${busName} device, sleep state */
    ${busName}_sleep: ${busName}_sleep {
        group1 {
            psels = ${psels};
            low-power-enable;
        };
    };
};
&${busName} {
    compatible = "${compatible}";
    status = "okay";
    pinctrl-0 = <&${busName}_default>;
    pinctrl-1 = <&${busName}_sleep>;
    pinctrl-names = "default", "sleep";${clockFreq}
};
`;
}

// ── RP2040 ──────────────────────────────────────────────────

function rp2040Pinctrl(args: PinctrlArgs): string {
  const { busName, busType, busPins } = args;
  const pinmuxEntries: string[] = [];
  const rxEntries: string[] = [];
  const pinComments: string[] = [];

  if (busType === "i2c") {
    if (busPins.sda) {
      pinmuxEntries.push(
        `<${busName.toUpperCase()}_SDA_P${busPins.sda.pinctrlRef}>`,
      );
      pinComments.push(`SDA on ${busPins.sda.displayName}`);
    }
    if (busPins.scl) {
      pinmuxEntries.push(
        `<${busName.toUpperCase()}_SCL_P${busPins.scl.pinctrlRef}>`,
      );
      pinComments.push(`SCL on ${busPins.scl.displayName}`);
    }
  } else {
    if (busPins.sck) {
      pinmuxEntries.push(
        `<${busName.toUpperCase()}_SCK_P${busPins.sck.pinctrlRef}>`,
      );
      pinComments.push(`SCK on ${busPins.sck.displayName}`);
    }
    if (busPins.mosi) {
      pinmuxEntries.push(
        `<${busName.toUpperCase()}_TX_P${busPins.mosi.pinctrlRef}>`,
      );
      pinComments.push(`MOSI on ${busPins.mosi.displayName}`);
    }
    if (busPins.miso) {
      rxEntries.push(
        `<${busName.toUpperCase()}_RX_P${busPins.miso.pinctrlRef}>`,
      );
      pinComments.push(`MISO on ${busPins.miso.displayName}`);
    }
    // miosio = 3-wire SPI: a single pin shared between MOSI and MISO,
    // so we emit both TX and RX pinmux entries for the same pin.
    if (busPins.miosio) {
      pinmuxEntries.push(
        `<${busName.toUpperCase()}_TX_P${busPins.miosio.pinctrlRef}>`,
      );
      rxEntries.push(
        `<${busName.toUpperCase()}_RX_P${busPins.miosio.pinctrlRef}>`,
      );
      pinComments.push(`MOSI/MISO on ${busPins.miosio.displayName}`);
    }
  }

  if (pinmuxEntries.length === 0 && rxEntries.length === 0) {
    throw new Error(`No pinmux entries generated for ${busName}`);
  }
  const comments = pinComments.map((c) => `// ${c}`).join("\n");

  const groups: string[] = [];

  if (pinmuxEntries.length > 0) {
    const pinmux = pinmuxEntries.join(", ");
    groups.push(
      `        group1 {
            pinmux = ${pinmux};
${
  busType === "i2c"
    ? "            input-enable;\n            input-schmitt-enable;\n"
    : ""
}        };`,
    );
  }

  if (rxEntries.length > 0) {
    const rxPinmux = rxEntries.join(", ");
    const groupName = groups.length > 0 ? "group2" : "group1";
    groups.push(
      `        ${groupName} {
            pinmux = ${rxPinmux};
            input-enable;
        };`,
    );
  }

  const clockFreq =
    busType === "i2c" ? `\n    clock-frequency = <I2C_BITRATE_FAST>;` : "";

  return `
// pin control for ${busName}
${comments}
&pinctrl {
    ${busName}_default: ${busName}_default {
${groups.join("\n")}
    };
};
&${busName} {
    status = "okay";
    pinctrl-0 = <&${busName}_default>;
    pinctrl-names = "default";${clockFreq}
};
`;
}
