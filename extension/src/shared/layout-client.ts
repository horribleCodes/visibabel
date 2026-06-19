import type { ExtensionConfig } from '../shared/config.js';
import type { LayoutAugmentResponse, LayoutParserConfig } from '../shared/layout-types.js';
import { resolveLayoutServiceUrl } from '../shared/service-health.js';

export async function fetchLayoutAugment(
  base64Image: string,
  config: ExtensionConfig,
  _parserConfig: LayoutParserConfig
): Promise<LayoutAugmentResponse> {
  const url = new URL('layout/augment', resolveLayoutServiceUrl(config));
  const timeoutMs = config.timeoutMs || 60000;
  const body = {
    image_base64: base64Image,
    ollama_endpoint: config.ollamaServiceUrl,
    ollama_model: config.glmModel || config.ocrModel,
    timeout_ms: timeoutMs,
  };
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from /layout/augment`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}
