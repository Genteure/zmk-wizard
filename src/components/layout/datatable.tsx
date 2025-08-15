import Plus from "lucide-solid/icons/plus";
import Trash2 from "lucide-solid/icons/trash-2";
import { For, type Component } from "solid-js";
import { produce, type SetStoreFunction, type Store } from "solid-js/store";
import type { Key } from "~/lib/types";

export const EditableTable: Component<{
  keys: Store<Key[]>,
  setKeys: SetStoreFunction<Key[]>,
}> = function EditableTable(props) {

  const addRow = () => props.setKeys(
    produce(draft => draft.push({
      partOf: 0, // default to part 0
      row: 0,
      column: 0,
      width: 1,
      height: 1,
      x: 0,
      y: 0,
      r: 0,
      rx: 0,
      ry: 0,
    }))
  );

  const deleteRow = (index: number) => {
    props.setKeys(props.keys.filter((_, i) => i !== index));
  };

  // const moveUp = (index: number) => {
  //   if (index <= 0) return;
  //   props.setKeys(
  //     produce((draft) => {
  //       [draft[index], draft[index - 1]] = [draft[index - 1], draft[index]];
  //     })
  //   );
  // };

  // const moveDown = (index: number) => {
  //   if (index >= props.keys.length - 1) return;
  //   props.setKeys(
  //     produce((draft) => {
  //       [draft[index], draft[index + 1]] = [draft[index + 1], draft[index]];
  //     })
  //   );
  // };

  function validateIntInput(value: string, prev: number): number {
    const intValue = parseInt(value, 10);
    return isNaN(intValue) ? prev : intValue;
  }

  function validateFloatInput(value: string, prev: number): number {
    const floatValue = parseFloat(value);
    return isNaN(floatValue) ? prev : floatValue;
  }

  type ValidateFn = (value: string, prev: number) => number;

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
    field: Exclude<keyof Key, "left">,
    element: HTMLInputElement,
    validateFn: ValidateFn,
    allowEmpty: boolean,
  ) {
    const newValue = element.value.trim();
    if (allowEmpty && (newValue === "" || newValue === "-")) {
      // while typing, allow partial input
      return;
    }

    const parsedNumber = validateFn(newValue, props.keys[rowIndex][field]);
    const asText = parsedNumber.toString();
    if (asText !== element.value) {
      element.value = asText; // Update the input value to the validated one
    }
    props.setKeys(rowIndex, field, parsedNumber);

    if (field === "row" || field === "column") {
      // sort the keys by row and column if changed
      props.setKeys(
        produce(draft => draft.sort((a, b) => (a.row - b.row) || (a.column - b.column)))
      );
    }
  }

  return (
    <div>
      <button
        onClick={addRow}
        class="btn btn-xs btn-primary mb-2 flex items-center gap-1"
      >
        <Plus size={14} />
        Add Key
      </button>

      <div class="overflow-auto min-h-24 max-h-64">
        <table class="table table-sm table-pin-cols table-pin-rows w-full border-collapse border-spacing-0 min-w-[600px]">
          <thead>
            <tr class="bg-base-300">
              <For each={[
                "",
                "ROW",
                "COL",
                "W",
                "H",
                "X",
                "Y",
                "R",
                "RX",
                "RY",
                "",
              ]}>
                {(header) => <th class="px-2 py-1 text-center"
                // classList={{ 'bg-transparent': !header }}
                >{header}</th>}
              </For>
            </tr>
          </thead>
          <tbody class="[&_td]:p-0 [&_input]:p-1">
            <For each={props.keys}>
              {(row, rowIndex) => (
                <tr class="hover:bg-base-200">
                  <th class="text-center text-base z-1">{rowIndex()}</th>
                  <For each={[
                    ["row", validateIntInput],
                    ["column", validateIntInput],
                    ["width", validateFloatInput],
                    ["height", validateFloatInput],
                    ["x", validateFloatInput],
                    ["y", validateFloatInput],
                    ["r", validateFloatInput],
                    ["rx", validateFloatInput],
                    ["ry", validateFloatInput],
                  ] satisfies [(keyof Key), ValidateFn][]}>
                    {([field, validateFn]) => (
                      <td>
                        <input
                          type="text"
                          value={row[field]}
                          onInput={(e) =>
                            handleInputEvents(
                              rowIndex(),
                              field,
                              e.currentTarget,
                              validateFn,
                              true
                            )}
                          onChange={(e) =>
                            handleInputEvents(
                              rowIndex(),
                              field,
                              e.currentTarget,
                              validateFn,
                              false
                            )}

                          class="input input-ghost input-sm text-center"
                        />
                      </td>
                    )}
                  </For>
                  <th class="flex items-center justify-center space-x-1">
                    {/* <button
                      onClick={() => moveUp(rowIndex())}
                      class="btn btn-square btn-ghost btn-xs"
                      disabled={rowIndex() === 0}
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      onClick={() => moveDown(rowIndex())}
                      class="btn btn-square btn-ghost btn-xs"
                      disabled={rowIndex() === props.keys.length - 1}
                    >
                      <ArrowDown size={14} />
                    </button> */}
                    <button
                      onClick={() => deleteRow(rowIndex())}
                      class="btn btn-square btn-ghost btn-xs text-error"
                    >
                      <Trash2 size={14} />
                    </button>
                  </th>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
    </div>
  );
}
