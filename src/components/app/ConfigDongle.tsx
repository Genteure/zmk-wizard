import { Popover } from "@kobalte/core/popover";
import RadioReceiver from "lucide-solid/icons/radio-receiver";
import type { VoidComponent } from "solid-js";

export const ConfigDongle: VoidComponent = () => {
  return (
    <div class="flex flex-col items-center gap-2 py-2 mb-8">
      {/* Dongle Header Section */}
      <div class="w-full max-w-md p-3 bg-base-200/60 rounded-xl border border-base-300">
        {/* Row 1: Part Name and Role */}
        <div class="flex items-center gap-2 mb-2 ml-3">
          {/* Dongle Icon and Name */}
          <RadioReceiver class="w-5 h-5 text-primary" aria-hidden />
          <span class="text-lg font-semibold">dongle</span>

          {/* Spacer */}
          <div class="flex-1" />

          {/* Part Role Badge */}
          <div class="flex items-center gap-1">
            <Popover>
              <Popover.Trigger class="badge badge-primary badge-sm cursor-help">
                Central
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content class="popover--content w-64 p-3">
                  <div class="text-sm">
                    <strong>Central</strong> is the dongle receiver that connects to the host device via USB or BLE.
                    It receives data from all peripheral keyboard parts.
                  </div>
                </Popover.Content>
              </Popover.Portal>
            </Popover>
          </div>
        </div>

        {/* Row 2: Controller Info */}
        <div class="flex items-center gap-2">
          <div class="btn btn-sm btn-ghost flex-1 justify-start text-left gap-2 h-auto py-1.5 cursor-default">
            <div class="flex flex-col items-start min-w-0">
              <span class="text-sm font-medium truncate text-base-content/70">Any compatible controller</span>
            </div>
          </div>
        </div>
      </div>

      {/* Empty content area - dongle has no pins or bus devices */}
      <div class="w-full max-w-5xl text-center text-base-content/50 py-8">
        <p>Dongle configuration is determined by the selected controller at build time.</p>
      </div>
    </div>
  );
};
