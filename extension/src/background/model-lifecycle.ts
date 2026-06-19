import { fetchJson, fetchOk } from '../shared/transport.js';
import { resolveLayoutServiceUrl } from '../shared/service-health.js';

export type SetModelLoadedStateOptions = {
  modelNames?: string[];
  unloadAllLoaded?: boolean;
};

export type ModelSession = {
  cache_key?: string;
  model?: string;
  host?: string;
  port?: number;
  timeout_ms?: number;
  idle_seconds?: number;
  age_seconds?: number;
};

export function uniqueModelNames(input: Array<string | undefined | null>): string[] {
  const normalized = input
    .map((value) => String(value || '').trim())
    .filter((value) => !!value);
  return Array.from(new Set(normalized));
}

function resolveOllamaEndpoint(config: Record<string, any>): string {
  return String(config.ollamaServiceUrl || config.endpoint || 'http://localhost:11434/');
}

async function fetchLoadedModelNames(endpoint: string): Promise<string[]> {
  const psUrl = new URL('api/ps', endpoint).toString();
  const psResponse = await fetchJson<any>(psUrl, { method: 'GET' });
  return Array.isArray(psResponse?.models)
    ? psResponse.models
      .map((entry: any) => String(entry?.name || '').trim())
      .filter((name: string) => !!name)
    : [];
}

export async function listModelState(config: Record<string, any>): Promise<Record<string, unknown>> {
  const endpoint = resolveOllamaEndpoint(config);
  const layoutServiceUrl = resolveLayoutServiceUrl(config);

  const tagsUrl = new URL('api/tags', endpoint).toString();
  const psUrl = new URL('api/ps', endpoint).toString();

  let ollamaAvailableModels: string[] = [];
  let ollamaLoadedModels: string[] = [];
  let ocrSdkLoadedSessions: ModelSession[] = [];

  try {
    const tagsResponse = await fetchJson<any>(tagsUrl, { method: 'GET' });
    ollamaAvailableModels = Array.isArray(tagsResponse?.models)
      ? tagsResponse.models
        .map((entry: any) => String(entry?.name || '').trim())
        .filter((name: string) => !!name)
      : [];
  } catch (_error: unknown) {
    ollamaAvailableModels = [];
  }

  try {
    const psResponse = await fetchJson<any>(psUrl, { method: 'GET' });
    ollamaLoadedModels = Array.isArray(psResponse?.models)
      ? psResponse.models
        .map((entry: any) => String(entry?.name || '').trim())
        .filter((name: string) => !!name)
      : [];
  } catch (_error: unknown) {
    ollamaLoadedModels = [];
  }

  if (layoutServiceUrl) {
    try {
      const healthUrl = new URL('health', layoutServiceUrl).toString();
      const healthResponse = await fetchJson<any>(healthUrl, { method: 'GET' });
      ocrSdkLoadedSessions = Array.isArray(healthResponse?.loaded_models)
        ? healthResponse.loaded_models
        : [];
    } catch (_error: unknown) {
      ocrSdkLoadedSessions = [];
    }
  }

  return {
    ollamaAvailableModels,
    ollamaLoadedModels,
    ocrSdkLoadedSessions,
  };
}

export async function setModelLoadedState(config: Record<string, any>, shouldLoad: boolean): Promise<Record<string, unknown>> {
  const endpoint = resolveOllamaEndpoint(config);
  const generateUrl = new URL('api/generate', endpoint).toString();
  const options: SetModelLoadedStateOptions = {
    modelNames: Array.isArray(config.modelNames) ? config.modelNames : undefined,
    unloadAllLoaded: config.unloadAllLoaded === true,
  };

  let models = uniqueModelNames([
    ...(options.modelNames || []),
    config.glmModel,
    config.ocrModel,
    config.translateModel,
  ]);

  if (!shouldLoad && options.unloadAllLoaded) {
    models = await fetchLoadedModelNames(endpoint);
  }

  const keepAlive = shouldLoad ? '30m' : 0;
  const loaded: string[] = [];
  const failed: string[] = [];
  await Promise.all(models.map(async (model) => {
    try {
      await fetchOk(generateUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt: '',
          stream: false,
          keep_alive: keepAlive,
        }),
      });
      loaded.push(model);
    } catch (_error) {
      failed.push(model);
    }
  }));
  return {
    changedModels: loaded,
    failedModels: failed,
  };
}
