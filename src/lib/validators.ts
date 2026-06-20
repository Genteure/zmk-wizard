import { z } from "astro/zod";
import { Controllers, SocBuses } from "~/metadata/controllers";
import { DEVICE_CLASS_LIMITS, DEVICE_REGISTRY, SOC_BUS_CONFLICTS, getDeviceMeta } from "~/metadata/device";
import { ZMK_MODULES, modulesConflict } from "~/metadata/modules";
import { KeyboardSchema } from "~/types/keyboard";
import type { BusPinRole } from "~/types";

// ───────────────────────────────────────────────────────────
// Reserved/common shield names (from ZMK ecosystem)
//
// When a new shield name conflicts with an existing ZMK board
// or common keyboard name, add it here.
// ───────────────────────────────────────────────────────────

const COMMON_SHIELD_NAMES = [
  "test", "zmk", "key", "macro", "macropad", "macro_pad", "keyboard",
  "my_keyboard", "corneish_zen", "totem", "nice_view", "nice_view_adapter",
  "a_dux", "adafruit_kb2040", "adafruit_qt_py_rp2040", "adv360pro",
  "bdn9_rev2", "bfo9000", "boardsource3x4", "boardsource5x12",
  "boardsource_blok", "corne", "cradio", "ergodash", "ferris_rev02",
  "helix", "iris", "jorne", "kyria", "lily58", "microdox",
  "nice_nano", "nice_nano_v2", "nibble", "planck_rev6",
  "seeeduino_xiao", "seeeduino_xiao_ble", "seeeduino_xiao_rp2040",
  "sofle", "sweep",
] as const satisfies readonly string[];

// ───────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────

/** Iterate part.pins with runtime-string keys, ignoring branded type at runtime. */
function pinEntries(part: { pins: Record<string, unknown> }): [string, { usage: string } | undefined][] {
  return Object.entries(part.pins).map(([id, u]) => [id, u as { usage: string } | undefined]);
}

/** Inline type for SocBuses lookup (BusMetadata interface is not exported). */
type SocBusLookup = Record<string, { type: "i2c" | "spi"; requires: readonly string[] } | undefined>;
const socBusesLookup = SocBuses as unknown as Record<string, SocBusLookup>;

// ───────────────────────────────────────────────────────────
// Enhanced Keyboard Schema with superRefine validation
// ───────────────────────────────────────────────────────────

export const ValidatedKeyboardSchema = KeyboardSchema.superRefine((data, ctx) => {
  // ── 1. Keyboard name ─────────────────────────────────────
  if (data.name !== data.name.trim()) {
    ctx.addIssue({ code: "custom", message: "Keyboard name cannot start or end with spaces", path: ["name"] });
  }

  // ── 2. Shield name ───────────────────────────────────────
  if (data.shield !== data.shield.trim()) {
    ctx.addIssue({ code: "custom", message: "Shield name cannot start or end with spaces", path: ["shield"] });
  }
  if ((COMMON_SHIELD_NAMES as readonly string[]).includes(data.shield)) {
    ctx.addIssue({ code: "custom", message: "Shield name is reserved; please choose another", path: ["shield"] });
  }

  // ── 3. Module conflicts — data-driven from ZMK_MODULES metadata ──
  for (let i = 0; i < data.modules.length; i++) {
    for (let j = i + 1; j < data.modules.length; j++) {
      if (modulesConflict(data.modules[i], data.modules[j])) {
        const modA = ZMK_MODULES[data.modules[i]];
        const modB = ZMK_MODULES[data.modules[j]];
        ctx.addIssue({
          code: "custom",
          message: `Modules "${modA?.name ?? data.modules[i]}" and "${modB?.name ?? data.modules[j]}" conflict with each other`,
          path: ["modules", i],
        });
      }
    }
  }

  // ── 4. Key count and logical layout ──────────────────────
  if (data.layout.length > 256) {
    ctx.addIssue({ code: "custom", message: "Do you really have more than 256 keys?", path: ["layout"] });
  }

  const posToKeys: Record<string, number[]> = {};
  data.layout.forEach((key, idx) => {
    const posKey = `${key.row},${key.col}`;
    (posToKeys[posKey] = posToKeys[posKey] || []).push(idx);
  });
  for (const [pos, indices] of Object.entries(posToKeys)) {
    if (indices.length > 1) {
      const [row, col] = pos.split(",");
      ctx.addIssue({
        code: "custom",
        message: `Keys ${indices.join(", ")} share the same logical position at row ${row}, col ${col}`,
        path: ["layout"],
      });
    }
  }

  // ── 5. Split parts ───────────────────────────────────────
  if (data.parts.length > 5) {
    ctx.addIssue({ code: "custom", message: "More than 5 parts are not supported", path: ["parts"] });
  }

  const seenPartNames = new Set<string>();
  data.parts.forEach((part, i) => {
    if (!/^[a-z]+$/.test(part.name)) {
      ctx.addIssue({
        code: "custom",
        message: `Part ${i} name is invalid; only lowercase letters (a-z) are allowed`,
        path: ["parts", i, "name"],
      });
    }

    if (seenPartNames.has(part.name)) {
      ctx.addIssue({
        code: "custom",
        message: `Part ${i} and another part have the same name; part names must be unique`,
        path: ["parts", i, "name"],
      });
    }
    seenPartNames.add(part.name);

    if (part.name === "dongle" && data.dongle) {
      ctx.addIssue({
        code: "custom",
        message: `Part name "dongle" is reserved for the auto-generated dongle part`,
        path: ["parts", i, "name"],
      });
    }
  });

  // ── 6. SoC-specific constraints ──────────────────────────
  // RP2040 unibody limitation — driven from Controllers metadata.
  const usesRp2040 = data.parts.some((part) => Controllers[part.controller]?.soc === "rp2040");
  if (usesRp2040) {
    if (data.parts.length !== 1) {
      ctx.addIssue({ code: "custom", message: "RP2040-based controllers only support unibody keyboards", path: ["parts"] });
    }
    if (data.dongle) {
      ctx.addIssue({ code: "custom", message: "RP2040-based controllers do not support dongle mode", path: ["dongle"] });
    }
  }

  // ── 7–11. Per-part validation ────────────────────────────
  data.parts.forEach((part, partIdx) => {
    const pinPath = (pinId: string): (string | number)[] => ["parts", partIdx, "pins", pinId];

    const controller = Controllers[part.controller];
    if (!controller) {
      ctx.addIssue({
        code: "custom",
        message: `Unknown controller "${part.controller}"`,
        path: ["parts", partIdx, "controller"],
      });
      return;
    }

    const validPinIds = new Set(Object.keys(controller.gpios));
    const socId = controller.soc;

    // ── 7. Bus and device configuration ────────────────────
    // Index bus pins by bus name for lookup
    type BusPinEntry = { pinId: string; role: BusPinRole };
    const busPinsByBus = new Map<string, BusPinEntry[]>();

    for (const [pinId, usage] of pinEntries(part)) {
      if (!usage || usage.usage !== "bus") continue;
      const busUsage = usage as { usage: "bus"; bus: string; role: BusPinRole };

      if (!validPinIds.has(pinId)) {
        ctx.addIssue({
          code: "custom",
          message: `Pin "${pinId}" used for bus "${busUsage.bus}" does not exist on controller "${part.controller}"`,
          path: pinPath(pinId),
        });
      }

      const list = busPinsByBus.get(busUsage.bus) ?? [];
      list.push({ pinId, role: busUsage.role });
      busPinsByBus.set(busUsage.bus, list);
    }

    const seenBusNames = new Set<string>();
    const classCounts: Partial<Record<string, number>> = {};
    const activeBuses: { name: string; type: "i2c" | "spi" }[] = [];

    for (const [busName, bus] of Object.entries(part.buses)) {
      if (bus.devices.length === 0) continue;
      activeBuses.push({ name: busName, type: bus.type });

      if (seenBusNames.has(busName)) {
        ctx.addIssue({
          code: "custom",
          message: `Bus name "${busName}" is duplicated`,
          path: ["parts", partIdx, "buses", busName],
        });
      }
      seenBusNames.add(busName);

      // Validate bus against SoC metadata (data-driven per SocBuses)
      const socBus = socBusesLookup[socId]?.[busName];
      if (!socBus) {
        ctx.addIssue({
          code: "custom",
          message: `Controller "${part.controller}" (${socId}) does not have bus "${busName}"`,
          path: ["parts", partIdx, "buses", busName],
        });
        continue;
      }

      if (socBus.type !== bus.type) {
        ctx.addIssue({
          code: "custom",
          message: `Bus "${busName}" is configured as ${bus.type.toUpperCase()} but controller expects ${socBus.type.toUpperCase()}`,
          path: ["parts", partIdx, "buses", busName],
        });
      }

      // Check required bus-level pins from SocBuses metadata
      if (bus.devices.length > 0) {
        for (const role of socBus.requires) {
          const hasPin = busPinsByBus.get(busName)?.some((e) => e.role === role) ?? false;
          if (!hasPin) {
            ctx.addIssue({
              code: "custom",
              message: `Bus "${busName}" is missing required pin for ${role.toUpperCase()}`,
              path: ["parts", partIdx, "buses", busName],
            });
          }
        }
      }

      // Validate each device on the bus — all device metadata is data-driven
      for (const device of bus.devices) {
        const meta = DEVICE_REGISTRY[device.type] as {
          bus?: string; class?: string; module?: string; exclusive?: boolean;
          gpio?: Record<string, { label: string; required?: boolean }>;
          requiredBusPins?: Partial<Record<string, boolean>>;
        } | undefined;

        if (!meta) {
          ctx.addIssue({
            code: "custom",
            message: `Unknown device type "${device.type}" on bus "${busName}"`,
            path: ["parts", partIdx, "buses", busName, "devices"],
          });
          continue;
        }

        if (meta.bus && meta.bus !== bus.type) {
          ctx.addIssue({
            code: "custom",
            message: `Device type "${device.type}" is not allowed on ${bus.type.toUpperCase()} bus "${busName}"`,
            path: ["parts", partIdx, "buses", busName, "devices"],
          });
        }

        // Module requirement — driven from device metadata
        if (meta.module && !data.modules.includes(meta.module as never)) {
          ctx.addIssue({
            code: "custom",
            message: `Device "${device.type}" requires external module "${meta.module}" which is not enabled`,
            path: ["parts", partIdx, "buses", busName, "devices"],
          });
        }

        // Class limits — driven from DEVICE_CLASS_LIMITS metadata
        if (meta.class) {
          const current = classCounts[meta.class] ?? 0;
          const limit = DEVICE_CLASS_LIMITS[meta.class as keyof typeof DEVICE_CLASS_LIMITS];
          if (typeof limit === "number" && current >= limit) {
            ctx.addIssue({
              code: "custom",
              message: `Too many "${meta.class}" devices; only ${limit} per part is supported`,
              path: ["parts", partIdx, "buses", busName, "devices"],
            });
          }
          classCounts[meta.class] = current + 1;
        }

        // Exclusive device check — driven from device metadata
        if (meta.exclusive && bus.devices.length > 1) {
          ctx.addIssue({
            code: "custom",
            message: `Bus "${busName}" contains exclusive device "${device.type}" and cannot share the bus with other devices`,
            path: ["parts", partIdx, "buses", busName, "devices"],
          });
        }

        // Device GPIO pins (CS, IRQ, etc.) — driven from device metadata gpio field
        if (meta.gpio) {
          for (const [role, req] of Object.entries(meta.gpio)) {
            if (!req.required) continue;

            const hasDevicePin = pinEntries(part).some(
              ([, u]) =>
                u?.usage === "device" &&
                (u as { usage: "device"; deviceId: string; role: string }).deviceId === device.id &&
                (u as { usage: "device"; deviceId: string; role: string }).role === role,
            );

            if (!hasDevicePin) {
              ctx.addIssue({
                code: "custom",
                message: `Device "${device.type}" on bus "${busName}" requires GPIO pin for "${req.label ?? role}"`,
                path: ["parts", partIdx, "buses", busName, "devices"],
              });
            }
          }
        }

        // Required bus-level pins per device — driven from device metadata requiredBusPins
        if (meta.requiredBusPins) {
          for (const [roleStr, required] of Object.entries(meta.requiredBusPins)) {
            if (!required) continue;
            const hasPin = busPinsByBus.get(busName)?.some((e) => e.role === roleStr) ?? false;
            if (!hasPin) {
              ctx.addIssue({
                code: "custom",
                message: `Device "${device.type}" on bus "${busName}" requires bus pin for ${roleStr.toUpperCase()}`,
                path: ["parts", partIdx, "buses", busName, "devices"],
              });
            }
          }
        }
      }
    }

    // Bus conflict detection — driven from SOC_BUS_CONFLICTS metadata
    const socConflicts = SOC_BUS_CONFLICTS as unknown as Record<string, [string, string][]>;
    const conflicts = socConflicts[socId] ?? [];
    const seenConflicts = new Set<string>();
    for (const [busA, busB] of conflicts) {
      const hasA = activeBuses.some((b) => b.name === busA);
      const hasB = activeBuses.some((b) => b.name === busB);
      if (hasA && hasB) {
        const key = [busA, busB].sort().join("|");
        if (!seenConflicts.has(key)) {
          seenConflicts.add(key);
          ctx.addIssue({
            code: "custom",
            message: `Uses conflicting buses "${busA}" and "${busB}" simultaneously`,
            path: ["parts", partIdx, "buses"],
          });
        }
      }
    }

    // ── 8. Device classification limits ─────────────────────
    // Already handled by DEVICE_CLASS_LIMITS above.
    // Additional per-class cross-checks that aren't simple max counts:
    const displayDevices: string[] = [];
    for (const bus of Object.values(part.buses)) {
      for (const device of bus.devices) {
        const meta = getDeviceMeta(device.type as never);
        if (meta.class === "display") {
          displayDevices.push(meta.visual?.name ?? device.type);
        }
      }
    }
    if (displayDevices.length > 1) {
      ctx.addIssue({
        code: "custom",
        message: `Only one display device is supported per part; found ${displayDevices.join(", ")}`,
        path: ["parts", partIdx, "buses"],
      });
    }

    // ── 9. Encoder configuration ────────────────────────────
    const encoderPinUsage = new Map<string, string>();

    part.encoders.forEach((enc, encIdx) => {
      const baseLabel = `encoder ${encIdx}`;

      // Find encoder pins from PinSelection
      const encPins = pinEntries(part).filter(
        ([, u]) => u?.usage === "encoder" && (u as { usage: "encoder"; encoderId: string }).encoderId === enc.id,
      );

      const pinA = encPins.find(([, u]) => (u as { usage: "encoder"; role: string }).role === "pinA");
      const pinB = encPins.find(([, u]) => (u as { usage: "encoder"; role: string }).role === "pinB");

      if (!pinA) {
        ctx.addIssue({
          code: "custom",
          message: `${baseLabel} A pin is not set`,
          path: ["parts", partIdx, "encoders", encIdx],
        });
      } else {
        const id = pinA[0];
        if (!validPinIds.has(id)) {
          ctx.addIssue({
            code: "custom",
            message: `Pin "${id}" for ${baseLabel} A does not exist on controller "${part.controller}"`,
            path: ["parts", partIdx, "pins", id],
          });
        }
        const prev = encoderPinUsage.get(id);
        if (prev && prev !== `${baseLabel} A`) {
          ctx.addIssue({ code: "custom", message: `Pin "${id}" is used for ${prev} and ${baseLabel} A; choose distinct pins`, path: ["parts", partIdx, "pins", id] });
        } else {
          encoderPinUsage.set(id, `${baseLabel} A`);
        }
      }

      if (!pinB) {
        ctx.addIssue({
          code: "custom",
          message: `${baseLabel} B pin is not set`,
          path: ["parts", partIdx, "encoders", encIdx],
        });
      } else {
        const id = pinB[0];
        if (!validPinIds.has(id)) {
          ctx.addIssue({
            code: "custom",
            message: `Pin "${id}" for ${baseLabel} B does not exist on controller "${part.controller}"`,
            path: ["parts", partIdx, "pins", id],
          });
        }
        const prev = encoderPinUsage.get(id);
        if (prev && prev !== `${baseLabel} B`) {
          ctx.addIssue({ code: "custom", message: `Pin "${id}" is used for ${prev} and ${baseLabel} B; choose distinct pins`, path: ["parts", partIdx, "pins", id] });
        } else {
          encoderPinUsage.set(id, `${baseLabel} B`);
        }
      }

      // A and B must be distinct
      if (pinA && pinB && pinA[0] === pinB[0]) {
        ctx.addIssue({
          code: "custom",
          message: `Encoder ${encIdx} must use different pins for A and B`,
          path: ["parts", partIdx, "encoders", encIdx],
        });
      }
    });

    // ── 10. Key wiring validation ───────────────────────────
    // Validate each key's wiring pins exist on the controller
    data.layout.forEach((key, idx) => {
      if (key.part !== partIdx) return;
      const wiring = part.keys[key.id];
      if (!wiring) {
        ctx.addIssue({
          code: "custom",
          message: `Key ${idx} is assigned to part ${partIdx} but has no wiring configuration`,
          path: ["parts", partIdx, "keys", key.id],
        });
        return;
      }

      if (wiring.input && !validPinIds.has(wiring.input)) {
        ctx.addIssue({
          code: "custom",
          message: `Key ${idx} uses unknown input pin "${wiring.input}"`,
          path: ["parts", partIdx, "keys", key.id, "input"],
        });
      }

      // only direct kscan can have no output
      if (wiring.output) {
        if (!validPinIds.has(wiring.output)) {
          ctx.addIssue({
            code: "custom",
            message: `Key ${idx} uses unknown output pin "${wiring.output}"`,
            path: ["parts", partIdx, "keys", key.id, "output"],
          });
        }
      } else {
        // get the kscan type by the key's input pin (if any)
        const input = wiring.input;
        if (input) {
          const usage = part.pins[input];
          if (usage && usage.usage === "kscan") {
            const kscanType = part.kscans.find(k => k.id === usage.kscan)?.kind;

            if (kscanType !== "direct") {
              ctx.addIssue({
                code: "custom",
                message: `Key ${idx} has no output pin but is wired to a ${kscanType ?? "unknown type"} kscan; only direct kscans can have no output pin`,
                path: ["parts", partIdx, "keys", key.id, "output"],
              });
            }
          }
        }
      }

      // Input and output must be distinct pins
      if (wiring.input && wiring.output && wiring.input === wiring.output) {
        ctx.addIssue({
          code: "custom",
          message: `Key ${idx} uses the same pin for both input and output; they must be different pins`,
          path: ["parts", partIdx, "keys", key.id],
        });
      }
    });

    // ── 11. Pin existence on controller ─────────────────────
    for (const pinId of Object.keys(part.pins)) {
      if (!validPinIds.has(pinId)) {
        ctx.addIssue({
          code: "custom",
          message: `Pin "${pinId}" does not exist on controller "${part.controller}"`,
          path: pinPath(pinId),
        });
      }
    }
  });
});

export type ValidatedKeyboard = z.infer<typeof ValidatedKeyboardSchema>;
