import type { ExtensionConfig } from './config.js';

export type CaptureRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
  devicePixelRatio?: number;
};

export type OcrSdkSession = {
  cache_key?: string;
  model?: string;
  host?: string;
  port?: number;
  timeout_ms?: number;
  idle_seconds?: number;
  age_seconds?: number;
};

export type ModelState = {
  ollamaAvailableModels: string[];
  ollamaLoadedModels: string[];
  ocrSdkLoadedSessions: OcrSdkSession[];
};

export type ModelChangeResult = {
  changedModels: string[];
  failedModels: string[];
};

export type UnloadRuntimeModelsOptions = {
  modelNames?: string[];
  unloadAllLoaded?: boolean;
};

type RuntimeSuccess<T> = { status: 'success' } & T;
type RuntimeError = { status: 'error'; error?: string };
type RuntimeResponse<T> = RuntimeSuccess<T> | RuntimeError;

function sendRuntimeMessage<TResponse extends Record<string, unknown>>(message: Record<string, unknown>): Promise<RuntimeResponse<TResponse>> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response?: RuntimeResponse<TResponse>) => {
      if (chrome.runtime.lastError) {
        resolve({ status: 'error', error: chrome.runtime.lastError.message });
        return;
      }
      if (!response) {
        resolve({ status: 'error', error: 'No response from background script.' });
        return;
      }
      resolve(response);
    });
  });
}

function ensureSuccess<TResponse extends Record<string, unknown>>(response: RuntimeResponse<TResponse>, fallbackMessage: string): TResponse {
  if (response.status === 'success') {
    return response;
  }
  throw new Error(response.error || fallbackMessage);
}

export async function runOcrTranslate(imageData: string): Promise<any> {
  const response = await sendRuntimeMessage<{ result?: any; runId?: string }>({
    type: 'RUN_OCR_TRANSLATE',
    imageData,
  });
  const success = ensureSuccess(response, 'Failed to process OCR request.');
  return success.result;
}

export async function runOcrTranslateRegion(tabId: number, region: CaptureRegion): Promise<any> {
  const response = await sendRuntimeMessage<{ result?: any; runId?: string }>({
    type: 'RUN_OCR_TRANSLATE_REGION',
    tabId,
    region,
  });
  const success = ensureSuccess(response, 'Failed to process selected region.');
  return success.result;
}

export async function getLastResult(): Promise<any> {
  const response = await sendRuntimeMessage<{ result?: any }>({ type: 'GET_LAST_RESULT' });
  const success = ensureSuccess(response, 'Failed to load latest output.');
  return success.result;
}

export async function openResultsWindow(): Promise<void> {
  const response = await sendRuntimeMessage<{}>({ type: 'OPEN_RESULTS_WINDOW' });
  ensureSuccess(response, 'Failed to open results window.');
}

export async function testEndpoint(configOverride?: Partial<ExtensionConfig>): Promise<void> {
  const response = await sendRuntimeMessage<{}>({ type: 'TEST_ENDPOINT', configOverride });
  ensureSuccess(response, 'Failed to connect.');
}

export async function getRuntimeConfig(): Promise<ExtensionConfig> {
  const response = await sendRuntimeMessage<{ config?: ExtensionConfig }>({ type: 'GET_CONFIG' });
  const success = ensureSuccess(response, 'Failed to load settings.');
  if (!success.config) {
    throw new Error('Configuration payload is missing.');
  }
  return success.config;
}

export async function saveRuntimeConfig(config: Partial<ExtensionConfig>): Promise<void> {
  const response = await sendRuntimeMessage<{}>({
    type: 'SAVE_CONFIG',
    config,
  });
  ensureSuccess(response, 'Failed to save settings.');
}

export async function listModelState(configOverride?: Partial<ExtensionConfig>): Promise<ModelState> {
  const response = await sendRuntimeMessage<Partial<ModelState>>({ type: 'LIST_MODEL_STATE', configOverride });
  const success = ensureSuccess(response, 'Failed to read model state.');
  return {
    ollamaAvailableModels: Array.isArray(success.ollamaAvailableModels) ? success.ollamaAvailableModels : [],
    ollamaLoadedModels: Array.isArray(success.ollamaLoadedModels) ? success.ollamaLoadedModels : [],
    ocrSdkLoadedSessions: Array.isArray(success.ocrSdkLoadedSessions) ? success.ocrSdkLoadedSessions : [],
  };
}

function toModelChangeResult(payload: Partial<ModelChangeResult>): ModelChangeResult {
  return {
    changedModels: Array.isArray(payload.changedModels) ? payload.changedModels : [],
    failedModels: Array.isArray(payload.failedModels) ? payload.failedModels : [],
  };
}

export async function loadRuntimeModels(configOverride?: Partial<ExtensionConfig>): Promise<ModelChangeResult> {
  const response = await sendRuntimeMessage<Partial<ModelChangeResult>>({ type: 'LOAD_RUNTIME_MODELS', configOverride });
  const success = ensureSuccess(response, 'Failed to load runtime models.');
  return toModelChangeResult(success);
}

export async function unloadRuntimeModels(
  configOverride?: Partial<ExtensionConfig>,
  options?: UnloadRuntimeModelsOptions,
): Promise<ModelChangeResult> {
  const response = await sendRuntimeMessage<Partial<ModelChangeResult>>({
    type: 'UNLOAD_RUNTIME_MODELS',
    configOverride,
    modelNames: options?.modelNames,
    unloadAllLoaded: options?.unloadAllLoaded,
  });
  const success = ensureSuccess(response, 'Failed to unload runtime models.');
  return toModelChangeResult(success);
}
