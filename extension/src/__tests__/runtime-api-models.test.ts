import { listModelState, loadRuntimeModels, unloadRuntimeModels, type ModelState, type ModelChangeResult } from '../shared/runtime-api';

describe('runtime-api model/session actions', () => {
  // These tests require a browser/extension context with chrome.runtime available.
  // Skip in CI/Jest unless running in a real extension environment.
  const hasChrome = typeof globalThis.chrome !== 'undefined' && chrome.runtime;

  (hasChrome ? test : test.skip)('should list model state without throwing', async () => {
    const state: ModelState = await listModelState();
    expect(state).toHaveProperty('ollamaAvailableModels');
    expect(state).toHaveProperty('ollamaLoadedModels');
    expect(state).toHaveProperty('ocrSdkLoadedSessions');
    expect(Array.isArray(state.ollamaAvailableModels)).toBe(true);
    expect(Array.isArray(state.ollamaLoadedModels)).toBe(true);
    expect(Array.isArray(state.ocrSdkLoadedSessions)).toBe(true);
  });

  (hasChrome ? test : test.skip)('should load and unload runtime models without error', async () => {
    const loadResult: ModelChangeResult = await loadRuntimeModels();
    expect(loadResult).toHaveProperty('changedModels');
    expect(loadResult).toHaveProperty('failedModels');
    expect(Array.isArray(loadResult.changedModels)).toBe(true);
    expect(Array.isArray(loadResult.failedModels)).toBe(true);

    const unloadResult: ModelChangeResult = await unloadRuntimeModels();
    expect(unloadResult).toHaveProperty('changedModels');
    expect(unloadResult).toHaveProperty('failedModels');
    expect(Array.isArray(unloadResult.changedModels)).toBe(true);
    expect(Array.isArray(unloadResult.failedModels)).toBe(true);
  });
});
