/** Model-native stop sequences for glm-ocr OCR requests (Ollama `options.stop`). */
export const GLM_OCR_STOP_SEQUENCES = ['<|endoftext|>', '<|user|>'] as const;

/** Optional fence stop when model wraps OCR output in markdown code blocks. */
export const GLM_OCR_FENCE_STOP = '```' as const;

export interface OcrOllamaOptions {
  temperature: number;
  num_predict: number;
  stop: string[];
}

export function buildOcrOllamaOptions(): OcrOllamaOptions {
  return {
    temperature: 0,
    num_predict: 8192,
    stop: [...GLM_OCR_STOP_SEQUENCES],
  };
}
