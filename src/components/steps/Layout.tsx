import ChevronLeft from "lucide-solid/icons/chevron-left";
import Sparkles from "lucide-solid/icons/sparkles";
import { createMemo, createSignal, For, Show, type Accessor, type Component } from "solid-js";
import { createStore, type SetStoreFunction } from "solid-js/store";
import { bboxCenter, getKeysBoundingBox, keyCenter } from "~/lib/geometry";
import { layouts } from "~/lib/physicalLayouts";
import { type Key } from "~/lib/types";
import { useWizardContext } from "../context";
import { EditableTable } from "../layout/datatable";
import { KeyboardLayoutPreview } from "../layout/preview";

function autoAssignSplitSide(keys: Key[]) {
  const center = bboxCenter(getKeysBoundingBox(keys));
  keys.forEach(key => {
    const kc = keyCenter(key);
    key.partOf = kc.x <= center.x ? 0 : 1; // 0 for left, 1 for right
  });
  return keys;
}

export const StepLayout: Component = function () {
  const wizardContext = useWizardContext();

  const [keys, setKeys] = createStore<Key[]>(wizardContext.keyboard.layout);
  const logicalKeys = createMemo(() => keys
    .map(key => ({
      ...key,
      width: 1,
      height: 1,
      x: key.column,
      y: key.row,
      r: 0,
      rx: 0,
      ry: 0,
    }))
  );

  let importJsonDialog = undefined as HTMLDialogElement | undefined;
  const [importJsonText, setImportJsonText] = createSignal<string>("");

  return (
    <div class="max-w-5xl mx-auto p-2">
      <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center">

        <div class="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">

          <button
            class="btn btn-primary w-full sm:w-auto"
            onClick={() => {
              importJsonDialog?.showModal();
            }}
          >
            Import Keymap Layout Helper JSON
            <Sparkles size={"1.5em"} />
          </button>
          <dialog class="modal" ref={importJsonDialog}>
            <div class="modal-box">
              <textarea
                class="textarea w-full my-2"
                placeholder="Paste Keymap Layout Helper JSON here"
                style={{ resize: "vertical" }}
                spellcheck="false"
                autocorrect="off"
                autocapitalize="off"
                onInput={(e) => setImportJsonText((e.target as HTMLTextAreaElement).value)}
                onChange={(e) => setImportJsonText((e.target as HTMLTextAreaElement).value)}
                value={importJsonText()}
              >
              </textarea>
              <div class="text-center text-sm">
                Malformed, unsupported or invalid data will be silently ignored. <br />
                If the JSON has multiple layouts, only the first one will be imported.
              </div>
              <div class="modal-action">
                <button
                  class="btn btn-outline"
                  onClick={() => {
                    importJsonDialog?.close();
                    setImportJsonText("");
                  }}
                >
                  Close
                </button>
                <button
                  class="btn btn-primary"
                  disabled={
                    (() => {
                      try {
                        const layouts = Object.values(((JSON.parse(importJsonText())).layouts || {})) as any[];
                        const layout = layouts[0]?.layout;
                        return !(Array.isArray(layout) && layout.length);
                      } catch {
                        return true;
                      }
                    })()
                  }
                  onClick={() => {
                    try {
                      const data = JSON.parse(importJsonText());
                      const layouts = Object.values((data.layouts || {})) as any[];
                      const layout = layouts[0].layout;

                      if (layout && Array.isArray(layout)) {
                        const importKeys = layout.map((item: any) => ({
                          partOf: 0,
                          row: item.row,
                          column: item.col,
                          width: item.w || 1,
                          height: item.h || 1,
                          x: item.x,
                          y: item.y,
                          r: item.r || 0,
                          rx: item.rx || 0,
                          ry: item.ry || 0,
                        } as Key));

                        {
                          // validate key order
                          // each key must have larger column than the previous key
                          // unless it's in a new row
                          let lastRow = 0, lastCol = -1;
                          for (const key of importKeys) {
                            if (key.row < lastRow || (key.row === lastRow && key.column <= lastCol)) {
                              // TODO move error message to HTML
                              alert("Invalid key order. Keys must be ordered by row and then by column.");
                              throw new Error("Invalid key order");
                            }
                            lastRow = key.row;
                            lastCol = key.column;
                          }
                        }

                        autoAssignSplitSide(importKeys);
                        setKeys(importKeys);
                      } else {
                        throw new Error("Invalid JSON format: 'layout' array not found");
                      }
                    } catch (error) {
                      console.error("Failed to parse JSON:", error);
                    } finally {
                      importJsonDialog?.close();
                      setImportJsonText("");
                    }
                  }}
                >
                  Import
                </button>
              </div>
            </div>
          </dialog>

          <details class="dropdown" onMouseLeave={(e) => e.currentTarget.removeAttribute("open")}>
            <summary class="btn btn-primary w-full sm:w-auto">Load Example</summary>
            <ul class="menu dropdown-content z-1 bg-base-200 rounded-box w-56">
              <For each={Object.entries(layouts)}>
                {([category, layouts]) => (
                  <li>
                    <details>
                      <summary class="flex items-center gap-2">
                        {category}
                      </summary>
                      <ul class="menu w-full">
                        <For each={layouts}>
                          {(layout) => (
                            <li>
                              <button onClick={() => setKeys(autoAssignSplitSide(structuredClone(layout.keys)))}>
                                {layout.name}
                              </button>
                            </li>
                          )}
                        </For>
                      </ul>
                    </details>
                  </li>
                )}
              </For>
            </ul>
          </details>
        </div>

        <div class="flex flex-row gap-2 w-full sm:w-auto mt-2 sm:mt-0">
          <button
            class="btn btn-outline flex-1 sm:w-auto"
            title="Go Back"
            onClick={wizardContext.stepBack}
          >
            <ChevronLeft />
          </button>
          <button
            class="btn btn-primary flex-1 sm:w-auto"
            disabled={keys.length === 0}
            onClick={wizardContext.stepNext}
          >
            Next
          </button>
        </div>

      </div>

      <div>
        <p class="text-base-content/65 mt-2">
          Importing from&nbsp;
          <a class="link" href="https://nickcoutsos.github.io/keymap-layout-tools/" target="_blank">Keymap Layout Helper</a>
          &nbsp;is highly recommended. It's much easier to edit layout there.
          Keymap Layout Helper can import KiCAD PCB and other data formats.
        </p>
      </div>

      <div class="my-4">
        <EditableTable keys={keys} setKeys={setKeys} />
      </div>

      <div class="my-4">
        <h2 class="text-xl font-semibold">Graphical Preview</h2>
        <p class="text-base-content/65">
          How the keyboard actually looks like phisically in real life.
          This is what will show up in&nbsp;
          <a href="https://zmk.dev/docs/features/studio" target="_blank" class="link">ZMK Studio</a>
          &nbsp;or&nbsp;
          <a href="https://nickcoutsos.github.io/keymap-editor/" target="_blank" class="link">Keymap Editor</a>
          &nbsp;.
        </p>
        <LayoutPreview
          split={() => wizardContext.keyboard.pinouts.length > 1}
          keys={() => keys}
          setKeys={setKeys}
        />
      </div>

      <div class="my-4">
        <h2 class="text-xl font-semibold">Logical/Textual Preview</h2>
        <p class="text-base-content/65">
          Just like how you would represent the keys in a text file or spreadsheet.
          Not necessarily how the keys are electrically connected.
        </p>
        <LayoutPreview
          split={() => wizardContext.keyboard.pinouts.length > 1}
          keys={logicalKeys}
          setKeys={setKeys}
        />
      </div>
    </div>
  );
}

const LayoutPreview: Component<{
  split: Accessor<boolean>,
  keys: Accessor<Key[]>,
  setKeys: SetStoreFunction<Key[]>,
}> = (props) => {
  return <>
    <KeyboardLayoutPreview keys={props.keys}>
      {(styles, key, index) => (
        <div class="absolute" style={styles()}>
          <div
            class="w-full h-full flex items-center justify-center rounded-sm select-none cursor-pointer"
            classList={{
              'cursor-pointer': props.split(),
              'bg-slate-500': !props.split(),
              'bg-amber-600': props.split() && key.partOf === 0,
              'bg-teal-600': props.split() && key.partOf === 1,
            }}
            onClick={() => props.setKeys(index(), "partOf", (partOf) => partOf ? 0 : 1)} // toggle partOf between 0 and 1
          >
            <span class="text-white font-extrabold text-3xl">{index()}</span>
          </div>
        </div>
      )}
    </KeyboardLayoutPreview>
    <Show when={props.split()}>
      <p class="text-base-content/65 text-center">
        Click to switch between&nbsp;
        <span class="px-2 py-1 rounded bg-amber-600 text-white font-semibold shadow">Left</span>
        &nbsp;and&nbsp;
        <span class="px-2 py-1 rounded bg-teal-600 text-white font-semibold shadow">Right</span>
      </p>
    </Show>
  </>
};
