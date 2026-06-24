import { test, expect } from '@playwright/test';
import { launchRuntimeHarness } from './helpers/extension-runtime';

test('Reset to Default config restores all fields', async () => {
  const harness = await launchRuntimeHarness('visibabel-options-reset-e2e');

  try {
    const page = await harness.context.newPage();
    await page.goto(`chrome-extension://${harness.extensionId}/src/options/options.html`);
    await expect(page.locator('#status')).toHaveText('Settings loaded.');

    // Change a field, save, then reset
    await page.fill('#endpoint', 'http://localhost:9999/');
    await page.click('#options-form button[type="submit"]');
    await expect(page.locator('#endpoint')).toHaveValue('http://localhost:9999/');
    await page.click('#reset');
    await expect(page.locator('#endpoint')).toHaveValue('http://localhost:11434/');
    await expect(page.locator('#status')).toHaveText('Reset to default values.');
    await expect(page.locator('#options-status-badge')).toHaveText('Defaults loaded');
  } finally {
    await harness.dispose();
  }
});
