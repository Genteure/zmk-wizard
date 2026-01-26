import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByLabel("Display Name").fill("E2E Test");
  await page.getByRole('button', { name: 'Dismiss' }).click();

  // Load the Ferris preset (34 keys - smaller and faster to test)
  await page.getByRole('menuitem', { name: 'Layout Tools' }).click();
  await page.getByRole('menuitem', { name: 'Presets' }).click();
  await page.getByRole('menuitem', { name: 'Ferris' }).click();
});

test.describe('datatable', () => {
  test.describe('layout and structure', () => {
    test('renders grid with correct ARIA attributes and columns', async ({ page }) => {
      const grid = page.getByRole('grid', { name: 'Keyboard layout keys' });
      await expect(grid).toBeVisible();

      // Check column headers are present (use exact match for single-letter headers)
      await expect(page.getByRole('columnheader', { name: 'ROW' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: 'COL' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: 'W', exact: true })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: 'H', exact: true })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: 'X', exact: true })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: 'Y', exact: true })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: 'R', exact: true })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: 'RX' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: 'RY' })).toBeVisible();

      // Check grid rows are rendered (Ferris has 34 keys)
      const rows = page.getByRole('row');
      // 1 header row + 34 data rows = 35 total
      await expect(rows).toHaveCount(35);
    });

    test('renders select buttons and delete buttons for each row', async ({ page }) => {
      // Check first row has select button and delete button
      const selectButton = page.getByRole('button', { name: 'Key 0', exact: true });
      await expect(selectButton).toBeVisible();

      const deleteButton = page.getByRole('button', { name: 'Delete key 0' });
      await expect(deleteButton).toBeVisible();

      // Check last row (key 33) also has buttons
      const lastSelectButton = page.getByRole('button', { name: 'Key 33', exact: true });
      await expect(lastSelectButton).toBeVisible();

      const lastDeleteButton = page.getByRole('button', { name: 'Delete key 33' });
      await expect(lastDeleteButton).toBeVisible();
    });
  });

  test.describe('keyboard navigation', () => {
    test('arrow keys navigate between cells vertically and horizontally', async ({ page }) => {
      // Focus on the first select button (column 0)
      const firstSelectButton = page.getByRole('button', { name: 'Key 0', exact: true });
      await firstSelectButton.focus();
      await expect(firstSelectButton).toBeFocused();

      // Press ArrowRight to move to first input (ROW column)
      await page.keyboard.press('ArrowRight');
      const rowInput = page.getByRole('textbox', { name: 'Key 0 row' });
      await expect(rowInput).toBeFocused();

      // Press ArrowDown to move to next row's ROW input
      await page.keyboard.press('ArrowDown');
      const nextRowInput = page.getByRole('textbox', { name: 'Key 1 row' });
      await expect(nextRowInput).toBeFocused();

      // Press ArrowUp to go back to first row
      await page.keyboard.press('ArrowUp');
      await expect(rowInput).toBeFocused();
    });

    test('Home and End keys navigate to row boundaries', async ({ page }) => {
      // Focus somewhere in the middle - use the select button first
      const selectButton = page.getByRole('button', { name: 'Key 0', exact: true });
      await selectButton.focus();

      // Navigate to width column using arrow keys
      await page.keyboard.press('ArrowRight'); // ROW
      await page.keyboard.press('ArrowRight'); // COL
      await page.keyboard.press('ArrowRight'); // W
      const widthInput = page.getByRole('textbox', { name: 'Key 0 width' });
      await expect(widthInput).toBeFocused();

      // Press Home to go to first cell (select button)
      await page.keyboard.press('Home');
      await expect(selectButton).toBeFocused();

      // Press End to go to last cell (delete button)
      await page.keyboard.press('End');
      const deleteButton = page.getByRole('button', { name: 'Delete key 0' });
      await expect(deleteButton).toBeFocused();
    });
  });

  test.describe('interactions', () => {
    test('clicking select button toggles key selection', async ({ page }) => {
      const selectButton = page.getByRole('button', { name: 'Key 0', exact: true });

      // Initially not pressed
      await expect(selectButton).toHaveAttribute('aria-pressed', 'false');

      // Click to select
      await selectButton.click();
      await expect(selectButton).toHaveAttribute('aria-pressed', 'true');

      // Verify selection is reflected in the graphics preview (use first match)
      const selectedCount = page.getByLabel('Physical Layout').getByText('1 selected');
      await expect(selectedCount).toBeVisible();

      // Click again to deselect
      await selectButton.click();
      await expect(selectButton).toHaveAttribute('aria-pressed', 'false');
      await expect(page.getByLabel('Physical Layout').getByText('0 selected')).toBeVisible();
    });

    test('editing input updates value', async ({ page }) => {
      const widthInput = page.getByRole('textbox', { name: 'Key 0 width' });

      // Get initial value
      const initialValue = await widthInput.inputValue();
      expect(initialValue).toBe('1');

      // Clear and type new value
      await widthInput.click();
      await widthInput.fill('2');
      await widthInput.blur();

      // Verify value was updated
      await expect(widthInput).toHaveValue('2');
    });

    test('delete button removes a key row', async ({ page }) => {
      // Get initial row count
      const initialRows = page.getByRole('row');
      await expect(initialRows).toHaveCount(35); // 1 header + 34 keys

      // Click delete on first key
      const deleteButton = page.getByRole('button', { name: 'Delete key 0' });
      await deleteButton.click();

      // Verify row count decreased
      const afterRows = page.getByRole('row');
      await expect(afterRows).toHaveCount(34); // 1 header + 33 keys

      // The former key 1 is now key 0
      const newFirstKey = page.getByRole('button', { name: 'Key 0', exact: true });
      await expect(newFirstKey).toBeVisible();
    });
  });
});
