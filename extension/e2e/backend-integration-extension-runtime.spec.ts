import { test, expect } from '@playwright/test';

import { launchRuntimeHarness, sendRuntimeMessageWithTimeout } from './helpers/extension-runtime';
import { setupEndpointMode } from './helpers/endpoint-mode-helper';


async function runBackendRequestCase(enableLayoutInference: boolean, testInfo: any): Promise<{
  response: any;
  chatCalls: number;
  generateCalls: number;
  layoutAugmentCalls: number;
}> {
  const harness = await launchRuntimeHarness('visibabel-backend-e2e');
  let chatCalls = 0;
  let generateCalls = 0;
  let layoutAugmentCalls = 0;

  await setupEndpointMode(
    testInfo,
    ['ollama', 'layout'],
    () => {
      harness.context.route('**/api/generate', async (route) => {
        chatCalls += 1;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ message: { content: 'OCR text from mocked chat endpoint' } }),
        });
      });
      harness.context.route('**/api/generate', async (route) => {
        generateCalls += 1;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ response: 'OCR text from mocked generate endpoint' }),
        });
      });
      harness.context.route('**/layout/augment', async (route) => {
        layoutAugmentCalls += 1;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ocr_text: 'OCR text from mocked layout endpoint',
            regions: [],
          }),
        });
      });
    }
  );

  try {
    const page = await harness.context.newPage();
    await page.goto(`chrome-extension://${harness.extensionId}/src/menu/menu.html`);

    const response = await sendRuntimeMessageWithTimeout(page, {
      type: 'RUN_OCR_TRANSLATE',
      imageData: 'data:image/png;base64,aGVsbG8=',
      configOverride: {
        ollamaServiceUrl: 'http://localhost:11434/',
        enableLayoutInference,
        skipTranslation: true,
        timeoutMs: 5000,
        retryCount: 0,
      },
    });

    return {
      response,
      chatCalls,
      generateCalls,
      layoutAugmentCalls,
    };
  } finally {
    await harness.dispose();
  }
}

test('Extension sends backend requests to Ollama runtime endpoint when layout inference is disabled', async ({}, testInfo) => {
  const { response, chatCalls, generateCalls, layoutAugmentCalls } = await runBackendRequestCase(false, testInfo);

  expect(response?.status).toBe('success');
  expect(chatCalls + generateCalls).toBeGreaterThan(0);
  expect(layoutAugmentCalls).toBe(0);
});

test('Extension sends backend requests to layout endpoint when layout inference is enabled', async ({}, testInfo) => {
  const { response, chatCalls, generateCalls, layoutAugmentCalls } = await runBackendRequestCase(true, testInfo);

  expect(response?.status).toBe('success');
  expect(layoutAugmentCalls).toBeGreaterThan(0);
  expect(chatCalls + generateCalls).toBeGreaterThan(0);
});
