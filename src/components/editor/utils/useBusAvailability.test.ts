import { describe, expect, test } from "vitest";
import {
  computeBusStatuses,
  canAddDeviceToBus,
  countDevicesOfClass,
  busHasExclusiveDevice,
  deviceClassLimitReached,
} from "./useBusAvailability";
import type { Bus, KeyboardPart } from "~/types";
import type { ControllerId } from "~/types/keyboard";

// ── Test helpers ───────────────────────────────────────────

/** Minimal fixture: part with no buses, no pins, nrf52840 controller. */
function emptyPart(controller: ControllerId = "nice_nano_v2"): KeyboardPart {
  return {
    name: "test-part",
    controller,
    pins: {},
    buses: {},
  } as KeyboardPart;
}

/** Build a part with specific buses and devices. */
function partWithBuses(
  controller: ControllerId,
  buses: Record<string, { type: "i2c" | "spi"; devices: { id: string; type: string; [k: string]: unknown }[] }>,
): KeyboardPart {
  return {
    name: "test-part",
    controller,
    pins: {},
    buses: buses as Record<string, Bus>,
  } as KeyboardPart;
}

// ── Bus status computation ─────────────────────────────────

describe("computeBusStatuses", () => {
  test("all buses inactive on empty part", () => {
    const statuses = computeBusStatuses(emptyPart(), "nice_nano_v2");
    expect(statuses.length).toBe(6);
    for (const s of statuses) {
      expect(s.status).toBe("inactive");
    }
  });

  test("active bus is marked active", () => {
    const part = partWithBuses("nice_nano_v2", {
      i2c0: { type: "i2c", devices: [{ id: "d1", type: "ssd1306" }] },
    });
    const statuses = computeBusStatuses(part, "nice_nano_v2");
    const i2c0 = statuses.find((s) => s.name === "i2c0");
    expect(i2c0!.status).toBe("active");
  });

  test("spi0 unavailable when i2c0 active on nRF52840", () => {
    const part = partWithBuses("nice_nano_v2", {
      i2c0: { type: "i2c", devices: [{ id: "d1", type: "ssd1306" }] },
    });
    const statuses = computeBusStatuses(part, "nice_nano_v2");
    const spi0 = statuses.find((s) => s.name === "spi0");
    expect(spi0!.status).toBe("unavailable");
  });

  test("i2c1 unavailable when spi1 active on nRF52840", () => {
    const part = partWithBuses("nice_nano_v2", {
      spi1: { type: "spi", devices: [{ id: "d1", type: "niceview" }] },
    });
    const statuses = computeBusStatuses(part, "nice_nano_v2");
    const i2c1 = statuses.find((s) => s.name === "i2c1");
    expect(i2c1!.status).toBe("unavailable");
  });

  test("no bus conflicts on RP2040", () => {
    const part = partWithBuses("xiao_rp2040", {
      i2c0: { type: "i2c", devices: [{ id: "d1", type: "ssd1306" }] },
    });
    const statuses = computeBusStatuses(part, "xiao_rp2040");
    const spi0 = statuses.find((s) => s.name === "spi0");
    expect(spi0!.status).toBe("inactive");
  });
});

// ── Device class limits ────────────────────────────────────

describe("countDevicesOfClass", () => {
  test("counts devices across all buses", () => {
    const part = partWithBuses("nice_nano_v2", {
      i2c0: { type: "i2c", devices: [{ id: "d1", type: "ssd1306" }] },
      i2c1: { type: "i2c", devices: [{ id: "d2", type: "ssd1306" }] },
    });
    expect(countDevicesOfClass(part, "display")).toBe(2);
  });

  test("counts zero for empty part", () => {
    expect(countDevicesOfClass(emptyPart(), "display")).toBe(0);
  });
});

describe("deviceClassLimitReached", () => {
  test("display limit reached with 1 ssd1306", () => {
    const part = partWithBuses("nice_nano_v2", {
      i2c0: { type: "i2c", devices: [{ id: "d1", type: "ssd1306" }] },
    });
    expect(deviceClassLimitReached(part, "ssd1306")).toBe(true);
  });

  test("display limit reached with 1 niceview", () => {
    const part = partWithBuses("nice_nano_v2", {
      spi0: { type: "spi", devices: [{ id: "d1", type: "niceview" }] },
    });
    // niceview is also display class
    expect(deviceClassLimitReached(part, "niceview")).toBe(true);
  });

  test("pointing never limited", () => {
    const part = partWithBuses("nice_nano_v2", {
      spi0: { type: "spi", devices: [{ id: "d1", type: "pmw3610" }] },
      spi1: { type: "spi", devices: [{ id: "d2", type: "paw3395" }] },
    });
    expect(deviceClassLimitReached(part, "pmw3610")).toBe(false);
    expect(deviceClassLimitReached(part, "paw3395")).toBe(false);
  });
});

// ── Exclusive device checks ────────────────────────────────

describe("busHasExclusiveDevice", () => {
  test("PMW3610 is exclusive", () => {
    const bus: Bus = {
      type: "spi",
      devices: [{ id: "d1", type: "pmw3610" }],
    } as Bus;
    expect(busHasExclusiveDevice(bus)).toBe(true);
  });

  test("WS2812 is exclusive", () => {
    const bus: Bus = {
      type: "spi",
      devices: [{ id: "d1", type: "ws2812" }],
    } as Bus;
    expect(busHasExclusiveDevice(bus)).toBe(true);
  });

  test("niceview is not exclusive", () => {
    const bus: Bus = {
      type: "spi",
      devices: [{ id: "d1", type: "niceview" }],
    } as Bus;
    expect(busHasExclusiveDevice(bus)).toBe(false);
  });
});

// ── canAddDeviceToBus ──────────────────────────────────────

describe("canAddDeviceToBus", () => {
  test("can add to compatible inactive bus", () => {
    const part = emptyPart();
    expect(canAddDeviceToBus(part, "nice_nano_v2", "ssd1306", "i2c0")).toBeNull();
  });

  test("cannot add to type-mismatched bus", () => {
    const part = emptyPart();
    expect(canAddDeviceToBus(part, "nice_nano_v2", "ssd1306", "spi0")).toBe("Bus type mismatch.");
  });

  test("cannot add to unavailable bus", () => {
    const part = partWithBuses("nice_nano_v2", {
      i2c0: { type: "i2c", devices: [{ id: "d1", type: "ssd1306" }] },
    });
    // spi0 is unavailable because i2c0 is active on nRF52840
    const reason = canAddDeviceToBus(part, "nice_nano_v2", "niceview", "spi0");
    expect(reason).toBe("Bus unavailable due to SoC conflicts.");
  });

  test("cannot add display when limit reached", () => {
    const part = partWithBuses("nice_nano_v2", {
      i2c0: { type: "i2c", devices: [{ id: "d1", type: "ssd1306" }] },
    });
    const reason = canAddDeviceToBus(part, "nice_nano_v2", "niceview", "spi1");
    expect(reason).toContain("display");
  });

  test("cannot add to bus with exclusive device", () => {
    const part = partWithBuses("nice_nano_v2", {
      spi1: { type: "spi", devices: [{ id: "d1", type: "pmw3610" }] },
    });
    const reason = canAddDeviceToBus(part, "nice_nano_v2", "niceview", "spi1");
    expect(reason).toBe("Bus already has an exclusive device that cannot share.");
  });

  test("exclusive device cannot share existing bus", () => {
    const part = partWithBuses("nice_nano_v2", {
      spi1: { type: "spi", devices: [{ id: "d1", type: "niceview" }] },
    });
    const reason = canAddDeviceToBus(part, "nice_nano_v2", "pmw3610", "spi1", ["badjeff/pmw3610"]);
    expect(reason).toBe("This device requires a dedicated bus.");
  });
});
