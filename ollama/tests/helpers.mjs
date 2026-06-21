// Test helpers for Ollama endpoint integration tests
import fs from 'fs/promises';

export function getEndpoint() {
  return process.env.OLLAMA_ENDPOINT || 'http://localhost:11434';
}

export function getModel() {
  return process.env.OLLAMA_MODEL || 'glm-ocr:latest';
}

/** Same prompt the extension uses for OCR (completion mode). */
export const EXTENSION_OCR_PROMPT = 'Text Recognition:';

/** Same Ollama options the extension sends for OCR (ollama-options.ts). */
export const EXTENSION_OCR_OPTIONS = {
  temperature: 0,
  num_predict: 8192,
  stop: ['<|endoftext|>', '<|user|>', '```markdown'],
};

/** Normalized text from resources/test_1.png (line 1: こんにちは, line 2: 世界). */
export const EXPECTED_TEST_1_TEXT = '世界\nこんにちは';

/** Mirrors extension cleanOcrText (ocr-text-cleaner.ts). */
export function cleanOcrLikeExtension(text) {
  let processedText = String(text || '').trim();
  processedText = processedText.replace(/^```[a-zA-Z]*\n([\s\S]*?)\n```$/gm, '$1').trim();
  processedText = processedText.replace(/^(line text:|text:)[ \t]*/i, '');
  processedText = processedText.replace(/\n*-{3,}\n*$/g, '').trim();
  processedText = dedupeRepeatedOcrLikeExtension(processedText);
  return processedText;
}

function dedupeRepeatedOcrLikeExtension(text) {
  if (text.length < 2) {
    return text;
  }
  const blockRepeat = text.match(/^([\s\S]+?)(?:\s*\1\s*)+$/);
  if (blockRepeat?.[1]) {
    return blockRepeat[1].trimEnd();
  }
  const len = text.length;
  const maxPeriod = Math.floor(len / 2);
  for (let period = 1; period <= maxPeriod; period += 1) {
    if (len % period !== 0) {
      continue;
    }
    const unit = text.slice(0, period);
    const repeats = len / period;
    if (repeats >= 2 && unit.repeat(repeats) === text) {
      return unit;
    }
  }
  return stripTrailingRepeatedSuffixLikeExtension(text);
}

function stripTrailingRepeatedSuffixLikeExtension(text) {
  const maxUnit = Math.floor(text.length / 2);
  for (let unitLen = maxUnit; unitLen >= 2; unitLen -= 1) {
    const suffix = text.slice(-unitLen);
    if (!suffix) {
      continue;
    }
    let count = 0;
    let pos = text.length;
    while (pos >= unitLen && text.slice(pos - unitLen, pos) === suffix) {
      count += 1;
      pos -= unitLen;
    }
    if (count >= 2) {
      return text.slice(0, pos + unitLen);
    }
  }
  return text;
}

export function describeOcrArtifacts(raw) {
  const text = String(raw || '');
  const dashRuns = text.match(/-{3,}/g) || [];
  const fenceRuns = text.match(/`{3,}/g) || [];
  return {
    rawLength: text.length,
    dashRunCount: dashRuns.length,
    longestDashRun: dashRuns.length ? Math.max(...dashRuns.map((d) => d.length)) : 0,
    fenceRunCount: fenceRuns.length,
  };
}

export async function loadTestImage() {
  // Loads a small PNG as base64 for OCR test
  const buf = await fs.readFile(new URL('../../resources/test_1.png', import.meta.url));
  return buf.toString('base64');
}
