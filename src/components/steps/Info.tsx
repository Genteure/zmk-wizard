import { debounce } from '@solid-primitives/scheduled';
import { createSignal, type Component } from 'solid-js';
import { CommonShieldNames } from '~/lib/shieldNames';
import { Controller, WiringType } from '~/lib/types';
import { useWizardContext } from '../context';

export const StepInfo: Component = function () {
  const wizardContext = useWizardContext();
  const [displayNameErrors, setDisplayNameErrors] = createSignal<string[]>([]);
  const [shieldNameErrors, setShieldNameErrors] = createSignal<string[]>([]);

  function nameToShield(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/_{2,}/g, '_');
  }

  let shieldInput: HTMLInputElement | undefined;

  const validateDisplayName = (value: string) => {
    const trimmedValue = value.trim();
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
        const expectedOldShieldName = nameToShield(wizardContext.keyboard.info.name);
        if (expectedOldShieldName === shieldInput.value) {
          // continue updating shield name base on display name
          updateShieldName = true;
        }
      }
      if (updateShieldName) {
        shieldInput.value = nameToShield(trimmedValue);
        validateShieldName(shieldInput.value);
      }
    }

    // set display name
    setDisplayNameErrors([]);
    wizardContext.setKeyboard('info', 'name', trimmedValue);

  };
  const debouncedValidateDisplayName = debounce(validateDisplayName, 100);

  const validateShieldName = (value: string) => {
    const errors = [];
    const trimmedValue = value.trim();
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
      wizardContext.setKeyboard('info', 'shield', trimmedValue);
    }
  };
  const debouncedValidateShieldName = debounce(validateShieldName, 100);

  return (
    <div class="max-w-lg mx-auto p-2">
      <div>
        <h1 class="text-2xl text-center font-bold">Shield Wizard for ZMK <span class='text-base'>v0.3</span></h1>
        <p class="text-sm my-2 text-center">
          An experimental tool to create ZMK shields for custom keyboards
        </p>
      </div>
      <fieldset class="fieldset p-4 rounded-lg bg-base-200">
        <legend class="fieldset-legend">Keyboard Information</legend>

        <div class="mb-4">
          <label
            class="input w-full"
            classList={{ 'input-error': displayNameErrors().length > 0 }}
          >
            <span class="label select-none">Display Name</span>
            <input
              id="keyboard-name"
              type="text"
              placeholder="My Keyboard"
              value={wizardContext.keyboard.info.name}
              autocomplete="off"
              onInput={e => debouncedValidateDisplayName(e.target.value)}
              onChange={e => validateDisplayName(e.target.value)}
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
              value={wizardContext.keyboard.info.shield}
              autocomplete="off"
              onInput={e => debouncedValidateShieldName(e.target.value)}
              onChange={e => validateShieldName(e.target.value)}
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
          <label class="select w-full">
            <span class="label select-none">Controller &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>
            <select
              value={wizardContext.keyboard.info.controller}
              autocomplete="off"
              onChange={e => {
                wizardContext.setKeyboard('info', 'controller', e.currentTarget.value as Controller)
                // reset pinout selections when controller changes
                wizardContext.setKeyboard('pinouts', wizardContext.keyboard.pinouts.map(() => ({})));
                wizardContext.setKeyboard('wiring', wizardContext.keyboard.layout.map(() => ({ input: null, output: null })));
              }}
            >
              <option value={Controller.enum.nice_nano_v2}>nice!nano v2</option>
              <option value={Controller.enum.nice_nano_v2}>SuperMini nRF52840 (n!n v2 clone)</option>
              <option value={Controller.enum.nice_nano_v2}>nano52840 (n!n v2 clone)</option>
              <option value={Controller.enum.seeed_xiao_ble}>Seeed XIAO nRF52840</option>
              <option value={Controller.enum.seeed_xiao_ble_plus}>Seeed XIAO nRF52840 Plus</option>
            </select>
          </label>
        </div>
        <div class="mb-4">
          <label class="select w-full">
            <span class="label select-none">Wiring &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>
            <select
              value={wizardContext.keyboard.info.wiring}
              autocomplete="off"
              onChange={e => wizardContext.setKeyboard('info', 'wiring', e.currentTarget.value as WiringType)}
            >
              <option value={WiringType.enum.matrix_diode}>Matrix (with diodes)</option>
              <option value={WiringType.enum.matrix_no_diode}>Matrix (no diodes)</option>
              <option value={WiringType.enum.direct_gnd}>Direct (to GND)</option>
              <option value={WiringType.enum.direct_vcc}>Direct (to VCC)</option>
            </select>
          </label>
        </div>

        <div class="mb-4">
          <div class="join">
            <input
              type="radio" name="shape" value="unibody" class="btn join-item" aria-label="Unibody (1 part)"
              checked={wizardContext.keyboard.pinouts.length === 1}
              autocomplete="off"
              onChange={() => wizardContext.setKeyboard('pinouts', [{}])}
            />
            <input
              type="radio" name="shape" value="split" class="btn join-item" aria-label="Split (2 parts)"
              checked={wizardContext.keyboard.pinouts.length === 2}
              autocomplete="off"
              onChange={() => wizardContext.setKeyboard('pinouts', [{}, {}])}
            />
          </div>
        </div>

        <div class="mb-4">
          <input
            type="checkbox" id="add-dongle" class="checkbox checkbox-primary"
            checked={wizardContext.keyboard.info.dongle}
            onChange={e => wizardContext.setKeyboard('info', 'dongle', e.currentTarget.checked)}
          />
          <label for="add-dongle" class="label pl-1">Add an optional dongle</label>
        </div>

        <div class="flex justify-end mt-4">
          <button
            class="btn btn-primary"
            onClick={wizardContext.stepNext}
            disabled={
              displayNameErrors().length > 0 ||
              shieldNameErrors().length > 0 ||
              wizardContext.keyboard.info.name === '' ||
              wizardContext.keyboard.info.shield === ''
            }
          >
            Next
          </button>
        </div>
      </fieldset>
      <div class='p-2 prose prose-sm'>
        <p class='font-bold'>Reading the <a href="https://zmk.dev/docs/development/hardware-integration/new-shield" target='_blank'>New Keyboard Shield</a> guide before using this tool is highly recommended.</p>
        <p><a href="https://zmk.dev/docs/development/hardware-integration#what-is-a-shield" target="_blank">
          What is a "shield"?
        </a></p>
        <p>This wizard does not support all ZMK features, such as:</p>
        <ul>
          <li>Encoder, LED, Display</li>
          <li>Split keyboard with 3 or more parts</li>
          <li>Shift registers, IO expanders, multiplexers</li>
          <li>Charlieplex and other unusual wiring</li>
          <li>Pointing/Mouse/Trackpad/Trackball</li>
          <li>Controller other than the listed ones</li>
          <li>And more</li>
        </ul>
        <p>
          For these features, please read ZMK docs and configure manually.
          See pages under <a href="https://zmk.dev/docs/development/hardware-integration" target='_blank'>Hardware Intergation</a> for more information.
        </p>
      </div>
    </div>
  );
}
