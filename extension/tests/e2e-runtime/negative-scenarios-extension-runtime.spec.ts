import { test, expect } from '@playwright/test';

import { launchRuntimeHarness, sendRuntimeMessageWithTimeout } from './helpers/extension-runtime';


test('Returns runtime error when Ollama endpoint responds with server failures and layout inference is disabled', async ({}, testInfo) => {
  const harness = await launchRuntimeHarness('visibabel-negative-e2e');

  await harness.context.route('**/api/chat', async (route) => {
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'upstream unavailable' }),
    });
  });
  await harness.context.route('**/api/generate', async (route) => {
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'upstream unavailable' }),
    });
  });

  try {
    const page = await harness.context.newPage();
    await page.goto(`chrome-extension://${harness.extensionId}/src/menu/menu.html`);

    const response = await sendRuntimeMessageWithTimeout(page, {
      type: 'RUN_OCR_TRANSLATE',
      imageData: 'data:image/png;base64,aGVsbG8=',
      configOverride: {
        ollamaServiceUrl: 'http://localhost:11434/',
        enableLayoutInference: false,
        skipTranslation: true,
        timeoutMs: 10000, // Increased timeout for investigation
        retryCount: 0,
      },
    });

    expect(response?.status).toBe('error');
    expect(String(response?.error || '')).toContain('HTTP 500');
  } finally {
    await harness.dispose();
  }
});


test('Returns runtime error when layout endpoint responds with server failures and layout inference is enabled', async ({}) => {
  const harness = await launchRuntimeHarness('visibabel-negative-layout-e2e');

  await harness.context.route('**/layout/augment', async (route) => {
    await route.fulfill({
      status: 422,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'invalid layout payload' }),
    });
  });

  try {
    const page = await harness.context.newPage();
    await page.goto(`chrome-extension://${harness.extensionId}/src/menu/menu.html`);

    const response = await sendRuntimeMessageWithTimeout(page, {
      type: 'RUN_OCR_TRANSLATE',
      imageData: 'data:image/png;base64,aGVsbG8=',
      configOverride: {
        ollamaServiceUrl: 'http://localhost:11434/',
        enableLayoutInference: true,
        skipTranslation: true,
        timeoutMs: 3000,
        retryCount: 0,
      },
    });

    expect(response?.status).toBe('error');
    expect(String(response?.error || '')).toContain('HTTP 422');
  } finally {
    await harness.dispose();
  }
});

test('Select Region reports chrome:// access restriction on chrome:// tabs', async () => {
  const harness = await launchRuntimeHarness('visibabel-negative-region-chrome-url-e2e');

  try {
    const restrictedPage = await harness.context.newPage();
    await restrictedPage.goto('chrome://extensions/');

    const restrictedTab = await harness.serviceWorker.evaluate(async () => {
      return await new Promise<{ id: number; windowId: number }>((resolve, reject) => {
        chrome.tabs.query({}, (tabs: chrome.tabs.Tab[]) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }

          const tab = tabs.find((candidate) => String(candidate.url || '').startsWith('chrome://extensions'));
          if (!tab?.id || typeof tab.windowId !== 'number') {
            reject(new Error('No chrome://extensions tab found.'));
            return;
          }

          resolve({ id: tab.id, windowId: tab.windowId });
        });
      });
    });

    const menuPage = await harness.context.newPage();
    await menuPage.goto(`chrome-extension://${harness.extensionId}/src/menu/menu.html`);

    // Force menu-side active tab lookup to target the restricted chrome:// tab.
    await menuPage.evaluate((forcedTab: { id: number; windowId: number }) => {
      const originalQuery = chrome.tabs.query.bind(chrome.tabs);
      (chrome.tabs.query as any) = (queryInfo: chrome.tabs.QueryInfo, callback: (tabs: chrome.tabs.Tab[]) => void) => {
        if (queryInfo?.active && queryInfo?.currentWindow) {
          callback([{ id: forcedTab.id, windowId: forcedTab.windowId, url: 'chrome://extensions/' } as chrome.tabs.Tab]);
          return;
        }
        originalQuery(queryInfo, callback);
      };
    }, restrictedTab);

    await menuPage.evaluate(() => {
      window.dispatchEvent(new Event('focus'));
    });

    await expect(menuPage.locator('#capture-tab')).toBeDisabled();
    await expect(menuPage.locator('#select-region')).toBeDisabled();

    await expect
      .poll(async () => String((await menuPage.locator('#status').textContent()) || ''), {
        timeout: 7000,
        message: 'Expected capture actions to be disabled with a chrome:// access restriction message.',
      })
      .toContain('chrome:// URL');
  } finally {
    await harness.dispose();
  }
});
