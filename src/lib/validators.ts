import { controllerInfos, deviceClassRules, getBusDeviceMetadata, requiredBusPinsForDevice, socBusData } from "~/components/controllerInfo";
import type { BusDeviceTypeName } from "~/typedef";
import { BusNameSchema, ShieldNameSchema, type Keyboard } from "~/typedef";
import { isI2cBus, isSpiBus } from "~/typehelper";
import { CommonShieldNames } from "./shieldNames";

export type ValidationError = { part: number | null; message: string };
type ValidatorResult = ValidationError[] | null;
type ValidatorFunction = (keyboard: Keyboard) => ValidatorResult;

const validShifterPinIds: string[] = Array.from({ length: 32 }, (_, i) => `shifter${i}`);

const Validators: Record<string, ValidatorFunction> = {
  displayName: (keyboard: Keyboard) => {
    const name = keyboard.name;
    if (name !== name.trim()) {
      return [{ part: null, message: "Keyboard name cannot start or end with spaces" }];
    }
    if (name.length === 0) {
      return [{ part: null, message: "Keyboard name cannot be empty" }];
    }
    const byteLength = new TextEncoder().encode(name).length;
    if (byteLength > 16) {
      return [{ part: null, message: `Keyboard name must be 16 bytes or less (currently ${byteLength})` }];
    }
    return null;
  },
  shieldName: (keyboard: Keyboard) => {
    const shield = keyboard.shield;
    if (shield !== shield.trim()) {
      return [{ part: null, message: "Shield name cannot start or end with spaces" }];
    }
    const validation = ShieldNameSchema.safeParse(shield);
    if (!validation.success) {
      const [issue] = validation.error.issues;
      return [{ part: null, message: issue?.message ?? "Invalid shield name" }];
    }

    if (CommonShieldNames.includes(shield)) {
      return [{ part: null, message: "Shield name is reserved; please choose another" }];
    }

    return null;
  },
  keyCountAndLogicalLayout: (keyboard: Keyboard) => {
    const keyCount = keyboard.layout.length;
    if (keyCount === 0) {
      return [{ part: null, message: "Keyboard must have at least one key" }];
    }
    if (keyCount > 256) {
      return [{ part: null, message: "Do you really have more than 256 keys?" }];
    }

    // check for valid logical layout
    // 1. all keys must have unique rows and cols
    // 2. key must be sorted by row then col

    const posToKeyIndex: Record<string, number[]> = {};
    // for (const key of keyboard.layout) {
    keyboard.layout.forEach((key, i) => {
      const posKey = `${key.row},${key.col}`;
      (posToKeyIndex[posKey] = posToKeyIndex[posKey] || []).push(i);
    })

    const errors = Object.entries(posToKeyIndex)
      .filter(([_, indices]) => indices.length > 1)
      .map(([pos, indices]) => ({
        part: null,
        message: `Multiple keys (${indices.join(", ")}) share the same logical position at row ${pos.split(",")[0]}, col ${pos.split(",")[1]}`,
      }));

    return errors.length > 0 ? errors : null;
  },
  splitParts: (keyboard: Keyboard) => {
    // 1 to 5 parts allowed, ignore dongle
    const partCount = keyboard.parts.length;
    if (partCount < 1) {
      return [{ part: null, message: "Keyboard must have at least one part" }];
    }
    if (partCount > 5) {
      return [{ part: null, message: "More than 5 parts are not supported" }];
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
      if (part.name === "dongle" && keyboard.dongle) {
        nameErrors.push(`Part ${i + 1} name cannot be "dongle" as it is reserved for the auto generated dongle part`);
      }
    }
    if (nameErrors.length > 0) {
      return nameErrors.map(m => ({ part: null, message: m }));
    }

    return null;
  },
  rp2040UnibodyOnly: (keyboard: Keyboard) => {
    const usesRp2040 = keyboard.parts.some((part) => controllerInfos[part.controller]?.soc === "rp2040");
    if (!usesRp2040) {
      return null;
    }

    const errors: ValidationError[] = [];

    if (keyboard.parts.length !== 1) {
      errors.push({ part: null, message: "RP2040-based controllers only support unibody keyboards; remove additional parts or choose a different controller" });
    }

    if (keyboard.dongle) {
      errors.push({ part: null, message: "RP2040-based controllers do not support dongle mode; disable dongle or use a different controller" });
    }

    return errors.length > 0 ? errors : null;
  },
  /**
   * Validate bus and device configuration for each part
   * - Ensure bus names are valid and unique within part
   * - Ensure device types are valid for the bus type
   * - Ensure required bus pins are set and valid (pin use set to "bus", no dual use)
   * - Ensure no pin conflicts between buses and devices
   * - Ensure no conflicting buses are used simultaneously
   * - Ensure no duplicate exclusive devices
   */
  busConfiguration: (keyboard: Keyboard) => {
    const errors: ValidationError[] = [];

    keyboard.parts.forEach((part, partIndex) => {
      const controllerInfo = controllerInfos[part.controller];
      if (!controllerInfo) {
        errors.push({ part: partIndex, message: `Unknown controller "${part.controller}"` });
        return;
      }

      const validPins = new Set(Object.keys(controllerInfo.pins))

      type PinUsage = {
        label: string;
        busType?: "i2c" | "spi";
        busName?: string;
        signal?: string;
      };

      const busPinUsage = new Map<string, PinUsage[]>();
      const seenBusNames = new Set<string>();
      const classCounts: Record<string, number> = {};

      const canSharePinUsage = (a: PinUsage, b: PinUsage) => {
        if (a.busType === "spi" && b.busType === "spi" && a.busName === b.busName) {
          const signals = new Set([a.signal, b.signal]);
          if (signals.has("mosi") && signals.has("miso")) return true;
        }

        return a.label === b.label;
      };

      const recordPinUsage = (pinId: string, usage: PinUsage) => {
        const prevList = busPinUsage.get(pinId) || [];
        const conflict = prevList.find((prev) => !canSharePinUsage(prev, usage));

        if (conflict) {
          errors.push({ part: partIndex, message: `Pin "${pinId}" is used for ${conflict.label} and ${usage.label}; choose distinct pins.` });
          return;
        }

        busPinUsage.set(pinId, [...prevList, usage]);
      };

      const validatePin = (pinId: string | undefined, label: string, required = false, usage: Partial<PinUsage> = {}) => {
        if (!pinId) {
          if (required) {
            // upper case first char
            const labelText = label ? (label.charAt(0).toUpperCase() + label.slice(1)) : label;
            errors.push({ part: partIndex, message: `${labelText} is not set` });
          }
          return false;
        }

        if (validPins && !validPins.has(pinId)) {
          errors.push({ part: partIndex, message: `Pin "${pinId}" for ${label} does not exist on controller "${part.controller}"` });
        }

        const mode = part.pins?.[pinId];
        if (mode && mode !== "bus") {
          errors.push({ part: partIndex, message: `Pin "${pinId}" for ${label} is marked as "${mode}" instead of "bus"` });
        }

        recordPinUsage(pinId, { label, ...usage });
        return true;
      };

      for (const bus of part.buses || []) {
        const nameValidation = BusNameSchema.safeParse(bus.name);
        if (!nameValidation.success) {
          const [issue] = nameValidation.error.issues;
          errors.push({ part: partIndex, message: `Bus name "${bus.name}" is invalid${issue?.message ? `: ${issue.message}` : ""}` });
        }

        if (seenBusNames.has(bus.name)) {
          errors.push({ part: partIndex, message: `Bus name "${bus.name}" is duplicated` });
        }
        seenBusNames.add(bus.name);

        const devices = bus.devices || [];

        for (const device of devices) {
          const meta = getBusDeviceMetadata(device.type);
          if (!meta) {
            errors.push({ part: partIndex, message: `Unknown device type "${device.type}" on bus "${bus.name}"` });
            continue;
          }
          if (meta.bus !== bus.type) {
            errors.push({ part: partIndex, message: `Device type "${device.type}" is not allowed on ${bus.type.toUpperCase()} bus "${bus.name}"` });
          }
        }

        for (const device of devices) {
          const meta = getBusDeviceMetadata(device.type);
          const rule = deviceClassRules[meta.class];
          const current = classCounts[meta.class] ?? 0;
          if (typeof rule.maxPerPart === "number" && current >= rule.maxPerPart) {
            errors.push({ part: partIndex, message: `Too many ${meta.class.replace("_", " ")} devices; only ${rule.maxPerPart} per part is supported` });
          }
          classCounts[meta.class] = current + 1;
        }

        // TODO this typing is annoying and pointless
        // Determine allowed pins from pinctrl choices for this bus
        const pinChoices = controllerInfo.pinctrlChoices(bus.name);
        if (!pinChoices) {
          errors.push({ part: partIndex, message: `Controller "${part.controller}" does not have bus "${bus.name}"` });
          continue;
        }
        // Determine hardware-required signals via SoC bus data
        const requiredBySoc = socBusData[controllerInfos[part.controller].soc].pinRequirements[bus.name] || [];

        const validateDevicePinProps = () => {
          for (const [_idx, device] of devices.entries()) {
            const meta = getBusDeviceMetadata(device.type);
            if (!meta) continue;

            Object.entries(meta.props).forEach(([propKey, propDef]) => {
              if (propDef.widget !== "pin") return;
              const pinId = (device as Record<string, string | undefined>)[propKey];
              const required = !propDef.optional;
              const label = propDef.name || propKey.toUpperCase();

              if (!pinId) {
                if (required) {
                  errors.push({ part: partIndex, message: `Device "${device.type}" on bus "${bus.name}" requires ${label}` });
                }
                return;
              }

              validatePin(pinId, `bus "${bus.name}" ${label} for device ${device.type}`, required);
            });
          }
        };

        if (isI2cBus(bus)) {
          if (pinChoices.type !== 'i2c') {
            errors.push({ part: partIndex, message: `Controller "${part.controller}" does not have I2C bus "${bus.name}"` });
            continue;
          }

          const requiredSignals = new Set<string>();
          devices.forEach((d) => requiredBusPinsForDevice(d.type).forEach((sig) => requiredSignals.add(sig)));
          requiredBySoc.forEach((sig) => requiredSignals.add(sig));

          if (devices.length > 0) {
            for (const sig of requiredSignals) {
              const value = (bus as unknown as Record<string, string | undefined>)[sig];
              validatePin(value, `bus "${bus.name}" ${sig.toUpperCase()}`, true, { busType: bus.type, busName: bus.name, signal: sig });
            }
          }

          // Membership checks: selected pins must be within allowed sets
          if (bus.sda && !pinChoices.sda.includes(bus.sda)) {
            errors.push({ part: partIndex, message: `Pin "${bus.sda}" for bus "${bus.name}" SDA is not allowed on controller "${part.controller}"` });
          }
          if (bus.scl && !pinChoices.scl.includes(bus.scl)) {
            errors.push({ part: partIndex, message: `Pin "${bus.scl}" for bus "${bus.name}" SCL is not allowed on controller "${part.controller}"` });
          }

          // SDA/SCL must be distinct when both set
          if (bus.sda && bus.scl && bus.sda === bus.scl) {
            errors.push({ part: partIndex, message: `Bus "${bus.name}" must use different pins for SDA and SCL` });
          }

          validateDevicePinProps();
        } else if (isSpiBus(bus)) {
          if (pinChoices.type !== 'spi') {
            errors.push({ part: partIndex, message: `Controller "${part.controller}" does not have SPI bus "${bus.name}"` });
            continue;
          }

          const exclusiveDevices = devices.filter((d) => getBusDeviceMetadata(d.type)?.exclusive);
          if (exclusiveDevices.length > 0 && devices.length > 1) {
            errors.push({ part: partIndex, message: `Bus "${bus.name}" contains exclusive device "${exclusiveDevices[0]?.type}" and cannot share the bus with other devices` });
          }

          const requiredSignals = new Set<string>();
          for (const device of devices) {
            requiredBusPinsForDevice(device.type)
              .filter((signal) => signal !== "cs")
              .forEach((signal) => requiredSignals.add(signal));
          }

          // Include SoC-level required signals from busPinRequirements
          for (const sig of requiredBySoc) {
            if (sig !== "cs") requiredSignals.add(sig);
          }

          if (devices.length > 0) {
            for (const sig of requiredSignals) {
              const value = (bus as unknown as Record<string, string | undefined>)[sig];
              validatePin(value, `bus "${bus.name}" ${sig.toUpperCase()}`, true, { busType: bus.type, busName: bus.name, signal: sig });
            }
          }

          // Validate selected pins and membership within allowed sets
          (["mosi", "miso", "sck"] as const).forEach((sig) => {
            const value = bus[sig];
            if (value) {
              validatePin(value, `bus "${bus.name}" ${sig.toUpperCase()}`, false, { busType: bus.type, busName: bus.name, signal: sig });
              if (!pinChoices[sig].includes(value)) {
                errors.push({ part: partIndex, message: `Pin "${value}" for bus "${bus.name}" ${sig.toUpperCase()} is not allowed on controller "${part.controller}"` });
              }
            }
          });

          validateDevicePinProps();

          const definedBusPins = [
            { label: "MOSI", signal: "mosi", value: bus.mosi },
            { label: "MISO", signal: "miso", value: bus.miso },
            { label: "SCK", signal: "sck", value: bus.sck },
          ].filter((entry) => Boolean(entry.value));

          const seenWithinBus = new Map<string, { label: string; signal: string }>();
          for (const entry of definedBusPins) {
            const pinId = entry.value as string;
            const prev = seenWithinBus.get(pinId);
            const signals = new Set([prev?.signal, entry.signal]);
            const allowShare = isSpiBus(bus) && signals.has("mosi") && signals.has("miso");

            if (prev && !allowShare) {
              errors.push({ part: partIndex, message: `Bus "${bus.name}" uses pin "${pinId}" for both ${prev.label} and ${entry.label}` });
            } else {
              seenWithinBus.set(pinId, { label: entry.label, signal: entry.signal });
            }
          }
        } else {
          const unknownBus = bus as unknown as { name?: string; type?: string };
          errors.push({ part: partIndex, message: `Bus "${unknownBus.name ?? "<unknown>"}" has unknown type "${unknownBus.type ?? "unknown"}"` });
        }
      }

      const activeBuses = (part.buses || []).filter((b) => (b.devices || []).length > 0);
      const seenConflictPairs = new Set<string>();
      const conflictsForSoc = socBusData[controllerInfos[part.controller].soc].conflicts;
      for (const bus of activeBuses) {
        const conflicts = conflictsForSoc[bus.name] || [];
        for (const conflictName of conflicts) {
          if (activeBuses.some((b) => b.name === conflictName)) {
            const key = [bus.name, conflictName].sort().join("|");
            if (!seenConflictPairs.has(key)) {
              seenConflictPairs.add(key);
              errors.push({ part: partIndex, message: `Uses conflicting buses "${bus.name}" and "${conflictName}" simultaneously` });
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

        for (const [pinId, usages] of busPinUsage.entries()) {
          const wiredKeys = keyPinUsage.get(pinId);
          if (wiredKeys && wiredKeys.length > 0) {
            const labels = usages.map((usage) => usage.label).join(" and ");
            errors.push({ part: partIndex, message: `Pin "${pinId}" is used for ${labels} and also wired to key(s) ${wiredKeys.join(", ")}` });
          }
        }
      }
    });

    return errors.length > 0 ? errors : null;
  },
  deviceClassification: (keyboard: Keyboard) => {
    const errors: ValidationError[] = [];
    // Add more device class checks here as needed

    // each keyboard part can only have up to 1 display
    keyboard.parts.forEach((part, partIndex) => {
      const displayDevices: BusDeviceTypeName[] = [];
      for (const bus of part.buses) {
        for (const device of bus.devices) {
          const meta = getBusDeviceMetadata(device.type);
          if (meta?.class === "display") {
            displayDevices.push(device.type);
          }
        }
      }

      if (displayDevices.length > 1) {
        errors.push({ part: partIndex, message: "Only one display device is supported per part; found " + displayDevices.map(id => getBusDeviceMetadata(id)?.fullName || id).join(", ") });
      }
    });

    return errors.length > 0 ? errors : null;
  },
  encoderConfiguration: (keyboard: Keyboard) => {
    const errors: ValidationError[] = [];

    keyboard.parts.forEach((part, partIndex) => {
      const controllerInfo = controllerInfos[part.controller];
      const validPins = controllerInfo ? new Set(Object.keys(controllerInfo.pins || {})) : null;

      const encoderPinUsage = new Map<string, string>();
      const recordEncoderPin = (pinId: string, label: string) => {
        const prev = encoderPinUsage.get(pinId);
        if (prev && prev !== label) {
          errors.push({ part: partIndex, message: `Pin "${pinId}" is used for ${prev} and ${label}; choose distinct pins.` });
        } else {
          encoderPinUsage.set(pinId, label);
        }
      };

      const validatePin = (pinId: string | undefined, label: string) => {
        if (!pinId) {
          const labelText = label ? (label.charAt(0).toUpperCase() + label.slice(1)) : label;
          errors.push({ part: partIndex, message: `${labelText} is not set` });
          return;
        }

        if (validPins && !validPins.has(pinId)) {
          errors.push({ part: partIndex, message: `Pin "${pinId}" for ${label} does not exist on controller "${part.controller}"` });
        }

        const mode = part.pins?.[pinId];
        if (mode && mode !== "encoder") {
          errors.push({ part: partIndex, message: `Pin "${pinId}" for ${label} is marked as "${mode}" instead of "encoder"` });
        }

        recordEncoderPin(pinId, label);
      };

      (part.encoders || []).forEach((enc, idx) => {
        const baseLabel = `encoder ${idx + 1}`;
        validatePin(enc.pinA, `${baseLabel} A`);
        validatePin(enc.pinB, `${baseLabel} B`);

        if (enc.pinS) {
          // validatePin(enc.pinS, `${baseLabel} button`);
          // data structure exists but Shield Wizard does not support configuring it yet
          errors.push({ part: partIndex, message: `Push button pin for ${baseLabel} cannot be set here; it must be wired into the key matrix.` });
        }

        if (enc.pinA && enc.pinB && enc.pinA === enc.pinB) {
          errors.push({ part: partIndex, message: `Encoder ${idx + 1} must use different pins for A and B` });
        }
      });
    });

    return errors.length > 0 ? errors : null;
  },
  keyHaveValidWiring: (keyboard: Keyboard) => {
    // Validate each key based on its owning part's wiring type and pin modes
    const visitedKeyIds = new Set<string>();
    const errors: ValidationError[] = [];
    const invalidPartIndices: number[] = [];
    const missingPinsByPart: Record<number, { input: number[]; output: number[] }> = {};
    const unexpectedOutputByPart: Record<number, number[]> = {};
    const wiringSigsByPart: Record<number, Map<string, number[]>> = {};

    const ensurePartRecord = (idx: number) => {
      if (!missingPinsByPart[idx]) {
        missingPinsByPart[idx] = { input: [], output: [] };
      }
    };
    const ensureUnexpectedRecord = (idx: number) => {
      if (!unexpectedOutputByPart[idx]) {
        unexpectedOutputByPart[idx] = [];
      }
    };
    const ensureSigMap = (idx: number) => {
      if (!wiringSigsByPart[idx]) {
        wiringSigsByPart[idx] = new Map<string, number[]>();
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
        errors.push({ part: null, message: `Duplicate key id "${key.id}" found at index ${index}` });
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
          ensurePartRecord(key.part);
          missingPinsByPart[key.part].input.push(index);
        } else if (part.pins[inputPin] !== "input") {
          errors.push({ part: key.part, message: `Key ${index} uses input pin "${inputPin}" which is not configured as input` });
        }

        if (!hasOutput) {
          ensurePartRecord(key.part);
          missingPinsByPart[key.part].output.push(index);
        } else if (!isValidShifterOutput && part.pins[outputPin] !== "output") {
          errors.push({ part: key.part, message: `Key ${index} uses output pin "${outputPin}" which is not configured as output` });
        }

        // Record signature for duplicate detection when both pins exist
        if (hasInput && hasOutput) {
          ensureSigMap(key.part);
          const sig = JSON.stringify({ t: "m", i: inputPin, o: outputPin });
          const map = wiringSigsByPart[key.part];
          const list = map.get(sig) ?? [];
          list.push(index);
          map.set(sig, list);
        }
      } else if (isDirect) {
        // Direct wiring should have a single input pin; output is not used
        const hasInput = typeof inputPin === "string" && inputPin !== "";

        if (!hasInput) {
          ensurePartRecord(key.part);
          missingPinsByPart[key.part].input.push(index);
        } else if (!part.pins[inputPin]) {
          errors.push({ part: key.part, message: `Key ${index} references unknown pin "${inputPin}"` });
        } else if (part.pins[inputPin] !== "input") {
          errors.push({ part: key.part, message: `Key ${index} uses pin "${inputPin}" which is not configured as input` });
        }
        // If someone set output for direct, warn as error to avoid confusion
        if (typeof outputPin === "string" && outputPin !== "") {
          ensureUnexpectedRecord(key.part);
          unexpectedOutputByPart[key.part].push(index);
        }

        // Record signature for duplicate detection when input exists
        if (hasInput) {
          ensureSigMap(key.part);
          const sig = JSON.stringify({ t: "d", i: inputPin });
          const map = wiringSigsByPart[key.part];
          const list = map.get(sig) ?? [];
          list.push(index);
          map.set(sig, list);
        }
      }
    });

    // Aggregate missing pin errors by part
    for (const [partIndexAsString, missing] of Object.entries(missingPinsByPart)) {
      const partIndex = Number(partIndexAsString);
      if (missing.input.length > 0) {
        errors.push({ part: partIndex, message: `Key ${missing.input.join(", ")} are missing input pin` });
      }
      if (missing.output.length > 0) {
        errors.push({ part: partIndex, message: `Key ${missing.output.join(", ")} are missing output pin` });
      }
    }

    // Aggregate unexpected output pins for direct wiring by part
    for (const [partIndexAsString, indices] of Object.entries(unexpectedOutputByPart)) {
      const partIndex = Number(partIndexAsString);
      if (indices.length > 0) {
        errors.push({ part: partIndex, message: `Key ${indices.join(", ")} should not set output pin` });
      }
    }

    // Aggregate duplicate wiring per part (same pins used by multiple keys)
    for (const [partIndexAsString, sigMap] of Object.entries(wiringSigsByPart)) {
      const partIndex = Number(partIndexAsString);
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
          errors.push({ part: partIndex, message: `Key ${indices.join(", ")} share the same wiring (${detail})` });
        }
      }
    }

    if (invalidPartIndices.length > 0) {
      errors.push({ part: null, message: `Key ${invalidPartIndices.join(", ")} reference invalid parts` });
    }
    if (errors.length > 0) {
      return errors;
    }
    return null;
  },
  pinsUsedActuallyExist: (keyboard: Keyboard) => {
    const errors: ValidationError[] = [];
    // Check each part's selected pins actually exist in its pinout
    // Verify pins against out internal controller pinout definition
    for (const [partIndex, part] of keyboard.parts.entries()) {

      const controllerInfo = controllerInfos[part.controller];
      if (!controllerInfo) {
        errors.push({ part: partIndex, message: `Unknown controller "${part.controller}"` });
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
        errors.push({ part: partIndex, message: `Pins ${invalidSelections.join(", ")} do not exist on controller "${part.controller}"` });
      }
    }

    if (errors.length > 0) {
      return errors;
    }
    return null;
  },

};

export function validateKeyboard(keyboard: Keyboard): ValidationError[] {
  const errors: ValidationError[] = [];
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
