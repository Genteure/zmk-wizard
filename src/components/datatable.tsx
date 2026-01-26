import { Button } from "@kobalte/core/button";
import { ToggleButton } from "@kobalte/core/toggle-button";
import Trash2 from "lucide-solid/icons/trash-2";
import { createSignal, For, onMount, type VoidComponent } from "solid-js";
import { produce } from "solid-js/store";
import { useWizardContext } from "./context";
import type { Key } from "../typedef";

/**
 * Column configuration for the data table grid.
 * Each entry represents a column with its field key and human-readable description.
 */
const COLUMNS: readonly (readonly [keyof Key, string])[] = [
  ["row", "row"],
  ["col", "column"],
  ["w", "width"],
  ["h", "height"],
  ["x", "X position"],
  ["y", "Y position"],
  ["r", "rotation"],
  ["rx", "rotation origin X"],
  ["ry", "rotation origin Y"],
] as const;

// Total columns: select button (0) + 9 data fields (1-9) + delete button (10) = 11
const TOTAL_COLS = COLUMNS.length + 2;

export const DataTable: VoidComponent = () => {
  const context = useWizardContext();

  // Track the currently focused cell position for grid navigation
  const [focusedCell, setFocusedCell] = createSignal<{ row: number; col: number }>({ row: 0, col: 0 });
  let tableRef: HTMLTableElement | undefined;

  const sortKeys = () => {
    context.setKeyboard("layout",
      produce(draft => draft.sort((a, b) => (a.row - b.row) || (a.col - b.col)))
    );
  };

  const deleteRow = (index: number) => {
    const rowCount = context.keyboard.layout.length;
    context.setKeyboard("layout", context.keyboard.layout.filter((_, i) => i !== index));

    // Adjust focus after deletion
    if (rowCount > 1) {
      const newRowIndex = Math.min(index, rowCount - 2);
      const currentCol = focusedCell().col;
      setFocusedCell({ row: newRowIndex, col: currentCol });
      // Use requestAnimationFrame to ensure DOM is updated
      requestAnimationFrame(() => focusCell(newRowIndex, currentCol));
    }
  };

  /**
   * Handle input validation and state updates
   */
  function handleInputEvents(
    rowIndex: number,
    field: keyof Key,
    element: HTMLInputElement,
    allowEmpty: boolean
  ) {
    const newValue = element.value.trim();

    const parsedNumber = field in { row: 1, col: 1 }
      ? parseInt(newValue, 10)
      : parseFloat(newValue);
    if (isNaN(parsedNumber)) {
      // Revert to previous value if invalid
      if (!allowEmpty) { element.value = context.keyboard.layout[rowIndex][field].toString(); }
      return;
    }

    context.setKeyboard("layout", rowIndex, field, parsedNumber);

    if (field === "row" || field === "col") {
      // Sort keys by row and column if changed
      sortKeys();
    }
  }

  /**
   * Get the focusable element at the given grid position
   */
  function getCellElement(row: number, col: number): HTMLElement | null {
    if (!tableRef) return null;
    const tbody = tableRef.querySelector("tbody");
    if (!tbody) return null;

    const rowElement = tbody.children[row] as HTMLElement | undefined;
    if (!rowElement) return null;

    // Column 0 = select button, columns 1-9 = inputs, column 10 = delete button
    if (col === 0) {
      return rowElement.querySelector<HTMLElement>('[data-cell="select"]');
    } else if (col === TOTAL_COLS - 1) {
      return rowElement.querySelector<HTMLElement>('[data-cell="delete"]');
    } else {
      const inputs = rowElement.querySelectorAll<HTMLInputElement>('[data-cell="input"]');
      return inputs[col - 1] ?? null;
    }
  }

  /**
   * Focus a specific cell and update the focused cell state
   */
  function focusCell(row: number, col: number) {
    const element = getCellElement(row, col);
    if (element) {
      element.focus();
      setFocusedCell({ row, col });
    }
  }

  /**
   * Handle keyboard navigation within the grid
   */
  function handleGridKeyDown(e: KeyboardEvent, currentRow: number, currentCol: number) {
    const rowCount = context.keyboard.layout.length;
    if (rowCount === 0) return;

    let newRow = currentRow;
    let newCol = currentCol;
    let handled = false;

    switch (e.key) {
      case "ArrowUp":
        if (currentRow > 0) {
          newRow = currentRow - 1;
          handled = true;
        }
        break;
      case "ArrowDown":
        if (currentRow < rowCount - 1) {
          newRow = currentRow + 1;
          handled = true;
        }
        break;
      case "ArrowLeft":
        if (currentCol > 0) {
          newCol = currentCol - 1;
          handled = true;
        }
        break;
      case "ArrowRight":
        if (currentCol < TOTAL_COLS - 1) {
          newCol = currentCol + 1;
          handled = true;
        }
        break;
      case "Home":
        if (e.ctrlKey) {
          // Ctrl+Home: go to first cell
          newRow = 0;
          newCol = 0;
        } else {
          // Home: go to first cell in row
          newCol = 0;
        }
        handled = true;
        break;
      case "End":
        if (e.ctrlKey) {
          // Ctrl+End: go to last cell
          newRow = rowCount - 1;
          newCol = TOTAL_COLS - 1;
        } else {
          // End: go to last cell in row
          newCol = TOTAL_COLS - 1;
        }
        handled = true;
        break;
      case "PageUp":
        // Move up by 10 rows or to start
        newRow = Math.max(0, currentRow - 10);
        handled = true;
        break;
      case "PageDown":
        // Move down by 10 rows or to end
        newRow = Math.min(rowCount - 1, currentRow + 10);
        handled = true;
        break;
    }

    if (handled) {
      e.preventDefault();
      focusCell(newRow, newCol);
    }
  }

  /**
   * Track which cell gains focus for proper tabindex management
   */
  function handleCellFocus(row: number, col: number) {
    setFocusedCell({ row, col });
  }

  // Set initial focus state when data loads (doesn't auto-focus the element)
  onMount(() => {
    if (context.keyboard.layout.length > 0) {
      setFocusedCell({ row: 0, col: 0 });
    }
  });

  const rowCount = () => context.keyboard.layout.length;

  return (
    <div class="overflow-auto min-h-32 h-full">
      <table
        ref={tableRef}
        role="grid"
        aria-label="Keyboard layout keys"
        aria-rowcount={rowCount() + 1}
        aria-colcount={TOTAL_COLS}
        class="table table-sm table-pin-cols table-pin-rows w-full border-collapse border-spacing-0 min-w-[600px]"
      >
        <thead>
          <tr role="row" aria-rowindex={1} class="bg-base-300">
            <th
              role="columnheader"
              aria-colindex={1}
              class="px-2 py-1 text-center"
              scope="col"
            >
              <span class="sr-only">Select</span>
              <span aria-hidden="true">#</span>
            </th>
            <For each={COLUMNS}>
              {([field, _], colIndex) => (
                <th
                  role="columnheader"
                  aria-colindex={colIndex() + 2}
                  class="px-2 py-1 text-center"
                  scope="col"
                >
                  {field.toUpperCase()}
                </th>
              )}
            </For>
            <th
              role="columnheader"
              aria-colindex={TOTAL_COLS}
              class="px-2 py-1 text-center"
              scope="col"
            >
              <span class="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody class="[&_th]:p-0 [&_td]:p-0 [&_input]:p-1">
          <For each={context.keyboard.layout}>
            {(row, rowIndex) => {
              const isSelected = () => context.nav.selectedKeys.includes(row.id);

              return (
                <tr
                  role="row"
                  aria-rowindex={rowIndex() + 2}
                  class="hover:bg-base-200"
                  classList={{
                    "bg-primary/10": isSelected(),
                  }}
                >
                  {/* Select Toggle Cell */}
                  <th role="gridcell" aria-colindex={1} class="z-1 select-none">
                    <ToggleButton
                      data-cell="select"
                      pressed={isSelected()}
                      aria-label={`Key ${rowIndex()}`}
                      aria-describedby={`key-${rowIndex()}-desc`}
                      tabIndex={focusedCell().row === rowIndex() && focusedCell().col === 0 ? 0 : -1}
                      onFocus={() => handleCellFocus(rowIndex(), 0)}
                      onKeyDown={(e: KeyboardEvent) => handleGridKeyDown(e, rowIndex(), 0)}
                      onChange={() => {
                        context.setNav("selectedKeys", produce(draft => {
                          const idx = context.nav.selectedKeys.indexOf(row.id);
                          if (idx === -1) {
                            draft.push(row.id);
                          } else {
                            draft.splice(idx, 1);
                          }
                        }));
                      }}
                      class="w-8 h-8 m-1 rounded-lg border text-sm font-semibold cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1"
                      classList={{
                        "bg-primary text-primary-content border-primary": isSelected(),
                        "bg-base-200 text-base-content border-base-300 dark:bg-base-300 dark:border-base-400 dark:text-base-200": !isSelected(),
                      }}
                    >
                      {rowIndex()}
                    </ToggleButton>
                    <span id={`key-${rowIndex()}-desc`} class="sr-only">
                      {isSelected() ? "Selected" : "Not selected"}. Row {row.row}, Column {row.col}.
                    </span>
                  </th>

                  {/* Data Input Cells */}
                  <For each={COLUMNS}>
                    {([field, desc], colIndex) => (
                      <td role="gridcell" aria-colindex={colIndex() + 2}>
                        <input
                          data-cell="input"
                          type="text"
                          inputMode={field === "row" || field === "col" ? "numeric" : "decimal"}
                          value={row[field]}
                          aria-label={`Key ${rowIndex()} ${desc}`}
                          tabIndex={focusedCell().row === rowIndex() && focusedCell().col === colIndex() + 1 ? 0 : -1}
                          onFocus={() => handleCellFocus(rowIndex(), colIndex() + 1)}
                          onKeyDown={(e) => {
                            // Allow normal text editing keys, only intercept navigation
                            if (["ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(e.key)) {
                              handleGridKeyDown(e, rowIndex(), colIndex() + 1);
                            } else if (e.key === "ArrowLeft" && (e.currentTarget.selectionStart ?? 0) === 0) {
                              handleGridKeyDown(e, rowIndex(), colIndex() + 1);
                            } else if (e.key === "ArrowRight" && (e.currentTarget.selectionStart ?? 0) === e.currentTarget.value.length) {
                              handleGridKeyDown(e, rowIndex(), colIndex() + 1);
                            }
                          }}
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
                          autocomplete="off"
                          autocorrect="off"
                          autocapitalize="off"
                          spellcheck={false}
                          class="input input-ghost input-sm text-center w-full focus:outline-none focus:ring-2 focus:ring-primary focus:ring-inset"
                        />
                      </td>
                    )}
                  </For>

                  {/* Delete Button Cell */}
                  <th role="gridcell" aria-colindex={TOTAL_COLS}>
                    <Button
                      data-cell="delete"
                      tabIndex={focusedCell().row === rowIndex() && focusedCell().col === TOTAL_COLS - 1 ? 0 : -1}
                      onFocus={() => handleCellFocus(rowIndex(), TOTAL_COLS - 1)}
                      onKeyDown={(e: KeyboardEvent) => handleGridKeyDown(e, rowIndex(), TOTAL_COLS - 1)}
                      onClick={() => deleteRow(rowIndex())}
                      class="btn btn-square btn-ghost btn-sm m-1 text-error focus:outline-none focus:ring-2 focus:ring-error focus:ring-offset-1"
                      aria-label={`Delete key ${rowIndex()}`}
                    >
                      <Trash2 aria-hidden="true" size={14} />
                    </Button>
                  </th>
                </tr>
              );
            }}
          </For>
        </tbody>
      </table>

      {/* Screen reader instructions */}
      <div class="sr-only" aria-live="polite">
        Use arrow keys to navigate between cells. Press Tab to exit the table.
      </div>
    </div>
  );
}
