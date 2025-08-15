import { actions } from 'astro:actions';
import { PUBLIC_TURNSTILE_SITEKEY } from "astro:env/client";
import JSZip from "jszip";
import FolderArchive from "lucide-solid/icons/folder-archive";
import FolderGit2 from "lucide-solid/icons/folder-git-2";
import { createEffect, createSignal, Show, type Component } from "solid-js";
import { unwrap } from "solid-js/store";
import { createZMKConfig } from "~/lib/templating";
import { TurnstileCaptcha } from "../captcha/turnstile";
import { useWizardContext } from "../context";

export const StepBuild: Component = function () {
  const wizardContext = useWizardContext();

  const [repoLink, setRepoLink] = createSignal<string>("");
  const [repoLinkInput, setRepoLinkInput] = createSignal<HTMLInputElement | undefined>(undefined);
  const [captchaToken, setCaptchaToken] = createSignal<string | null>(null);

  createEffect(() => {
    const input = repoLinkInput();
    if (input) {
      const link = repoLink();
      input.value = link;

      input.focus();
      input.setSelectionRange(link.length, link.length);
      input.blur();
    }
  })

  const submitToServer = async () => {
    const { data, error } = await actions.buildRepository({
      keyboard: unwrap(wizardContext.keyboard),
      captcha: captchaToken() || "",
    })

    if (error) {
      console.error("Error building repository:", error);
      alert("Failed to create repository.\n" + error.message);
      return;
    }

    if (data?.repoId) {
      setRepoLink(`${window.location.origin}/repo/${data.repoId}.git`);
    } else {
      console.error("No repoId returned from server");
      alert("Failed to create repository.");
    }
  }

  const downloadZip = async () => {
    const keyboardConfig = createZMKConfig(unwrap(wizardContext.keyboard));

    const zip = new JSZip();
    for (const [filePath, content] of Object.entries(keyboardConfig)) {
      zip.file(filePath, content);
    }

    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `zmk-config-${wizardContext.keyboard.info.shield}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div class="max-w-xl my-4 mx-auto p-2">

      <div class="bg-base-200 p-2 rounded-lg shadow">
        <div class="text-center text-lg my-2">
          Your ZMK Configuration is ready!
        </div>

        <Show when={!repoLink()}>
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
                disabled={!captchaToken()}
              >
                Create Import Link
              </button>
            </div>
            <div class="text-center mt-4 text-sm">
              Repository link expires after 24 hours. <br />
              Creating hosted repository is captcha protected to prevent abuse.
            </div>
          </div>
        </Show>

        <Show when={repoLink()}>
          <div class="my-8">
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
                    navigator.clipboard.writeText(repoLink());
                  }}
                >Copy</button>
              </div>
            </div>

            <div class="m-4 text-sm">
              <div class="text-center">
                Import at <a href="https://github.com/new/import" class="link" target="_blank" rel="noopener noreferrer">
                  https://github.com/new/import
                </a><br />
                Recommended repository name is <span class="font-semibold text-nowrap">zmk-config-{wizardContext.keyboard.info.shield}</span>
                <br /><br />
                Leave credentials empty.
                Public repository is recommended for easier troubleshooting and free Action builds.
              </div>
            </div>
          </div>
        </Show>

        <div class="divider"></div>
        <div class="my-4 text-center">
          <div class="text-sm">
            As an alternative, download the configuration.<br />
            You can push it to your GitHub repository using git client of your choice.
          </div>
          <button
            class="btn btn-primary mt-2"
            onClick={downloadZip}
          >
            <FolderArchive class="inline" />
            Download
          </button>
        </div>
      </div>

      <div class="mt-8 p-2 prose">
        <h2 class="text-center">Next steps</h2>
        <ul>
          <li>
            <a href="https://zmk.dev/docs/user-setup#installing-the-firmware" target="_blank">
              Download the compiled firmware and flash it to your device.
            </a>
          </li>
          <li>
            Learn about <a href="https://zmk.dev/docs/keymaps" target="_blank">
              Keymap and Behaviors
            </a>. We used A, B, C, D... sequence as the default keymap so you can test the keyboard
            straight away, and we would be very surprised if you'd want to keep it.
          </li>
          <li>
            Enable <a href="https://zmk.dev/docs/features/studio#building" target="_blank">
              ZMK Studio support
            </a> to change keys without compiling and flashing again, or...
          </li>
          <li>
            ...edit the <code>.keymap</code> file manually (can be done <a
              href="https://docs.github.com/en/repositories/working-with-files/managing-files/editing-files"
              target="_blank" rel="noopener noreferrer">
              directly in browser
            </a>) or with <a href="https://nickcoutsos.github.io/keymap-editor/" target="_blank">
              Keymap Editor
            </a>.
          </li>
          <li>
            <a href="https://zmk.dev/docs/config" target="_blank">
              Configure your keyboard
            </a>, for example:
            <ul>
              <li>Enable <a href="https://zmk.dev/docs/config/battery" target="_blank">battery reporting</a></li>
              <li>Enable <a href="https://zmk.dev/docs/config/power" target="_blank">deep sleep</a> to save power</li>
            </ul>
          </li>
          <li>
            Join the <a href="https://zmk.dev/community/discord/invite" target="_blank">
              ZMK Discord server
            </a>.
          </li>
        </ul>

      </div>
    </div>
  );
}
