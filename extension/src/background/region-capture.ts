export type CaptureRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
  devicePixelRatio?: number;
};

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function getTabWindowId(tabId: number): Promise<number> {
  return new Promise((resolve, reject) => {
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message || 'Failed to read active tab.'));
        return;
      }

      if (!tab || typeof tab.windowId !== 'number') {
        reject(new Error('No active window for region capture.'));
        return;
      }

      resolve(tab.windowId);
    });
  });
}

function captureVisibleTab(windowId: number): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.tabs.captureVisibleTab(windowId, { format: 'png' }, (dataUrl?: string) => {
      if (chrome.runtime.lastError || !dataUrl) {
        reject(new Error(chrome.runtime.lastError?.message || 'Failed to capture selected region.'));
        return;
      }
      resolve(dataUrl);
    });
  });
}

function validateRegion(region: CaptureRegion): void {
  if (!region || typeof region !== 'object') {
    throw new Error('Selected region is invalid.');
  }

  const values = [region.x, region.y, region.width, region.height];
  if (values.some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
    throw new Error('Selected region is invalid.');
  }

  if (region.width < 5 || region.height < 5) {
    throw new Error('Selected region is too small.');
  }
}

export async function captureRegionImage(tabId: number, region: CaptureRegion): Promise<string> {
  validateRegion(region);

  const windowId = await getTabWindowId(tabId);
  const screenshotDataUrl = await captureVisibleTab(windowId);

  const screenshotResponse = await fetch(screenshotDataUrl);
  if (!screenshotResponse.ok) {
    throw new Error(`Failed to decode captured image (${screenshotResponse.status}).`);
  }

  const screenshotBlob = await screenshotResponse.blob();
  const bitmap = await createImageBitmap(screenshotBlob);

  const ratio = typeof region.devicePixelRatio === 'number' && region.devicePixelRatio > 0
    ? region.devicePixelRatio
    : 1;

  const sourceX = Math.max(0, Math.round(region.x * ratio));
  const sourceY = Math.max(0, Math.round(region.y * ratio));
  const sourceWidth = Math.max(1, Math.round(region.width * ratio));
  const sourceHeight = Math.max(1, Math.round(region.height * ratio));

  const maxWidth = Math.max(0, bitmap.width - sourceX);
  const maxHeight = Math.max(0, bitmap.height - sourceY);
  const cropWidth = Math.min(sourceWidth, maxWidth);
  const cropHeight = Math.min(sourceHeight, maxHeight);

  if (cropWidth < 1 || cropHeight < 1) {
    throw new Error('Selected region is outside the visible capture area.');
  }

  const canvas = new OffscreenCanvas(cropWidth, cropHeight);
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Failed to initialize image crop canvas.');
  }

  context.drawImage(bitmap, sourceX, sourceY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

  const croppedBlob = await canvas.convertToBlob({ type: 'image/png' });
  const bytes = new Uint8Array(await croppedBlob.arrayBuffer());
  return `data:image/png;base64,${bytesToBase64(bytes)}`;
}
