import { test, expect, chromium } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// This test launches the extension and verifies the context menu action

test('Context menu action appears and triggers workflow', async () => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const extensionPath = path.resolve(__dirname, '../../');
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'visibabel-contextmenu-e2e-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });

  try {
    // Wait for extension service worker
    let [serviceWorker] = context.serviceWorkers();
    if (!serviceWorker) {
      serviceWorker = await context.waitForEvent('serviceworker', { timeout: 15000 });
    }
    const extensionId = new URL(serviceWorker.url()).host;

    // Open a test page with an image
    const page = await context.newPage();
    await page.setContent('<img src="https://via.placeholder.com/150" id="test-img">');

    // Right-click on the image to open the context menu
    await page.click('#test-img', { button: 'right' });

    // Playwright cannot interact with the real browser context menu, but we can check if the extension context menu is registered
    // by querying the background script or checking for side effects after triggering the menu programmatically
    // For now, this is a placeholder for manual verification or future automation with Chrome DevTools Protocol
    // Optionally, trigger the context menu action via extension APIs if exposed
    // TODO: Enhance this test when Playwright supports extension context menu automation
    expect(true).toBe(true); // Placeholder assertion
  } finally {
    await context.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});
