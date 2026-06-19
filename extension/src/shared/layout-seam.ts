import type { ExtensionConfig } from '../shared/config.js';
import type { LayoutParserConfig } from '../shared/layout-types.js';

export function shouldUseLayoutAugment(config: ExtensionConfig): boolean {
  return !!config.enableLayoutInference;
}

export function getParserConfig(config: ExtensionConfig): LayoutParserConfig {
  return {
    chunkStrategy: config.layoutChunkStrategy || 'none',
    maxChunkSize: config.layoutMaxChunkSize,
    debugRawPayload: config.layoutDebugRawPayload,
  };
}

export function fallbackToTextOnly(config: ExtensionConfig): boolean {
  return !shouldUseLayoutAugment(config);
}
