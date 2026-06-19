/// <reference types="chrome" />
import { requiredEl } from '../shared/ui/dom.js';
import { createStatusPresenter } from '../shared/ui/status.js';
import { setBadgeState } from '../shared/ui/badge.js';
import { createDebugLogger } from '../shared/ui/debug-log.js';
import { readServiceHealth } from '../shared/service-health.js';
import {
  getRuntimeConfig,
  openResultsWindow,
  runOcrTranslate as runOcrTranslateRequest,
  runOcrTranslateRegion,
  saveRuntimeConfig,
} from '../shared/runtime-api.js';

const captureBtn = requiredEl<HTMLButtonElement>('capture-tab');
const selectBtn = requiredEl<HTMLButtonElement>('select-region');
const openResultsBtn = requiredEl<HTMLButtonElement>('open-results');
const openOptionsBtn = requiredEl<HTMLButtonElement>('open-options');
const statusDiv = requiredEl<HTMLElement>('status');
const ollamaBadge = requiredEl<HTMLElement>('ollama-status-badge');
const ocrSdkBadge = requiredEl<HTMLElement>('ocr-sdk-status-badge');
const enableLayoutInference = requiredEl<HTMLInputElement>('enable-layout-inference');
const enableAutoPipeline = requiredEl<HTMLInputElement>('enable-auto-pipeline');
const status = createStatusPresenter(statusDiv);
const debug = createDebugLogger(null);

let activeConfig: Record<string, unknown> = {};

type CaptureActionAvailability = {
  allowed: boolean;
  reason?: string;
};

function getCaptureActionAvailability(tab?: chrome.tabs.Tab): CaptureActionAvailability {
  if (!tab || !tab.id) {
    return { allowed: false, reason: 'No active tab available.' };
  }

  const url = String(tab.url || '').trim();
  if (!url) {
    return { allowed: false, reason: 'Capture unavailable on this page.' };
  }

  if (/^(chrome|edge|about|devtools|view-source):/i.test(url)) {
    const match = url.match(/^([a-z-]+):/i);
    const scheme = match?.[1] || 'browser-internal';
    return { allowed: false, reason: `Cannot access a ${scheme}:// URL.` };
  }

  if (/^https:\/\/(chromewebstore\.google\.com|addons\.opera\.com)\//i.test(url)) {
    return { allowed: false, reason: 'Capture unavailable on browser store pages.' };
  }

  return { allowed: true };
}

function setCaptureActionsEnabled(enabled: boolean): void {
  captureBtn.disabled = !enabled;
  selectBtn.disabled = !enabled;
}

function refreshCaptureActionsState(): void {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs: chrome.tabs.Tab[]) => {
    const availability = getCaptureActionAvailability(tabs[0]);
    setCaptureActionsEnabled(availability.allowed);
    if (!availability.allowed && availability.reason) {
      status.error(availability.reason);
    }
  });
}

function refreshHealthIndicators(): void {
  setBadgeState(ollamaBadge, 'loading');
  setBadgeState(ocrSdkBadge, 'loading');

  readServiceHealth(activeConfig)
    .then((snapshot) => {
      setBadgeState(ollamaBadge, snapshot.ollama.status, snapshot.ollama.message);
      setBadgeState(ocrSdkBadge, snapshot.ocrSdk.status, snapshot.ocrSdk.message);
      debug.writeLine(`Health check complete: ollama=${snapshot.ollama.status}, ocr-sdk=${snapshot.ocrSdk.status}`);
    })
    .catch((error: any) => {
      setBadgeState(ollamaBadge, 'offline', 'Offline');
      setBadgeState(ocrSdkBadge, 'offline', 'Offline');
      debug.writeLine(`Health check failed: ${error?.message || String(error)}`);
    });
}

function saveToggleConfig(update: Record<string, unknown>): void {
  activeConfig = Object.assign({}, activeConfig, update);
  saveRuntimeConfig(update)
    .then(() => {
      debug.writeLine('Saved runtime toggle settings.');
      refreshHealthIndicators();
    })
    .catch((error: any) => {
      status.error(error?.message || 'Failed to save runtime settings.');
    });
}

getRuntimeConfig()
  .then((config) => {
    activeConfig = config;
    enableLayoutInference.checked = config.enableLayoutInference !== false;
    enableAutoPipeline.checked = config.enableAutoPipeline !== false;
    refreshHealthIndicators();
    refreshCaptureActionsState();
  })
  .catch((error: any) => {
    status.error(error?.message || 'Failed to load runtime settings.');
    setBadgeState(ollamaBadge, 'offline', 'Offline');
    setBadgeState(ocrSdkBadge, 'degraded', 'Not configured');
    refreshCaptureActionsState();
  });

window.addEventListener('focus', () => {
  refreshCaptureActionsState();
});

enableLayoutInference.addEventListener('change', () => {
  saveToggleConfig({ enableLayoutInference: enableLayoutInference.checked });
});

enableAutoPipeline.addEventListener('change', () => {
  saveToggleConfig({ enableAutoPipeline: enableAutoPipeline.checked });
});


captureBtn.addEventListener('click', () => {
  status.info('Capturing tab...');
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs: chrome.tabs.Tab[]) => {
    const activeTab = tabs[0];
    const availability = getCaptureActionAvailability(activeTab);
    if (!availability.allowed) {
      setCaptureActionsEnabled(false);
      status.error(availability.reason || 'Capture unavailable on this page.');
      return;
    }

    const winId = activeTab.windowId;
    if (typeof winId !== 'number') {
      status.error('No active tab/window available.');
      return;
    }
    chrome.tabs.captureVisibleTab(winId, { format: 'png' }, (dataUrl?: string) => {
      if (chrome.runtime.lastError || !dataUrl) {
        status.error('Failed to capture tab.');
        return;
      }
      runOcrTranslate(dataUrl);
    });
  });
});

function sendStartRegionSelect(tabId: number, autoRun = false): Promise<any> {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, { type: 'START_REGION_SELECT', autoRun }, (response?: any) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message || 'Failed to contact content script.'));
        return;
      }
      resolve(response);
    });
  });
}

function ensureSelectorInjected(tabId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        files: ['dist/content/selector.js'],
      },
      () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message || 'Failed to inject region selector.'));
          return;
        }
        chrome.scripting.insertCSS(
          {
            target: { tabId },
            files: ['src/content/overlay.css'],
          },
          () => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message || 'Failed to inject region selector styles.'));
              return;
            }
            resolve();
          },
        );
      },
    );
  });
}

async function requestRegionSelection(tabId: number, autoRun = false): Promise<any> {
  try {
    return await sendStartRegionSelect(tabId, autoRun);
  } catch (error) {
    const message = (error as Error)?.message || String(error);
    if (!/Receiving end does not exist/i.test(message)) {
      throw error;
    }
    await ensureSelectorInjected(tabId);
    return await sendStartRegionSelect(tabId, autoRun);
  }
}

selectBtn.addEventListener('click', () => {
  status.info('Select region...');
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs: chrome.tabs.Tab[]) => {
    const activeTab = tabs[0];
    const availability = getCaptureActionAvailability(activeTab);
    if (!availability.allowed) {
      setCaptureActionsEnabled(false);
      status.error(availability.reason || 'Capture unavailable on this page.');
      return;
    }

    if (!activeTab?.id) {
      status.error('No active tab available.');
      return;
    }
    requestRegionSelection(activeTab.id, true)
      .then((response) => {
        if (response?.started) {
          status.success('Region selected. Processing...');
        } else if (response?.region) {
          // Fallback for stale content scripts that do not support auto-run.
          runOcrTranslateRegion(activeTab.id!, response.region)
            .then(() => {
              status.success('Done. Open Results to view output.');
            })
            .catch((error: any) => {
              status.error(error?.message || 'Failed to process selected region.');
            });
        } else if (response?.imageData) {
          runOcrTranslate(response.imageData);
        } else {
          status.error('Region selection cancelled.');
        }
      })
      .catch((error: any) => {
        status.error(error?.message || 'Region selection unavailable on this page.');
      });
  });
});

openResultsBtn.addEventListener('click', () => {
  openResultsWindow()
    .then(() => {
      status.success('Opened results window.');
    })
    .catch((error: any) => {
      status.error(error?.message || 'Failed to open results window.');
    });
});

openOptionsBtn.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

function runOcrTranslate(imageData: string): void {
  status.info('Processing...');
  runOcrTranslateRequest(imageData)
    .then(() => {
      status.success('Done. Open Results to view output.');
    })
    .catch((error: any) => {
      status.error(error?.message || 'Error.');
    });
}
