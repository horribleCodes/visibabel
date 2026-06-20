// extension/src/__tests__/endpoint-mode-helper.ts
// Jest/unit endpoint-mode helper for real-or-mock endpoint selection
// Usage: import { setupEndpointMode } from './endpoint-mode-helper';

import fetch from 'node-fetch';

export type Endpoint = 'ollama' | 'layout';
export type EndpointHealthMap = Record<Endpoint, boolean>;
export type EndpointMode = 'auto' | 'real' | 'mock';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const LAYOUT_URL = process.env.LAYOUT_URL || 'http://localhost:5002';
const ENDPOINT_TIMEOUT = +(process.env.VISIBABEL_ENDPOINT_TIMEOUT_MS || 2000);
const MODE: EndpointMode = (process.env.VISIBABEL_ENDPOINT_MODE as EndpointMode) || 'auto';
const FAIL_ON_FALLBACK = process.env.VISIBABEL_FAIL_ON_FALLBACK === 'true';

async function probeOllama(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { method: 'GET', timeout: ENDPOINT_TIMEOUT });
    return res.ok;
  } catch {
    return false;
  }
}

async function probeLayout(): Promise<boolean> {
  try {
    const res = await fetch(`${LAYOUT_URL}/health`, { method: 'GET', timeout: ENDPOINT_TIMEOUT });
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

export async function setupEndpointMode(required: Endpoint[], mockHandlers: () => void, testName: string) {
  const health = await probeEndpoints(required);
  const offline = required.filter(ep => !health[ep]);
  let useMock = false;
  if (MODE === 'mock') useMock = true;
  else if (MODE === 'real') useMock = false;
  else if (MODE === 'auto') useMock = offline.length > 0;

  if (useMock) {
    mockHandlers();
    const msg = `[endpoint-fallback] ${testName} using mock for: ${offline.join(', ')} (health probe failed)`;
    // Only warn once per test file
    if (!global.__endpointFallbackWarned) {
      // eslint-disable-next-line no-console
      console.warn(msg);
      global.__endpointFallbackWarned = true;
    }
    if (FAIL_ON_FALLBACK) throw new Error(msg);
  }
}
