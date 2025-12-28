import { Button } from "@kobalte/core/button";
import { ToggleButton } from "@kobalte/core/toggle-button";
import Trash2 from "lucide-solid/icons/trash-2";
import { For, type VoidComponent } from "solid-js";
import { produce } from "solid-js/store";
import { useWizardContext } from "./context";
import type { Key } from "../typedef";

// This entire component is shite for keyboard navigation, needs rework. Good enough for now though.

export const DataTable: VoidComponent = () => {
  const context = useWizardContext();

  const sortKeys = () => {
    context.setKeyboard("layout",
      produce(draft => draft.sort((a, b) => (a.row - b.row) || (a.col - b.col)))
    );
  }

  const deleteRow = (index: number) => {
    context.setKeyboard("layout", context.keyboard.layout.filter((_, i) => i !== index));
  };

  /**
   *
   * @param rowIndex index of the row to update
   * @param field field to update
   * @param element input element
   * @param validateFn validation function
   * @param allowEmpty allow empty string, for onInput events
   */
  function handleInputEvents(
    rowIndex: number,
    field: keyof Key,
    element: HTMLInputElement,
    allowEmpty: boolean
  ) {
    const newValue = element.value.trim();
    // if (allowEmpty) {
    //   //  && (newValue === "" || newValue === "-")) {
    //   // while typing, allow partial input
    //   return;
    // }

    const parsedNumber = field in { row: 1, col: 1 }
      ? parseInt(newValue, 10)
      : parseFloat(newValue);
    if (isNaN(parsedNumber)) {
      // revert to previous value if invalid
      if (!allowEmpty) { element.value = context.keyboard.layout[rowIndex][field].toString(); }
      return;
    }
    // const asText = parsedNumber.toString();
    // if (asText !== element.value) {
    //   element.value = asText; // Update the input value to the validated one
    // }
    context.setKeyboard("layout", rowIndex, field, parsedNumber);

    if (field === "row" || field === "col") {
      // sort the keys by row and column if changed
      sortKeys();
    }
  }

  return (<div class="overflow-auto min-h-32 h-full">
    <table class="table table-sm table-pin-cols table-pin-rows w-full border-collapse border-spacing-0 min-w-[600px]">
      <thead>
        <tr class="bg-base-300">
          <th class="px-2 py-1 text-center" aria-label="Key Index"></th>
          <th class="px-2 py-1 text-center">ROW</th>
          <th class="px-2 py-1 text-center">COL</th>
          <th class="px-2 py-1 text-center">W</th>
          <th class="px-2 py-1 text-center">H</th>
          <th class="px-2 py-1 text-center">X</th>
          <th class="px-2 py-1 text-center">Y</th>
          <th class="px-2 py-1 text-center">R</th>
          <th class="px-2 py-1 text-center">RX</th>
          <th class="px-2 py-1 text-center">RY</th>
          <th class="px-2 py-1 text-center" aria-label="Delete Buttons"></th>
        </tr>
      </thead>
      <tbody class="[&_th]:p-0 [&_td]:p-0 [&_input]:p-1">
        <For each={context.keyboard.layout}>
          {(row, rowIndex) => (
            <tr class="hover:bg-base-200">
              <th class="z-1 select-none">
                <ToggleButton
                  title={`Key ${rowIndex()}, ${context.nav.selectedKeys.includes(row.id) ? "" : "not "}selected`}
                  aria-label={`Select key ${rowIndex()}`}
                  onClick={() => {
                    context.setNav("selectedKeys", produce(draft => {
                      const idx = context.nav.selectedKeys.indexOf(row.id);
                      if (idx === -1) {
                        draft.push(row.id);
                      } else {
                        draft.splice(idx, 1);
                      }
                    }));
                  }}
                  class="w-8 h-8 m-1 rounded-lg border text-sm font-semibold cursor-pointer"
                  classList={{
                    "bg-primary text-primary-content border-primary": context.nav.selectedKeys.includes(row.id),
                    "bg-base-200 text-base-content border-base-300 dark:bg-base-300 dark:border-base-400 dark:text-base-200": !context.nav.selectedKeys.includes(row.id),
                  }}
                >
                  {rowIndex()}
                </ToggleButton>
              </th>
              <For each={[
                ["row", "row"],
                ["col", "column"],
                ["w", "width"],
                ["h", "height"],
                ["x", "X position"],
                ["y", "Y position"],
                ["r", "rotation"],
                ["rx", "rotation origin X"],
                ["ry", "rotation origin Y"],
              ] satisfies ([keyof Key, string])[]}>
                {([field, desc]) => (
                  <td>
                    <input
                      type="text"
                      value={row[field]}
                      title={`Edit ${desc} of key ${rowIndex()}`}
                      onInput={(e) => handleInputEvents(
                        rowIndex(),
                        field,
                        e.currentTarget,
                        true
                      )}
                      onChange={(e) => handleInputEvents(
                        rowIndex(),
                        field,
                        e.currentTarget,
                        false
                      )}
                      autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
                      class="input input-ghost input-sm text-center" />
                  </td>
                )}
              </For>
              <th>
                <Button
                  onClick={() => deleteRow(rowIndex())}
                  class="btn btn-square btn-ghost btn-sm m-1 text-error"
                  title={`Delete key ${rowIndex()}`}
                >
                  <Trash2 aria-hidden size={14} />
                </Button>
              </th>
            </tr>
          )}
        </For>
      </tbody>
    </table>
  </div>);
}
