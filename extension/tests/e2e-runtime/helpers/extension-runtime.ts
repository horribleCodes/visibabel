/// <reference types="chrome" />
import { chromium, type BrowserContext } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type RuntimeHarness = {
  context: BrowserContext;
  extensionId: string;
  serviceWorker: any;
  dispose: () => Promise<void>;
};

export async function launchRuntimeHarness(prefix: string): Promise<RuntimeHarness> {
  // ESM-compatible path resolution
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const extensionPath = path.resolve(__dirname, '../../../');
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));

  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });

  let [serviceWorker] = context.serviceWorkers();
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent('serviceworker', { timeout: 20000 });
  }

  const extensionId = new URL(serviceWorker.url()).host;

  return {
    context,
    extensionId,
    serviceWorker,
    dispose: async () => {
      await context.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    },
  };
}

export async function seedRuntimeConfig(serviceWorker: any, config: Record<string, unknown>): Promise<void> {
  await serviceWorker.evaluate(async (newConfig: Record<string, unknown>) => {
    await new Promise<void>((resolve) => {
      chrome.storage.local.set({ config: newConfig }, () => resolve());
    });
  }, config);
}

export async function sendRuntimeMessageWithTimeout<T = any>(
  page: { evaluate: (fn: any, arg: any) => Promise<any> },
  message: Record<string, unknown>,
  timeoutMs = 6000,
): Promise<T | { status: 'timeout'; error: string }> {
  return page.evaluate(
    async ({ payload, timeout }: { payload: Record<string, unknown>; timeout: number }) => {
      return await new Promise((resolve) => {
        let settled = false;
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          resolve({ status: 'timeout', error: `No runtime response within ${timeout}ms.` });
        }, timeout);

        chrome.runtime.sendMessage(payload, (response: any) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (chrome.runtime.lastError) {
            resolve({ status: 'error', error: chrome.runtime.lastError.message });
            return;
          }
          resolve(response || { status: 'error', error: 'Empty runtime response.' });
        });
      });
    },
    { payload: message, timeout: timeoutMs },
  );
}
