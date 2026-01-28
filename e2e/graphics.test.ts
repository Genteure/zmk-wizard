import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByLabel("Display Name").fill("E2E Test");
  // await page.getByRole("button", { name: "Continue to Editor" }).click();
  await page.getByRole('button', { name: 'Dismiss' }).click();
});

test.describe('basics', () => {

  test('renders empty preview message when no keys', async ({ page }) => {
    await expect(page.getByText('No keys to see here')).toHaveCount(2);
  });

  test('renders all keys and shows part names', async ({ page }) => {
    await page.getByRole('menuitem', { name: 'Layout Tools' }).click();
    await page.getByRole('menuitem', { name: 'Presets' }).click();
    await page.getByRole('menuitem', { name: 'Sofle' }).click();

    // TODO maybe better ways to match the editor areas
    await expect(page.locator('.keyboard-editor')).toHaveCount(2);
    await expect(page.getByRole('application')).toHaveCount(2);
    await expect(page.getByRole('application').getByText('left')).toHaveCount(60);
    await expect(page.getByRole('application').getByText('right')).toHaveCount(60);
  });
});

test.describe('controls buttons', () => {
  [0, 1].forEach(index =>
    test(`mode toggle button for editor ${index}`, async ({ page }) => {
      const editor = page.getByRole('application').nth(index);
      const toggle = editor.getByRole('button', { name: 'Toggle Mode' });

      // initial mode is Select (title contains current: Select)
      await expect(toggle).toHaveAttribute('title', /current:\s*Select/);

      // click to switch to Pan
      await toggle.click();
      await expect(toggle).toHaveAttribute('title', /current:\s*Pan/);

      // clicking again returns to Select
      await toggle.click();
      await expect(toggle).toHaveAttribute('title', /current:\s*Select/);
    })
  );

  test('zoom button', async ({ page }) => {
    await page.getByRole('menuitem', { name: 'Layout Tools' }).click();
    await page.getByRole('menuitem', { name: 'Presets' }).click();
    await page.getByRole('menuitem', { name: 'Sofle' }).click();

    const editor = page.getByRole('application').first();
    const displayArea = editor.locator('div[style*="transform"]').first();
    const zoomInButton = editor.getByRole('button', { name: 'Zoom In' });
    const zoomOutButton = editor.getByRole('button', { name: 'Zoom Out' });
    const resetZoomButton = editor.getByRole('button', { name: 'Reset Zoom' });

    const getScale = async () => {
      const style = await displayArea.getAttribute('style');
      const match = /scale\(\s*([-.\d]+)\s*\)/.exec(style || '');
      const value = match ? parseFloat(match[1]) : NaN;
      expect(value).not.toBeNaN();
      return value;
    };

    const initialScale = await getScale();

    await zoomInButton.click();
    const afterZoomInScale = await getScale();
    expect(afterZoomInScale).toBeGreaterThan(initialScale);

    await zoomOutButton.click();
    await zoomOutButton.click();
    const afterZoomOutScale = await getScale();
    expect(afterZoomOutScale).toBeLessThan(afterZoomInScale);
    expect(afterZoomOutScale).toBeLessThan(initialScale);

    await resetZoomButton.click();
    const afterResetScale = await getScale();
    expect(afterResetScale).toBeCloseTo(initialScale);
  });
})

test.describe('pan and zoom', () => {
  test.describe('mouse', () => {
    test.beforeEach(async ({ page }) => {
      await page.getByRole('menuitem', { name: 'Layout Tools' }).click();
      await page.getByRole('menuitem', { name: 'Presets' }).click();
      await page.getByRole('menuitem', { name: 'Sofle' }).click();
    });

    test('pan with mouse drag', async ({ page }) => {
      const editor = page.getByRole('application').first();
      const displayArea = editor.locator('div[style*="transform"]').first();

      const box = await displayArea.boundingBox();
      expect(box).toBeTruthy();
      if (!box) return;

      // switch to Pan mode
      const toggle = editor.getByRole('button', { name: 'Toggle Mode' });
      await toggle.click();
      expect(await toggle.getAttribute('title')).toMatch(/current:\s*Pan/);

      const startX = box.x + box.width / 2;
      const startY = box.y + box.height / 2;
      const endX = startX - 50;
      const endY = startY - 50;

      // drag
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(endX, endY);
      await page.mouse.up();

      // verify that the view has panned towards top-left
      const style = await displayArea.getAttribute('style');
      const translateMatch = /translate\(\s*([-.\d]+)px(?:\s*,\s*([-.\d]+)px)?\s*\)/.exec(style || '');
      expect(translateMatch).toBeDefined();
      if (translateMatch) {
        const translateX = parseFloat(translateMatch[1]);
        const translateY = translateMatch[2] ? parseFloat(translateMatch[2]) : 0;
        expect(translateX).toBeLessThan(0);
        expect(translateY).toBeLessThan(0);
      }
    });

    test('zoom with mouse wheel', async ({ page }) => {
      const editor = page.getByRole('application').first();
      const displayArea = editor.locator('div[style*="transform"]').first();
      const resetZoomButton = editor.getByRole('button', { name: 'Reset Zoom' });

      await expect(resetZoomButton).toBeDisabled();

      const getScale = async () => {
        const style = await displayArea.getAttribute('style');
        const match = /scale\(\s*([-.\d]+)\s*\)/.exec(style || '');
        const value = match ? parseFloat(match[1]) : NaN;
        expect(value).not.toBeNaN();
        return value;
      };

      const initialScale = await getScale();

      await editor.hover();

      // zoom in
      await page.mouse.wheel(0, -20);
      await page.waitForTimeout(100);

      const afterZoomInScale = await getScale();
      expect(afterZoomInScale).toBeGreaterThan(initialScale);
      await expect(resetZoomButton).toBeEnabled();

      // zoom out
      await page.mouse.wheel(0, 20);
      await page.mouse.wheel(0, 20);
      await page.waitForTimeout(100);

      const afterZoomOutScale = await getScale();
      expect(afterZoomOutScale).toBeLessThan(afterZoomInScale);
      expect(afterZoomOutScale).toBeLessThan(initialScale);
      await expect(resetZoomButton).toBeEnabled();

      // verify we didn't pan during zoom
      // since mouse is at center, we expect translate(0,0) or very close to it
      // translate(x,y) or translate(x)
      const style = await displayArea.getAttribute('style');
      const translateMatch = /translate\(\s*([-.\d]+)px(?:\s*,\s*([-.\d]+)px)?\s*\)/.exec(style || '');
      expect(translateMatch).toBeDefined();
      if (translateMatch) {
        const translateX = parseFloat(translateMatch[1]);
        const translateY = translateMatch[2] ? parseFloat(translateMatch[2]) : 0;

        // precision is no where near exact but should be close to 0
        expect(translateX).toBeCloseTo(0, 0);
        expect(translateY).toBeCloseTo(0, 0);
      } else {
        throw new Error('No translate found: ' + style);
      }

      // reset
      await resetZoomButton.click();
      const afterResetScale = await getScale();
      expect(afterResetScale).toBeCloseTo(initialScale);
      await expect(resetZoomButton).toBeDisabled();
    });

    test('pan with zoom', async ({ page }) => {
      const editor = page.getByRole('application').first();
      const displayArea = editor.locator('div[style*="transform"]').first();

      const getTranslate = async () => {
        const style = await displayArea.getAttribute('style');
        const translateMatch = /translate\(\s*([-.\d]+)px(?:\s*,\s*([-.\d]+)px)?\s*\)/.exec(style || '');
        expect(translateMatch).toBeDefined();
        if (!translateMatch) throw new Error('No translate found');
        const x = parseFloat(translateMatch[1]);
        const y = translateMatch[2] ? parseFloat(translateMatch[2]) : 0;
        expect(x).not.toBeNaN();
        expect(y).not.toBeNaN();
        return { x, y };
      }

      // get bounding box
      // move mouse to left 1/4, top 1/4 of the area
      // zoom out
      // move mouse to right 3/4, bottom 3/4 of the area
      // zoom in
      // verify that the view has panned towards top-left

      const box = await displayArea.boundingBox();
      expect(box).toBeTruthy();
      if (!box) return;

      const leftX = box.x + box.width / 4;
      const rightX = box.x + (box.width * 3) / 4;
      const topY = box.y + box.height / 4;
      const bottomY = box.y + (box.height * 3) / 4;

      await page.mouse.move(leftX, topY);
      await page.mouse.wheel(0, 20);
      await page.waitForTimeout(100);

      await page.mouse.move(rightX, bottomY);
      await page.mouse.wheel(0, -20);
      await page.waitForTimeout(100);

      const translate = await getTranslate();
      expect(translate.x).toBeLessThan(0);
      expect(translate.y).toBeLessThan(0);
    });

  });
  test.describe('touch', () => {
    test.use({ hasTouch: true })

    test.beforeEach(async ({ page }) => {
      await page.getByRole('menuitem', { name: 'Layout Tools' }).tap();
      await page.getByRole('menuitem', { name: 'Presets' }).tap();
      await page.getByRole('menuitem', { name: 'Sofle' }).tap();
    });

    test('pan with touch drag', async ({ page }) => {
      const editor = page.getByRole('application').first();
      const displayArea = editor.locator('div[style*="transform"]').first();

      // switch to Pan mode
      const toggle = editor.getByRole('button', { name: 'Toggle Mode' });
      await toggle.tap();
      expect(await toggle.getAttribute('title')).toMatch(/current:\s*Pan/);

      // emulate touch pan gesture using legacy TouchEvent dispatch
      // determine center coordinates inside the element
      const { centerX, centerY } = await displayArea.evaluate((el: HTMLElement) => {
        const bounds = el.getBoundingClientRect();
        return { centerX: bounds.left + bounds.width / 2, centerY: bounds.top + bounds.height / 2 };
      });

      // start touch at center
      const touchesStart = [{ identifier: 0, clientX: centerX, clientY: centerY }];
      await displayArea.dispatchEvent('touchstart', { touches: touchesStart, changedTouches: touchesStart, targetTouches: touchesStart });

      // perform a few move steps towards top-left
      const steps = 3;
      for (let i = 1; i <= steps; i++) {
        const touchesMove = [{
          identifier: 0,
          clientX: centerX - (20 * i) / steps,
          clientY: centerY - (20 * i) / steps,
        }];
        await displayArea.dispatchEvent('touchmove', { touches: touchesMove, changedTouches: touchesMove, targetTouches: touchesMove });
        await page.waitForTimeout(20);
      }

      // end touch
      await displayArea.dispatchEvent('touchend', { touches: [], changedTouches: [], targetTouches: [] });

      // verify that the view has panned towards top-left
      const style = await displayArea.getAttribute('style');
      const translateMatch = /translate\(\s*([-.\d]+)px(?:\s*,\s*([-.\d]+)px)?\s*\)/.exec(style || '');
      expect(translateMatch).toBeDefined();
      if (translateMatch) {
        const translateX = parseFloat(translateMatch[1]);
        const translateY = translateMatch[2] ? parseFloat(translateMatch[2]) : 0;

        expect(translateX).toBeLessThan(0);
        expect(translateY).toBeLessThan(0);
      }
    });

    test('zoom with pinch gesture', async ({ page }) => {
      const editor = page.getByRole('application').first();
      const displayArea = editor.locator('div[style*="transform"]').first();

      // switch to Pan mode
      const toggle = editor.getByRole('button', { name: 'Toggle Mode' });
      await toggle.tap();
      expect(await toggle.getAttribute('title')).toMatch(/current:\s*Pan/);

      const getScale = async () => {
        const style = await displayArea.getAttribute('style');
        const match = /scale\(\s*([-.\d]+)\s*\)/.exec(style || '');
        const value = match ? parseFloat(match[1]) : NaN;
        expect(value).not.toBeNaN();
        return value;
      };

      const initialScale = await getScale();

      // determine center coordinates inside the element
      const { centerX, centerY } = await displayArea.evaluate((el: HTMLElement) => {
        const bounds = el.getBoundingClientRect();
        return { centerX: bounds.left + bounds.width / 2, centerY: bounds.top + bounds.height / 2 };
      });

      // start two touches close to center
      const offsetStart = 10;
      const touchesStart = [
        { identifier: 0, clientX: centerX - offsetStart, clientY: centerY },
        { identifier: 1, clientX: centerX + offsetStart, clientY: centerY },
      ];
      await displayArea.dispatchEvent('touchstart', { touches: touchesStart, changedTouches: touchesStart, targetTouches: touchesStart });

      // spread touches apart (zoom out)
      const steps = 3;
      const offsetEnd = 40;
      for (let i = 1; i <= steps; i++) {
        const offset = offsetStart + ((offsetEnd - offsetStart) * i) / steps;
        const touchesMove = [
          { identifier: 0, clientX: centerX - offset, clientY: centerY },
          { identifier: 1, clientX: centerX + offset, clientY: centerY },
        ];
        await displayArea.dispatchEvent('touchmove', { touches: touchesMove, changedTouches: touchesMove, targetTouches: touchesMove });
        await page.waitForTimeout(20);
      }

      // end touches
      await displayArea.dispatchEvent('touchend', { touches: [], changedTouches: [], targetTouches: [] });

      const afterZoomInScale = await getScale();
      expect(afterZoomInScale).toBeGreaterThan(initialScale);

      // reset zoom
      const resetZoomButton = editor.getByRole('button', { name: 'Reset Zoom' });
      await expect(resetZoomButton).toBeEnabled();
      await resetZoomButton.tap();
      await expect(resetZoomButton).toBeDisabled();

      // zoom in
      // start two touches apart from center
      const touchesStartIn = [
        { identifier: 0, clientX: centerX - offsetEnd, clientY: centerY },
        { identifier: 1, clientX: centerX + offsetEnd, clientY: centerY },
      ];
      await displayArea.dispatchEvent('touchstart', { touches: touchesStartIn, changedTouches: touchesStartIn, targetTouches: touchesStartIn });

      // bring touches closer (zoom in)
      for (let i = 1; i <= steps; i++) {
        const offset = offsetEnd - ((offsetEnd - offsetStart) * i) / steps;
        const touchesMove = [
          { identifier: 0, clientX: centerX - offset, clientY: centerY },
          { identifier: 1, clientX: centerX + offset, clientY: centerY },
        ];
        await displayArea.dispatchEvent('touchmove', { touches: touchesMove, changedTouches: touchesMove, targetTouches: touchesMove });
        await page.waitForTimeout(20);
      }

      // end touches
      await displayArea.dispatchEvent('touchend', { touches: [], changedTouches: [], targetTouches: [] });

      const afterZoomOutScale = await getScale();
      expect(afterZoomOutScale).toBeLessThan(afterZoomInScale);
      expect(afterZoomOutScale).toBeLessThan(initialScale);
    });
  });
})

test.describe('selection', () => {
  test.describe('mouse', () => {
    test.beforeEach(async ({ page }) => {
      await page.getByRole('menuitem', { name: 'Layout Tools' }).click();
      await page.getByRole('menuitem', { name: 'Presets' }).click();
      await page.getByRole('menuitem', { name: 'Sofle' }).click();
    });

    test('select keys with mouse drag', async ({ page }) => {
      const editor = page.getByRole('application').first();
      await expect(editor).toBeVisible();

      // Current default mode is Select, so no need to toggle

      // drag to select from top-left to bottom-right of editor
      const box = await editor.boundingBox();
      if (!box) throw new Error('No bounding box for editor');

      const startX = box.x + 2;
      const startY = box.y + 2;
      const centerX = box.x + box.width / 2;
      const endX = box.x + box.width - 2;
      const endY = box.y + box.height - 2;

      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(endX, endY, { steps: 5 });
      await page.mouse.up();

      // verify keys are selected (use visible selector to skip sr-only elements)
      const selectedCount = editor.locator(':not(.sr-only)').getByText(/^\d+ selected$/);
      await expect(selectedCount).toHaveText("60 selected");

      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(centerX, endY, { steps: 5 });
      await page.mouse.up();

      // verify keys are selected
      await expect(selectedCount).toHaveText("30 selected");
    });
  });

  test.describe('keyboard', () => {
    test.beforeEach(async ({ page }) => {
      await page.getByRole('menuitem', { name: 'Layout Tools' }).click();
      await page.getByRole('menuitem', { name: 'Presets' }).click();
      await page.getByRole('menuitem', { name: 'Sofle' }).click();
    });

    test('arrow keys and Enter navigate and select keys', async ({ page }) => {
      const editor = page.getByRole('application').first();
      await expect(editor).toBeVisible();

      // Focus the editor
      await editor.focus();

      // Press arrow down to focus a key
      await page.keyboard.press('ArrowDown');

      // Press Enter to select
      await page.keyboard.press('Enter');

      // Check that a key is selected
      const selectedCount = editor.locator(':not(.sr-only)').getByText(/^\d+ selected$/);
      await expect(selectedCount).toHaveText("1 selected");
      
      // Navigate right and select another key
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('Enter');
      
      // Should have 2 keys selected
      await expect(selectedCount).toHaveText("2 selected");
    });

    test('Space key also selects keys', async ({ page }) => {
      const editor = page.getByRole('application').first();
      await expect(editor).toBeVisible();

      // Focus the editor
      await editor.focus();

      // Press arrow down to focus a key
      await page.keyboard.press('ArrowDown');

      // Press Space to select (alternative to Enter)
      await page.keyboard.press(' ');

      // Check that a key is selected
      const selectedCount = editor.locator(':not(.sr-only)').getByText(/^\d+ selected$/);
      await expect(selectedCount).toHaveText("1 selected");
    });

    test('Shift+Arrow keys move selected keys', async ({ page }) => {
      const editor = page.getByRole('application').first();
      await expect(editor).toBeVisible();

      // Focus the editor
      await editor.focus();

      // Focus and select a key
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');

      // Get the initial X position from the data table
      const xInput = page.getByRole('textbox', { name: 'Key 0 x position' });
      const initialX = await xInput.inputValue();

      // Press Shift+ArrowRight to move the selected key
      await page.keyboard.press('Shift+ArrowRight');

      // Wait for the update
      await page.waitForTimeout(100);

      // The X position should have increased
      const newX = await xInput.inputValue();
      expect(parseFloat(newX)).toBeGreaterThan(parseFloat(initialX));
    });

    test('Ctrl+A selects all keys', async ({ page }) => {
      const editor = page.getByRole('application').first();
      await expect(editor).toBeVisible();

      // Focus the editor and dispatch Ctrl+A via JavaScript
      // (Playwright's keyboard.press for Ctrl+A can be intercepted by browser's default behavior)
      await editor.evaluate((el) => {
        el.focus();
        const event = new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true });
        el.dispatchEvent(event);
      });

      // Check that all keys are selected
      const selectedCount = editor.locator(':not(.sr-only)').getByText(/^\d+ selected$/);
      await expect(selectedCount).toHaveText("60 selected");
    });

    test('Escape clears selection', async ({ page }) => {
      const editor = page.getByRole('application').first();
      await expect(editor).toBeVisible();

      // Select all keys first via JavaScript dispatch
      await editor.evaluate((el) => {
        el.focus();
        const event = new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true });
        el.dispatchEvent(event);
      });
      
      const selectedCount = editor.locator(':not(.sr-only)').getByText(/^\d+ selected$/);
      await expect(selectedCount).toHaveText("60 selected");

      // Re-focus and press Escape to clear selection
      await editor.focus();
      await page.keyboard.press('Escape');
      await expect(selectedCount).toHaveText("0 selected");
    });

    test('Home and End keys navigate to first and last key', async ({ page }) => {
      const editor = page.getByRole('application').first();
      await expect(editor).toBeVisible();

      // Focus the editor
      await editor.focus();

      // Press End to go to last key
      await page.keyboard.press('End');

      // Press Enter to select the last key
      await page.keyboard.press('Enter');

      // Press Home to go to first key
      await page.keyboard.press('Home');

      // Press Enter to also select the first key
      await page.keyboard.press('Enter');

      // Should have 2 keys selected
      const selectedCount = editor.locator(':not(.sr-only)').getByText(/^\d+ selected$/);
      await expect(selectedCount).toHaveText("2 selected");
    });

    test('plus and minus keys zoom in and out', async ({ page }) => {
      const editor = page.getByRole('application').first();
      const displayArea = editor.locator('div[style*="transform"]').first();
      
      await expect(editor).toBeVisible();

      const getScale = async () => {
        const style = await displayArea.getAttribute('style');
        const match = /scale\(\s*([-.\d]+)\s*\)/.exec(style || '');
        const value = match ? parseFloat(match[1]) : NaN;
        expect(value).not.toBeNaN();
        return value;
      };

      const initialScale = await getScale();

      // Focus the editor
      await editor.focus();

      // Press + to zoom in
      await page.keyboard.press('+');
      await page.waitForTimeout(100);

      const afterZoomInScale = await getScale();
      expect(afterZoomInScale).toBeGreaterThan(initialScale);

      // Press - to zoom out
      await page.keyboard.press('-');
      await page.keyboard.press('-');
      await page.waitForTimeout(100);

      const afterZoomOutScale = await getScale();
      expect(afterZoomOutScale).toBeLessThan(afterZoomInScale);

      // Press 0 to reset zoom
      await page.keyboard.press('0');
      await page.waitForTimeout(100);

      const afterResetScale = await getScale();
      expect(afterResetScale).toBeCloseTo(initialScale);
    });

    test('WASD keys pan the view', async ({ page }) => {
      const editor = page.getByRole('application').first();
      const displayArea = editor.locator('div[style*="transform"]').first();
      
      await expect(editor).toBeVisible();

      const getTranslate = async () => {
        const style = await displayArea.getAttribute('style');
        // Match translate(Xpx, Ypx) inside the transform
        const match = /translate\(\s*([-.\d]+)px,\s*([-.\d]+)px\s*\)/.exec(style || '');
        if (!match) return { x: 0, y: 0 };
        return { x: parseFloat(match[1]), y: parseFloat(match[2]) };
      };

      // Focus the editor
      await editor.focus();
      
      // Press W to pan up (moves content down, so Y increases)
      const initialTranslate = await getTranslate();
      await page.keyboard.press('w');
      await page.waitForTimeout(100);
      const afterWTranslate = await getTranslate();
      expect(afterWTranslate.y).toBeGreaterThan(initialTranslate.y);

      // Press S to pan down (moves content up, so Y decreases)
      await page.keyboard.press('s');
      await page.keyboard.press('s');
      await page.waitForTimeout(100);
      const afterSTranslate = await getTranslate();
      expect(afterSTranslate.y).toBeLessThan(afterWTranslate.y);
    });

    test('arrow keys pan in pan mode', async ({ page }) => {
      const editor = page.getByRole('application').first();
      const displayArea = editor.locator('div[style*="transform"]').first();
      const toggleButton = editor.getByRole('button', { name: 'Toggle Mode' });
      
      await expect(editor).toBeVisible();

      const getTranslate = async () => {
        const style = await displayArea.getAttribute('style');
        const match = /translate\(\s*([-.\d]+)px,\s*([-.\d]+)px\s*\)/.exec(style || '');
        if (!match) return { x: 0, y: 0 };
        return { x: parseFloat(match[1]), y: parseFloat(match[2]) };
      };

      // Switch to Pan mode
      await toggleButton.click();
      await expect(toggleButton).toHaveAttribute('title', /current:\s*Pan/);

      // Focus the editor
      await editor.focus();
      
      // Press ArrowUp to pan up (moves content down, so Y increases)
      const initialTranslate = await getTranslate();
      await page.keyboard.press('ArrowUp');
      await page.waitForTimeout(100);
      const afterUpTranslate = await getTranslate();
      expect(afterUpTranslate.y).toBeGreaterThan(initialTranslate.y);

      // Press ArrowDown to pan down (moves content up, so Y decreases)
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(100);
      const afterDownTranslate = await getTranslate();
      expect(afterDownTranslate.y).toBeLessThan(afterUpTranslate.y);
    });
  });

  // test.describe('touch', () => {
  //   test.use({ hasTouch: true })
  //   test.beforeEach(async ({ page }) => {
  //     await page.getByRole('menuitem', { name: 'Layout Tools' }).tap();
  //     await page.getByRole('menuitem', { name: 'Presets' }).tap();
  //     await page.getByRole('menuitem', { name: 'Sofle' }).tap();
  //   });

  //   test('select keys with touch', async ({ page }) => {

  //   });
  // });
});
