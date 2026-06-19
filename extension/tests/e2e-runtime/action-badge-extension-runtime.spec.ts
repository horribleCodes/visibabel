import { test, expect } from '@playwright/test';
import { launchRuntimeHarness, sendRuntimeMessageWithTimeout } from './helpers/extension-runtime';
import { setupEndpointMode } from './helpers/endpoint-mode-helper';

async function readBadgeText(serviceWorker: any): Promise<string> {
  return serviceWorker.evaluate(async () => {
    return await new Promise<string>((resolve) => {
      chrome.action.getBadgeText({}, (text) => {
        resolve(String(text || ''));
      });
    });
  });
}

async function setBadgeText(serviceWorker: any, text: string): Promise<void> {
  await serviceWorker.evaluate(async (nextText: string) => {
    await new Promise<void>((resolve) => {
      chrome.action.setBadgeText({ text: nextText }, () => resolve());
    });
  }, text);
}

test('Action badge updates for OCR run success, error, and clear-on-results-open', async ({}, testInfo) => {
  const harness = await launchRuntimeHarness('visibabel-badge-e2e');
  let chatCallCount = 0;
  let layoutAugmentCallCount = 0;

  await setupEndpointMode(testInfo, ['ollama', 'layout'], () => {
    harness.context.route('**/api/tags', async (route) => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'offline for badge runtime test' }),
      });
    });
    harness.context.route('**/api/chat', async (route) => {
      chatCallCount += 1;
      // Slow the first translate call so the test can observe in-flight badge state.
      if (chatCallCount === 2) {
        await new Promise((resolve) => setTimeout(resolve, 1200));
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ message: { content: 'Translated text from mocked endpoint' } }),
      });
      return;
    });
    harness.context.route('**/layout/augment', async (route) => {
      layoutAugmentCallCount += 1;
      if (layoutAugmentCallCount === 2) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'forced layout error for badge runtime test' }),
        });
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ocr_text: 'OCR text from mocked layout endpoint',
          regions: [],
        }),
      });
    });
  });

  try {
    const page = await harness.context.newPage();
    await page.goto(`chrome-extension://${harness.extensionId}/src/options/options.html`);

    await expect
      .poll(async () => await readBadgeText(harness.serviceWorker), {
        timeout: 5000,
        message: 'Expected OFF badge text when Ollama health check is offline.',
      })
      .toBe('OFF');

    await setBadgeText(harness.serviceWorker, '');

    const successRunPromise = sendRuntimeMessageWithTimeout(page, {
      type: 'RUN_OCR_TRANSLATE',
      imageData: 'data:image/png;base64,aGVsbG8=',
      configOverride: {
        ollamaServiceUrl: 'http://localhost:11434/',
        skipTranslation: false,
        timeoutMs: 5000,
        retryCount: 0,
        autoOpenPopupOnComplete: false,
      },
    }, 15000);

    await expect
      .poll(async () => await readBadgeText(harness.serviceWorker), {
        timeout: 5000,
        message: 'Expected OCR in-progress badge text before runtime response completes.',
      })
      .toBe('OCR');

    const successResponse = await successRunPromise;
    expect(successResponse?.status).toBe('success');

    await expect
      .poll(async () => await readBadgeText(harness.serviceWorker), {
        timeout: 5000,
        message: 'Expected success badge text after a successful OCR run.',
      })
      .toBe('✓');

    const openResultsResponse = await sendRuntimeMessageWithTimeout(page, {
      type: 'OPEN_RESULTS_WINDOW',
    }, 10000);
    expect(openResultsResponse?.status).toBe('success');

    await expect
      .poll(async () => await readBadgeText(harness.serviceWorker), {
        timeout: 5000,
        message: 'Expected success badge to clear when opening the results window.',
      })
      .toBe('');

    await harness.context.unroute('**/api/chat');
    await harness.context.route('**/api/chat', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'forced error for badge runtime test' }),
      });
    });

    const errorResponse = await sendRuntimeMessageWithTimeout(page, {
      type: 'RUN_OCR_TRANSLATE',
      imageData: 'data:image/png;base64,aGVsbG8=',
      configOverride: {
        ollamaServiceUrl: 'http://localhost:11434/',
        skipTranslation: true,
        timeoutMs: 2000,
        retryCount: 0,
        autoOpenPopupOnComplete: false,
      },
    }, 12000);

    expect(errorResponse?.status).toBe('error');

    await expect
      .poll(async () => await readBadgeText(harness.serviceWorker), {
        timeout: 5000,
        message: 'Expected error badge text after a failed OCR run.',
      })
      .toBe('!');

    const openResultsAfterError = await sendRuntimeMessageWithTimeout(page, {
      type: 'OPEN_RESULTS_WINDOW',
    }, 10000);
    expect(openResultsAfterError?.status).toBe('success');

    await expect
      .poll(async () => await readBadgeText(harness.serviceWorker), {
        timeout: 5000,
        message: 'Expected error badge to clear when opening the results window.',
      })
      .toBe('');
  } finally {
    await harness.dispose();
  }
});
