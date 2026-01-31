import { Button } from "@kobalte/core/button";
import { Link } from "@kobalte/core/link";
import { Popover } from "@kobalte/core/popover";
import Info from "lucide-solid/icons/info";
import { createMemo, createSignal, For, Show, type Accessor, type VoidComponent } from "solid-js";
import { produce } from "solid-js/store";
import { Dynamic } from "solid-js/web";
import type { AnyBus, AnyBusDevice, BusDeviceTypeName, BusName, I2cBus, PinSelection, SpiBus } from "~/typedef";
import { AnyBusDeviceSchema } from "~/typedef";
import { addDeviceToBus, isI2cBus, isSpiBus } from "~/typehelper";
import { useWizardContext } from "../context";
import { busDeviceMetadata, busDeviceTypes, controllerInfos, deviceClassRules, getBusDeviceMetadata, pinPropKeysForDevice, requiredBusPinsForDevice, socBusData, ZmkModules, type AllDeviceDataTypes, type BusDeviceClass, type ControllerInfo, type DevicePropDefinition, type PinctrlI2cPinChoices, type PinctrlSpiPinChoices } from "../controllerInfo";
import { devicePropWidgetRenderers } from "./devicePropWidgets";

function defaultDevice(type: BusDeviceTypeName): AnyBusDevice {
  const defaults = busDeviceMetadata[type]?.defaults ?? {};
  return AnyBusDeviceSchema.parse({ type, ...defaults });
}

const AddDevicePanel: VoidComponent<{
  buses: Accessor<AnyBus[]>;
  controllerInfo: Accessor<ControllerInfo | null>;
  disabledByConflictBuses: Accessor<Set<BusName>>;
  conflictingActiveFor: (busName: BusName) => BusName[];
  busHasExclusive: (bus: AnyBus) => boolean;
  hasDeviceType: (type: BusDeviceTypeName) => boolean;
  addDevice: (busIdx: number, type: BusDeviceTypeName) => void;
}> = (panelProps) => {
  const [busPickerType, setBusPickerType] = createSignal<BusDeviceTypeName | null>(null);

  const deviceOptionsForController = createMemo(() => {
    return busDeviceTypes.filter((type: BusDeviceTypeName) => {
      const meta = getBusDeviceMetadata(type);
      return panelProps.buses().some((bus) => bus.type === meta.bus);
    });
  });

  const busesForType = (type: BusDeviceTypeName) => {
    const meta = getBusDeviceMetadata(type);
    return panelProps.buses().filter((bus) => bus.type === meta.bus);
  };

  const busEligible = (type: BusDeviceTypeName, bus: AnyBus) => {
    const meta = getBusDeviceMetadata(type);
    if (meta.bus !== bus.type) return false;
    if (panelProps.disabledByConflictBuses().has(bus.name)) return false;
    if (panelProps.busHasExclusive(bus)) return false;
    if ((bus.devices || []).length > 0 && meta.exclusive) return false;
    return true;
  };

  // const busDisabledReason = (type: BusDeviceTypeName, bus: AnyBus) => {
  //   const blockers = panelProps.conflictingActiveFor(bus.name);
  //   if (panelProps.disabledByConflictBuses().has(bus.name)) {
  //     return `Conflicts with active bus${blockers.length > 1 ? "es" : ""} ${blockers.join(", ")}`;
  //   }
  //   if (panelProps.busHasExclusive(bus)) return "Bus has an exclusive device";
  //   const meta = getBusDeviceMetadata(type);
  //   if (meta.exclusive && (bus.devices || []).length > 0) return "Exclusive device cannot share bus";
  //   return "";
  // };

  const classLimitReachedForType = (type: BusDeviceTypeName) => {
    const countDevicesOfClassInPart = (deviceClass: BusDeviceClass) => {
      let count = 0;
      for (const bus of panelProps.buses()) {
        for (const d of bus.devices || []) {
          const m = getBusDeviceMetadata(d.type);
          if (m?.class === deviceClass) count++;
        }
      }
      return count;
    };

    const meta = getBusDeviceMetadata(type);
    const rule = meta ? deviceClassRules[meta.class as keyof typeof deviceClassRules] : undefined;
    if (!rule || typeof rule.maxPerPart !== "number") return false;
    return countDevicesOfClassInPart(meta.class) >= rule.maxPerPart;
  };

  const deviceDisabledReason = (type: BusDeviceTypeName): string => {
    const meta = getBusDeviceMetadata(type);
    if (classLimitReachedForType(type)) {
      switch (meta.class) {
        case "display": return "Only one display per part";
        case "led_strip": return "Only one LED device per part";
        case "shift_register": return "Only one shift register per part";
        default: return "Class limit reached";
      }
    }
    const buses = busesForType(type);
    if (buses.length === 0) return "No compatible buses on this controller";
    if (buses.every((bus) => !busEligible(type, bus))) return "No available buses";
    return "";
  };

  const deviceButtonDisabled = (type: BusDeviceTypeName) => {
    // Special case: nice!view needs BLE which is not available on rp2040
    // If we ever needs a second check here, move to data driven approach
    // Do not add more hardcoded exceptions here!
    if (type === 'niceview' && panelProps.controllerInfo()?.soc === 'rp2040') return true;

    if (classLimitReachedForType(type)) return true;
    const buses = busesForType(type);
    if (buses.length === 0) return true;
    return buses.every((bus) => !busEligible(type, bus));
  };

  return (
    <div class="border border-base-300 rounded-xl bg-base-200/50 p-3">
      <div class="font-semibold text-sm">Add device</div>
      {/* <div class="text-xs text-base-content/75">Choose a device, then select a bus.</div> */}
      <div class="mt-2 flex flex-wrap gap-2">
        <For each={deviceOptionsForController()}>{(type) => {
          const disabled = createMemo(() => deviceButtonDisabled(type));
          const setOpen = (next: boolean) => setBusPickerType(next ? type : null);

          return (
            <Popover open={busPickerType() === type} onOpenChange={(next) => !disabled() && setOpen(next)} placement="bottom-start" gutter={6}>
              <Popover.Anchor>
                <Button
                  class="btn btn-sm btn-soft"
                  disabled={disabled()}
                  title={disabled() ? deviceDisabledReason(type) : undefined}
                  onClick={() => {
                    if (disabled()) return;
                    setOpen(!(busPickerType() === type));
                  }}
                >
                  {(getBusDeviceMetadata(type))?.shortName || type}
                </Button>
              </Popover.Anchor>
              <Popover.Portal>
                <Popover.Content class="popover--content w-64 max-w-sm p-3 flex flex-col gap-2" aria-label={`Add ${(getBusDeviceMetadata(type))?.fullName || type}`}>
                  <div class="text-sm text-center font-semibold">Add {(getBusDeviceMetadata(type))?.fullName || type}</div>
                  <div class="flex flex-wrap gap-2">
                    <For each={busesForType(type)}>{(bus) => {
                      const enabled = () => busEligible(type, bus);
                      return (
                        <Button
                          class="btn btn-soft w-full"
                          disabled={!enabled()}
                          // title={enabled() ? undefined : busDisabledReason(type, bus)}
                          onClick={() => {
                            if (!enabled()) return;
                            panelProps.addDevice(panelProps.buses().findIndex((b) => b.name === bus.name), type);
                            setOpen(false);
                          }}
                        >
                          {bus.name}
                        </Button>
                      );
                    }}</For>
                  </div>
                </Popover.Content>
              </Popover.Portal>
            </Popover>
          );
        }}</For>
      </div>

      <div class="text-xs text-base-content/75 mt-2">
        Configuring SPI/I2C devices was not tested thoroughly with all possible configurations and may produce broken builds.
        Please join the <Link class="link" href="https://zmk.dev/community/discord/invite" target="_blank" rel="noopener noreferrer">ZMK Community Discord</Link> for help
        and send feedback to @genteure.
      </div>
    </div>
  );
};

export const BusDevicesConfigurator: VoidComponent<{ partIndex: Accessor<number> }> = (props) => {
  const context = useWizardContext();
  const part = createMemo(() => context.keyboard.parts[props.partIndex()]);
  const buses = (() => part().buses);

  const controllerInfo = createMemo(() => controllerInfos[part().controller]);
  const socBusMetadata = createMemo(() => socBusData[controllerInfo().soc]);
  const busTooltip = () => socBusMetadata().tooltip;

  const pinLabelForPinId = (pinId: string): string => controllerInfo().pins[pinId]?.displayName || pinId;

  const hasDeviceType = (type: BusDeviceTypeName) => {
    return buses().some((bus) => (bus.devices || []).some((d) => d.type === type));
  };

  const activeBuses = createMemo(() => buses().filter((bus) => (bus.devices || []).length > 0));

  /// Calculate disabled buses due to conflicts with already selected buses
  const disabledByConflictBuses = createMemo(() => {
    const conflicts: Set<BusName> = new Set();
    for (const bus of activeBuses()) {
      const conflictList = socBusMetadata().conflicts[bus.name] || [];
      for (const conflictBusName of conflictList) conflicts.add(conflictBusName);
    }
    return conflicts;
  });

  const conflictingActiveFor = (busName: BusName) => activeBuses()
    .filter((bus) => (socBusMetadata().conflicts[bus.name] || []).includes(busName))
    .map((bus) => bus.name);

  const busHasExclusive = (b: AnyBus) => (b.devices || []).some((d) => getBusDeviceMetadata(d.type).exclusive);

  type BusPinKey = "sda" | "scl" | "mosi" | "miso" | "sck";
  type SkipUsage = { busIndex: number; key: BusPinKey };

  const isPinUsedInPart = (partState: { buses?: AnyBus[]; pins?: PinSelection }, pinId: string, skip: SkipUsage[] = []) => {
    // pin used for non-bus purpose on this part
    const usage = partState.pins?.[pinId];
    if (usage && usage !== "bus") return true;

    const shouldSkip = (idx: number, key: BusPinKey) => skip.some((s) => s.busIndex === idx && s.key === key);

    for (const [idx, bus] of (partState.buses || []).entries()) {
      if (isI2cBus(bus)) {
        if (!shouldSkip(idx, "sda") && bus.sda === pinId) return true;
        if (!shouldSkip(idx, "scl") && bus.scl === pinId) return true;
      } else if (isSpiBus(bus)) {
        if (!shouldSkip(idx, "mosi") && bus.mosi === pinId) return true;
        if (!shouldSkip(idx, "miso") && bus.miso === pinId) return true;
        if (!shouldSkip(idx, "sck") && bus.sck === pinId) return true;
      }

      for (const device of bus.devices || []) {
        for (const propKey of pinPropKeysForDevice(device.type)) {
          const propPin = (device as Record<string, string | undefined>)[propKey];
          if (propPin === pinId) return true;
        }
      }
    }

    return false;
  };

  // TODO validate what is this doing
  const clearBusPins = (bus: AnyBus, partPins?: PinSelection) => {
    const unset = (pinId?: string) => {
      if (!pinId) return;
      if (partPins && partPins[pinId] === "bus") {
        delete partPins[pinId];
      }
    };

    if (isI2cBus(bus)) {
      unset(bus.sda); bus.sda = undefined;
      unset(bus.scl); bus.scl = undefined;
    } else if (isSpiBus(bus)) {
      unset(bus.mosi); bus.mosi = undefined;
      unset(bus.miso); bus.miso = undefined;
      unset(bus.sck); bus.sck = undefined;
    }
  };

  const setBusPin = (busIndex: number, key: "sda" | "scl" | "mosi" | "miso" | "sck", value?: string) => {
    context.setKeyboard("parts", props.partIndex(), produce((part) => {
      const bus = part.buses?.[busIndex];
      if (!bus) return;

      if (isI2cBus(bus) && (key === "sda" || key === "scl")) {
        // const prev = key === "sda" ? bus.sda : bus.scl;
        const prev = bus[key];
        if (prev && prev !== value && part.pins?.[prev] === "bus") {
          const stillUsed = isPinUsedInPart(part, prev, [{ busIndex, key }]);
          if (!stillUsed) {
            delete part.pins[prev];
          }
        }
        bus[key] = value;
      } else if (isSpiBus(bus) && (key === "mosi" || key === "miso" || key === "sck")) {
        // const prev = key === "mosi" ? bus.mosi : key === "miso" ? bus.miso : bus.sck;
        const prev = bus[key];
        if (prev && prev !== value && part.pins?.[prev] === "bus") {
          const stillUsed = isPinUsedInPart(part, prev, [{ busIndex, key }]);
          if (!stillUsed) {
            delete part.pins[prev];
          }
        }
        bus[key] = value;
      } else {
        // invalid key for bus type
        return;
      }

      if (value) {
        part.pins = part.pins || {};
        part.pins[value] = "bus";
      }

      if (!bus.devices || bus.devices.length === 0) {
        // TOOO validate what this call is doing
        clearBusPins(bus, part.pins);
      }
    }));
  };

  const setDeviceField = (busIndex: number, deviceIndex: number, key: string, value: unknown) => {
    context.setKeyboard("parts", props.partIndex(), produce((part) => {
      const bus = part.buses?.[busIndex];
      if (!bus) return;
      const device = bus.devices?.[deviceIndex];
      if (!device) return;
      const meta = getBusDeviceMetadata(device.type);
      if (!meta) return;
      const prop = meta.props[key as keyof typeof meta.props] as DevicePropDefinition<unknown> | undefined;
      if (!prop) return;
      const deviceRecord = device as Record<string, unknown>;

      if (prop.widget === "pin") {
        const prev = deviceRecord[key] as string | undefined;
        const next = typeof value === "string" && value.length > 0 ? value : undefined;
        if (prev && prev !== next && part.pins?.[prev] === "bus") {
          delete part.pins[prev];
        }
        deviceRecord[key] = next;
        if (next) {
          part.pins = part.pins || {};
          part.pins[next] = "bus";
        }
        return;
      }

      if (prop.widget === "checkbox") {
        deviceRecord[key] = Boolean(value);
        return;
      }

      if (typeof value === "number" && !Number.isNaN(value)) {
        deviceRecord[key] = value;
      }
    }));
  };

  const removeDevice = (busIndex: number, deviceIndex: number) => {
    context.setKeyboard("parts", props.partIndex(), produce((part) => {
      const bus = part.buses?.[busIndex];
      if (!bus) return;
      const removed = bus.devices?.splice(deviceIndex, 1)?.[0];
      if (removed) {
        const pinProps = pinPropKeysForDevice(removed.type);
        pinProps.forEach((propKey) => {
          const pinId = (removed as Record<string, string | undefined>)[propKey];
          if (pinId && part.pins?.[pinId] === "bus") {
            delete part.pins[pinId];
          }
        });
      }
      if (!bus.devices || bus.devices.length === 0) {
        clearBusPins(bus, part.pins);
      }
    }));
  };

  const addDevice = (busIndex: number, type: BusDeviceTypeName) => {
    context.setKeyboard("parts", props.partIndex(), produce((part) => {
      const targetBus = part.buses?.[busIndex];
      if (!targetBus) return;

      const meta = getBusDeviceMetadata(type);
      if (meta.bus !== targetBus.type) return;

      // Enforce per-part class limits (e.g., only one display/LED/shift register)
      const rule = deviceClassRules[meta.class];
      if (typeof rule.maxPerPart === "number") {
        let count = 0;
        for (const b of part.buses) {
          for (const d of b.devices) {
            const m = getBusDeviceMetadata(d.type);
            if (m?.class === meta.class) count++;
          }
        }
        if (count >= rule.maxPerPart) return;
      }

      if (busHasExclusive(targetBus)) return;

      if (targetBus.devices.length > 0 && meta.exclusive) return;

      const device = defaultDevice(type);
      addDeviceToBus(targetBus, structuredClone(device));
    }));
  };

  const BusCard: VoidComponent<{ bus: AnyBus; index: number }> = (cardProps) => {
    const busForPinAccess = createMemo(() => cardProps.bus as Partial<I2cBus> & Partial<SpiBus>);

    const pinChoices = createMemo(() => controllerInfo()?.pinctrlChoices(cardProps.bus.name) ?? null);
    const pinChoicesForPinAccess = () => pinChoices() as (Partial<PinctrlI2cPinChoices> & Partial<PinctrlSpiPinChoices>) | null;

    const pinChoicesHas = (type: 'i2c' | 'spi', signal: keyof PinctrlI2cPinChoices | keyof PinctrlSpiPinChoices) => {
      const choices = pinChoices();
      if (type === 'i2c') {
        if (choices?.type !== 'i2c') return false;
        return !!((choices as PinctrlI2cPinChoices)[signal as keyof PinctrlI2cPinChoices]);
      } else {
        if (choices?.type !== 'spi') return false;
        return !!((choices as PinctrlSpiPinChoices)[signal as keyof PinctrlSpiPinChoices]);
      }
    };

    const requiredBySoc = createMemo(() => socBusMetadata().pinRequirements[cardProps.bus.name] || []);
    const requiredPins = createMemo(() => {
      const set = new Set<string>();
      // Device level requirements
      for (const d of cardProps.bus.devices || []) {
        requiredBusPinsForDevice(d.type).forEach((pin) => set.add(pin));
      }
      // SoC-level hardware requirements
      for (const k of requiredBySoc()) set.add(k);
      return set;
    });

    const isActive = createMemo(() => (cardProps.bus.devices.length || 0) > 0);
    const isConflicted = createMemo(() => disabledByConflictBuses().has(cardProps.bus.name));
    const conflictedWith = createMemo(() => conflictingActiveFor(cardProps.bus.name));

    const isPinBusy = (pinId: string, current?: string) => {
      if (!pinId) return false;
      if (current && pinId === current) return false;
      return isPinUsedInPart(part(), pinId);
    };

    const isBusPinBusy = (pinId: string, signal: BusPinKey) => {
      if (!pinId) return false;

      const skip: SkipUsage[] = [{ busIndex: cardProps.index, key: signal }];
      if (isSpiBus(cardProps.bus) && (signal === "mosi" || signal === "miso")) {
        const counterpart = signal === "mosi" ? "miso" : "mosi";
        if (cardProps.bus[counterpart] === pinId) {
          skip.push({ busIndex: cardProps.index, key: counterpart });
        }
      }

      const current = busForPinAccess()[signal];
      if (current && pinId === current) return false;

      return isPinUsedInPart(part(), pinId, skip);
    };

    return (
      <div
        class="border border-base-300 rounded-xl bg-base-200/50 p-3 flex flex-col gap-3 transition-opacity select-none"
        classList={{
          "border-dashed border-2": isConflicted() && !isActive(),
        }}
      >
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <span
              class="badge badge-outline font-bold"
              classList={{
                "badge-dash opacity-50": !isActive() || (isConflicted() && !isActive()),
                "badge-success": isActive() && !isConflicted(),
                "badge-warning": isConflicted(),
              }}
            >
              {cardProps.bus.type.toUpperCase()}
            </span>
            <span class="font-semibold text-lg">{cardProps.bus.name}</span>
          </div>
          <div class="flex items-center gap-2 text-xs text-base-content/60">
            <Show when={!isConflicted()} fallback={
              <span class="badge badge-warning badge-sm" title={`Conflicts with ${conflictedWith().join(", ")}`}>
                Unavailable
              </span>
            }>
              <Show when={isActive()} fallback={<span class="badge badge-ghost badge-sm">Inactive</span>}>
                <span class="badge badge-success badge-sm">Active</span>
              </Show>
            </Show>
          </div>
        </div>

        <Show when={isConflicted()}>
          <div class="text-xs font-semibold">
            Unavailable due to conflicts with {conflictedWith().join(", ")}.
          </div>
        </Show>

        <Show when={isActive()}>
          {/* Show hardware-required signals (SoC-level) when present */}
          <Show when={requiredBySoc().length > 0}>
            <div class="text-xs text-base-content/70">
              This bus requires
              <span class="ml-2">
                {requiredBySoc().map((need) => (
                  <span class="badge badge-ghost badge-sm mr-1">{need.toUpperCase()}</span>
                ))}
              </span>
            </div>
          </Show>

          <Show when={pinChoices()} fallback={<div class="text-xs text-base-content/60">Pin selections unavailable for this controller.</div>}>
            <div class="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
              <For each={[
                ['i2c', 'sda'],
                ['i2c', 'scl'],
                ['spi', 'mosi'],
                ['spi', 'miso'],
                ['spi', 'sck'],
              ] as const}>
                {([type, signal]) => (
                  <Show when={pinChoicesHas(type, signal)}>
                    <label class="flex flex-col gap-1">
                      <span class="text-sm uppercase text-base-content/75">{signal}{
                        requiredPins().has(signal)
                        && <span class="text-red-500 ml-1" title="Required" aria-label="Required">*</span>
                      }</span>
                      <select
                        class="select select-bordered select-sm"
                        value={busForPinAccess()[signal] || ""}
                        onChange={(e) => setBusPin(cardProps.index, signal, e.currentTarget.value)}
                      >
                        <option value="">None</option>
                        <For each={pinChoicesForPinAccess()?.[signal]}>{(pin) => (
                          <option value={pin} disabled={isBusPinBusy(pin, signal as BusPinKey)}>
                            {pinLabelForPinId(pin) + (isBusPinBusy(pin, signal as BusPinKey) ? " (in use)" : "")}
                          </option>
                        )}</For>
                      </select>
                    </label>
                  </Show>
                )}
              </For>
            </div>
          </Show>

          <div class="space-y-2">
            <For each={cardProps.bus.devices}>
              {(device, devIdx) => {
                const deviceData = createMemo(() => {
                  const meta = getBusDeviceMetadata(device.type);
                  const requires = [
                    ...requiredBusPinsForDevice(device.type),
                    ...Object.entries(meta.props)
                      .filter(([, prop]) => prop.widget === "pin" && !prop.optional)
                      .map(([key, prop]) => prop.name || key),
                  ];

                  return {
                    meta,
                    requires,
                    propEntries: Object.entries(meta.props),
                  };
                });

                return (
                  <div class="border border-base-300 rounded-lg bg-base-100 p-3">
                    <div class="flex items-center justify-between gap-2">
                      <div class="font-semibold">
                        {deviceData().meta.fullName}
                        <Show when={deviceData().meta.exclusive}>
                          <span
                            class="ml-2 badge badge-xs badge-ghost"
                            title="Exclusive device: cannot share bus with other devices">
                            Exclusive
                          </span>
                        </Show>
                      </div>
                      <Button
                        class="btn btn-ghost btn-xs text-red-500"
                        onClick={() => removeDevice(cardProps.index, devIdx())}
                        title="Remove device"
                      >
                        Remove
                      </Button>
                    </div>
                    <Show when={deviceData().requires.length}>
                      <div class="text-xs text-base-content/70">
                        Device requires
                        <span class="ml-2">
                          <For each={deviceData().requires}>{(need) => (
                            <span class="badge badge-ghost badge-sm mr-1 uppercase">{need}</span>
                          )}</For>
                        </span>
                      </div>
                    </Show>
                    <Show when={deviceData().meta.module}>
                      {(moduleKey) => {
                        const moduleData = () => ZmkModules[moduleKey()];
                        return (
                          <div class="text-xs text-base-content/70 mt-1">
                            External device driver from <Link class="link" target="_blank" rel="noopener" href={`https://github.com/${moduleData().remote}/${moduleData().repo}/tree/${moduleData().rev}`}>{`https://github.com/${moduleData().remote}/${moduleData().repo}`}</Link>
                          </div>
                        );
                      }}
                    </Show>

                    <div class="divider my-1"></div>
                    <div class="grid gap-3 sm:grid-cols-2 md:grid-cols-3 mt-2 text-sm">
                      <For each={deviceData().propEntries}>
                        {([propKey, propDef]) => (
                          <Dynamic
                            component={devicePropWidgetRenderers[propDef.widget]}
                            label={propDef.name || propKey}
                            required={!propDef.optional}
                            desc={propDef.desc}
                            value={(device as Record<string, AllDeviceDataTypes>)[propKey]}
                            propKey={propKey}
                            propDef={propDef}
                            // TODO figure out this pins situation
                            pins={(propDef.widget === "pin"
                              ? Object.keys(controllerInfo().pins)
                              : undefined)}
                            isPinBusy={isPinBusy}
                            pinLabelForPinId={pinLabelForPinId}
                            onChange={(val) => setDeviceField(cardProps.index, devIdx(), propKey, val)}
                          />
                        )}
                      </For>
                    </div>
                  </div>
                );
              }}
            </For>
          </div>

        </Show>
      </div>
    );
  };

  return <div class="flex flex-col gap-3">
    <Show when={controllerInfo()} fallback={<div class="text-center text-sm text-base-content/60">Select a controller to configure buses.</div>}>
      <Show when={buses().length > 0} fallback={<div class="text-center text-sm text-base-content/60">No buses available for this controller.</div>}>
        <AddDevicePanel
          buses={buses}
          controllerInfo={controllerInfo}
          disabledByConflictBuses={disabledByConflictBuses}
          conflictingActiveFor={conflictingActiveFor}
          busHasExclusive={busHasExclusive}
          hasDeviceType={hasDeviceType}
          addDevice={addDevice}
        />

        <Show when={busTooltip()}>
          <div class="border border-base-300 rounded-xl bg-base-200/50 p-3 flex items-center justify-between gap-3">
            <Info class="w-8 h-8 text-info" />
            <div class="text-sm text-base-content/70">
              {busTooltip()}
            </div>
          </div>
        </Show>

        <For each={buses()}>{(bus, idx) => <BusCard bus={bus} index={idx()} />}</For>
      </Show>
    </Show>
  </div>;
};
