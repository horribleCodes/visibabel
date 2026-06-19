/// <reference types="chrome" />
import { test, expect } from '@playwright/test';
import { launchRuntimeHarness } from './helpers/extension-runtime';

test('Select Region from menu shows overlay on active page tab', async () => {
  const harness = await launchRuntimeHarness('visibabel-menu-region-overlay-e2e');

  try {
    const targetPage = await harness.context.newPage();
    await targetPage.goto('https://example.com/');

    const targetTab = await harness.serviceWorker.evaluate(async () => {
      return await new Promise<{ id: number; windowId: number }>((resolve, reject) => {
        chrome.tabs.query({ url: ['https://example.com/*'] }, (tabs: chrome.tabs.Tab[]) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          const tab = tabs[0];
          if (!tab?.id || typeof tab.windowId !== 'number') {
            reject(new Error('No target tab info found.'));
            return;
          }
          resolve({ id: tab.id, windowId: tab.windowId });
        });
      });
    });

    const menuPage = await harness.context.newPage();
    await menuPage.goto(`chrome-extension://${harness.extensionId}/src/menu/menu.html`);

    // Force menu-side active tab lookup to use the example.com tab.
    await menuPage.evaluate((forcedTab: { id: number; windowId: number }) => {
      const originalQuery = chrome.tabs.query.bind(chrome.tabs);
      (chrome.tabs.query as any) = (queryInfo: chrome.tabs.QueryInfo, callback: (tabs: chrome.tabs.Tab[]) => void) => {
        if (queryInfo?.active && queryInfo?.currentWindow) {
          callback([{ id: forcedTab.id, windowId: forcedTab.windowId, url: 'https://example.com/' } as chrome.tabs.Tab]);
          return;
        }
        originalQuery(queryInfo, callback);
      };
    }, targetTab);

    await menuPage.evaluate(() => {
      window.dispatchEvent(new Event('focus'));
    });

    await expect(menuPage.locator('#select-region')).toBeEnabled();

    await menuPage.click('#select-region');

    await expect
      .poll(
        async () =>
          await targetPage.evaluate(() => {
            return !!document.querySelector('.visibabel-region-overlay');
          }),
        {
          timeout: 7000,
          message: 'Expected region overlay to be present on target tab after clicking Select Region.',
        },
      )
      .toBe(true);

    // Dismiss selection to finish pending selection flow cleanly.
    await targetPage.keyboard.press('Escape');
  } finally {
    await harness.dispose();
  }
});
