// ocr-text-cleaner.ts
// Utility for cleaning OCR output text of extraneous artifacts

/**
 * Detects when the full OCR output repeats cyclically (common GLM-OCR EOS failure).
 * Returns the first occurrence only.
 */
export function dedupeRepeatedOcrOutput(text: string): string {
  const normalized = String(text || '');
  if (normalized.length < 2) {
    return normalized;
  }

  const blockRepeat = normalized.match(/^([\s\S]+?)(?:\s*\1\s*)+$/);
  if (blockRepeat?.[1]) {
    return blockRepeat[1].trimEnd();
  }

  const len = normalized.length;
  const maxPeriod = Math.floor(len / 2);

  for (let period = 1; period <= maxPeriod; period += 1) {
    if (len % period !== 0) {
      continue;
    }
    const unit = normalized.slice(0, period);
    const repeats = len / period;
    if (repeats >= 2 && unit.repeat(repeats) === normalized) {
      return unit;
    }
  }

  return stripTrailingRepeatedSuffix(normalized);
}

function stripTrailingRepeatedSuffix(text: string): string {
  const minUnit = 2;
  const maxUnit = Math.floor(text.length / 2);
  if (maxUnit < minUnit) {
    return text;
  }

  for (let unitLen = maxUnit; unitLen >= minUnit; unitLen -= 1) {
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

export interface CleanOcrTextOptions {
  dedupe?: boolean;
}

/**
 * Cleans OCR output by removing markdown code blocks, leading/trailing artifacts, and common noise.
 * @param text Raw OCR output text
 * @returns Cleaned text
 */
export function cleanOcrText(text: string, options: CleanOcrTextOptions = {}): string {
  let processedText = String(text || '').trim();

  // Remove markdown code blocks (```...```), including language specifier
  processedText = processedText.replace(/^```[a-zA-Z]*\n([\s\S]*?)\n```$/gm, '$1').trim();

  // Remove common leading artifacts (e.g., 'line text:', 'Text:', etc.)
  processedText = processedText.replace(/^(line text:|text:)[ \t]*/i, '');

  // Remove trailing fence/dash runs emitted as EOS workarounds (not mid-document content)
  processedText = processedText.replace(/\n*-{3,}\n*$/g, '').trim();

  if (options.dedupe !== false) {
    processedText = dedupeRepeatedOcrOutput(processedText);
  }

  return processedText;
}
