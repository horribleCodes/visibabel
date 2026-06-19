import { buildPrompt } from '../prompt';

describe('buildPrompt', () => {
  it('replaces tokens with values', () => {
    const template = 'Hello {name}, translate to {lang}.';
    const result = buildPrompt(template, { name: 'Alice', lang: 'French' });
    expect(result).toBe('Hello Alice, translate to French.');
  });
  it('handles missing tokens', () => {
    const template = 'Hi {foo}.';
    expect(buildPrompt(template, {})).toBe('Hi .');
  });
  it('accepts string as replacements', () => {
    expect(buildPrompt('To {target_language}', 'German')).toBe('To German');
  });
});
