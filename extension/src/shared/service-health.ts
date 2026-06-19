import type { ExtensionConfig } from './config.js';
import { fetchOk } from './transport.js';
import { clearOfflineBadgeIfPresent, setOfflineBadge } from '../background/badge-manager.js';

type ServiceStatus = 'online' | 'offline' | 'degraded';

export type ServiceHealthSnapshot = {
  ollama: {
    status: ServiceStatus;
    message: string;
  };
  ocrSdk: {
    status: ServiceStatus;
    message: string;
    ollamaServiceUrl: string;
  };
};

function buildLayoutHealthEndpoint(layoutServiceUrl: string): string {
  return new URL('health', layoutServiceUrl).toString();
}

function inferLayoutServiceUrl(ollamaServiceUrl: string): string {
  try {
    const parsed = new URL(ollamaServiceUrl || 'http://localhost:11434/');
    const host = parsed.hostname || '127.0.0.1';
    return `${parsed.protocol}//${host}:5002/`;
  } catch (_error: unknown) {
    return 'http://127.0.0.1:5002/';
  }
}

export function resolveConfiguredLayoutServiceUrl(config: Partial<ExtensionConfig>): string {
  const explicit = String(config.layoutServiceUrl || '').trim();
  if (explicit) {
    return explicit;
  }
  return inferLayoutServiceUrl(String(config.ollamaServiceUrl || 'http://localhost:11434/').trim());
}

export function resolveLayoutServiceUrl(config: Partial<ExtensionConfig>): string {
  return resolveConfiguredLayoutServiceUrl(config);
}

export async function readServiceHealth(config: Partial<ExtensionConfig>): Promise<ServiceHealthSnapshot> {
  const ollamaServiceUrl = String(config.ollamaServiceUrl || 'http://localhost:11434/').trim();
  const timeoutMs = Math.max(500, Number(config.timeoutMs) || 2000);
  const configuredLayoutServiceUrl = resolveConfiguredLayoutServiceUrl(config);
  const layoutServiceUrl = resolveLayoutServiceUrl(config);

  const ollama = {
    status: 'offline' as ServiceStatus,
    message: 'Offline',
  };

  try {
    await fetchOk(new URL('api/tags', ollamaServiceUrl).toString(), {
      method: 'GET',
      timeoutMs,
    });
    ollama.status = 'online';
    ollama.message = 'Online';
    clearOfflineBadgeIfPresent();
  } catch (_error: unknown) {
    ollama.status = 'offline';
    ollama.message = 'Offline';
    setOfflineBadge();
  }

  const ocrSdk = {
    status: 'degraded' as ServiceStatus,
    message: configuredLayoutServiceUrl ? 'Checking...' : 'Not configured',
    ollamaServiceUrl: configuredLayoutServiceUrl,
  };

  if (layoutServiceUrl) {
    try {
      await fetchOk(buildLayoutHealthEndpoint(layoutServiceUrl), {
        method: 'GET',
        timeoutMs,
      });
      ocrSdk.status = 'online';
      ocrSdk.message = 'Online';
    } catch (_error: unknown) {
      ocrSdk.status = 'offline';
      ocrSdk.message = 'Offline';
    }
  }

  return {
    ollama,
    ocrSdk,
  };
}
