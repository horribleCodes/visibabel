import { test, expect, chromium } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

test('menu loads in real extension runtime without missing internal resources', async () => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const extensionPath = path.resolve(__dirname, '../../');
  const menuScriptPath = path.join(extensionPath, 'dist', 'menu', 'menu.js');

  expect(fs.existsSync(menuScriptPath)).toBe(true);

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'visibabel-extension-e2e-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });

  const requestFailures: string[] = [];
  const consoleErrors: string[] = [];

  try {
    let [serviceWorker] = context.serviceWorkers();
    if (!serviceWorker) {
      serviceWorker = await context.waitForEvent('serviceworker', { timeout: 15000 });
    }

    const extensionId = new URL(serviceWorker.url()).host;
    const page = await context.newPage();

    page.on('requestfailed', (request) => {
      if (request.url().startsWith(`chrome-extension://${extensionId}/`)) {
        requestFailures.push(`${request.url()} :: ${request.failure()?.errorText || 'request failed'}`);
      }
    });

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto(`chrome-extension://${extensionId}/src/menu/menu.html`);

    await expect(page.locator('#capture-tab')).toBeVisible();
    await expect(page.locator('#select-region')).toBeVisible();
    await expect(page.locator('#open-results')).toBeVisible();
    await expect(page.locator('#open-options')).toBeVisible();

    expect(requestFailures).toEqual([]);
    expect(consoleErrors).toEqual([]);
  } finally {
    await context.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});
