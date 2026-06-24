
// Unit tests for OCR client logic
// Framework: Jest
import { runOcrTranslation, NoTextDetectedError } from '../shared/ocr-client';
import { setupEndpointMode } from './endpoint-mode-helper';

describe('OCR Client', () => {
  beforeEach(async () => {
    (globalThis as any).fetch = jest.fn();
    await setupEndpointMode(['ollama'], () => {
      (globalThis as any).fetch = jest.fn();
    }, 'OCR Client');
    (globalThis as any).chrome = {
      storage: {
        local: {
          get: jest.fn((_keys: string[], cb: (result: any) => void) => {
            cb({
              config: {
                ollamaServiceUrl: 'http://localhost:11434/',
                ocrModel: 'glm-ocr:latest',
                ocrType: 'generate',
                translateModel: 'kaelri/hy-mt2:1.8b',
                translateType: 'generate',
                translatePromptTemplate: 'Translate to {target_language}: {ocr_text}',
                targetLanguage: 'English',
                timeoutMs: 2000,
                retryCount: 0,
                maxImageSize: 1600,
                debug: false,
                enableNotifications: true,
                autoOpenPopupOnComplete: false,
                autoOcrWhitelist: '',
                enableLayoutInference: false,
                enableAutoPipeline: true,
                skipTranslation: false,
              },
            });
          }),
          set: jest.fn((_value: Record<string, unknown>, cb: () => void) => cb()),
        },
      },
    };
  });

  afterEach(() => {
    delete (globalThis as any).fetch;
    delete (globalThis as any).chrome;
  });

  it('should run OCR and translation via completion mode defaults', async () => {
    const fetchMock = globalThis.fetch as jest.Mock;
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ response: 'Bonjour' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ response: 'Hello' }),
      });

    const output = await runOcrTranslation('data:image/png;base64,QUJD', { retryCount: 0 });
    expect(output.result).toEqual(
      expect.objectContaining({
        ocr_text: 'Bonjour',
        translated_text: 'Hello',
        skip_translation: false,
      })
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:11434/api/generate');
    expect(fetchMock.mock.calls[1][0]).toBe('http://localhost:11434/api/generate');
    const ocrBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(ocrBody.options.stop).toEqual(['<|endoftext|>', '<|user|>', '```markdown']);
    expect(ocrBody.prompt).toBe('Text Recognition:');
    const translateBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(translateBody.prompt).toBe('Translate to English: Bonjour');
  });

  it('should skip translation when skipTranslation is enabled', async () => {
    const fetchMock = globalThis.fetch as jest.Mock;
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ response: 'Already English' }),
    });

    const output = await runOcrTranslation('data:image/png;base64,QUJD', { skipTranslation: true });
    expect(output.result).toEqual(
      expect.objectContaining({
        ocr_text: 'Already English',
        translated_text: 'Already English',
        skip_translation: true,
      })
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('should fallback to completion when chat fails', async () => {
    const fetchMock = globalThis.fetch as jest.Mock;

    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/chat')) {
        return {
          ok: false,
          json: async () => ({ error: 'Chat failed' }),
        };
      }

      if (url.includes('/api/generate')) {
        return {
          ok: true,
          json: async () => ({ response: 'Hello world' }),
        };
      }

      throw new Error(`Unexpected fetch to ${url}`);
    });

    const output = await runOcrTranslation('data:image/png;base64,QUJD', {
      ocrType: 'chat_fallback',
      skipTranslation: true,
      retryCount: 0,
    });

    expect(output.result).toEqual(
      expect.objectContaining({
        ocr_text: 'Hello world',
        skip_translation: true,
      })
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:11434/api/chat');
    expect(fetchMock.mock.calls[1][0]).toBe('http://localhost:11434/api/generate');
    const ocrBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(ocrBody.messages.some((m: { role: string }) => m.role === 'system')).toBe(false);
  });

  it('should throw NoTextDetectedError when OCR returns empty output', async () => {
    const fetchMock = globalThis.fetch as jest.Mock;
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: { content: '' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ response: '' }),
      });

    await expect(runOcrTranslation('data:image/png;base64,QUJD', {ocrType: 'completion'})).rejects.toBeInstanceOf(NoTextDetectedError);
  });
});
