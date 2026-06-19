/// <reference types="chrome" />
import { getDefaultConfig, type ExtensionConfig } from '../shared/config.js';
import { requiredEl } from '../shared/ui/dom.js';
import { createStatusPresenter } from '../shared/ui/status.js';
import { setBadgeState } from '../shared/ui/badge.js';
import { createDebugLogger } from '../shared/ui/debug-log.js';
import { readServiceHealth, resolveConfiguredLayoutServiceUrl } from '../shared/service-health.js';
import {
  getRuntimeConfig,
  listModelState,
  loadRuntimeModels,
  saveRuntimeConfig,
  testEndpoint,
  unloadRuntimeModels,
  type OcrSdkSession,
} from '../shared/runtime-api.js';

document.addEventListener('DOMContentLoaded', () => {
  const form = requiredEl<HTMLFormElement>('options-form');
  const statusDiv = requiredEl<HTMLElement>('status');
  const optionsStatusBadge = requiredEl<HTMLElement>('options-status-badge');
  const status = createStatusPresenter(statusDiv);
  const ollamaBadge = requiredEl<HTMLElement>('ollama-status-badge');
  const ocrSdkBadge = requiredEl<HTMLElement>('ocr-sdk-status-badge');
  const ocrSdkEndpoint = requiredEl<HTMLElement>('ocr-sdk-endpoint');
  const debugLog = requiredEl<HTMLElement>('debug-log');
  const debugLogger = createDebugLogger(debugLog);

  const endpoint = requiredEl<HTMLInputElement>('endpoint');
  const glmModel = requiredEl<HTMLInputElement>('glmModel');
  const targetLanguage = requiredEl<HTMLInputElement>('targetLanguage');
  const timeoutMs = requiredEl<HTMLInputElement>('timeoutMs');
  const retryCount = requiredEl<HTMLInputElement>('retryCount');
  const maxImageSize = requiredEl<HTMLInputElement>('maxImageSize');
  const debugCheckbox = requiredEl<HTMLInputElement>('debug');
  const enableNotifications = requiredEl<HTMLInputElement>('enableNotifications');
  const autoOpenPopupOnComplete = requiredEl<HTMLInputElement>('autoOpenPopupOnComplete');
  const autoOcrWhitelist = requiredEl<HTMLTextAreaElement>('autoOcrWhitelist');

  const ocrModel = requiredEl<HTMLSelectElement>('ocrModel');
  const ocrType = requiredEl<HTMLSelectElement>('ocrType');
  const ocrPromptTemplate = requiredEl<HTMLTextAreaElement>('ocrPromptTemplate');
  const skipTranslation = requiredEl<HTMLInputElement>('skip-translation');

  const translateModel = requiredEl<HTMLSelectElement>('translateModel');
  const translateType = requiredEl<HTMLSelectElement>('translateType');
  const translatePromptTemplate = requiredEl<HTMLTextAreaElement>('translatePromptTemplate');
  const layoutChunkStrategy = requiredEl<HTMLSelectElement>('layoutChunkStrategy');
  const layoutMaxChunkSize = requiredEl<HTMLInputElement>('layoutMaxChunkSize');
  const layoutDebugRawPayload = requiredEl<HTMLInputElement>('layoutDebugRawPayload');

  const resetBtn = requiredEl<HTMLButtonElement>('reset');
  const testBtn = requiredEl<HTMLButtonElement>('test');
  const refreshModelsBtn = requiredEl<HTMLButtonElement>('refresh-models');
  const loadModelsBtn = requiredEl<HTMLButtonElement>('load-models');
  const unloadModelsBtn = requiredEl<HTMLButtonElement>('unload-models');
  const loadedModelsList = requiredEl<HTMLUListElement>('loaded-models');
  const ocrSdkLoadedModelsList = requiredEl<HTMLUListElement>('ocr-sdk-loaded-models');

  let activeConfig: ExtensionConfig = getDefaultConfig();

  function setOptionsStatus(state: 'synced' | 'unsynced' | 'saved', message: string): void {
    optionsStatusBadge.classList.remove('synced', 'unsynced', 'saved');
    optionsStatusBadge.classList.add('status', state);
    optionsStatusBadge.textContent = message;
  }

  function markUnsynced(): void {
    setOptionsStatus('unsynced', 'Unsaved changes');
  }

  // Render defaults immediately so a cold install or runtime messaging race never shows blank settings.
  applyConfig(activeConfig);

  function setListItems(list: HTMLUListElement, items: string[], emptyLabel: string): void {
    list.innerHTML = '';
    if (!items.length) {
      const li = document.createElement('li');
      li.textContent = emptyLabel;
      list.appendChild(li);
      return;
    }
    items.forEach((item) => {
      const li = document.createElement('li');
      li.textContent = item;
      list.appendChild(li);
    });
  }

  function describeSession(session: OcrSdkSession): string {
    const model = String(session.model || 'unknown-model');
    const endpoint = `${session.host || 'unknown-host'}:${session.port || 0}`;
    const idle = typeof session.idle_seconds === 'number' ? `${session.idle_seconds}s idle` : 'idle n/a';
    return `${model} (${endpoint}, ${idle})`;
  }

  function pickSelectedModels(config: Partial<ExtensionConfig>): string[] {
    return Array.from(
      new Set(
        [config.glmModel, config.ocrModel, config.translateModel]
          .map((value) => String(value || '').trim())
          .filter(Boolean),
      ),
    );
  }

  function collectDraftConfig(): Partial<ExtensionConfig> {
    const layoutServiceUrl = String(activeConfig.layoutServiceUrl || '').trim();
    const selectedLayoutChunkStrategy = layoutChunkStrategy.value as ExtensionConfig['layoutChunkStrategy'];
    return {
      ollamaServiceUrl: endpoint.value.trim(),
      layoutServiceUrl,
      glmModel: glmModel.value.trim(),
      targetLanguage: targetLanguage.value.trim(),
      timeoutMs: Number(timeoutMs.value),
      retryCount: Number(retryCount.value),
      maxImageSize: Number(maxImageSize.value),
      debug: debugCheckbox.checked,
      enableNotifications: enableNotifications.checked,
      autoOpenPopupOnComplete: autoOpenPopupOnComplete.checked,
      autoOcrWhitelist: autoOcrWhitelist.value,
      ocrModel: ocrModel.value,
      ocrType: ocrType.value,
      ocrPromptTemplate: ocrPromptTemplate.value,
      skipTranslation: skipTranslation.checked,
      translateModel: translateModel.value,
      translateType: translateType.value,
      translatePromptTemplate: translatePromptTemplate.value,
      layoutChunkStrategy: selectedLayoutChunkStrategy,
      layoutMaxChunkSize: Number(layoutMaxChunkSize.value),
      layoutDebugRawPayload: layoutDebugRawPayload.checked,
    };
  }

  function refreshModelLists(configOverride?: Partial<ExtensionConfig>, preferredConfig?: Partial<ExtensionConfig>): Promise<void> {
    const setSelectOptions = (
      selectEl: HTMLSelectElement,
      availableModels: string[],
      preferredValue: string,
    ): void => {
      const uniqueModels = Array.from(new Set((availableModels || []).map((item) => String(item || '').trim()).filter(Boolean)));
      if (preferredValue && !uniqueModels.includes(preferredValue)) {
        uniqueModels.unshift(preferredValue);
      }

      const priorValue = selectEl.value;
      selectEl.innerHTML = '';
      uniqueModels.forEach((model) => {
        const option = document.createElement('option');
        option.value = model;
        option.textContent = model;
        selectEl.appendChild(option);
      });

      if (priorValue && uniqueModels.includes(priorValue)) {
        selectEl.value = priorValue;
      } else if (preferredValue && uniqueModels.includes(preferredValue)) {
        selectEl.value = preferredValue;
      }
    };

    const preferred = Object.assign({}, activeConfig, preferredConfig || {});
    return listModelState(configOverride)
      .then((state) => {
        setSelectOptions(ocrModel, state.ollamaAvailableModels, String(preferred.ocrModel || activeConfig.ocrModel));
        setSelectOptions(translateModel, state.ollamaAvailableModels, String(preferred.translateModel || activeConfig.translateModel));
        setListItems(loadedModelsList, state.ollamaLoadedModels, 'No loaded Ollama models.');
        setListItems(
          ocrSdkLoadedModelsList,
          state.ocrSdkLoadedSessions.map((session) => describeSession(session)),
          'No loaded OCR SDK sessions.',
        );
        debugLogger.writeLine(
          `Model state refreshed: loaded=${state.ollamaLoadedModels.length}, ocr-sessions=${state.ocrSdkLoadedSessions.length}`,
        );
      })
      .catch((error: any) => {
        setListItems(loadedModelsList, [], 'Unable to read loaded Ollama models.');
        setListItems(ocrSdkLoadedModelsList, [], 'Unable to read OCR SDK sessions.');
        debugLogger.writeLine(`Model state refresh failed: ${error?.message || String(error)}`);
      });
  }

  function refreshHealthIndicators(config: Partial<ExtensionConfig>): void {
    setBadgeState(ollamaBadge, 'loading');
    setBadgeState(ocrSdkBadge, 'loading');

    readServiceHealth(config)
      .then((snapshot) => {
        setBadgeState(ollamaBadge, snapshot.ollama.status, snapshot.ollama.message);
        setBadgeState(ocrSdkBadge, snapshot.ocrSdk.status, snapshot.ocrSdk.message);
        ocrSdkEndpoint.textContent = snapshot.ocrSdk.ollamaServiceUrl || 'OCR SDK endpoint is not configured.';
        debugLogger.writeLine(`Service health updated: ollama=${snapshot.ollama.status}, ocr-sdk=${snapshot.ocrSdk.status}`);
      })
      .catch((error: any) => {
        setBadgeState(ollamaBadge, 'offline', 'Offline');
        setBadgeState(ocrSdkBadge, 'offline', 'Offline');
        ocrSdkEndpoint.textContent = 'Service health check failed.';
        debugLogger.writeLine(`Service health failed: ${error?.message || String(error)}`);
      });
  }

  function applyConfig(cfg: ExtensionConfig): void {
    endpoint.value = cfg.ollamaServiceUrl;
    ocrSdkEndpoint.textContent = resolveConfiguredLayoutServiceUrl(cfg) || 'OCR SDK endpoint is not configured.';
    glmModel.value = cfg.glmModel;
    targetLanguage.value = cfg.targetLanguage;
    timeoutMs.value = String(cfg.timeoutMs);
    retryCount.value = String(cfg.retryCount);
    maxImageSize.value = String(cfg.maxImageSize);
    debugCheckbox.checked = cfg.debug;
    enableNotifications.checked = cfg.enableNotifications;
    autoOpenPopupOnComplete.checked = cfg.autoOpenPopupOnComplete;
    autoOcrWhitelist.value = cfg.autoOcrWhitelist;

    ocrModel.innerHTML = `<option value="${cfg.ocrModel}">${cfg.ocrModel}</option>`;
    ocrModel.value = cfg.ocrModel;
    ocrType.value = cfg.ocrType;
    ocrPromptTemplate.value = cfg.ocrPromptTemplate;
    skipTranslation.checked = cfg.skipTranslation;

    translateModel.innerHTML = `<option value="${cfg.translateModel}">${cfg.translateModel}</option>`;
    translateModel.value = cfg.translateModel;
    translateType.value = cfg.translateType;
    translatePromptTemplate.value = cfg.translatePromptTemplate;
    layoutChunkStrategy.value = String(cfg.layoutChunkStrategy || 'none');
    layoutMaxChunkSize.value = String(cfg.layoutMaxChunkSize || 1200);
    layoutDebugRawPayload.checked = !!cfg.layoutDebugRawPayload;

    setOptionsStatus('synced', 'Synced');
  }

  getRuntimeConfig()
    .then((cfg) => {
      activeConfig = cfg;
      applyConfig(cfg);
      refreshHealthIndicators(cfg);
      refreshModelLists();
      status.success('Settings loaded.');
      setOptionsStatus('synced', 'Synced');
    })
    .catch((error: any) => {
      activeConfig = getDefaultConfig();
      applyConfig(activeConfig);
      status.error(error?.message || 'Failed to load settings.');
      setBadgeState(ollamaBadge, 'offline', 'Offline');
      setBadgeState(ocrSdkBadge, 'degraded', 'Not configured');
      setOptionsStatus('unsynced', 'Load failed');
    });

  form.addEventListener('input', () => {
    markUnsynced();
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const previousConfig = Object.assign({}, activeConfig);
    const selectedLayoutChunkStrategy = layoutChunkStrategy.value as ExtensionConfig['layoutChunkStrategy'];
    const configUpdate: Partial<ExtensionConfig> = {
      ollamaServiceUrl: endpoint.value.trim(),
      glmModel: glmModel.value.trim(),
      targetLanguage: targetLanguage.value.trim(),
      timeoutMs: Number(timeoutMs.value),
      retryCount: Number(retryCount.value),
      maxImageSize: Number(maxImageSize.value),
      debug: debugCheckbox.checked,
      enableNotifications: enableNotifications.checked,
      autoOpenPopupOnComplete: autoOpenPopupOnComplete.checked,
      autoOcrWhitelist: autoOcrWhitelist.value,
      ocrModel: ocrModel.value,
      ocrType: ocrType.value,
      ocrPromptTemplate: ocrPromptTemplate.value,
      skipTranslation: skipTranslation.checked,
      translateModel: translateModel.value,
      translateType: translateType.value,
      translatePromptTemplate: translatePromptTemplate.value,
      layoutChunkStrategy: selectedLayoutChunkStrategy,
      layoutMaxChunkSize: Number(layoutMaxChunkSize.value),
      layoutDebugRawPayload: layoutDebugRawPayload.checked,
    };

    const nextConfig = Object.assign({}, previousConfig, configUpdate);
    const previousModels = pickSelectedModels(previousConfig);
    const nextModels = pickSelectedModels(nextConfig);
    const staleCandidates = previousModels.filter((name) => !nextModels.includes(name));

    saveRuntimeConfig(configUpdate)
      .then(() => {
        activeConfig = nextConfig;
        const maybeUnloadStaleModels = staleCandidates.length
          ? listModelState(nextConfig)
            .then((state) => {
              const staleLoaded = state.ollamaLoadedModels.filter((name) => staleCandidates.includes(name));
              if (!staleLoaded.length) {
                return;
              }
              return unloadRuntimeModels(nextConfig, { modelNames: staleLoaded })
                .then((unloadResult) => {
                  debugLogger.writeLine(
                    `Auto-unload stale models completed: requested=${staleLoaded.length}, unloaded=${unloadResult.changedModels.length}, failed=${unloadResult.failedModels.length}`,
                  );
                });
            })
          : Promise.resolve();

        return maybeUnloadStaleModels.then(() => {
          refreshHealthIndicators(activeConfig);
          return refreshModelLists(nextConfig, nextConfig);
        }).then(() => {
          status.success('Saved!');
          setOptionsStatus('saved', 'Saved');
        });
      })
      .catch((error: any) => {
        status.error(error?.message || 'Failed to save settings.');
        setOptionsStatus('unsynced', 'Save failed');
      });
  });

  resetBtn.addEventListener('click', () => {
    const defaults = getDefaultConfig();
    activeConfig = defaults;
    applyConfig(defaults);
    refreshHealthIndicators(defaults);
    refreshModelLists();
    status.info('Reset to default values.');
    setOptionsStatus('unsynced', 'Defaults loaded');
  });

  testBtn.addEventListener('click', () => {
    status.info('Testing connection...');
    const draftConfig = collectDraftConfig();
    testEndpoint(draftConfig)
      .then(() => {
        refreshHealthIndicators(draftConfig);
        refreshModelLists(draftConfig, draftConfig);
        status.success('Endpoint OK!');
      })
      .catch((error: any) => {
        status.error(error?.message || 'Failed to connect.');
      });
  });

  refreshModelsBtn.addEventListener('click', () => {
    status.info('Refreshing model state...');
    const draftConfig = collectDraftConfig();
    refreshModelLists(draftConfig, draftConfig).then(() => {
      status.success('Model state refreshed.');
    });
  });

  loadModelsBtn.addEventListener('click', () => {
    status.info('Loading configured models...');
    const draftConfig = collectDraftConfig();
    loadRuntimeModels(draftConfig)
      .then((result) => {
        const failed = result.failedModels.length;
        const loaded = result.changedModels.length;
        debugLogger.writeLine(`Load models completed: loaded=${loaded}, failed=${failed}`);
        return refreshModelLists(draftConfig, draftConfig).then(() => {
          if (failed > 0) {
            status.error(`Loaded ${loaded} model(s), ${failed} failed.`);
          } else {
            status.success(`Loaded ${loaded} model(s).`);
          }
        });
      })
      .catch((error: any) => {
        status.error(error?.message || 'Failed to load models.');
      });
  });

  unloadModelsBtn.addEventListener('click', () => {
    status.info('Unloading all loaded models...');
    const draftConfig = collectDraftConfig();
    unloadRuntimeModels(draftConfig, { unloadAllLoaded: true })
      .then((result) => {
        const failed = result.failedModels.length;
        const unloaded = result.changedModels.length;
        debugLogger.writeLine(`Unload models completed: unloaded=${unloaded}, failed=${failed}`);
        return refreshModelLists(draftConfig, draftConfig).then(() => {
          if (failed > 0) {
            status.error(`Unloaded ${unloaded} model(s), ${failed} failed.`);
          } else {
            status.success(`Unloaded ${unloaded} model(s).`);
          }
        });
      })
      .catch((error: any) => {
        status.error(error?.message || 'Failed to unload models.');
      });
  });
});
