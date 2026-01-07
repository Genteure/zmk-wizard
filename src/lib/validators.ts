import { busDeviceInfos, controllerInfos } from "~/components/controllerInfo";
import type { BusDeviceTypeName } from "~/typedef";
import { BusNameSchema, ShieldNameSchema, type Keyboard } from "~/typedef";
import { isI2cBus, isSpiBus } from "~/typehelper";
import { CommonShieldNames } from "./shieldNames";

type ValidatorResult = string | string[] | null;
type ValidatorFunction = (keyboard: Keyboard) => ValidatorResult;

const validShifterPinIds: string[] = Array.from({ length: 32 }, (_, i) => `shifter${i}`);

const Validators: Record<string, ValidatorFunction> = {
  displayName: (keyboard: Keyboard) => {
    const name = keyboard.name;
    if (name !== name.trim()) {
      return "Keyboard name cannot start or end with spaces";
    }
    if (name.length === 0) {
      return "Keyboard name cannot be empty";
    }
    const byteLength = new TextEncoder().encode(name).length;
    if (byteLength > 16) {
      return `Keyboard name must be 16 bytes or less (currently ${byteLength})`;
    }
    return null;
  },
  shieldName: (keyboard: Keyboard) => {
    const shield = keyboard.shield;
    if (shield !== shield.trim()) {
      return "Shield name cannot start or end with spaces";
    }
    const validation = ShieldNameSchema.safeParse(shield);
    if (!validation.success) {
      const [issue] = validation.error.issues;
      return issue?.message ?? "Invalid shield name";
    }

    if (CommonShieldNames.includes(shield)) {
      return "Shield name is reserved; please choose another";
    }

    return null;
  },
  keyCount: (keyboard: Keyboard) => {
    const keyCount = keyboard.layout.length;
    if (keyCount === 0) {
      return "Keyboard must have at least one key";
    }
    if (keyCount > 256) {
      return "Keyboard cannot have more than 256 keys";
    }
    return null;
  },
  splitParts: (keyboard: Keyboard) => {
    // 1 to 5 parts allowed, ignore dongle
    const partCount = keyboard.parts.length;
    if (partCount < 1) {
      return "Keyboard must have at least one part";
    }
    if (partCount > 5) {
      return "More than 5 parts are not supported";
    }

    const nameErrors: string[] = [];
    for (let i = 0; i < partCount; i++) {
      const part = keyboard.parts[i];
      // only a-z lowercase allowed, nothing else
      if (!/^[a-z]+$/.test(part.name)) {
        nameErrors.push(`Part ${i + 1} name is invalid; only lowercase letters (a-z) are allowed`);
      }
      // unique part names
      for (let j = i + 1; j < partCount; j++) {
        const otherPart = keyboard.parts[j];
        if (part.name === otherPart.name) {
          nameErrors.push(`Part ${i + 1} and Part ${j + 1} have the same name; part names must be unique`);
        }
      }
      // do not allow "dongle" because it's a reserved word
      if (part.name === "dongle") {
        nameErrors.push(`Part ${i + 1} name cannot be "dongle" as it is reserved for the auto generated dongle part`);
      }
    }
    if (nameErrors.length > 0) {
      return nameErrors;
    }

    return null;
  },
  rp2040UnibodyOnly: (keyboard: Keyboard) => {
    const usesRp2040 = keyboard.parts.some((part) => controllerInfos[part.controller]?.soc === "rp2040");
    if (!usesRp2040) {
      return null;
    }

    const errors: string[] = [];

    if (keyboard.parts.length !== 1) {
      errors.push("RP2040-based controllers only support unibody keyboards; remove additional parts or choose a different controller");
    }

    if (keyboard.dongle) {
      errors.push("RP2040-based controllers do not support dongle mode; disable dongle or use a different controller");
    }

    return errors.length > 0 ? errors : null;
  },
  busConfiguration: (keyboard: Keyboard) => {
    const errors: string[] = [];

    keyboard.parts.forEach((part, partIndex) => {
      const controllerInfo = controllerInfos[part.controller];
      const validPins = controllerInfo ? new Set(Object.keys(controllerInfo.pins || {})) : null;

      const busPinUsage = new Map<string, string>();
      const seenBusNames = new Set<string>();
      const seenDeviceTypes = new Set<BusDeviceTypeName>();

      const recordPinUsage = (pinId: string, label: string) => {
        const prev = busPinUsage.get(pinId);
        if (prev && prev !== label) {
          errors.push(`Pin "${pinId}" in part "${part.name}" is used for ${prev} and ${label}; choose distinct pins.`);
        } else {
          busPinUsage.set(pinId, label);
        }
      };

      const validatePin = (pinId: string | undefined, label: string, required = false) => {
        if (!pinId) {
          if (required) {
            errors.push(`${label} in part "${part.name}" is not set`);
          }
          return false;
        }

        if (validPins && !validPins.has(pinId)) {
          errors.push(`Pin "${pinId}" for ${label} in part "${part.name}" does not exist on controller "${part.controller}"`);
        }

        const mode = part.pins?.[pinId];
        if (mode && mode !== "bus") {
          errors.push(`Pin "${pinId}" for ${label} in part "${part.name}" is marked as "${mode}" instead of "bus"`);
        }

        recordPinUsage(pinId, label);
        return true;
      };

      for (const bus of part.buses || []) {
        const nameValidation = BusNameSchema.safeParse(bus.name);
        if (!nameValidation.success) {
          const [issue] = nameValidation.error.issues;
          errors.push(`Bus name "${bus.name}" in part "${part.name}" is invalid${issue?.message ? `: ${issue.message}` : ""}`);
        }

        if (seenBusNames.has(bus.name)) {
          errors.push(`Bus name "${bus.name}" is duplicated in part "${part.name}"`);
        }
        seenBusNames.add(bus.name);

        const devices = bus.devices || [];

        for (const device of devices) {
          const type = device.type as BusDeviceTypeName;
          if (seenDeviceTypes.has(type)) {
            errors.push(`Part "${part.name}" has multiple "${type}" devices; only one is supported per part`);
          }
          seenDeviceTypes.add(type);
        }

        if (isI2cBus(bus)) {
          for (const device of devices) {
            if (device.type !== "ssd1306") {
              errors.push(`Device type "${device.type}" is not allowed on I2C bus "${bus.name}" in part "${part.name}"`);
            }
          }

          if (devices.length > 0) {
            const hasSda = validatePin(bus.sda, `bus "${bus.name}" SDA`, true);
            const hasScl = validatePin(bus.scl, `bus "${bus.name}" SCL`, true);

            if (hasSda && hasScl && bus.sda === bus.scl) {
              errors.push(`Bus "${bus.name}" in part "${part.name}" must use different pins for SDA and SCL`);
            }
          }
        } else if (isSpiBus(bus)) {
          const exclusiveDevices = devices.filter((d) => busDeviceInfos[d.type as BusDeviceTypeName]?.exclusive);
          if (exclusiveDevices.length > 0 && devices.length > 1) {
            errors.push(`Bus "${bus.name}" in part "${part.name}" contains exclusive device "${exclusiveDevices[0]?.type}" and cannot share the bus with other devices`);
          }

          for (const device of devices) {
            if (device.type === "ssd1306") {
              errors.push(`Device type "${device.type}" is not allowed on SPI bus "${bus.name}" in part "${part.name}"`);
            }
          }

          const requiredSignals = new Set<string>();
          for (const device of devices) {
            const info = busDeviceInfos[device.type as BusDeviceTypeName];
            if (!info?.needs) continue;
            for (const [signal, needed] of Object.entries(info.needs)) {
              if (!needed) continue;
              if (signal !== "cs") {
                requiredSignals.add(signal);
              }
            }
          }

          if (devices.length > 0) {
            for (const sig of requiredSignals) {
              const value = (bus as unknown as Record<string, string | undefined>)[sig];
              validatePin(value, `bus "${bus.name}" ${sig.toUpperCase()}`, true);
            }
          }

          (["mosi", "miso", "sck"] as const).forEach((sig) => {
            const value = bus[sig];
            if (value) {
              validatePin(value, `bus "${bus.name}" ${sig.toUpperCase()}`);
            }
          });

          const csUsage = new Map<string, string>();
          devices.forEach((device, idx) => {
            const info = busDeviceInfos[device.type as BusDeviceTypeName];
            const needsCs = info?.needs?.cs;
            const cs = (device as Record<string, string | undefined>).cs;

            if (needsCs && !cs) {
              errors.push(`Device "${device.type}" on bus "${bus.name}" in part "${part.name}" requires a CS pin`);
              return;
            }

            if (cs) {
              validatePin(cs, `bus "${bus.name}" CS for device ${device.type}`, Boolean(needsCs));
              if (csUsage.has(cs)) {
                csUsage.set(cs, `${csUsage.get(cs)} and device ${device.type}`);
                errors.push(`Multiple devices on bus "${bus.name}" in part "${part.name}" share CS pin "${cs}"`);
              } else {
                csUsage.set(cs, `device ${device.type} #${idx}`);
              }
            }
          });

          const definedBusPins = [
            { label: "MOSI", value: bus.mosi },
            { label: "MISO", value: bus.miso },
            { label: "SCK", value: bus.sck },
          ].filter((entry) => Boolean(entry.value));

          const seenWithinBus = new Map<string, string>();
          for (const entry of definedBusPins) {
            const pinId = entry.value as string;
            if (seenWithinBus.has(pinId)) {
              errors.push(`Bus "${bus.name}" in part "${part.name}" uses pin "${pinId}" for both ${seenWithinBus.get(pinId)} and ${entry.label}`);
            } else {
              seenWithinBus.set(pinId, entry.label);
            }
          }
        } else {
          const unknownBus = bus as unknown as { name?: string; type?: string };
          errors.push(`Bus "${unknownBus.name ?? "<unknown>"}" in part "${part.name}" has unknown type "${unknownBus.type ?? "unknown"}"`);
        }
      }

      const activeBuses = (part.buses || []).filter((b) => (b.devices || []).length > 0);
      const seenConflictPairs = new Set<string>();
      for (const bus of activeBuses) {
        const conflicts = controllerInfo?.busConflicts?.[bus.name] || [];
        for (const conflictName of conflicts) {
          if (activeBuses.some((b) => b.name === conflictName)) {
            const key = [bus.name, conflictName].sort().join("|");
            if (!seenConflictPairs.has(key)) {
              seenConflictPairs.add(key);
              errors.push(`Part "${part.name}" uses conflicting buses "${bus.name}" and "${conflictName}" simultaneously`);
            }
          }
        }
      }

      if (validPins) {
        const keyPinUsage = new Map<string, string[]>();
        keyboard.layout.forEach((key) => {
          if (key.part !== partIndex) return;
          const wiring = part.keys[key.id];
          if (!wiring) return;
          const pins = [wiring.input, wiring.output];
          pins.forEach((pin) => {
            if (!pin || !validPins.has(pin)) return;
            const list = keyPinUsage.get(pin) || [];
            list.push(key.id);
            keyPinUsage.set(pin, list);
          });
        });

        for (const [pinId, label] of busPinUsage.entries()) {
          const wiredKeys = keyPinUsage.get(pinId);
          if (wiredKeys && wiredKeys.length > 0) {
            errors.push(`Pin "${pinId}" in part "${part.name}" is used for ${label} and also wired to key(s) ${wiredKeys.join(", ")}`);
          }
        }
      }
    });

    return errors.length > 0 ? errors : null;
  },
  keyHaveValidWiring: (keyboard: Keyboard) => {
    // Validate each key based on its owning part's wiring type and pin modes
    const visitedKeyIds = new Set<string>();
    const errors: string[] = [];
    const invalidPartIndices: number[] = [];
    const missingPinsByPart: Record<string, { input: number[]; output: number[] }> = {};
    const unexpectedOutputByPart: Record<string, number[]> = {};
    const wiringSigsByPart: Record<string, Map<string, number[]>> = {};

    const ensurePartRecord = (name: string) => {
      if (!missingPinsByPart[name]) {
        missingPinsByPart[name] = { input: [], output: [] };
      }
    };
    const ensureUnexpectedRecord = (name: string) => {
      if (!unexpectedOutputByPart[name]) {
        unexpectedOutputByPart[name] = [];
      }
    };
    const ensureSigMap = (name: string) => {
      if (!wiringSigsByPart[name]) {
        wiringSigsByPart[name] = new Map<string, number[]>();
      }
    };

    const shifterPinCountPerPart: number[] = keyboard.parts.map((part) => {
      const shifterDevice = (() => {
        for (const bus of part.buses) {
          for (const device of bus.devices) {
            if (device.type === "74hc595") {
              return device;
            }
          }
        }
        return null;
      })();
      return shifterDevice?.ngpios || 0;
    });

    keyboard.layout.forEach((key, index) => {
      // Skip duplicate IDs defensively
      if (visitedKeyIds.has(key.id)) {
        errors.push(`Duplicate key id "${key.id}" found at index ${index}`);
        return;
      }
      visitedKeyIds.add(key.id);

      const part = keyboard.parts[key.part];
      if (!part) {
        invalidPartIndices.push(index);
        return;
      }

      const wiringType = part.wiring;
      const isMatrix = wiringType === "matrix_diode" || wiringType === "matrix_no_diode";
      const isDirect = wiringType === "direct_gnd" || wiringType === "direct_vcc";

      const wiring = part.keys[key.id];
      const inputPin = wiring?.input;
      const outputPin = wiring?.output;

      // shifterPinIndex is either not found (-1) or the index of the pin within the shifter pins
      const shifterPinIndex = validShifterPinIds.findIndex((pid) => pid === outputPin);
      // for a shifter pin to be valid, it must be within the range of pins provided by the shifter device on this part
      const isValidShifterOutput = shifterPinIndex >= 0 && shifterPinIndex < shifterPinCountPerPart[key.part];

      if (isMatrix) {
        // Matrix wiring requires both input and output pins and they must exist with correct modes
        const hasInput = typeof inputPin === "string" && inputPin !== "";
        const hasOutput = typeof outputPin === "string" && outputPin !== "";

        if (!hasInput) {
          ensurePartRecord(part.name);
          missingPinsByPart[part.name].input.push(index);
        } else if (part.pins[inputPin] !== "input") {
          errors.push(`Key ${index} in part "${part.name}" uses input pin "${inputPin}" which is not configured as input`);
        }

        if (!hasOutput) {
          ensurePartRecord(part.name);
          missingPinsByPart[part.name].output.push(index);
        } else if (!isValidShifterOutput && part.pins[outputPin] !== "output") {
          errors.push(`Key ${index} in part "${part.name}" uses output pin "${outputPin}" which is not configured as output`);
        }

        // Record signature for duplicate detection when both pins exist
        if (hasInput && hasOutput) {
          ensureSigMap(part.name);
          const sig = JSON.stringify({ t: "m", i: inputPin, o: outputPin });
          const map = wiringSigsByPart[part.name];
          const list = map.get(sig) ?? [];
          list.push(index);
          map.set(sig, list);
        }
      } else if (isDirect) {
        // Direct wiring should have a single input pin; output is not used
        const hasInput = typeof inputPin === "string" && inputPin !== "";

        if (!hasInput) {
          ensurePartRecord(part.name);
          missingPinsByPart[part.name].input.push(index);
        } else if (!part.pins[inputPin]) {
          errors.push(`Key ${index} in part "${part.name}" references unknown pin "${inputPin}"`);
        } else if (part.pins[inputPin] !== "input") {
          errors.push(`Key ${index} in part "${part.name}" uses pin "${inputPin}" which is not configured as input`);
        }
        // If someone set output for direct, warn as error to avoid confusion
        if (typeof outputPin === "string" && outputPin !== "") {
          ensureUnexpectedRecord(part.name);
          unexpectedOutputByPart[part.name].push(index);
        }

        // Record signature for duplicate detection when input exists
        if (hasInput) {
          ensureSigMap(part.name);
          const sig = JSON.stringify({ t: "d", i: inputPin });
          const map = wiringSigsByPart[part.name];
          const list = map.get(sig) ?? [];
          list.push(index);
          map.set(sig, list);
        }
      }
    });

    // Aggregate missing pin errors by part
    for (const [partName, missing] of Object.entries(missingPinsByPart)) {
      if (missing.input.length > 0) {
        errors.push(`Key ${missing.input.join(", ")} in part "${partName}" are missing an input pin`);
      }
      if (missing.output.length > 0) {
        errors.push(`Key ${missing.output.join(", ")} in part "${partName}" are missing an output pin`);
      }
    }

    // Aggregate unexpected output pins for direct wiring by part
    for (const [partName, indices] of Object.entries(unexpectedOutputByPart)) {
      if (indices.length > 0) {
        errors.push(`Key ${indices.join(", ")} in part "${partName}" should not set an output pin`);
      }
    }

    // Aggregate duplicate wiring per part (same pins used by multiple keys)
    for (const [partName, sigMap] of Object.entries(wiringSigsByPart)) {
      for (const [sig, indices] of sigMap.entries()) {
        if (indices.length > 1) {
          let detail = "";
          try {
            const parsed = JSON.parse(sig) as { t: "m" | "d"; i: string; o?: string };
            detail = parsed.t === "m"
              ? `input "${parsed.i}" and output "${parsed.o ?? ""}"`
              : `input "${parsed.i}"`;
          } catch {
            detail = "same wiring";
          }
          errors.push(`Key ${indices.join(", ")} in part "${partName}" share the same wiring (${detail})`);
        }
      }
    }

    if (invalidPartIndices.length > 0) {
      errors.push(`Key ${invalidPartIndices.join(", ")} reference invalid parts`);
    }
    if (errors.length > 0) {
      return errors;
    }
    return null;
  },
  pinsUsedActuallyExist: (keyboard: Keyboard) => {
    const errors: string[] = [];
    // Check each part's selected pins actually exist in its pinout
    // Verify pins against out internal controller pinout definition
    for (const part of keyboard.parts) {

      const controllerInfo = controllerInfos[part.controller];
      if (!controllerInfo) {
        errors.push(`Unknown controller "${part.controller}" in part "${part.name}"`);
        continue;
      }

      const validPinIds = Object.keys(controllerInfo.pins);
      const invalidSelections: string[] = [];

      // Validate selected pin modes against controller pin availability
      for (const pinId of Object.keys(part.pins)) {
        if (!validPinIds.includes(pinId)) {
          invalidSelections.push(pinId);
        }
      }

      if (invalidSelections.length > 0) {
        errors.push(`Pins ${invalidSelections.join(", ")} in part "${part.name}" do not exist on controller "${part.controller}"`);
      }
    }

    if (errors.length > 0) {
      return errors;
    }
    return null;
  },

};

export function validateKeyboard(keyboard: Keyboard): string[] {
  const errors: string[] = [];
  for (const [_name, validator] of Object.entries(Validators)) {
    const error = validator(keyboard);
    if (error) {
      if (Array.isArray(error)) {
        errors.push(...error);
      } else {
        errors.push(error);
      }
    }
  }
  return errors;
}
