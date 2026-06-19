import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { launchRuntimeHarness } from './helpers/extension-runtime';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SAMPLE_IMAGE_PATH = path.resolve(__dirname, '../../../resources/test_2.png');
const SAMPLE_IMAGE_DATA = `data:image/png;base64,${fs.readFileSync(SAMPLE_IMAGE_PATH).toString('base64')}`;

test('Overlay box stays aligned after maximize and restore', async () => {
  const harness = await launchRuntimeHarness('visibabel-results-overlay-e2e');

  try {
    await harness.serviceWorker.evaluate(async (imageData: string) => {
      await new Promise<void>((resolve) => {
        chrome.storage.local.set(
          {
            lastResult: {
              ocr_text: 'sample text',
              translated_text: 'sample text',
              source_image_data: imageData,
              layout: {
                overlayBoxes: [
                  {
                    id: 'r1',
                    x: 100,
                    y: 80,
                    width: 300,
                    height: 140,
                    label: 'Characters\nline two content',
                    zIndex: 10,
                  },
                ],
              },
            },
          },
          () => resolve(),
        );
      });
    }, SAMPLE_IMAGE_DATA);

    const page = await harness.context.newPage();
    await page.goto(`chrome-extension://${harness.extensionId}/src/results/results.html`);

    const toggle = page.locator('#toolbar-toggle-image');
    await expect(toggle).toBeVisible();
    await toggle.click();

    const box = page.locator('.overlay-box').first();
    const panel = page.locator('#result-image-panel');
    await expect(box).toBeVisible();

    const baseline = await page.evaluate(() => {
      const image = document.querySelector('#result-image') as HTMLImageElement | null;
      const overlay = document.querySelector('.overlay-box') as HTMLElement | null;
      if (!image || !overlay) {
        return null;
      }
      const imageRect = image.getBoundingClientRect();
      const boxRect = overlay.getBoundingClientRect();
      return {
        leftRatio: (boxRect.left - imageRect.left) / imageRect.width,
        topRatio: (boxRect.top - imageRect.top) / imageRect.height,
        widthRatio: boxRect.width / imageRect.width,
        heightRatio: boxRect.height / imageRect.height,
      };
    });

    expect(baseline).not.toBeNull();

    await panel.click({ position: { x: 6, y: 6 } });
    await expect(panel).toHaveClass(/is-maximized/);

    await panel.click({ position: { x: 6, y: 6 } });
    await expect(panel).not.toHaveClass(/is-maximized/);

    const restored = await page.evaluate(() => {
      const image = document.querySelector('#result-image') as HTMLImageElement | null;
      const overlay = document.querySelector('.overlay-box') as HTMLElement | null;
      if (!image || !overlay) {
        return null;
      }
      const imageRect = image.getBoundingClientRect();
      const boxRect = overlay.getBoundingClientRect();
      return {
        leftRatio: (boxRect.left - imageRect.left) / imageRect.width,
        topRatio: (boxRect.top - imageRect.top) / imageRect.height,
        widthRatio: boxRect.width / imageRect.width,
        heightRatio: boxRect.height / imageRect.height,
      };
    });

    expect(restored).not.toBeNull();

    const tolerance = 0.02;
    expect(Math.abs((restored?.leftRatio ?? 0) - (baseline?.leftRatio ?? 0))).toBeLessThan(tolerance);
    expect(Math.abs((restored?.topRatio ?? 0) - (baseline?.topRatio ?? 0))).toBeLessThan(tolerance);
    expect(Math.abs((restored?.widthRatio ?? 0) - (baseline?.widthRatio ?? 0))).toBeLessThan(tolerance);
    expect(Math.abs((restored?.heightRatio ?? 0) - (baseline?.heightRatio ?? 0))).toBeLessThan(tolerance);
  } finally {
    await harness.dispose();
  }
});
