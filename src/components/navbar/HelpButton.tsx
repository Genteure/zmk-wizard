import { Button } from "@kobalte/core/button";
import { Dialog } from "@kobalte/core/dialog";
import { DropdownMenu } from "@kobalte/core/dropdown-menu";
import ChevronRight from "lucide-solid/icons/chevron-right";
import ExternalLink from "lucide-solid/icons/external-link";
import Menu from "lucide-solid/icons/menu";
import SunMoon from "lucide-solid/icons/sun-moon";
import X from "lucide-solid/icons/x";
import { createSignal, type VoidComponent } from "solid-js";
import { version } from "virtual:version";
import { KeyboardSchema } from "~/typedef";
import { useWizardContext } from "../context";

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
