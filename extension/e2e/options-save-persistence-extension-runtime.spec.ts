import { test, expect } from '@playwright/test';
import { launchRuntimeHarness } from './helpers/extension-runtime';

test('Options save and persistence in real extension', async () => {
  const harness = await launchRuntimeHarness('visibabel-options-save-e2e');

  try {
    const page = await harness.context.newPage();
    await page.goto(`chrome-extension://${harness.extensionId}/src/options/options.html`);

    // Change endpoint and save
    await expect(page.locator('#endpoint')).toBeVisible();
    await page.fill('#endpoint', 'http://localhost:9999/');
    await page.click('#options-form button[type="submit"]');
    await expect(page.locator('#status')).toHaveText('Saved!');
    await expect(page.locator('#options-status-badge')).toHaveText('Saved');

    // Reload and verify persistence
    await page.reload();
    await expect(page.locator('#endpoint')).toHaveValue('http://localhost:9999/');
  } finally {
    await harness.dispose();
  }
});
