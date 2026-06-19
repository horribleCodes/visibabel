/// <reference types="chrome" />
import { test, expect } from '@playwright/test';
import { launchRuntimeHarness, sendRuntimeMessageWithTimeout } from './helpers/extension-runtime';

import { setupEndpointMode } from './helpers/endpoint-mode-helper';

async function runTabRegionCase(enableLayoutInference: boolean, testInfo: any): Promise<{
  runtimeResponse: any;
  chatCalls: number;
  generateCalls: number;
  layoutAugmentCalls: number;
}> {
  const harness = await launchRuntimeHarness('visibabel-tab-region-e2e');
  let chatCalls = 0;
  let generateCalls = 0;
  let layoutAugmentCalls = 0;

  await setupEndpointMode(testInfo, ['ollama', 'layout'], () => {
    harness.context.route('**/api/chat', async (route) => {
      chatCalls += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ message: { content: 'mocked text' } }),
      });
    });
    harness.context.route('**/api/generate', async (route) => {
      generateCalls += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ response: 'mocked text' }),
      });
    });
    harness.context.route('**/layout/augment', async (route) => {
      layoutAugmentCalls += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ocr_text: 'mocked layout text',
          regions: [],
        }),
      });
    });
  });

  try {
    const page = await harness.context.newPage();
    await page.goto('https://example.com/');

    const regionResponse = await harness.serviceWorker.evaluate(async () => {
      return await new Promise<any>((resolve) => {
        chrome.tabs.query({ url: ['https://example.com/*'] }, (tabs: chrome.tabs.Tab[]) => {
          const tabId = tabs[0]?.id;
          if (!tabId) {
            resolve({ cancelled: true, error: 'No target tab found.' });
            return;
          }

          const sendSelectionMessage = () => {
            const sendWithRetry = (remainingAttempts: number): void => {
              chrome.tabs.sendMessage(tabId, { type: 'START_REGION_SELECT' }, (response: any) => {
                if (chrome.runtime.lastError) {
                  const message = chrome.runtime.lastError.message || 'No receiver.';
                  if (remainingAttempts > 0 && /Receiving end does not exist/i.test(message)) {
                    setTimeout(() => sendWithRetry(remainingAttempts - 1), 120);
                    return;
                  }
                  resolve({ cancelled: true, error: message });
                  return;
                }
                resolve(response || { cancelled: true, error: 'No response from content script.' });
              });
            };

            sendWithRetry(40);
          };

          chrome.scripting.executeScript(
            {
              target: { tabId },
              files: ['dist/content/selector.js'],
            },
            () => {
              if (chrome.runtime.lastError) {
                resolve({ cancelled: true, error: `executeScript failed: ${chrome.runtime.lastError.message}` });
                return;
              }
              chrome.scripting.insertCSS(
                {
                  target: { tabId },
                  files: ['src/content/overlay.css'],
                },
                () => {
                  if (chrome.runtime.lastError) {
                    resolve({ cancelled: true, error: `insertCSS failed: ${chrome.runtime.lastError.message}` });
                    return;
                  }
                  sendSelectionMessage();

                  const triggerSyntheticDrag = (remainingAttempts: number) => {
                    chrome.scripting.executeScript(
                      {
                        target: { tabId },
                        func: () => {
                          const overlay = document.querySelector('.visibabel-region-overlay') as HTMLElement | null;
                          if (!overlay) return false;

                          const emit = (type: string, x: number, y: number) => {
                            overlay.dispatchEvent(
                              new MouseEvent(type, {
                                bubbles: true,
                                cancelable: true,
                                clientX: x,
                                clientY: y,
                              }),
                            );
                          };

                          emit('mousedown', 40, 40);
                          emit('mousemove', 220, 180);
                          emit('mouseup', 220, 180);
                          return true;
                        },
                      },
                      (results) => {
                        if (chrome.runtime.lastError) {
                          resolve({ cancelled: true, error: `drag script failed: ${chrome.runtime.lastError.message}` });
                          return;
                        }
                        const injected = !!results?.[0]?.result;
                        if (!injected && remainingAttempts > 0) {
                          setTimeout(() => triggerSyntheticDrag(remainingAttempts - 1), 100);
                        }
                      },
                    );
                  };

                  setTimeout(() => triggerSyntheticDrag(30), 100);
                },
              );
            },
          );
        });
      });
    });

    if (regionResponse?.cancelled === true) {
      throw new Error(`Region selection cancelled: ${regionResponse?.error || 'unknown reason'}`);
    }
    expect(Number(regionResponse?.region?.width || 0)).toBeGreaterThan(0);
    expect(Number(regionResponse?.region?.height || 0)).toBeGreaterThan(0);

    const popup = await harness.context.newPage();
    await popup.goto(`chrome-extension://${harness.extensionId}/src/menu/menu.html`);

    const runtimeResponse = await sendRuntimeMessageWithTimeout(popup, {
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
      runtimeResponse,
      chatCalls,
      generateCalls,
      layoutAugmentCalls,
    };
  } finally {
    await harness.dispose();
  }
}

test('Tab and region capture workflow triggers overlay and Ollama backend request when layout inference is disabled', async ({}, testInfo) => {
  const { runtimeResponse, chatCalls, generateCalls, layoutAugmentCalls } = await runTabRegionCase(false, testInfo);

  expect(runtimeResponse?.status).toBe('success');
  expect(chatCalls + generateCalls).toBeGreaterThan(0);
  expect(layoutAugmentCalls).toBe(0);
});

test('Tab and region capture workflow triggers overlay and layout backend request when layout inference is enabled', async ({}, testInfo) => {
  const { runtimeResponse, chatCalls, generateCalls, layoutAugmentCalls } = await runTabRegionCase(true, testInfo);

  expect(runtimeResponse?.status).toBe('success');
  expect(layoutAugmentCalls).toBeGreaterThan(0);
  expect(chatCalls + generateCalls).toBe(0);
});
