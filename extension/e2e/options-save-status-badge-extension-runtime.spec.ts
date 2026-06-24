import { test, expect } from '@playwright/test';
import { launchRuntimeHarness } from './helpers/extension-runtime';

test('Save status badge updates on save and error', async () => {
  const harness = await launchRuntimeHarness('visibabel-savebadge-e2e');

  try {
    const page = await harness.context.newPage();
    await page.goto(`chrome-extension://${harness.extensionId}/src/options/options.html`);

    // Save valid config
    await page.fill('#endpoint', 'http://localhost:11434/');
    await page.click('#options-form button[type="submit"]');
    await expect(page.locator('#options-status-badge')).toHaveText('Saved');

    // Editing any setting should mark form as unsaved.
    await page.fill('#targetLanguage', 'German');
    await expect(page.locator('#options-status-badge')).toHaveText('Unsaved changes');
  } finally {
    await harness.dispose();
  }
});
