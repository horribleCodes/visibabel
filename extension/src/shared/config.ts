// Shared config schema, normalization, and helpers
import type { LayoutChunkStrategy } from './layout-types.js';

export interface ExtensionConfig {
  ollamaServiceUrl: string;
  layoutServiceUrl: string;
  glmModel: string;
  ocrModel: string;
  ocrType: string;
  ocrPromptTemplate: string;
  translateModel: string;
  translateType: string;
  translatePromptTemplate: string;
  targetLanguage: string;
  timeoutMs: number;
  retryCount: number;
  maxImageSize: number;
  debug: boolean;
  enableNotifications: boolean;
  autoOpenPopupOnComplete: boolean;
  autoOcrWhitelist: string;
  enableLayoutInference: boolean;
  enableAutoPipeline: boolean;
  skipTranslation: boolean;
  enableOcrDedupe: boolean;
  storeConvertedWebpInResults: boolean;
  layoutChunkStrategy?: LayoutChunkStrategy;
  layoutMaxChunkSize?: number;
  layoutDebugRawPayload?: boolean;
  [key: string]: any;
}

export const defaultConfig: ExtensionConfig = {
  ollamaServiceUrl: 'http://localhost:11434/',
  layoutServiceUrl: '',
  glmModel: 'glm-ocr:latest',
  ocrModel: 'glm-ocr:latest',
  ocrType: 'completion',
  ocrPromptTemplate: 'Text Recognition:',
  translateModel: 'kaelri/hy-mt2:1.8b',
  translateType: 'completion',
  translatePromptTemplate: 'Translate the following text to {target_language}. Preserve line breaks. Return only translated text.\n\n{ocr_text}',
  targetLanguage: 'English',
  timeoutMs: 60000,
  retryCount: 2,
  maxImageSize: 1600,
  debug: false,
  enableNotifications: true,
  autoOpenPopupOnComplete: false,
  autoOcrWhitelist: '',
  enableLayoutInference: true,
  enableAutoPipeline: true,
  skipTranslation: false,
  enableOcrDedupe: true,
  storeConvertedWebpInResults: false,
  layoutChunkStrategy: 'none',
  layoutMaxChunkSize: 1200,
  layoutDebugRawPayload: false,
};

export function normalizeConfig(rawConfig: Partial<ExtensionConfig>): ExtensionConfig {
  const cfg = Object.assign({}, defaultConfig, rawConfig || {});
  const validStepTypes = new Set(['completion', 'chat', 'chat_fallback']);

  cfg.ollamaServiceUrl = String(cfg.ollamaServiceUrl || defaultConfig.ollamaServiceUrl).trim();
  cfg.layoutServiceUrl = String(cfg.layoutServiceUrl || defaultConfig.layoutServiceUrl).trim();
  cfg.glmModel = String(cfg.glmModel || defaultConfig.glmModel).trim();
  cfg.ocrModel = String(cfg.ocrModel || defaultConfig.ocrModel).trim();
  cfg.ocrType = validStepTypes.has(String(cfg.ocrType)) ? String(cfg.ocrType) : defaultConfig.ocrType;
  cfg.ocrPromptTemplate = String(cfg.ocrPromptTemplate || defaultConfig.ocrPromptTemplate);
  cfg.translateModel = String(cfg.translateModel || defaultConfig.translateModel).trim();
  cfg.translateType = validStepTypes.has(String(cfg.translateType)) ? String(cfg.translateType) : defaultConfig.translateType;
  cfg.translatePromptTemplate = String(cfg.translatePromptTemplate || defaultConfig.translatePromptTemplate);
  cfg.targetLanguage = String(cfg.targetLanguage || defaultConfig.targetLanguage).trim();
  cfg.timeoutMs = Math.max(1000, Number(cfg.timeoutMs) || defaultConfig.timeoutMs);
  cfg.retryCount = Math.max(0, Number(cfg.retryCount) || defaultConfig.retryCount);
  cfg.maxImageSize = Math.max(128, Number(cfg.maxImageSize) || defaultConfig.maxImageSize);
  cfg.debug = !!cfg.debug;
  cfg.enableNotifications = cfg.enableNotifications !== false;
  cfg.autoOpenPopupOnComplete = !!cfg.autoOpenPopupOnComplete;
  cfg.autoOcrWhitelist = String(cfg.autoOcrWhitelist || defaultConfig.autoOcrWhitelist);
  cfg.enableLayoutInference = cfg.enableLayoutInference !== false;
  cfg.enableAutoPipeline = cfg.enableAutoPipeline !== false;
  cfg.skipTranslation = cfg.skipTranslation === true;
  cfg.enableOcrDedupe = cfg.enableOcrDedupe !== false;
  cfg.storeConvertedWebpInResults = cfg.storeConvertedWebpInResults === true;
  cfg.layoutChunkStrategy = cfg.layoutChunkStrategy || defaultConfig.layoutChunkStrategy;
  cfg.layoutMaxChunkSize = Math.max(100, Number(cfg.layoutMaxChunkSize) || defaultConfig.layoutMaxChunkSize || 1200);
  cfg.layoutDebugRawPayload = !!cfg.layoutDebugRawPayload;

  return cfg;
}

export function getConfig(): Promise<ExtensionConfig> {
  return new Promise(resolve => {
    chrome.storage.local.get(['config'], result => {
      resolve((result.config as ExtensionConfig) ? normalizeConfig(result.config as ExtensionConfig) : defaultConfig);
    });
  });
}

export function saveConfig(config: Partial<ExtensionConfig>): Promise<void> {
  return new Promise(resolve => {
    chrome.storage.local.get(['config'], result => {
      const existing = (result?.config as Partial<ExtensionConfig>) || {};
      const merged = Object.assign({}, existing, config || {});
      chrome.storage.local.set({ config: normalizeConfig(merged) }, () => resolve());
    });
  });
}

export function getDefaultConfig(): ExtensionConfig {
  return defaultConfig;
}
