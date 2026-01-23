import { createEffect, createSignal, For, Show, type VoidComponent } from "solid-js";
import type { AllDeviceDataTypes, AllWidgetTypes, DevicePropDefinition } from "../controllerInfo";

export type DevicePropFieldProps = {
  label: string;
  required: boolean;
  desc?: string | undefined;
  value: AllDeviceDataTypes;
  propKey: string;
  propDef: DevicePropDefinition<AllDeviceDataTypes | undefined>;
  onChange: (value: AllDeviceDataTypes | undefined) => void;
  pins?: readonly string[] | undefined;
  isPinBusy?: (pin: string, current?: string) => boolean;
  pinLabelForPinId: (pinId: string) => string;
};

export const devicePropWidgetRenderers: Record<AllWidgetTypes, VoidComponent<DevicePropFieldProps>> = {
  pin: (props) => (
    <label class="flex flex-col gap-1">
      <span class="text-sm uppercase text-base-content/75">
        {props.label}{props.required ? <span class="text-red-500 ml-1" title="Required">*</span> : null}
      </span>
      <select
        class="select select-bordered select-sm"
        value={(props.value as string) || ""}
        onChange={(e) => props.onChange(e.currentTarget.value)}
      >
        <option value="">{props.required ? "Select pin" : "None"}</option>
        <For each={props.pins}>{(pin) => (
          <option value={pin} disabled={props.isPinBusy?.(pin, props.value as string | undefined)}>
            {props.pinLabelForPinId(pin) + (props.isPinBusy?.(pin, props.value as string | undefined) ? " (in use)" : "")}
          </option>
        )}</For>
      </select>
      <Show when={props.desc}>
        <span class="text-xs/tight text-base-content/60">{props.desc}</span>
      </Show>
    </label>
  ),
  checkbox: (props) => (
    <label class="flex flex-col gap-1">
      <span class="text-sm uppercase text-base-content/75">{props.label}</span>
      <div class="flex items-center gap-2">
        <input
          type="checkbox"
          class="toggle toggle-sm"
          checked={Boolean(props.value)}
          onChange={(e) => props.onChange(e.currentTarget.checked)}
        />
      </div>
      <Show when={props.desc}>
        <span class="text-xs/tight text-base-content/60">{props.desc}</span>
      </Show>
    </label>
  ),
  numberOptions: (props) => (
    <label class="flex flex-col gap-1">
      <span class="text-sm uppercase text-base-content/75">{props.label}</span>
      <select
        class="select select-bordered select-sm"
        value={(props.value as number | undefined) ?? ""}
        onChange={(e) => props.onChange(Number(e.currentTarget.value))}
      >
        <For each={(props.propDef.options as number[] | undefined)}>{(opt) => <option value={opt}>{opt}</option>}</For>
      </select>
      <Show when={props.desc}>
        <span class="text-xs/tight text-base-content/60">{props.desc}</span>
      </Show>
    </label>
  ),
  stringOptions: (props) => (
    <label class="flex flex-col gap-1">
      <span class="text-sm uppercase text-base-content/75">{props.label}</span>
      <select
        class="select select-bordered select-sm"
        value={(props.value as string | undefined) ?? ""}
        onChange={(e) => props.onChange(e.currentTarget.value)}
      >
        <For each={(props.propDef.options as string[] | undefined)}>{(opt) => <option value={opt}>{opt}</option>}</For>
      </select>
      <Show when={props.desc}>
        <span class="text-xs/tight text-base-content/60">{props.desc}</span>
      </Show>
    </label>
  ),
  dec: (props) => (
    <label class="flex flex-col gap-1">
      <span class="text-sm uppercase text-base-content/75">{props.label}</span>
      <input
        class="input input-bordered input-sm"
        type="number"
        min={props.propDef.min}
        max={props.propDef.max}
        value={(props.value as number | undefined) ?? ""}
        onInput={(e) => {
          const raw = e.currentTarget.value;
          const parsed = raw === "" ? NaN : Number(raw);
          props.onChange(Number.isNaN(parsed) ? undefined : parsed);
        }}
      />
      <Show when={props.desc}>
        <span class="text-xs/tight text-base-content/60">{props.desc}</span>
      </Show>
    </label>
  ),
  hex: (props) => {
    const formatHex = (value: number | undefined) => value === undefined ? "" : value.toString(16);

    const [inputValue, setInputValue] = createSignal(formatHex(props.value as number | undefined));
    const [lastValid, setLastValid] = createSignal(formatHex(props.value as number | undefined));

    createEffect(() => {
      const formatted = formatHex(props.value as number | undefined);
      setLastValid(formatted);
      setInputValue(formatted);
    });

    const parseHex = (raw: string) => {
      const trimmed = raw.trim();
      if (trimmed === "") return { kind: "empty" } as const;
      const normalized = trimmed.toLowerCase().startsWith("0x") ? trimmed.slice(2) : trimmed;
      if (normalized === "") return { kind: "empty" } as const;
      if (!/^[0-9a-fA-F]+$/.test(normalized)) return { kind: "invalid" } as const;
      const parsed = parseInt(normalized, 16);
      if (Number.isNaN(parsed)) return { kind: "invalid" } as const;
      if (typeof props.propDef.min === "number" && parsed < props.propDef.min) return { kind: "invalid" } as const;
      if (typeof props.propDef.max === "number" && parsed > props.propDef.max) return { kind: "invalid" } as const;
      return { kind: "value", value: parsed } as const;
    };

    return (
      <label class="flex flex-col gap-1">
        <span class="text-sm uppercase text-base-content/75">{props.label}</span>
        <div
          class="input input-bordered input-sm font-mono"
        >
          <span>0x</span>
          <input
            type="text"
            inputmode="text"
            pattern="^(0x)?[0-9a-fA-F]*$"
            autocomplete="off"
            autocorrect="off"
            autocapitalize="off"
            spellcheck="false"
            value={inputValue()}
            onInput={(e) => {
              const raw = e.currentTarget.value;
              setInputValue(raw);
              const result = parseHex(raw);
              if (result.kind === "value") {
                const formatted = formatHex(result.value);
                setLastValid(formatted);
                props.onChange(result.value);
              } else if (result.kind === "empty") {
                setLastValid("");
                props.onChange(undefined);
              }
            }}
            onBlur={() => {
              const result = parseHex(inputValue());
              if (result.kind === "invalid") {
                setInputValue(lastValid());
                return;
              }
              if (result.kind === "value") {
                const formatted = formatHex(result.value);
                setLastValid(formatted);
                setInputValue(formatted);
                return;
              }
              setInputValue("");
            }}
          />
        </div>
        <Show when={props.desc}>
          <span class="text-xs/tight text-base-content/60">{props.desc}</span>
        </Show>
      </label>
    );
  },
};
