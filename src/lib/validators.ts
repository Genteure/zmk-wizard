import { controllerInfos } from "~/components/controllerInfo";
import { type Keyboard, ShieldNameSchema } from "~/typedef";
import { CommonShieldNames } from "./shieldNames";

type ValidatorResult = string | string[] | null;
type ValidatorFunction = (keyboard: Keyboard) => ValidatorResult;

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
        } else if (part.pins[outputPin] !== "output") {
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

      const validPinIds = Object.keys(controllerInfo.dtsMap);
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
