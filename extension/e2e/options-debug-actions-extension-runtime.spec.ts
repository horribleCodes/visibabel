import { test, expect } from '@playwright/test';
import { launchRuntimeHarness } from './helpers/extension-runtime';

test('Debug actions on options page work', async () => {
  const harness = await launchRuntimeHarness('visibabel-debugactions-e2e');

  try {
    const page = await harness.context.newPage();
    await page.goto(`chrome-extension://${harness.extensionId}/src/options/options.html`);

    // Trigger all developer actions by their real button IDs.
    await page.click('#refresh-models');
    await expect(page.locator('#status')).toHaveText('Model state refreshed.');

    await page.click('#test');
    await expect(page.locator('#status')).not.toHaveText('');

    await page.click('#load-models');
    await expect(page.locator('#status')).not.toHaveText('');

    await page.click('#unload-models');
    await expect(page.locator('#status')).not.toHaveText('');

    await expect(page.locator('#debug-log')).toBeVisible();
    await expect(page.locator('#debug-log')).not.toContainText('No debug output yet.');
  } finally {
    await harness.dispose();
  }
});
