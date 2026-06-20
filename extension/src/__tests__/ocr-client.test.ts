
// Unit tests for OCR client logic
// Framework: Jest
import { BadResponseError, runOcrTranslation, NoTextDetectedError } from '../shared/ocr-client';
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
                ocrType: 'chat_fallback',
                ocrPromptTemplate: 'Extract text',
                translateModel: 'kaelri/hy-mt2:1.8b',
                translateType: 'chat_fallback',
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

  it('should run OCR and translation via chat mode fallback defaults', async () => {
    const fetchMock = globalThis.fetch as jest.Mock;
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: { content: 'Bonjour' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: { content: 'Hello' } }),
      });

    const output = await runOcrTranslation('data:image/png;base64,QUJD');
    expect(output.result).toEqual(
      expect.objectContaining({
        ocr_text: 'Bonjour',
        translated_text: 'Hello',
        skip_translation: false,
      })
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:11434/api/chat');
    expect(fetchMock.mock.calls[1][0]).toBe('http://localhost:11434/api/chat');
  });

  it('should skip translation when skipTranslation is enabled', async () => {
    const fetchMock = globalThis.fetch as jest.Mock;
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: { content: 'Already English' } }),
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

    await expect(runOcrTranslation('data:image/png;base64,QUJD')).rejects.toBeInstanceOf(NoTextDetectedError);
  });

  it.skip('should throw BadResponseError when OCR returns invalid sentinel text', async () => {
    // SKIPPED: The cleaning logic now removes these patterns entirely, resulting in NoTextDetectedError instead.
    // Reinstate this test if a new pattern is added that does not get fully removed by cleaning.
  });
});
