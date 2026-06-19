import { getConfig, normalizeConfig, saveConfig } from '../shared/config.js';
import { getLastResult } from '../shared/storage.js';
import { fetchOk } from '../shared/transport.js';
import { listModelState, setModelLoadedState } from './model-lifecycle.js';
import { runOcrAndPersist } from './pipeline.js';
import { openOrFocusResultsWindow } from './popup-manager.js';
import { captureRegionImage } from './region-capture.js';

function buildRunSuccessResponse(result: any, runId?: string) {
  if (runId) {
    return { status: 'success', result, runId };
  }
  return { status: 'success', result };
}



export function registerRuntimeMessageRouter(): void {
  chrome.runtime.onMessage.addListener((message: any, _sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
    if (message?.type === 'RUN_OCR_TRANSLATE') {
      runOcrAndPersist(message.imageData, message.configOverride)
        .then(({ result, runId }) => {
          sendResponse(buildRunSuccessResponse(result, runId || message.runId));
        })
        .catch((error: any) => {
          sendResponse({ status: 'error', error: error?.message || String(error) });
        });
      return true;
    }

    if (message?.type === 'GET_LAST_RESULT') {
      getLastResult()
        .then((result) => {
          sendResponse({ status: 'success', result });
        })
        .catch((error: any) => {
          sendResponse({ status: 'error', error: error?.message || String(error) });
        });
      return true;
    }

    if (message?.type === 'RUN_OCR_TRANSLATE_REGION') {
      const senderTabId = _sender?.tab?.id;
      const tabId = typeof message?.tabId === 'number' ? message.tabId : senderTabId;
      if (typeof tabId !== 'number') {
        sendResponse({ status: 'error', error: 'No active tab available for region capture.' });
        return false;
      }

      captureRegionImage(tabId, message.region)
        .then((imageData) => runOcrAndPersist(imageData, message.configOverride))
        .then(({ result, runId }) => {
          sendResponse(buildRunSuccessResponse(result, runId || message.runId));
        })
        .catch((error: any) => {
          sendResponse({ status: 'error', error: error?.message || String(error) });
        });
      return true;
    }

    if (message?.type === 'OPEN_RESULTS_WINDOW') {
      openOrFocusResultsWindow()
        .then(() => {
          sendResponse({ status: 'success' });
        })
        .catch((error: any) => {
          sendResponse({ status: 'error', error: error?.message || String(error) });
        });
      return true;
    }

    if (message?.type === 'GET_CONFIG') {
      getConfig()
        .then((config) => {
          sendResponse({ status: 'success', config });
        })
        .catch((error: any) => {
          sendResponse({ status: 'error', error: error?.message || String(error) });
        });
      return true;
    }

    if (message?.type === 'SAVE_CONFIG') {
      saveConfig(message.config)
        .then(() => {
          sendResponse({ status: 'success' });
        })
        .catch((error: any) => {
          sendResponse({ status: 'error', error: error?.message || String(error) });
        });
      return true;
    }

    if (message?.type === 'TEST_ENDPOINT') {
      getConfig()
        .then((config) => normalizeConfig(Object.assign({}, config, message?.configOverride || {})))
        .then((config) => fetchOk(new URL('api/tags', config.ollamaServiceUrl).toString(), { method: 'GET' }))
        .then(() => {
          sendResponse({ status: 'success' });
        })
        .catch((error: any) => {
          sendResponse({ status: 'error', error: error?.message || String(error) });
        });
      return true;
    }

    if (message?.type === 'LIST_MODEL_STATE') {
      getConfig()
        .then((config) => normalizeConfig(Object.assign({}, config, message?.configOverride || {})))
        .then((config) => listModelState(config))
        .then((state) => {
          sendResponse({ status: 'success', ...state });
        })
        .catch((error: any) => {
          sendResponse({ status: 'error', error: error?.message || String(error) });
        });
      return true;
    }

    if (message?.type === 'LOAD_RUNTIME_MODELS') {
      getConfig()
        .then((config) => normalizeConfig(Object.assign({}, config, message?.configOverride || {})))
        .then((config) => setModelLoadedState(config, true))
        .then((result) => {
          sendResponse({ status: 'success', ...result });
        })
        .catch((error: any) => {
          sendResponse({ status: 'error', error: error?.message || String(error) });
        });
      return true;
    }

    if (message?.type === 'UNLOAD_RUNTIME_MODELS') {
      getConfig()
        .then((config) => normalizeConfig(Object.assign({}, config, message?.configOverride || {})))
        .then((config) => Object.assign({}, config, {
          modelNames: Array.isArray(message?.modelNames) ? message.modelNames : undefined,
          unloadAllLoaded: message?.unloadAllLoaded === true,
        }))
        .then((config) => setModelLoadedState(config, false))
        .then((result) => {
          sendResponse({ status: 'success', ...result });
        })
        .catch((error: any) => {
          sendResponse({ status: 'error', error: error?.message || String(error) });
        });
      return true;
    }

    return false;
  });
}
