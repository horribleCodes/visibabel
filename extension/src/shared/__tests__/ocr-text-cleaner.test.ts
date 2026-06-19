import { cleanOcrText } from '../ocr-text-cleaner.js';

describe('cleanOcrText', () => {
  it('removes markdown code blocks', () => {
    const input = '```markdown\nHello world!\n```';
    expect(cleanOcrText(input)).toBe('Hello world!');
  });

  it('removes leading artifacts', () => {
    expect(cleanOcrText('line text: Hello')).toBe('Hello');
    expect(cleanOcrText('Text: Something')).toBe('Something');
  });

  it('removes trailing dashes', () => {
    expect(cleanOcrText('Hello\n---')).toBe('Hello');
  });

  it('trims whitespace', () => {
    expect(cleanOcrText('   Hello   ')).toBe('Hello');
  });

  it('returns empty string for empty input', () => {
    expect(cleanOcrText('')).toBe('');
    expect(cleanOcrText(null as any)).toBe('');
  });
});
