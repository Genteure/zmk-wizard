import { Button } from "@kobalte/core/button";
import { Dialog } from "@kobalte/core/dialog";
import { DropdownMenu } from "@kobalte/core/dropdown-menu";
import { Link } from "@kobalte/core/link";
import { Popover } from "@kobalte/core/popover";
import { debounce } from "@solid-primitives/scheduled";
import { actions } from "astro:actions";
import { PUBLIC_TURNSTILE_SITEKEY } from "astro:env/client";
import JSZip from "jszip";
import ChevronRight from "lucide-solid/icons/chevron-right";
import ExternalLink from "lucide-solid/icons/external-link";
import FolderArchive from "lucide-solid/icons/folder-archive";
import FolderGit2 from "lucide-solid/icons/folder-git-2";
import Menu from "lucide-solid/icons/menu";
import Package from "lucide-solid/icons/package";
import PencilLine from "lucide-solid/icons/pencil-line";
import SunMoon from "lucide-solid/icons/sun-moon";
import X from "lucide-solid/icons/x";
import { createEffect, createMemo, createSignal, For, onMount, Show, type VoidComponent } from "solid-js";
import { produce, unwrap } from "solid-js/store";
import { version } from "virtual:version";
import { CommonShieldNames } from "~/lib/shieldNames";
import { swpBgClass } from "~/lib/swpColors";
import { createZMKConfig } from "~/lib/templating";
import { validateKeyboard, type ValidationError } from "~/lib/validators";
import { KeyboardSchema, type BusDeviceTypeName, type KeyboardPart } from "~/typedef";
import { TurnstileCaptcha } from "./captcha/turnstile";
import { useWizardContext } from "./context";
import { controllerInfos, getBusDeviceMetadata, loadBusesForController } from "./controllerInfo";

export const InfoEditButton: VoidComponent = () => {
  const context = useWizardContext();
  const [displayNameErrors, setDisplayNameErrors] = createSignal<string[]>([]);
  const [shieldNameErrors, setShieldNameErrors] = createSignal<string[]>([]);

  function nameToShield(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/_{2,}/g, '_');
  }

  let displayNameInput: HTMLInputElement | undefined;
  let shieldInput: HTMLInputElement | undefined;

  const validateDisplayName = () => {
    if (!displayNameInput) return;
    const trimmedValue = displayNameInput.value.trim();
    const bytes = new TextEncoder().encode(trimmedValue);
    if (trimmedValue === '') {
      setDisplayNameErrors(['Display name cannot be empty.']);
      return;
    }
    if (bytes.length > 16) {
      setDisplayNameErrors(['Display name must be less than 16 bytes.']);
      return;
    }

    // set shield name based on display name, unless it was manually set to something else
    if (shieldInput) {
      let updateShieldName = shieldInput.value.trim() === '';
      if (!updateShieldName) {
        const expectedOldShieldName = nameToShield(context.keyboard.name);
        if (expectedOldShieldName === shieldInput.value) {
          // continue updating shield name base on display name
          updateShieldName = true;
        }
      }
      if (updateShieldName) {
        shieldInput.value = nameToShield(trimmedValue);
        validateShieldName();
      }
    }

    // set display name
    setDisplayNameErrors([]);
    context.setKeyboard('name', trimmedValue);

  };
  const debouncedValidateDisplayName = debounce(validateDisplayName, 100);

  const validateShieldName = () => {
    if (!shieldInput) return;

    const errors = [];
    const trimmedValue = shieldInput.value.trim();

    if (trimmedValue === '') {
      errors.push('Shield name cannot be empty.');
    } else {
      if (!/^[a-z]/.test(trimmedValue)) {
        errors.push('Shield name must start with a lowercase letter (a-z).');
      }
      if (!/^[a-z0-9_]+$/.test(trimmedValue)) {
        errors.push('Shield name can only contain lowercase letters (a-z), digits (0-9), and underscores ( _ ).');
      }
      if (trimmedValue.length < 3) {
        errors.push('Shield name must be at least 3 characters long.');
      }
    }

    if (CommonShieldNames.includes(trimmedValue)) {
      errors.push(`"${trimmedValue}" is reserved to avoid potential conflicts with other shields.`);
    }

    setShieldNameErrors(errors);

    if (errors.length === 0) {
      context.setKeyboard('shield', trimmedValue);
    }
  };
  const debouncedValidateShieldName = debounce(validateShieldName, 100);

  const allowClose = createMemo(() => {
    return displayNameErrors().length === 0 && shieldNameErrors().length === 0 && context.keyboard.name.trim() !== '' && context.keyboard.shield.trim() !== '';
  })

  onMount(() => {
    if (!context.keyboard.name.trim() || context.keyboard.shield.trim().length < 3) {
      // context.setNav("infoDialog", true);
      context.setNav("dialog", "info", true);
    }
  })

  return (
    <Dialog
      open={context.nav.dialog.info}
      onOpenChange={(open) => context.setNav("dialog", "info", open)}
    >
      <Dialog.Trigger
        class="px-2 py-1 min-w-26 text-start flex items-center justify-around gap-2 rounded-lg border-2 border-transparent
hover:border-accent bg-base-300 hover:bg-base-content/10 transition-colors duration-75 cursor-pointer"
        title="Edit Keyboard Information"
      >
        <div class="max-w-24 sm:max-w-36">
          <div
            class="text-base truncate"
            classList={{
              "italic text-base-content/50": !context.keyboard.name
            }}
          >{context.keyboard.name || 'My Keyboard'}</div>
          <div
            class="text-xs font-mono truncate"
            classList={{
              "italic text-base-content/50": !context.keyboard.shield
            }}
          >{context.keyboard.shield || 'my_keyboard'}</div>
        </div>
        <PencilLine aria-hidden class="w-5 h-5" />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay class="dialog--overlay" />
        <div class="dialog--positioner">
          <Dialog.Content
            class="dialog--content"
            onPointerDownOutside={(e) => {
              if (!allowClose()) e.preventDefault()
            }}
            onFocusOutside={(e) => {
              if (!allowClose()) e.preventDefault()
            }}
            onInteractOutside={(e) => {
              if (!allowClose()) e.preventDefault()
            }}
          >
            <Dialog.Title class="dialog--title text-center">
              Shield Wizard for ZMK v0.3
            </Dialog.Title>
            <Dialog.Description as="div">
              <div class="mb-2 text-center text-sm select-none text-base-content/70">
                Create ZMK shield for your custom keyboard without writing code
              </div>
              <fieldset class="fieldset p-4 rounded-lg bg-base-300 max-w-sm mx-auto">
                <legend class="fieldset-legend select-none">Keyboard Information</legend>

                <div class="mb-4">
                  <label
                    class="input w-full"
                    classList={{ 'input-error': displayNameErrors().length > 0 }}
                  >
                    <span class="label select-none">Display Name</span>
                    <input
                      ref={displayNameInput}
                      type="text"
                      placeholder="My Keyboard"
                      value={context.keyboard.name}
                      autocomplete="off"
                      onInput={() => debouncedValidateDisplayName()}
                      onChange={() => validateDisplayName()}
                    />
                  </label>
                  <p class="label text-wrap text-error mt-1">{
                    displayNameErrors().map((msg, index) => (
                      <>
                        {index === 0 || <br />}
                        {msg}
                      </>
                    ))
                  }</p>
                </div>

                <div class="mb-4">
                  <label
                    class="input w-full"
                    classList={{ 'input-error': shieldNameErrors().length > 0 }}
                  >
                    <span class="label select-none">Shield Name &nbsp;</span>
                    <input
                      ref={shieldInput}
                      type="text"
                      placeholder='my_keyboard'
                      value={context.keyboard.shield}
                      autocomplete="off"
                      onInput={() => debouncedValidateShieldName()}
                      onChange={() => validateShieldName()}
                    />
                  </label>
                  <p class="label text-wrap text-error mt-1">
                    {
                      shieldNameErrors().map((msg, index) => (
                        <>
                          {index === 0 || <br />}
                          {msg}
                        </>
                      ))
                    }
                  </p>
                </div>

                <div class="mb-4">
                  <select class="select w-full" value={context.keyboard.parts.length} onChange={e => {
                    const count = parseInt(e.currentTarget.value);
                    if (isNaN(count) || count < 1 || count > 5) return;

                    const names = count > 1 ? (["left", "right", "third", "fourth", "fifth"].slice(0, count)) : ["unibody"];
                    context.setKeyboard('parts', names.map(name => ({
                      name,
                      controller: "nice_nano_v2",
                      wiring: "matrix_diode",
                      keys: {},
                      encoders: [],
                      pins: {},
                      buses: loadBusesForController("nice_nano_v2"),
                    } satisfies KeyboardPart)));

                    context.setKeyboard("layout", produce(keys => {
                      for (const k of keys) {
                        if (k.part >= count) {
                          k.part = count - 1;
                        }
                      }
                    }))

                  }}>
                    <For each={Array(5).fill(0)}>
                      {(_, i) => (
                        <option value={i() + 1} selected={context.keyboard.parts.length === (i() + 1)}>
                          {i() ? `Split ${i() + 1} Parts` : `Unibody (1 Part)`}
                        </option>
                      )}
                    </For>
                  </select>
                </div>

                <div>
                  <label class="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={context.keyboard.dongle}
                      onChange={e => context.setKeyboard('dongle', e.currentTarget.checked)}
                      class="checkbox"
                    />
                    <span class="select-none">Add an optional dongle shield</span>
                  </label>
                </div>
              </fieldset>
              <div class="w-2/3 mx-auto">
                <Dialog.CloseButton
                  disabled={!allowClose()}
                  class="btn btn-primary btn-sm md:btn-md md:text-lg mt-4 w-full"
                >
                  Continue to Editor
                </Dialog.CloseButton>
              </div>
              <div class="mt-6">
                <div class="text-xs text-base-content/50 select-none items-center justify-center flex gap-1">
                  <Link
                    href="https://github.com/genteure/zmk-wizard"
                    target="_blank"
                    rel="noopener"
                    class="link"
                  >https://github.com/genteure/zmk-wizard</Link>
                </div>
              </div>
            </Dialog.Description>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog>
  );
};

export const BuildButton: VoidComponent = () => {
  // Build and Configuration Validation
  // ==================================
  // Default flow:
  // 1. User clicks "Build" button
  // 2. Open Dialog, run validation, show errors and block build if any
  // 3a. Show list of error messages
  // 3b. Switch UI to Captcha/Download mode if no errors
  // 4. User can either get a repo link or download ZIP
  //
  // About snapshot:
  // - We take snapshot of valid configuration when user opens the build dialog.
  // - If repoLink is empty (meaning user didn't create an online repo), refresh
  //   the snapshot when user re-opens the dialog.
  // - If repoLink is not empty, keep using the old snapshot to provide
  //   a consistent build.
  // - User needs to click Build Again to force a new snapshot and re-validate, if
  //   they made changes after creating the repo link.
  const context = useWizardContext();

  const [repoLinkInput, setRepoLinkInput] = createSignal<HTMLInputElement | undefined>(undefined);
  const [captchaToken, setCaptchaToken] = createSignal<string | null>(null);

  // validation errors, will block build if non-empty
  const [validationErrors, setValidationErrors] = createSignal<ValidationError[]>([]);
  // error message to show above the captcha / download section
  const [BuildErrorMessage, setBuildErrorMessage] = createSignal<string | null>(null);
  // is building state, mostly for disabling buttons
  const [isBuilding, setIsBuilding] = createSignal(false);

  // Summary screen local state
  const [showSummary, setShowSummary] = createSignal(false);
  type SummaryData = {
    name: string;
    dongle: boolean;
    parts: {
      board: string;
      shield: string;
      roleC: boolean;
      roleP: boolean;
      keys: number;
      encoders: number;
      devices: { type: BusDeviceTypeName, bus: string }[];
    }[];
  };
  const [summaryData, setSummaryData] = createSignal<SummaryData | null>(null);

  // const canBuild = createMemo(() => validationErrors().length === 0 && Boolean(context.snapshot()));

  const validateKeyboardAndSetSnapshot = (): void => {
    const keyboardClone = structuredClone(unwrap(context.keyboard));

    let collected: ValidationError[];
    const schemaResult = KeyboardSchema.safeParse(keyboardClone);
    if (schemaResult.success) {
      collected = validateKeyboard(keyboardClone);
    } else {
      collected = schemaResult.error.issues.map(issue => ({ part: null, message: issue.message }));
    }

    setValidationErrors(collected);
    setBuildErrorMessage(null);

    if (collected.length === 0) {
      context.setSnapshot({
        time: new Date(),
        keyboard: keyboardClone,
      });

      {
        // build summary UI data
        const parts: SummaryData['parts'] = keyboardClone.parts.map((p, idx) => {
          const keys = keyboardClone.layout.filter((k) => k.part === idx).length;
          const encoders = p.encoders.length;
          const devices = p.buses.flatMap(bus => bus.devices.map(d => ({ type: d.type, bus: bus.name })));
          return {
            board: p.controller as string,
            shield: keyboardClone.parts.length > 1
              ? `${keyboardClone.shield}_${p.name}`
              : keyboardClone.shield,
            roleC: idx === 0,
            roleP: idx !== 0,
            keys,
            encoders,
            devices,
          };
        });

        if (keyboardClone.dongle) {
          // add dongle part at position 0
          parts[0].roleP = true; // make part 0 also peripheral
          parts.unshift({
            board: "",
            shield: `${keyboardClone.shield}_dongle`,
            roleC: true,
            roleP: false,
            keys: 0,
            encoders: 0,
            devices: [],
          });
        }

        setSummaryData({
          name: keyboardClone.name,
          dongle: keyboardClone.dongle,
          parts,
        });
        setShowSummary(true);
      }
    } else {
      context.setSnapshot(null);
      setSummaryData(null);
      setShowSummary(false);
    }
  };

  const groupedValidationEntries = createMemo(() => {
    const map = new Map<number | null, string[]>();
    for (const e of validationErrors()) {
      const key = e.part ?? null;
      const list = map.get(key) ?? [];
      list.push(e.message);
      map.set(key, list);
    }
    // Order: keyboard-level (null) first, then numeric part index ascending
    const entries = Array.from(map.entries());
    entries.sort((a, b) => {
      if (a[0] === null && b[0] !== null) return -1;
      if (a[0] !== null && b[0] === null) return 1;
      if (a[0] === null && b[0] === null) return 0;
      return (Number(a[0]) - Number(b[0]));
    });
    return entries;
  });

  createEffect(() => {
    // on element mount or repoLink change, update the input value
    // and select it for easy copying
    const input = repoLinkInput();
    const link = context.nav.repoLink;
    if (input) {
      input.value = link;

      input.focus();
      input.setSelectionRange(link.length, link.length);
      input.blur();
    }
  });

  createEffect(() => {
    if (!context.nav.dialog.build) return;
    // on dialog open:
    // - If no repoLink, call validate and set snapshot
    //   This will show error message UI if there are validation errors
    // - If have repoLink, keep using the old snapshot

    setCaptchaToken(null);
    setBuildErrorMessage(null);

    if (!context.nav.repoLink || !context.snapshot()) {
      validateKeyboardAndSetSnapshot();
    }
  });

  const submitToServer = async () => {
    // only submit if have valid snapshot and captcha token
    // having a snapshot means validation passed
    if (!captchaToken()) return;
    const snapshot = context.snapshot();
    if (!snapshot) return;

    // disable buttons and clear old error message
    setIsBuilding(true);
    setBuildErrorMessage(null);

    try {
      const { data, error } = await actions.buildRepository({
        keyboard: snapshot.keyboard,
        captcha: captchaToken() || "",
      });

      if (error) {
        throw error;
      }

      if (!data?.repoId) {
        throw new Error("No repository id returned from server");
      }

      context.setNav("repoLink", `${window.location.origin}/repo/${data.repoId}.git`);
    } catch (err) {
      console.error("Error creating repository:", err);
      const message = err instanceof Error ? err.message : "Failed to create repository for unknown reasons.";
      setBuildErrorMessage(message);
    } finally {
      setIsBuilding(false);
    }
  };

  const resetBuildState = () => {
    context.setNav("repoLink", "");
    context.setSnapshot(null);
    setCaptchaToken(null);
    setSummaryData(null);
    setShowSummary(false);
    validateKeyboardAndSetSnapshot();
  };

  const downloadZip = async () => {
    const snapshot = context.snapshot();
    if (!snapshot) return;

    setIsBuilding(true);
    setBuildErrorMessage(null);

    try {
      const keyboardConfig = createZMKConfig(snapshot.keyboard);

      const zip = new JSZip();
      for (const [filePath, content] of Object.entries(keyboardConfig)) {
        zip.file(filePath, content);
      }

      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `zmk-config-${snapshot.keyboard.shield}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error generating zip file:", err);
      const message = err instanceof Error ? err.message : "Failed to generate zip file for unknown reasons.";
      setBuildErrorMessage(message);
    } finally {
      setIsBuilding(false);
    }
  };

  return (
    <Dialog open={context.nav.dialog.build} onOpenChange={v => context.setNav("dialog", "build", v)}>
      <Dialog.Trigger class="btn btn-primary btn-sm md:btn-md md:text-lg ui-disabled:btn-disabled"
      >
        <Package aria-hidden class="inline-block w-5 h-5" />
        Build
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay class="dialog--overlay" />
        <div class="dialog--positioner">
          <Dialog.Content class="dialog--content"
          >
            <div class="dialog--header">
              <Dialog.Title class="dialog--title">
                Build ZMK Repository
              </Dialog.Title>
              <Dialog.CloseButton class="cursor-pointer">
                <X class="w-6 h-6" />
              </Dialog.CloseButton>
            </div>
            <Dialog.Description as="div">
              <div class="space-y-4">
                <Show when={validationErrors().length == 0}
                  fallback={<div>
                    <div class="font-semibold text-error text-lg text-center flex items-center justify-center gap-2">
                      Problems found
                    </div>
                    <div class="my-4 flex items-center justify-center">
                      <div class="w-full max-w-md">
                        <div class="max-h-56 overflow-auto px-2">
                          <For each={groupedValidationEntries()}>
                            {(entry) => {
                              const part = entry[0];
                              const msgs = entry[1];
                              return (
                                <div class="mb-4">
                                  <div class="flex items-center justify-center gap-2 mb-2">
                                    <span
                                      class="inline-block w-3 h-3 rounded-full"
                                      classList={{
                                        [swpBgClass(Number(part))]: part !== null,
                                        'hidden': part === null,
                                      }}
                                      aria-hidden />
                                    <div class="font-semibold text-sm text-center">
                                      {part === null ? "General" : (context.keyboard.parts?.[Number(part)]?.name ?? `Part ${Number(part) + 1}`)}
                                    </div>
                                  </div>
                                  <ul class="list-disc pl-5 text-sm space-y-1 marker:text-error">
                                    <For each={msgs}>{(m) => <li>{m}</li>}</For>
                                  </ul>
                                </div>
                              )
                            }}
                          </For>
                        </div>
                      </div>
                    </div>
                    <div class="text-center">
                      Please fix the listed issues then try again.
                    </div>
                  </div>}
                >

                  <Show when={BuildErrorMessage()}>
                    <div class="alert alert-error shadow-sm">
                      {BuildErrorMessage()}
                    </div>
                  </Show>

                  <Show when={showSummary()}>
                    <div class="mt-4">
                      <div class="text-center mb-2 font-semibold text-xl">
                        {summaryData()?.name}
                      </div>
                      <div class="max-h-64 overflow-auto px-2 max-w-sm mx-auto">
                        <For each={summaryData()?.parts ?? []}>{(p) => (
                          <div
                            class="p-3 mb-2 bg-base-100 rounded-lg shadow-sm border border-base-300"
                          >
                            <div>
                              <Popover>
                                <Popover.Trigger>
                                  <Show when={p.roleC}>
                                    <span class="badge badge-outline badge-accent font-bold select-none me-1 cursor-pointer">C</span>
                                  </Show>
                                  <Show when={p.roleP}>
                                    <span class="badge badge-outline badge-accent font-bold select-none me-1 cursor-pointer">P</span>
                                  </Show>
                                </Popover.Trigger>
                                <Popover.Content class="popover--content max-w-xs">
                                  <div>
                                    <span class="font-bold">C: </span>
                                    <span class="font-semibold">Central, </span>
                                    <span class="text-sm">
                                      processes keymap and communicates with host devices.
                                    </span>
                                  </div>
                                  <div>
                                    <span class="font-bold">P: </span>
                                    <span class="font-semibold">Peripheral, </span>
                                    <span class="text-sm">
                                      reports to the central over an internal BLE connection.
                                    </span>
                                  </div>

                                  <Show when={p.roleC}>
                                    <div class="mt-2 text-sm">
                                      There can only be one central part in a split keyboard, the role for each part is set at compile time.
                                    </div>
                                  </Show>
                                  <Show when={p.roleP}>
                                    <div class="mt-2 text-sm">
                                      Peripheral part(s) only connect to the central part.
                                      They don't work as USB devices on their own.
                                    </div>
                                  </Show>

                                </Popover.Content>
                              </Popover>
                              <span class="font-semibold font-mono">
                                {p.shield}
                              </span>
                            </div>
                            <div class="text-sm text-base-content/70">
                              With {controllerInfos[p.board as keyof typeof controllerInfos]?.name || "any controller"}
                            </div>
                            <div
                              class="flex flex-col items-end justify-end text-sm mt-2"
                            >
                              <div class="text-sm text-base-content/70">
                                {p.keys} Key{p.keys !== 1 ? 's' : ''}, {p.encoders} Encoder{p.encoders !== 1 ? 's' : ''}
                              </div>
                            </div>
                            <div
                              class="text-sm text-base-content mt-1"
                            >
                              <For each={p.devices}>{(d, i) => (
                                <>
                                  <span>
                                    {getBusDeviceMetadata(d.type)?.fullName || d.type}
                                  </span>
                                  <span class="text-base-content/50">
                                    &nbsp;on&nbsp;
                                  </span>
                                  <span class="font-mono">
                                    {d.bus}
                                  </span>
                                  {i() < (p.devices.length - 1) ? <br /> : null}
                                </>
                              )}</For>
                            </div>
                          </div>
                        )}</For>
                      </div>
                      <div class="mt-4 flex items-center justify-center">
                        <Button class="btn btn-primary" onClick={() => setShowSummary(false)} disabled={isBuilding() || !context.snapshot()}>Next</Button>
                      </div>
                    </div>
                  </Show>

                  <Show when={!showSummary()}>
                    <Show
                      when={context.nav.repoLink}
                      fallback={
                        <div class="my-8">
                          <div class="flex flex-col justify-center items-center">
                            <div style={{ width: "300px", height: "65px", position: "relative" }}>
                              <span class="absolute left-0 right-0 top-0 bottom-0 flex items-center justify-center rounded-sm bg-base-300 text-base-content/80" style="z-index:0;">
                                Loading Captcha...
                              </span>
                              <div
                                class="absolute left-0 right-0 top-0 bottom-0" style="z-index:1;"
                              >
                                <TurnstileCaptcha
                                  sitekey={PUBLIC_TURNSTILE_SITEKEY}
                                  onSuccess={(token) => {
                                    setCaptchaToken(token);
                                  }}
                                  onExpire={() => {
                                    setCaptchaToken(null);
                                  }}
                                />
                              </div>
                            </div>

                            <button
                              class="btn btn-primary mt-2"
                              onClick={submitToServer}
                              disabled={!captchaToken() || isBuilding()}
                            >
                              Create Import Link
                            </button>
                          </div>
                          <div class="text-center mt-4 text-sm">
                            Repository link expires after 24 hours. <br />
                            Creating hosted repository is captcha protected to prevent abuse.
                          </div>
                        </div>
                      }
                    >
                      <div class="mt-8 space-y-3">
                        <div class="text-center">
                          <div class="join">
                            <div>
                              <label class="input join-item">
                                <FolderGit2 class="inline" />
                                <input
                                  readonly
                                  ref={setRepoLinkInput}
                                  onFocus={e => {
                                    const input = e.currentTarget;
                                    if (input) {
                                      input.setSelectionRange(0, input.value.length);
                                    }
                                  }}
                                />
                              </label>
                            </div>
                            <button
                              class="btn btn-primary join-item"
                              onClick={() => {
                                navigator.clipboard.writeText(context.nav.repoLink);
                              }}
                            >Copy</button>
                          </div>
                        </div>

                        <div class="text-center text-sm">
                          Import at <Link href="https://github.com/new/import" class="link" target="_blank" rel="noopener noreferrer">
                            https://github.com/new/import
                          </Link><br /><br />
                          Suggested repository name: <span class="font-semibold text-nowrap">zmk-config-{context.keyboard.shield}</span>
                          <br />
                          Leave credentials empty.
                          Public repository is recommended.
                        </div>

                        <div class="text-center font-bold">
                          <Link
                            href="/next-steps"
                            target="_blank"
                            class="link"
                          >
                            What to do next?
                          </Link>
                        </div>

                        <div class="text-center">
                          <div class="mb-2 text-xs/snug text-center text-base-content/70">
                            If you want to make changes to your keyboard
                          </div>
                          <Button
                            class="btn btn-soft btn-sm"
                            onClick={resetBuildState}
                            disabled={isBuilding()}
                          >
                            Try Again
                          </Button>
                        </div>
                      </div>
                    </Show>

                    <div class="divider"></div>
                    <div class="my-4 text-center">
                      <div class="text-sm">
                        As an alternative, download the configuration.<br />
                        You can push it to your GitHub repository using git client of your choice.
                      </div>
                      <Show when={context.nav.repoLink}>
                        <div class="mt-2 text-xs/snug text-center text-base-content/70">
                          Keyboard snapshot taken at {context.snapshot()?.time.toLocaleString() ?? "unknown"}.<br />
                          Downloading will produce the same content as the linked repository.<br />
                          Click "Try Again" to use latest config if you made changes after creating the repository.
                        </div>
                      </Show>
                      <button
                        class="btn btn-primary mt-2"
                        onClick={downloadZip}
                        disabled={isBuilding()}
                      >
                        <FolderArchive class="inline" />
                        Download
                      </button>

                    </div>
                  </Show>
                </Show>
              </div>
            </Dialog.Description>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog>
  );
}

export const HelpButton: VoidComponent = () => {
  const context = useWizardContext();
  let debugDataTextArea: HTMLTextAreaElement | undefined;
  const [debugOpen, setDebugOpen] = createSignal(false);

  return (
    <>
      <Dialog open={debugOpen()} onOpenChange={setDebugOpen}>
        <Dialog.Portal>
          <Dialog.Overlay class="dialog--overlay" />
          <div class="dialog--positioner">
            <Dialog.Content class="dialog--content"
            >
              <div class="dialog--header">
                <Dialog.Title class="dialog--title">
                  Internal Data
                </Dialog.Title>
                <Dialog.CloseButton class="cursor-pointer">
                  <X class="w-6 h-6" />
                </Dialog.CloseButton>
              </div>
              <Dialog.Description as="div">
                <div class="text-sm/snug">
                  Warning: Debug-only. Applying data will replace the current keyboard configuration and
                  may produce invalid or unsupported state. Use only with trusted data and at your own risk.
                  No promise is made regarding backward compatibility of debug data between versions.
                </div>
                <Button class="btn btn-warning btn-sm w-full my-2"
                  onClick={() => {
                    if (!debugDataTextArea) return;
                    try {
                      const jsonObj = JSON.parse(debugDataTextArea.value);
                      if (!KeyboardSchema) {
                        alert('Error: Keyboard schema not loaded');
                        return;
                      }
                      const result = KeyboardSchema.parse(jsonObj);
                      context.setKeyboard(result);
                      alert('Debug data applied');
                    } catch (e) {
                      alert('Error: ' + (e as Error).message);
                    }
                  }}
                >
                  Set Debug Data
                </Button>
                <div>
                  <textarea class="textarea text-sm w-full h-80 font-mono" ref={debugDataTextArea} value={
                    JSON.stringify(context.keyboard, null, 2).replace(/(\d,)\n +/g, '$1 ')
                  } />
                </div>
              </Dialog.Description>
            </Dialog.Content>
          </div>
        </Dialog.Portal>
      </Dialog>
      <DropdownMenu placement="bottom-end">
        <DropdownMenu.Trigger
          class="btn btn-square btn-ghost md:btn-lg border-2 border-transparent hover:border-primary/70 dark:hover:border-primary bg-base-300 hover:bg-base-content/10"
        >
          <Menu class="w-8 h-8" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content class="p-2 bg-base-200 rounded shadow-lg border menu">
            <DropdownMenu.Item as="li" closeOnSelect={false}
              onSelect={() => {
                const currentIsDark = document.documentElement.dataset.theme
                  ? document.documentElement.dataset.theme === 'dark'
                  : window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
                document.documentElement.dataset.theme = currentIsDark ? 'light' : 'dark';
              }}
            >
              <button>
                <SunMoon class="inline-block w-5 h-5" />
                Toggle Theme
              </button>
            </DropdownMenu.Item>

            <DropdownMenu.Separator class="m-1" />

            <DropdownMenu.Sub overlap gutter={4} shift={-8}>
              <DropdownMenu.SubTrigger as="li">
                <button>
                  {/* <ChevronLeft class="inline-block w-5 h-5" /> */}
                  ZMK Documentation
                  <div class="ml-auto pl-6">
                    <ChevronRight class="w-5 h-5" />
                  </div>
                </button>
              </DropdownMenu.SubTrigger>
              <DropdownMenu.Portal>
                <DropdownMenu.SubContent class="p-2 bg-base-200 rounded shadow-lg border menu">
                  <DropdownMenu.Item as="li"
                    onSelect={() => {
                      window.open('https://zmk.dev/docs/keymaps', '_blank', 'noopener');
                    }}
                  >
                    <button>
                      Keymaps & Behaviors
                      <div class="ml-auto pl-6">
                        <ExternalLink class="w-5 h-5" />
                      </div>
                    </button>
                  </DropdownMenu.Item>
                  <DropdownMenu.Item as="li"
                    onSelect={() => {
                      window.open('https://zmk.dev/docs/config', '_blank', 'noopener');
                    }}
                  >
                    <button>
                      Configuration Overview
                      <div class="ml-auto pl-6">
                        <ExternalLink class="w-5 h-5" />
                      </div>
                    </button>
                  </DropdownMenu.Item>
                  <DropdownMenu.Item as="li"
                    onSelect={() => {
                      window.open('https://zmk.dev/docs/features/encoders', '_blank', 'noopener');
                    }}
                  >
                    <button>
                      Encoders
                      <div class="ml-auto pl-6">
                        <ExternalLink class="w-5 h-5" />
                      </div>
                    </button>
                  </DropdownMenu.Item>
                  <DropdownMenu.Item as="li"
                    onSelect={() => {
                      window.open('https://zmk.dev/docs/features/studio', '_blank', 'noopener');
                    }}
                  >
                    <button>
                      ZMK Studio
                      <div class="ml-auto pl-6">
                        <ExternalLink class="w-5 h-5" />
                      </div>
                    </button>
                  </DropdownMenu.Item>
                  <DropdownMenu.Item as="li"
                    onSelect={() => {
                      window.open('https://zmk.dev/docs/development/hardware-integration/new-shield', '_blank', 'noopener');
                    }}
                  >
                    <button>
                      New Keyboard Shield
                      <div class="ml-auto pl-6">
                        <ExternalLink class="w-5 h-5" />
                      </div>
                    </button>
                  </DropdownMenu.Item>
                </DropdownMenu.SubContent>
              </DropdownMenu.Portal>
            </DropdownMenu.Sub>
            <DropdownMenu.Item as="li"
              onSelect={() => {
                window.open('https://nickcoutsos.github.io/keymap-layout-tools/', '_blank', 'noopener');
              }}
            >
              <button>
                Keymap Layout Helper
                <div class="ml-auto pl-6">
                  <ExternalLink class="w-5 h-5" />
                </div>
              </button>
            </DropdownMenu.Item>
            <DropdownMenu.Item as="li"
              onSelect={() => {
                window.open('https://nickcoutsos.github.io/keymap-editor/', '_blank', 'noopener');
              }}
            >
              <button>
                Keymap Editor
                <div class="ml-auto pl-6">
                  <ExternalLink class="w-5 h-5" />
                </div>
              </button>
            </DropdownMenu.Item>

            <DropdownMenu.Separator class="m-1" />

            <DropdownMenu.Item as="li" closeOnSelect={false} title="Click to copy version info"
              onSelect={() => {
                const text = `ZMK Shield Wizard - Version
Branch: ${version.branch || ''}${version.dirty ? ' (dirty)' : ''}
Commit: ${version.commit || '(unknown)'}
Tag: ${version.tag || '(none)'}
Generated At: ${version.buildDate || '(unknown)'}
`;
                navigator.clipboard.writeText(text);
              }}
            >
              <button>
                <div class="flex items-baseline gap-2">
                  <div class="">{version.branch || ''}{version.dirty ? ' • dirty' : ''}</div>
                  <div class="flex-1 font-mono text-xs truncate">{version.short || version.commit || 'unknown'}</div>
                </div>
              </button>
            </DropdownMenu.Item>

            <DropdownMenu.Sub>
              <DropdownMenu.SubTrigger as="li">
                <button>
                  Debug Options
                  <div class="ml-auto pl-6">
                    <ChevronRight class="w-5 h-5" />
                  </div>
                </button>
              </DropdownMenu.SubTrigger>
              <DropdownMenu.Portal>
                <DropdownMenu.SubContent class="p-2 bg-base-200 rounded shadow-lg border menu">
                  <DropdownMenu.Item as="li"
                    onSelect={() => setDebugOpen(true)}
                  >
                    <button>
                      Show Internal Data
                    </button>
                  </DropdownMenu.Item>
                </DropdownMenu.SubContent>
              </DropdownMenu.Portal>
            </DropdownMenu.Sub>

            <DropdownMenu.Separator class="m-1" />

            <DropdownMenu.Item as="li"
              class="menu-disabled"
              onSelect={() => { console.log("TODO") }}
            >
              <button>
                Run Tutorial (TODO)
              </button>
            </DropdownMenu.Item>
            <DropdownMenu.Item as="li"
              onSelect={() => {
                window.open('/next-steps', '_blank', 'noopener');
              }}
            >
              <button>
                What to do after this?
              </button>
            </DropdownMenu.Item>
            <DropdownMenu.Item as="li"
              onSelect={() => {
                // TODO investigate if we can just use a plain link, I hate button links
                window.open('https://zmk.dev/community/discord/invite', '_blank', 'noopener');
              }}
            >
              <button>
                ZMK Community Discord
              </button>
            </DropdownMenu.Item>
            <DropdownMenu.Item as="li"
              onSelect={() => {
                window.open('https://github.com/Genteure/zmk-wizard', '_blank', 'noopener');
              }}
            >
              <button>
                Shield Wizard GitHub
              </button>
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu>

    </>
  );
}
