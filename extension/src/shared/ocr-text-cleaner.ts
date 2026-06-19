// ocr-text-cleaner.ts
// Utility for cleaning OCR output text of extraneous artifacts

/**
 * Cleans OCR output by removing markdown code blocks, leading/trailing artifacts, and common noise.
 * @param text Raw OCR output text
 * @returns Cleaned text
 */
export function cleanOcrText(text: string): string {
  let processedText = String(text || '').trim();

  // Remove markdown code blocks (```...```), including language specifier
  processedText = processedText.replace(/^```[a-zA-Z]*\n([\s\S]*?)\n```$/gm, '$1').trim();

  // Remove common leading artifacts (e.g., 'line text:', 'Text:', etc.)
  processedText = processedText.replace(/^(line text:|text:)[ \t]*/i, '');

  // Remove trailing artifacts (e.g., repeated --- or similar)
  processedText = processedText.replace(/\n*-{3,}\n*$/g, '').trim();

  return processedText;
}
