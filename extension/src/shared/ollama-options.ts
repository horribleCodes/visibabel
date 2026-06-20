/** Model-native stop sequences for glm-ocr OCR requests (Ollama `options.stop`). */
export const GLM_OCR_STOP_SEQUENCES = ['<|endoftext|>', '<|user|>'] as const;

/** Optional fence stop when model wraps OCR output in markdown code blocks. */
export const GLM_OCR_FENCE_STOP = '```' as const;

export interface OcrOllamaOptions {
  temperature: number;
  top_k: number;
  top_p: number;
  repeat_penalty: number;
  num_predict: number;
  stop: string[];
}

export function buildOcrOllamaOptions(): OcrOllamaOptions {
  return {
    temperature: 0,
    top_k: 1,
    top_p: 0.00001,
    repeat_penalty: 1.1,
    num_predict: 8192,
    stop: [...GLM_OCR_STOP_SEQUENCES],
  };
}
