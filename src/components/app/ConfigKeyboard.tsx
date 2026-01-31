import { Link } from "@kobalte/core/link";
import Minus from "lucide-solid/icons/minus";
import Plus from "lucide-solid/icons/plus";
import { createMemo, For, type VoidComponent } from "solid-js";
import { produce } from "solid-js/store";
import type { ModuleId } from "~/typedef";
import { useWizardContext } from "../context";
import { ZmkModules, busDeviceMetadata, busDeviceTypes } from "../controllerInfo";

/**
 * Get the list of all available module IDs
 */
const allModuleIds = Object.keys(ZmkModules) as ModuleId[];

/**
 * Get information about which devices require a specific module
 */
function getDevicesForModule(moduleId: ModuleId): string[] {
  return busDeviceTypes.filter((type) => {
    const meta = busDeviceMetadata[type];
    return meta.module === moduleId;
  }).map(type => busDeviceMetadata[type].fullName);
}

export const ConfigKeyboard: VoidComponent = () => {
  const context = useWizardContext();

  const enabledModules = () => context.keyboard.modules;

  const availableModules = createMemo(() => {
    const enabled = new Set(enabledModules());
    return allModuleIds.filter(id => !enabled.has(id));
  });

  const addModule = (moduleId: ModuleId) => {
    context.setKeyboard("modules", produce((modules) => {
      if (!modules.includes(moduleId)) {
        modules.push(moduleId);
      }
    }));
  };

  const removeModule = (moduleId: ModuleId) => {
    context.setKeyboard("modules", produce((modules) => {
      const index = modules.indexOf(moduleId);
      if (index !== -1) {
        modules.splice(index, 1);
      }
    }));
  };

  return (
    <>
      {/* Module configuration card */}
      <div class="p-4 border border-base-300 rounded-lg bg-base-200">
        <div class="text-lg font-semibold mb-3">
          External Modules
        </div>
        <p class="text-sm text-base-content/70 mb-4">
          External modules provide drivers for pointing devices and other hardware.
          Add a module to enable its devices in the device configuration.
        </p>

        {/* Enabled modules */}
        <div class="mb-4">
          <div class="text-sm font-medium mb-2">Enabled Modules</div>
          <div class="flex flex-col gap-2">
            <For each={enabledModules()} fallback={
              <div class="text-sm text-base-content/50 italic p-2 bg-base-100 rounded border border-base-300">
                No external modules enabled
              </div>
            }>
              {(moduleId) => {
                const moduleData = () => ZmkModules[moduleId];
                const devices = () => getDevicesForModule(moduleId);
                return (
                  <div class="flex items-center justify-between p-3 bg-base-100 rounded border border-base-300">
                    <div class="flex-1">
                      <div class="font-medium">
                        <Link
                          class="link link-primary"
                          href={`https://github.com/${moduleData().remote}/${moduleData().repo}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {moduleData().remote}/{moduleData().repo}
                        </Link>
                      </div>
                      <div class="text-xs text-base-content/60">
                        Provides: {devices().join(", ")}
                      </div>
                    </div>
                    <button
                      class="btn btn-sm btn-ghost text-error hover:bg-error/10"
                      onClick={() => removeModule(moduleId)}
                      title="Remove module"
                    >
                      <Minus class="w-4 h-4" />
                      Remove
                    </button>
                  </div>
                );
              }}
            </For>
          </div>
        </div>

        {/* Available modules to add */}
        <div>
          <div class="text-sm font-medium mb-2">Available Modules</div>
          <div class="flex flex-col gap-2">
            <For each={availableModules()} fallback={
              <div class="text-sm text-base-content/50 italic p-2 bg-base-100 rounded border border-base-300">
                All available modules are enabled
              </div>
            }>
              {(moduleId) => {
                const moduleData = () => ZmkModules[moduleId];
                const devices = () => getDevicesForModule(moduleId);
                return (
                  <div class="flex items-center justify-between p-3 bg-base-100 rounded border border-base-300">
                    <div class="flex-1">
                      <div class="font-medium">
                        <Link
                          class="link link-primary"
                          href={`https://github.com/${moduleData().remote}/${moduleData().repo}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {moduleData().remote}/{moduleData().repo}
                        </Link>
                      </div>
                      <div class="text-xs text-base-content/60">
                        Provides: {devices().join(", ")}
                      </div>
                    </div>
                    <button
                      class="btn btn-sm btn-ghost text-success hover:bg-success/10"
                      onClick={() => addModule(moduleId)}
                      title="Add module"
                    >
                      <Plus class="w-4 h-4" />
                      Add
                    </button>
                  </div>
                );
              }}
            </For>
          </div>
        </div>
      </div>
    </>
  );
};
