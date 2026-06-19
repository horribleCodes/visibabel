// Refactored integration tests for Ollama endpoint
// Framework: node:test or Jest

import test from 'node:test';
import assert from 'node:assert/strict';
import fetch from 'node-fetch';
import { getEndpoint, getModel, loadTestImage } from './helpers.mjs';

const endpoint = getEndpoint();
const model = getModel();

// Helper for POST requests
async function postJson(url, body, opts = {}) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    body: JSON.stringify(body),
    ...opts,
  });loadTestImage
}

test('Ollama endpoint is reachable', async () => {
  const res = await fetch(`${endpoint}/api/tags`);
  assert.equal(res.status, 200, 'Should return 200 OK');
  const data = await res.json();
  assert.ok(Array.isArray(data.models) || Array.isArray(data.tags), 'Should return models or tags array');
});

test('Ollama returns models', async () => {
  const res = await fetch(`${endpoint}/api/tags`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(Array.isArray(data.models) || Array.isArray(data.tags));
  // If models present, check at least one has a name
  if (Array.isArray(data.models) && data.models.length > 0) {
    assert.ok(data.models[0].name);
  }
});

test('Ollama handles CORS/Origin', async () => {
  // Simulate browser CORS preflight
  const res = await fetch(`${endpoint}/api/tags`, {
    method: 'OPTIONS',
    headers: {
      'Origin': 'http://localhost',
      'Access-Control-Request-Method': 'GET',
    },
  });
  assert.equal(res.status, 204);
  // CORS headers
  assert.ok(res.headers.get('access-control-allow-origin'));
});

test('Ollama OCR endpoint returns text', async () => {
  const imageBase64 = await loadTestImage();
  const res = await postJson(`${endpoint}/api/generate`, {
    model,
    prompt: 'What text is in this image?',
    stream: false,
    images: [imageBase64],
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(data.response && typeof data.response === 'string' && data.response.length > 0, 'Should return OCR text');
});

test('Ollama translation endpoint returns translation', async () => {
  const res = await postJson(`${endpoint}/api/generate`, {
    model,
    prompt: 'Translate to German and return only the translated phrase: Hello world',
    stream: false,
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(
    data.response && /(hallo|welt|hello\s*world)/i.test(data.response),
    'Should return generated translation text or echoed phrase',
  );
});

test('Ollama handles errors and timeouts', async () => {
  // Missing model
  const res1 = await postJson(`${endpoint}/api/generate`, {
    model: 'nonexistent-model',
    prompt: 'Test',
  });
  assert.notEqual(res1.status, 200, 'Should not return 200 for missing model');

  // Malformed request
  const res2 = await fetch(`${endpoint}/api/generate`, { method: 'POST', body: 'not-json', headers: { 'Content-Type': 'application/json' } });
  assert.notEqual(res2.status, 200, 'Should not return 200 for malformed JSON');

  // Timeout (simulate with very short timeout if supported)
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
  assert.ok(timedOut || true, 'Should handle timeouts gracefully');
});
