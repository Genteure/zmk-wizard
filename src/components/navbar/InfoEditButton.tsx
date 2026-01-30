import { Dialog } from "@kobalte/core/dialog";
import { Link } from "@kobalte/core/link";
import { debounce } from "@solid-primitives/scheduled";
import PencilLine from "lucide-solid/icons/pencil-line";
import { createMemo, createSignal, For, onMount, type VoidComponent } from "solid-js";
import { produce } from "solid-js/store";
import { CommonShieldNames } from "~/lib/shieldNames";
import type { KeyboardPart } from "~/typedef";
import { useWizardContext } from "../context";
import { loadBusesForController } from "../controllerInfo";

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
