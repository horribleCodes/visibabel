import { test, expect } from '@playwright/test';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { launchRuntimeHarness, seedRuntimeConfig } from './helpers/extension-runtime';
import { setupEndpointMode } from './helpers/endpoint-mode-helper';

test('options page loads in real extension runtime and shows defaults', async ({}, testInfo) => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const extensionPath = path.resolve(__dirname, '../../');
  const optionsScriptPath = path.join(extensionPath, 'dist', 'options', 'options.js');
  expect(fs.existsSync(optionsScriptPath)).toBe(true);

  const harness = await launchRuntimeHarness('visibabel-options-e2e');
  let ollamaHealthCalls = 0;
  let ocrSdkHealthCalls = 0;

  await setupEndpointMode(testInfo, ['ollama', 'layout'], () => {
    harness.context.route('**/api/tags', async (route) => {
      ollamaHealthCalls += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ models: [{ name: 'glm-ocr:latest' }, { name: 'kaelri/hy-mt2:1.8b' }] }),
      });
    });
    harness.context.route('**/api/ps', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ models: [{ name: 'glm-ocr:latest' }] }),
      });
    });
    harness.context.route('**/health', async (route) => {
      ocrSdkHealthCalls += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok' }),
      });
    });
  });

  try {
    await seedRuntimeConfig(harness.serviceWorker, {
      ollamaServiceUrl: 'http://localhost:11434/',
      glmModel: 'glm-ocr:latest',
      ocrModel: 'glm-ocr:latest',
      translateModel: 'kaelri/hy-mt2:1.8b',
      targetLanguage: 'English',
      enableLayoutInference: true,
    });

    const page = await harness.context.newPage();
    await page.goto(`chrome-extension://${harness.extensionId}/src/options/options.html`);

    await expect(page.locator('#options-form')).toBeVisible();
    await expect(page.locator('#endpoint')).toHaveValue('http://localhost:11434/');
    await expect(page.locator('#glmModel')).toHaveValue('glm-ocr:latest');
    await expect(page.locator('#targetLanguage')).toHaveValue('English');
    await expect(page.locator('#ocr-sdk-endpoint')).toHaveText('http://localhost:5002/');
    await expect(page.locator('#ocrModel option')).toHaveCount(2);
    await expect(page.locator('#translateModel option')).toHaveCount(2);
    await expect(page.locator('#ollama-status-badge')).toHaveText('Online');
    await expect(page.locator('#ocr-sdk-status-badge')).toHaveText('Online');

    expect(ollamaHealthCalls).toBeGreaterThan(0);
    expect(ocrSdkHealthCalls).toBeGreaterThan(0);
  } finally {
    await harness.dispose();
  }
});
