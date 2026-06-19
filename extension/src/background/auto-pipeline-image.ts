import { normalizeImageSourceForOcr } from '../shared/image-source.js';

export async function getAutoPipelineImageData(tabId: number): Promise<string> {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const imageEl = document.getElementById('img') as HTMLImageElement | null;
      if (!imageEl) {
        return '';
      }

      // Prefer currentSrc so responsive image candidates are resolved consistently.
      return String(imageEl.currentSrc || imageEl.src || '').trim();
    },
  });

  const source = String(result || '').trim();
  if (!source) {
    throw new Error('Auto-pipeline could not find an image element with id "img".');
  }

  return await normalizeImageSourceForOcr(source);
}
