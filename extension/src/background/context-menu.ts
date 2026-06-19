import { runOcrAndPersist } from './pipeline.js';
import { normalizeImageSourceForOcr } from '../shared/image-source.js';

const CONTEXT_MENU_ID = 'visibabel-ocr-image';

export function registerContextMenuHandlers(): void {
  chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: CONTEXT_MENU_ID,
        title: 'OCR + Translate Image',
        contexts: ['image'],
      });
    });
  });

  chrome.contextMenus.onClicked.addListener((info, _tab) => {
    if (!info.srcUrl || info.menuItemId !== CONTEXT_MENU_ID) {
      return;
    }

    normalizeImageSourceForOcr(info.srcUrl)
      .then((imageDataUrl) => runOcrAndPersist(imageDataUrl))
      .then(() => {
        // Auto-open popup behavior will be reintroduced in the runtime-hooks step.
      })
      .catch(() => {
        // Background failures are surfaced to active popup requests.
      });
  });
}
