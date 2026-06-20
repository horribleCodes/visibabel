import { requiredEl } from '../shared/ui/dom.js';
import { createStatusPresenter } from '../shared/ui/status.js';
import { getLastResult } from '../shared/runtime-api.js';
import type { LayoutOverlayBox } from '../shared/layout-types.js';

const ORIGINAL_COLLAPSED_STORAGE_KEY = 'visibabel.results.originalCollapsed';

const statusDiv = requiredEl<HTMLElement>('status');
const root = requiredEl<HTMLElement>('root');
const resultOriginalDiv = requiredEl<HTMLElement>('result-original');
const resultTranslatedDiv = requiredEl<HTMLElement>('result-translated');
const toolbarToggleImageButton = requiredEl<HTMLButtonElement>('toolbar-toggle-image');
const resultImagePanel = requiredEl<HTMLElement>('result-image-panel');
const resultImageStage = requiredEl<HTMLElement>('result-image-stage');
const resultImage = requiredEl<HTMLImageElement>('result-image');
const overlayContainer = requiredEl<HTMLElement>('overlay-container');
const status = createStatusPresenter(statusDiv);
let currentOverlayBoxes: LayoutOverlayBox[] = [];
const pinnedLabelIds = new Set<string>();
let imagePanelMaximized = false;

const REGION_TYPE_COLORS: Record<string, { border: string; fill: string; text: string }> = {
  title: { border: '#dc2626', fill: 'rgba(220,38,38,0.12)', text: '#f1f1f1' },
  text: { border: '#1d4ed8', fill: 'rgba(29,78,216,0.12)', text: '#f1f1f1' },
  table: { border: '#15803d', fill: 'rgba(21,128,61,0.12)', text: '#f1f1f1' },
  figure: { border: '#9333ea', fill: 'rgba(147,51,234,0.12)', text: '#f1f1f1' },
  formula: { border: '#0f766e', fill: 'rgba(15,118,110,0.12)', text: '#f1f1f1' },
  header: { border: '#b45309', fill: 'rgba(180,83,9,0.12)', text: '#f1f1f1' },
  footer: { border: '#be123c', fill: 'rgba(190,18,60,0.12)', text: '#f1f1f1' },
  page_number: { border: '#334155', fill: 'rgba(51,65,85,0.12)', text: '#f1f1f1' },
  reference: { border: '#0e7490', fill: 'rgba(14,116,144,0.12)', text: '#f1f1f1' },
  seal: { border: '#7c2d12', fill: 'rgba(124,45,18,0.12)', text: '#f1f1f1' },
};

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function fallbackColorFromType(regionType: string): { border: string; fill: string; text: string } {
  const hue = hashString(regionType) % 360;
  return {
    border: `hsl(${hue} 70% 42%)`,
    fill: `hsl(${hue} 70% 42% / 0.12)`,
    text: `#f1f1f1`,
  };
}

function colorForRegionType(regionType: string | undefined): { border: string; fill: string; text: string } {
  const key = (regionType || '').trim().toLowerCase();
  if (!key) {
    return { border: '#1e90ff', fill: 'rgba(30,144,255,0.08)', text: '#f1f1f1' };
  }
  return REGION_TYPE_COLORS[key] || fallbackColorFromType(key);
}

function denormalizeOverlayBox(box: LayoutOverlayBox, imageWidth: number, imageHeight: number): LayoutOverlayBox {
  return {
    ...box,
    x: (box.x / 1000) * imageWidth,
    y: (box.y / 1000) * imageHeight,
    width: (box.width / 1000) * imageWidth,
    height: (box.height / 1000) * imageHeight,
  };
}

function clearOverlay() {
  overlayContainer.innerHTML = '';
  overlayContainer.style.display = 'none';
}

export function renderOverlay(boxes: LayoutOverlayBox[] = []) {
  currentOverlayBoxes = boxes;
  clearOverlay();
  if (!boxes.length || !resultImage.naturalWidth || !resultImage.naturalHeight) return;

  const absoluteBoxes = boxes.map((box) =>
    denormalizeOverlayBox(box, resultImage.naturalWidth, resultImage.naturalHeight),
  );

  // Ensure prior inline sizing never constrains image growth after resize.
  resultImageStage.style.removeProperty('width');
  resultImageStage.style.removeProperty('height');

  const imageRect = resultImage.getBoundingClientRect();
  if (!imageRect.width || !imageRect.height) return;

  resultImageStage.style.width = `${imageRect.width}px`;
  resultImageStage.style.height = `${imageRect.height}px`;

  const maxSourceX = absoluteBoxes.reduce((max, box) => Math.max(max, box.x + box.width), 0);
  const maxSourceY = absoluteBoxes.reduce((max, box) => Math.max(max, box.y + box.height), 0);
  const sourceWidth = maxSourceX > resultImage.naturalWidth * 1.05 ? maxSourceX : resultImage.naturalWidth;
  const sourceHeight = maxSourceY > resultImage.naturalHeight * 1.05 ? maxSourceY : resultImage.naturalHeight;
  const scaleX = imageRect.width / sourceWidth;
  const scaleY = imageRect.height / sourceHeight;

  overlayContainer.style.display = 'block';
  overlayContainer.style.left = '0';
  overlayContainer.style.top = '0';
  overlayContainer.style.width = imageRect.width + 'px';
  overlayContainer.style.height = imageRect.height + 'px';
  overlayContainer.style.pointerEvents = 'auto';
  overlayContainer.style.zIndex = '20';

  absoluteBoxes.forEach(box => {
    const div = document.createElement('div');
    const color = colorForRegionType(box.regionType);
    div.className = 'overlay-box';
    div.dataset.boxId = box.id;
    div.style.position = 'absolute';
    div.style.left = box.x * scaleX + 'px';
    div.style.top = box.y * scaleY + 'px';
    div.style.width = box.width * scaleX + 'px';
    div.style.height = box.height * scaleY + 'px';
    div.style.border = `2px solid ${color.border}`;
    div.style.background = color.fill;
    div.style.zIndex = String(box.zIndex || 20);
    div.style.pointerEvents = 'auto';
    if (pinnedLabelIds.has(box.id)) {
      div.classList.add('is-label-pinned');
    }
    if (box.label) {
      const label = document.createElement('span');
      label.className = 'overlay-label';
      label.textContent = box.label;
      label.style.color = color.text;
      div.appendChild(label);
    }
    overlayContainer.appendChild(div);
  });
}

let originalCollapsed = readOriginalCollapsedPreference();
let imageVisible = false;
let latestImageData = '';

function scheduleOverlayRerender(): void {
  if (!currentOverlayBoxes.length) return;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => renderOverlay(currentOverlayBoxes));
  });
}

function setImagePanelMaximized(maximized: boolean): void {
  imagePanelMaximized = maximized && imageVisible;
  resultImagePanel.classList.toggle('is-maximized', imagePanelMaximized);
  root.classList.toggle('image-focus-mode', imagePanelMaximized);
  if (currentOverlayBoxes.length) {
    scheduleOverlayRerender();
  }
}

function readOriginalCollapsedPreference(): boolean {
  try {
    const raw = localStorage.getItem(ORIGINAL_COLLAPSED_STORAGE_KEY);
    if (raw === null) {
      return true;
    }
    return raw === 'true';
  } catch {
    return true;
  }
}

function persistOriginalCollapsedPreference(collapsed: boolean): void {
  try {
    localStorage.setItem(ORIGINAL_COLLAPSED_STORAGE_KEY, String(collapsed));
  } catch {
    // Ignore storage errors and keep current in-memory state.
  }
}

function applyOriginalCollapsedState(): void {
  resultOriginalDiv.classList.toggle('is-collapsed', originalCollapsed);
  resultOriginalDiv.setAttribute('aria-expanded', String(!originalCollapsed));
  resultOriginalDiv.title = originalCollapsed ? 'Click to expand original text' : 'Click to collapse original text';
}

function setOriginalCollapsed(nextCollapsed: boolean): void {
  originalCollapsed = nextCollapsed;
  persistOriginalCollapsedPreference(nextCollapsed);
  applyOriginalCollapsedState();
}

function updateImageToggleButtonState(): void {
  const shouldEnable = latestImageData.length > 0;
  toolbarToggleImageButton.disabled = !shouldEnable;
  toolbarToggleImageButton.setAttribute('aria-pressed', String(imageVisible));
  toolbarToggleImageButton.title = imageVisible ? 'Hide latest source image' : 'Show latest source image';
}

function setImageVisible(visible: boolean): void {
  imageVisible = visible && latestImageData.length > 0;
  resultImagePanel.classList.toggle('is-hidden', !imageVisible);
  if (!imageVisible) {
    setImagePanelMaximized(false);
  }
  updateImageToggleButtonState();
  if (imageVisible && currentOverlayBoxes.length) {
    scheduleOverlayRerender();
  }
}

function setLatestImage(result: any): void {
  const sourceImageData = typeof result?.source_image_data === 'string' ? result.source_image_data.trim() : '';
  latestImageData = sourceImageData;
  if (latestImageData) {
    resultImage.src = latestImageData;
  } else {
    resultImage.removeAttribute('src');
  }
  // Always start hidden when opening the results page or loading latest output.
  setImageVisible(false);
  setImagePanelMaximized(false);
  pinnedLabelIds.clear();
  clearOverlay();
}

function renderResult(result: any): void {
  const translatedText = typeof result?.translated_text === 'string' ? result.translated_text : '';
  const originalText = typeof result?.ocr_text === 'string' ? result.ocr_text : '';
  const skipTranslationEnabled = result?.skip_translation === true;
  setLatestImage(result);

  // Overlay rendering
  let overlayBoxes: LayoutOverlayBox[] = [];
  if (result?.layout?.overlayBoxes && Array.isArray(result.layout.overlayBoxes)) {
    overlayBoxes = result.layout.overlayBoxes;
  }
  // Render overlay after image loads
  if (overlayBoxes.length) {
    if (resultImage.complete && resultImage.naturalWidth) {
      renderOverlay(overlayBoxes);
    } else {
      resultImage.onload = () => renderOverlay(overlayBoxes);
    }
  } else {
    clearOverlay();
  }

  resultTranslatedDiv.textContent = translatedText || originalText || 'No text found.';
  if (skipTranslationEnabled || !originalText) {
    resultOriginalDiv.style.display = 'none';
    resultOriginalDiv.textContent = '';
  } else {
    resultOriginalDiv.style.display = 'block';
    resultOriginalDiv.textContent = originalText;
    applyOriginalCollapsedState();
  }
}

resultOriginalDiv.setAttribute('role', 'button');
resultOriginalDiv.tabIndex = 0;
resultOriginalDiv.addEventListener('click', () => {
  if (resultOriginalDiv.style.display === 'none') {
    return;
  }
  setOriginalCollapsed(!originalCollapsed);
});
resultOriginalDiv.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') {
    return;
  }
  event.preventDefault();
  if (resultOriginalDiv.style.display === 'none') {
    return;
  }
  setOriginalCollapsed(!originalCollapsed);
});

toolbarToggleImageButton.addEventListener('click', () => {
  if (!latestImageData) {
    return;
  }
  setImageVisible(!imageVisible);
});

resultImagePanel.addEventListener('click', () => {
  if (!imageVisible) {
    return;
  }
  setImagePanelMaximized(!imagePanelMaximized);
});

overlayContainer.addEventListener('click', (event) => {
  const target = event.target as HTMLElement;
  const box = target.closest('.overlay-box') as HTMLElement | null;
  if (!box) {
    return;
  }

  event.stopPropagation();
  const boxId = box.dataset.boxId || '';
  if (!boxId) {
    return;
  }

  if (pinnedLabelIds.has(boxId)) {
    pinnedLabelIds.delete(boxId);
    box.classList.remove('is-label-pinned');
  } else {
    pinnedLabelIds.add(boxId);
    box.classList.add('is-label-pinned');
  }
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && imagePanelMaximized) {
    setImagePanelMaximized(false);
  }
});

updateImageToggleButtonState();

window.addEventListener('resize', () => {
  if (imageVisible && currentOverlayBoxes.length) {
    renderOverlay(currentOverlayBoxes);
  }
});

if (typeof ResizeObserver !== 'undefined') {
  const imageResizeObserver = new ResizeObserver(() => {
    if (imageVisible && currentOverlayBoxes.length) {
      renderOverlay(currentOverlayBoxes);
    }
  });
  imageResizeObserver.observe(resultImage);
}


function loadAndRenderLatestResult(): void {
  status.info('Loading latest output...');
  getLastResult()
    .then((result) => {
      renderResult(result);
      status.success('Showing latest output.');
    })
    .catch((error: any) => {
      resultTranslatedDiv.textContent = '';
      resultOriginalDiv.textContent = '';
      resultOriginalDiv.style.display = 'none';
      setLatestImage(null);
      status.error(error?.message || 'Failed to load latest output.');
    });
}

// Initial load
loadAndRenderLatestResult();

// Listen for RESULT_UPDATED messages to refresh output live
chrome.runtime.onMessage.addListener((message: any) => {
  if (message?.type === 'RESULT_UPDATED') {
    loadAndRenderLatestResult();
  }
});
