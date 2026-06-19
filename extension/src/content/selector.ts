// Content script for region selection overlay (TypeScript port)
let activeOverlay: HTMLDivElement | null = null;

type SelectedRegion = { x: number; y: number; width: number; height: number; devicePixelRatio: number };
type RegionSelectResponse = { cancelled: boolean } | { region: SelectedRegion } | { started: boolean; region: SelectedRegion };

chrome.runtime.onMessage.addListener((message: any, _sender, sendResponse: (response: RegionSelectResponse) => void) => {
  if (message.type !== 'START_REGION_SELECT') {
    return false;
  }

  const shouldAutoRun = message?.autoRun === true;

  if (activeOverlay) {
    sendResponse({ cancelled: true });
    return true;
  }

  const overlay = document.createElement('div');
  const box = document.createElement('div');
  const hint = document.createElement('div');

  overlay.className = 'visibabel-region-overlay';
  box.className = 'visibabel-selection-box';
  hint.className = 'visibabel-selection-hint';
  hint.textContent = 'Drag to select region. Press Esc to cancel.';

  overlay.appendChild(box);
  overlay.appendChild(hint);
  document.documentElement.appendChild(overlay);
  activeOverlay = overlay;

  let dragging = false;
  let startX = 0;
  let startY = 0;

  // Cleanup overlay and yield a frame before callback
  const cleanupAndThen = (cb: () => void) => {
    document.removeEventListener('keydown', onKeyDown, true);
    overlay.removeEventListener('mousedown', onMouseDown, true);
    overlay.removeEventListener('mousemove', onMouseMove, true);
    overlay.removeEventListener('mouseup', onMouseUp, true);
    if (overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
    if (activeOverlay === overlay) {
      activeOverlay = null;
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(cb);
    });
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      cleanupAndThen(() => sendResponse({ cancelled: true }));
    }
  };

  const onMouseDown = (event: MouseEvent) => {
    event.preventDefault();
    dragging = true;
    startX = event.clientX;
    startY = event.clientY;
    box.style.left = `${startX}px`;
    box.style.top = `${startY}px`;
    box.style.width = '0px';
    box.style.height = '0px';
  };

  const onMouseMove = (event: MouseEvent) => {
    if (!dragging) return;
    const x = Math.min(startX, event.clientX);
    const y = Math.min(startY, event.clientY);
    const width = Math.abs(event.clientX - startX);
    const height = Math.abs(event.clientY - startY);
    box.style.left = `${x}px`;
    box.style.top = `${y}px`;
    box.style.width = `${width}px`;
    box.style.height = `${height}px`;
  };

  const onMouseUp = (event: MouseEvent) => {
    if (!dragging) return;
    dragging = false;
    const x = Math.min(startX, event.clientX);
    const y = Math.min(startY, event.clientY);
    const width = Math.abs(event.clientX - startX);
    const height = Math.abs(event.clientY - startY);
    cleanupAndThen(() => {
      if (width < 5 || height < 5) {
        sendResponse({ cancelled: true });
      } else {
        const region: SelectedRegion = {
          x,
          y,
          width,
          height,
          devicePixelRatio: window.devicePixelRatio || 1,
        };

        if (shouldAutoRun) {
          chrome.runtime.sendMessage(
            {
              type: 'RUN_OCR_TRANSLATE_REGION',
              region,
            },
            () => {
              void chrome.runtime.lastError;
            },
          );
          sendResponse({ started: true, region });
          return;
        }

        sendResponse({ region });
      }
    });
  };

  document.addEventListener('keydown', onKeyDown, true);
  overlay.addEventListener('mousedown', onMouseDown, true);
  overlay.addEventListener('mousemove', onMouseMove, true);
  overlay.addEventListener('mouseup', onMouseUp, true);

  return true;
});
