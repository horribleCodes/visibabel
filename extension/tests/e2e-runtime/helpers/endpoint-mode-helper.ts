// extension/tests/e2e-runtime/helpers/endpoint-mode-helper.ts
// Shared endpoint-mode helper for E2E tests: auto-selects real or mock endpoints
// Usage: import { setupEndpointMode } from './helpers/endpoint-mode-helper';

export type Endpoint = 'ollama' | 'layout';
export type EndpointHealthMap = Record<Endpoint, boolean>;
export type EndpointMode = 'auto' | 'real' | 'mock';

declare const process: any;
const OLLAMA_URL = (typeof process !== 'undefined' && process.env.OLLAMA_URL) || 'http://localhost:11434';
const LAYOUT_URL = (typeof process !== 'undefined' && process.env.LAYOUT_URL) || 'http://localhost:8000';
const ENDPOINT_TIMEOUT = (typeof process !== 'undefined' && process.env.VISIBABEL_ENDPOINT_TIMEOUT_MS) ? +process.env.VISIBABEL_ENDPOINT_TIMEOUT_MS : 2000;

function getEndpointMode(): EndpointMode {
  return ((typeof process !== 'undefined' && process.env.VISIBABEL_ENDPOINT_MODE as EndpointMode) || 'auto');
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

  if (useMock) {
    mockHandlers();
    const title = typeof testContext.title === 'function' ? testContext.title() : testContext.title;
    const msg = `[endpoint-fallback] ${title} using mock for: ${offline.join(', ')} (health probe failed)`;
    const annotations = Array.isArray(testContext?.annotations)
      ? testContext.annotations
      : Array.isArray(testContext?.info?.annotations)
        ? testContext.info.annotations
        : null;

    if (annotations) {
      annotations.push({ type: 'warning', description: msg });
    }
    // Keep this visible in CI logs even when annotation plumbing is unavailable.
    // eslint-disable-next-line no-console
    console.warn(msg);

    if (getFailOnFallback()) throw new Error(msg);
  }
}
