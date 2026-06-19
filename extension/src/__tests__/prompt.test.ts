// Unit tests for prompt logic
// Framework: Jest

import { buildPrompt } from '../shared/prompt';

describe('Prompt', () => {
  it('should keep prompt unchanged when no tokens exist', () => {
    const template = 'Extract text from the image.';
    const result = buildPrompt(template, '');
    expect(result).toBe('Extract text from the image.');
  });

  it('should replace target language token from string shorthand', () => {
    const template = 'Translate to {target_language}: ...';
    const result = buildPrompt(template, 'French');
    expect(result).toBe('Translate to French: ...');
  });

  it('should replace multiple named tokens from object replacements', () => {
    const template = 'Translate to {target_language}: {ocr_text}';
    const result = buildPrompt(template, {
      target_language: 'German',
      ocr_text: 'Hello',
    } as any);
    expect(result).toBe('Translate to German: Hello');
  });

  it('should erase unknown token values instead of leaving raw placeholders', () => {
    const template = 'Result: {missing_token}';
    const result = buildPrompt(template, {} as any);
    expect(result).toBe('Result: ');
  });
});
