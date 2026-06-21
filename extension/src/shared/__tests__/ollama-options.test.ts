import { buildOcrOllamaOptions, GLM_OCR_STOP_SEQUENCES } from '../ollama-options.js';

describe('buildOcrOllamaOptions', () => {
  it('matches official GLM-OCR generation defaults for Ollama', () => {
    expect(buildOcrOllamaOptions()).toEqual({
      temperature: 0,
      num_predict: 8192,
      stop: [...GLM_OCR_STOP_SEQUENCES],
    });
    expect(GLM_OCR_STOP_SEQUENCES).toContain('<|endoftext|>');
    expect(GLM_OCR_STOP_SEQUENCES).toContain('<|user|>');
  });
});
