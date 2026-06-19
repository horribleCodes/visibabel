// Negative/edge case tests for Ollama endpoint
// Framework: node:test or Jest

import test from 'node:test';
import assert from 'node:assert/strict';
import fetch from 'node-fetch';
import { getEndpoint, getModel } from './helpers.mjs';

const endpoint = getEndpoint();
const model = getModel();

// Helper for POST requests
async function postJson(url, body, opts = {}) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    body: JSON.stringify(body),
    ...opts,
  });
}

test('Ollama returns error for malformed request', async () => {
  const res = await fetch(`${endpoint}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: 'not-json',
  });
  assert.notEqual(res.status, 200, 'Should not return 200 for malformed JSON');
  const data = await res.json().catch(() => null);
  assert.ok(data?.error, 'Should return an error message');
});

test('Ollama returns error for missing model', async () => {
  const res = await postJson(`${endpoint}/api/generate`, {
    model: 'nonexistent-model',
    prompt: 'Test',
  });
  assert.notEqual(res.status, 200, 'Should not return 200 for missing model');
  const data = await res.json().catch(() => null);
  assert.ok(data?.error, 'Should return an error message');
});

test('Ollama times out on slow response', async () => {
  let timedOut = false;
  try {
    await fetch(`${endpoint}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: 'Test' }),
      signal: AbortSignal.timeout ? AbortSignal.timeout(1) : undefined,
    });
  } catch (e) {
    timedOut = true;
  }
  assert.ok(timedOut, 'Should handle timeouts gracefully');
});
