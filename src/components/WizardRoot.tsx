import { createSignal, DEV as SOLID_DEV, type Component } from 'solid-js';
import { createStore, unwrap } from 'solid-js/store';
import { Dynamic } from 'solid-js/web';
import { Controller, WiringType, type KeyboardContext } from '~/lib/types';
import { WizardProvider } from './context';
import { StepBuild } from './steps/Build';
import { StepInfo } from './steps/Info';
import { StepLayout } from './steps/Layout';
import { StepPinout } from './steps/Pinout';
import { StepWiring } from './steps/Wiring';

const steps = [
  { name: 'Info', component: StepInfo },
  { name: 'Layout', component: StepLayout },
  { name: 'Pinout', component: StepPinout },
  { name: 'Wiring', component: StepWiring },
  { name: 'Build', component: StepBuild },
];

const App: Component = () => {
  const [currentStep, setCurrentStep] = createSignal(0);
  function stepPrevious() {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  }
  function stepNext() {
    setCurrentStep((prev) => Math.min(prev + 1, steps.length - 1));
  }

  const [keyboard, setKeyboard] = createStore<KeyboardContext>({
    info: {
      name: '',
      shield: '',
      controller: Controller.enum.nice_nano_v2,
      wiring: WiringType.enum.matrix_diode,
      // dongle: false,
    },
    layout: [],
    pinouts: [{}, {}],
    wiring: [],
  });

  const wizardContext = {
    stepBack: stepPrevious,
    stepNext,
    keyboard,
    setKeyboard,
  }

  // if (SOLID_DEV)
  {
    if (typeof window !== 'undefined') {
      (window as any).solidUnwrap = unwrap;
      (window as any).wizardContext = wizardContext;
    }
  }

  return (
    <WizardProvider value={wizardContext}>
      <div id="app-root">
        <ul class="steps steps-horizontal w-full my-2 select-none">
          {steps.map((step, idx) => (
            <li
              class="step"
              classList={{
                'step-primary': idx <= currentStep(),
                'font-bold': idx === currentStep(),
              }}
              onClick={
                SOLID_DEV ?
                  () => setCurrentStep(idx)
                  : undefined // Disable step clicking in production
              }
            >
              {step.name}
            </li>
          ))}
        </ul>
        <Dynamic component={steps[currentStep()].component} />
      </div>
    </WizardProvider>
  );
};

export default App;
