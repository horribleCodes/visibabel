// extension/e2e/helpers/endpoint-mode-helper.ts
// Shared endpoint-mode helper for E2E tests: auto-selects real or mock endpoints
// Usage: import { setupEndpointMode } from './helpers/endpoint-mode-helper';

export type Endpoint = 'ollama' | 'layout';
export type EndpointHealthMap = Record<Endpoint, boolean>;
export type EndpointMode = 'auto' | 'real' | 'mock';

declare const process: any;
const OLLAMA_URL = (typeof process !== 'undefined' && process.env.OLLAMA_URL) || 'http://localhost:11434';
const LAYOUT_URL = (typeof process !== 'undefined' && process.env.LAYOUT_URL) || 'http://localhost:5002';
const ENDPOINT_TIMEOUT = (typeof process !== 'undefined' && process.env.VISIBABEL_ENDPOINT_TIMEOUT_MS) ? +process.env.VISIBABEL_ENDPOINT_TIMEOUT_MS : 2000;

function getEndpointMode(): EndpointMode {
  return ((typeof process !== 'undefined' && process.env.VISIBABEL_ENDPOINT_MODE as EndpointMode) || 'mock');
}

function getFailOnFallback(): boolean {
  return typeof process !== 'undefined' && process.env.VISIBABEL_FAIL_ON_FALLBACK === 'true';
}

async function probeOllama(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ENDPOINT_TIMEOUT);
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { method: 'GET', signal: controller.signal });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

async function probeLayout(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ENDPOINT_TIMEOUT);
    const res = await fetch(`${LAYOUT_URL}/health`, { method: 'GET', signal: controller.signal });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

export async function probeEndpoints(required: Endpoint[]): Promise<EndpointHealthMap> {
  const results: EndpointHealthMap = { ollama: true, layout: true };
  await Promise.all(required.map(async (ep) => {
    if (ep === 'ollama') results.ollama = await probeOllama();
    if (ep === 'layout') results.layout = await probeLayout();
  }));
  return results;
}

export async function setupEndpointMode(testContext: any, required: Endpoint[], mockHandlers: () => void) {
  const health = await probeEndpoints(required);
  const offline = required.filter(ep => !health[ep]);
  const mode = getEndpointMode();
  let useMock = false;
  if (mode === 'mock') useMock = true;
  else if (mode === 'real') useMock = false;
  else if (mode === 'auto') useMock = offline.length > 0;

  // Register Playwright interceptors whenever the test supplies handlers so local
  // docker services on localhost do not bypass mocked E2E routes.
  mockHandlers();

  if (useMock) {
    const title = typeof testContext.title === 'function' ? testContext.title() : testContext.title;
    const offlineLabel = offline.length > 0 ? offline.join(', ') : '';
    const reasonLabel = mode === 'mock' ? '(forced mock mode)' : '(health probe failed)';
    const msg = `[endpoint-fallback] ${title} using mock for: ${offlineLabel} ${reasonLabel}`;
    const annotations = Array.isArray(testContext?.annotations)
      ? testContext.annotations
      : Array.isArray(testContext?.info?.annotations)
        ? testContext.info.annotations
        : null;

    if (annotations) {
      const annotType = mode === 'mock' ? 'info' : 'warning';
      annotations.push({ type: annotType, description: msg });
    }
    // Keep this visible in CI logs even when annotation plumbing is unavailable.
    // eslint-disable-next-line no-console
    if (mode === 'mock') console.info(msg);
    else console.warn(msg);

    if (getFailOnFallback() && mode !== 'mock') throw new Error(msg);
  }
}
