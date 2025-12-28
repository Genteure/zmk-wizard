import { Button } from "@kobalte/core/button";
import { Dialog } from "@kobalte/core/dialog";
import { DropdownMenu } from "@kobalte/core/dropdown-menu";
import { Link } from "@kobalte/core/link";
import { debounce } from "@solid-primitives/scheduled";
import { actions } from "astro:actions";
import { PUBLIC_TURNSTILE_SITEKEY } from "astro:env/client";
import JSZip from "jszip";
import ChevronRight from "lucide-solid/icons/chevron-right";
import CircleQuestionMark from "lucide-solid/icons/circle-question-mark";
import ExternalLink from "lucide-solid/icons/external-link";
import FolderArchive from "lucide-solid/icons/folder-archive";
import FolderGit2 from "lucide-solid/icons/folder-git-2";
import Keyboard from "lucide-solid/icons/keyboard";
import OctagonX from "lucide-solid/icons/octagon-x";
import Package from "lucide-solid/icons/package";
import PencilLine from "lucide-solid/icons/pencil-line";
import SunMoon from "lucide-solid/icons/sun-moon";
import X from "lucide-solid/icons/x";
import { createEffect, createMemo, createSignal, For, onMount, Show, type VoidComponent } from "solid-js";
import { produce, unwrap } from "solid-js/store";
import { version } from "virtual:version";
import { CommonShieldNames } from "~/lib/shieldNames";
import { createZMKConfig } from "~/lib/templating";
import { validateKeyboard } from "~/lib/validators";
import { type KeyboardPart, KeyboardSchema } from "../typedef";
import { TurnstileCaptcha } from "./captcha/turnstile";
import { useWizardContext } from "./context";

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
              <div class="mb-2 text-center text-sm select-none">
                An experimental tool for making ZMK shields
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
                      pins: {}
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
                    <span class="select-none">Add a key-less Dongle shield</span>
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
  const [validationErrors, setValidationErrors] = createSignal<string[]>([]);
  // error message to show above the captcha / download section
  const [BuildErrorMessage, setBuildErrorMessage] = createSignal<string | null>(null);
  // is building state, mostly for disabling buttons
  const [isBuilding, setIsBuilding] = createSignal(false);

  // const canBuild = createMemo(() => validationErrors().length === 0 && Boolean(context.snapshot()));

  const validateKeyboardAndSetSnapshot = (): void => {
    const keyboardClone = structuredClone(unwrap(context.keyboard));
    const errors = new Set<string>();

    const schemaResult = KeyboardSchema.safeParse(keyboardClone);
    if (schemaResult.success) {
      validateKeyboard(keyboardClone).forEach(err => errors.add(err));
    } else {
      schemaResult.error.issues.forEach(issue => errors.add(issue.message));
    }

    const errorList = Array.from(errors);
    setValidationErrors(errorList);
    setBuildErrorMessage(null);

    if (errorList.length === 0) {
      context.setSnapshot({
        time: new Date(),
        keyboard: keyboardClone,
      });
    } else {
      context.setSnapshot(null);
    }
  };

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
                    <div class="font-semibold text-lg text-center flex items-center justify-center gap-2">
                      <OctagonX class="w-6 h-6 inline-block text-error" aria-hidden />
                      Problems found
                      <OctagonX class="w-6 h-6 inline-block text-error" aria-hidden />
                    </div>
                    <div class="my-4 flex items-center justify-center">
                      <ul class="list-disc pl-5 text-sm space-y-1 text-error">
                        {validationErrors().slice(0, 10).map((msg) => (
                          <li>{msg}</li>
                        ))}
                        <Show when={validationErrors().length > 10}>
                          <li class="list-none italic text-error/80">... and {validationErrors().length - 10} more.</li>
                        </Show>
                      </ul>
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

                      <div class="text-center">
                        <div class="mb-2 text-xs/snug text-center text-base-content/70">
                          If you want to make changes to your keyboard
                        </div>
                        <button
                          class="btn btn-soft btn-sm"
                          onClick={resetBuildState}
                          disabled={isBuilding()}
                        >
                          Try Again
                        </button>
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
              </div>
            </Dialog.Description>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog>
  );
}

export const ImportExportButtons: VoidComponent = () => {
  return (<div class="join join-vertical md:join-horizontal">
    <DropdownMenu placement="bottom-start">
      <DropdownMenu.Trigger class="join-item btn btn-xs md:btn-sm">
        Import
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content class="p-2 bg-base-200 rounded shadow-lg border menu">
          <DropdownMenu.Sub
            overlap
            gutter={4}
            shift={-8}
          >
            <DropdownMenu.SubTrigger as="li">
              <button>
                <Keyboard class="inline-block w-5 h-5" />
                Layout
                <div class="ml-auto pl-6">
                  <ChevronRight class="w-5 h-5" />
                </div>
              </button>
            </DropdownMenu.SubTrigger>
            <DropdownMenu.Portal>
              <DropdownMenu.SubContent class="p-2 bg-base-200 rounded shadow-lg border menu">
                <DropdownMenu.Item as="li"
                  onSelect={() => alert('TODO')}
                >
                  <button>
                    Keymap Layout Helper JSON
                  </button>
                </DropdownMenu.Item>
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </DropdownMenu.Sub>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu>

    <DropdownMenu placement="bottom-start">
      <DropdownMenu.Trigger class="join-item btn btn-xs md:btn-sm">
        Export
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content class="p-2 bg-base-200 rounded shadow-lg border menu">
          <DropdownMenu.Item as="li"
            onSelect={() => alert('TODO')}
          >
            <button>
              Keymap Layout Helper JSON
            </button>
          </DropdownMenu.Item>
          <DropdownMenu.Item as="li"
            onSelect={() => alert('TODO')}
          >
            <button>
              Internal Debug Data
            </button>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu>
  </div>);
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
        <DropdownMenu.Trigger class="btn btn-circle btn-ghost">
          <CircleQuestionMark class="w-6 h-6" />
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
Generated At: ${version.generatedAt || '(unknown)'}
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
              onSelect={() => { console.log("TODO") }}
            >
              <button>
                Run Tour
              </button>
            </DropdownMenu.Item>
            <DropdownMenu.Item as="li"
              onSelect={() => { console.log("TODO") }}
            >
              <button>
                Discord
              </button>
            </DropdownMenu.Item>
            <DropdownMenu.Item as="li"
              onSelect={() => { console.log("TODO") }}
            >
              <button>
                GitHub
              </button>
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu>

    </>
  );
}
