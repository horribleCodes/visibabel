// Test helpers for Ollama endpoint integration tests
import fs from 'fs/promises';

export function getEndpoint() {
  return process.env.OLLAMA_ENDPOINT || 'http://localhost:11434';
}

export function getModel() {
  return process.env.OLLAMA_MODEL || 'glm-ocr';
}

export async function loadTestImage() {
  // Loads a small PNG as base64 for OCR test
  const buf = await fs.readFile(new URL('../../resources/test_1.png', import.meta.url));
  return buf.toString('base64');
}
