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

      // initial mode is Edit (title contains current: Edit)
      await expect(toggle).toHaveAttribute('title', /current:\s*Edit/);

      // click to switch to Pan
      await toggle.click();
      await expect(toggle).toHaveAttribute('title', /current:\s*Pan/);

      // clicking again returns to Edit
      await toggle.click();
      await expect(toggle).toHaveAttribute('title', /current:\s*Edit/);
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
      const translateMatch = /translate\(\s*([-.\d]+)px,\s*([-.\d]+)px\s*\)/.exec(style || '');
      expect(translateMatch).toBeDefined();
      if (translateMatch) {
        const translateX = parseFloat(translateMatch[1]);
        const translateY = parseFloat(translateMatch[2]);

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
      // since mouse is at center, we expect translate(0,0)
      const style = await displayArea.getAttribute('style');
      const translateMatch = /translate\(\s*([-.\d]+)px,\s*([-.\d]+)px\s*\)/.exec(style || '');
      expect(translateMatch).toBeDefined();
      if (translateMatch) {
        const translateX = parseFloat(translateMatch[1]);
        const translateY = parseFloat(translateMatch[2]);

        // precision is no where near exact but should be close to 0
        expect(translateX).toBeCloseTo(0, 0);
        expect(translateY).toBeCloseTo(0, 0);
      } else {
        throw new Error('No translate found');
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
        const translateMatch = /translate\(\s*([-.\d]+)px,\s*([-.\d]+)px\s*\)/.exec(style || '');
        expect(translateMatch).toBeDefined();
        if (!translateMatch) throw new Error('No translate found');
        const x = parseFloat(translateMatch[1]);
        const y = parseFloat(translateMatch[2]);
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
      const translateMatch = /translate\(\s*([-\.\d]+)px,\s*([-\.\d]+)px\s*\)/.exec(style || '');
      expect(translateMatch).toBeDefined();
      if (translateMatch) {
        const translateX = parseFloat(translateMatch[1]);
        const translateY = parseFloat(translateMatch[2]);

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

      // Current default mode is Edit, so no need to toggle

      // drag to select from top-left to bottom-right of editor
      const box = await editor.boundingBox();
      if (!box) throw new Error('No bounding box for editor');

      const startX = box.x + 5;
      const startY = box.y + 5;
      const centerX = box.x + box.width / 2;
      const endX = box.x + box.width - 5;
      const endY = box.y + box.height - 5;

      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(endX, endY, { steps: 5 });
      await page.mouse.up();

      // verify keys are selected
      const selectedCount = editor.getByText('selected').first();
      await expect(selectedCount).toHaveText("60 selected");

      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(centerX, endY, { steps: 5 });
      await page.mouse.up();

      // verify keys are selected
      await expect(selectedCount).toHaveText("30 selected");
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
