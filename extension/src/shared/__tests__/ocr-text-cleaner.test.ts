import { cleanOcrText, dedupeRepeatedOcrOutput } from '../ocr-text-cleaner.js';

describe('dedupeRepeatedOcrOutput', () => {
  it('keeps first copy when full output repeats', () => {
    expect(dedupeRepeatedOcrOutput('Hello\nWorldHello\nWorld')).toBe('Hello\nWorld');
  });

  it('keeps first copy when output repeats three times', () => {
    const unit = 'abc';
    expect(dedupeRepeatedOcrOutput(unit.repeat(3))).toBe(unit);
  });

  it('strips trailing repeated suffix', () => {
    expect(dedupeRepeatedOcrOutput('Title\nabcabc')).toBe('Title\nabc');
  });

  it('keeps first copy when block repeats with newline separator', () => {
    expect(dedupeRepeatedOcrOutput('Hi\nHi')).toBe('Hi');
  });

  it('returns short or unique text unchanged', () => {
    expect(dedupeRepeatedOcrOutput('Hello')).toBe('Hello');
    expect(dedupeRepeatedOcrOutput('a---b')).toBe('a---b');
  });
});

describe('cleanOcrText', () => {
  it('removes markdown code blocks', () => {
    const input = '```markdown\nHello world!\n```';
    expect(cleanOcrText(input)).toBe('Hello world!');
  });

  it('removes leading artifacts', () => {
    expect(cleanOcrText('line text: Hello')).toBe('Hello');
    expect(cleanOcrText('Text: Something')).toBe('Something');
  });

  it('removes trailing dash runs used as EOS artifacts', () => {
    expect(cleanOcrText('Hello\n---')).toBe('Hello');
  });

  it('preserves mid-document dashes', () => {
    expect(cleanOcrText('Section A\n---\nSection B')).toBe('Section A\n---\nSection B');
  });

  it('dedupes repeated OCR blocks after other cleaning', () => {
    expect(cleanOcrText('Hi\nHi')).toBe('Hi');
    expect(cleanOcrText('abcabc')).toBe('abc');
  });

  it('trims whitespace', () => {
    expect(cleanOcrText('   Hello   ')).toBe('Hello');
  });

  it('returns empty string for empty input', () => {
    expect(cleanOcrText('')).toBe('');
    expect(cleanOcrText(null as any)).toBe('');
  });

  it('skips dedupe when disabled', () => {
    expect(cleanOcrText('Hi\nHi', { dedupe: false })).toBe('Hi\nHi');
    expect(cleanOcrText('abcabc', { dedupe: false })).toBe('abcabc');
  });
});
