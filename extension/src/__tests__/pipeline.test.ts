import { runOcrAndPersist } from '../background/pipeline';
import { runOcrTranslation } from '../shared/ocr-client.js';
import { saveLastResult } from '../shared/storage.js';
import { autoOpenResultsIfEnabled } from '../background/popup-manager.js';
import { logDebug } from '../shared/logger.js';
import { setBadge } from '../background/badge-manager.js';
import { shouldUseLayoutAugment, getParserConfig } from '../shared/layout-seam.js';
import { fetchLayoutAugment } from '../shared/layout-client.js';
import { parseLayoutAugment } from '../shared/layout-parser.js';

jest.mock('../shared/ocr-client.js', () => ({
  runOcrTranslation: jest.fn(),
  BadResponseError: class BadResponseError extends Error {
    result: any;

    constructor(message: string, result: any) {
      super(message);
      this.result = result;
    }
  },
}));

jest.mock('../shared/storage.js', () => ({
  saveLastResult: jest.fn(),
}));

jest.mock('../background/popup-manager.js', () => ({
  autoOpenResultsIfEnabled: jest.fn(),
}));

jest.mock('../shared/config.js', () => ({
  getConfig: jest.fn(async () => ({ debug: false })),
}));

jest.mock('../shared/logger.js', () => ({
  logDebug: jest.fn(),
}));

jest.mock('../background/badge-manager.js', () => ({
  setBadge: jest.fn(),
}));

jest.mock('../shared/layout-seam.js', () => ({
  shouldUseLayoutAugment: jest.fn(() => false),
  getParserConfig: jest.fn(() => ({ chunkStrategy: 'none' })),
}));

jest.mock('../shared/layout-client.js', () => ({
  fetchLayoutAugment: jest.fn(),
}));

jest.mock('../shared/layout-parser.js', () => ({
  parseLayoutAugment: jest.fn(),
}));

describe('Pipeline RESULT_UPDATED broadcast', () => {
  const mockedRunOcrTranslation = runOcrTranslation as jest.MockedFunction<typeof runOcrTranslation>;
  const mockedSaveLastResult = saveLastResult as jest.MockedFunction<typeof saveLastResult>;
  const mockedAutoOpenResultsIfEnabled = autoOpenResultsIfEnabled as jest.MockedFunction<typeof autoOpenResultsIfEnabled>;
  const mockedLogDebug = logDebug as jest.MockedFunction<typeof logDebug>;
  const mockedSetBadge = setBadge as jest.MockedFunction<typeof setBadge>;
  const mockedShouldUseLayoutAugment = shouldUseLayoutAugment as jest.MockedFunction<typeof shouldUseLayoutAugment>;
  const mockedGetParserConfig = getParserConfig as jest.MockedFunction<typeof getParserConfig>;
  const mockedFetchLayoutAugment = fetchLayoutAugment as jest.MockedFunction<typeof fetchLayoutAugment>;
  const mockedParseLayoutAugment = parseLayoutAugment as jest.MockedFunction<typeof parseLayoutAugment>;

  beforeEach(() => {
    jest.clearAllMocks();
    const runtime: any = {
      lastError: null,
      sendMessage: jest.fn((_message: any, callback?: () => void) => {
        runtime.lastError = {
          message: 'Could not establish connection. Receiving end does not exist.',
        };
        if (callback) {
          callback();
        }
        runtime.lastError = null;
      }),
    };

    (globalThis as any).chrome = {
      runtime,
    };
  });

  afterEach(() => {
    delete (globalThis as any).chrome;
  });

  it('does not throw when RESULT_UPDATED has no receiver', async () => {
    mockedRunOcrTranslation.mockResolvedValueOnce({
      result: {
        ocr_text: 'bonjour',
        translated_text: 'hello',
      },
      config: {
        autoOpenPopupOnComplete: false,
      },
    } as any);
    mockedSaveLastResult.mockResolvedValueOnce(undefined as any);
    mockedAutoOpenResultsIfEnabled.mockResolvedValueOnce(undefined as any);

    await expect(runOcrAndPersist('data:image/png;base64,QUJD', { debug: false })).resolves.toEqual(
      expect.objectContaining({
        result: expect.objectContaining({
          translated_text: 'hello',
        }),
      })
    );

    expect((globalThis as any).chrome.runtime.sendMessage).toHaveBeenCalledWith(
      { type: 'RESULT_UPDATED' },
      expect.any(Function)
    );
    expect(mockedAutoOpenResultsIfEnabled).toHaveBeenCalled();
    expect(mockedLogDebug).not.toHaveBeenCalledWith(
      'RESULT_UPDATED broadcast failed',
      expect.anything()
    );
  });

  it('sets success badge before attempting auto-open', async () => {
    mockedRunOcrTranslation.mockResolvedValueOnce({
      result: {
        ocr_text: 'bonjour',
        translated_text: 'hello',
      },
      config: {
        autoOpenPopupOnComplete: true,
      },
    } as any);
    mockedSaveLastResult.mockResolvedValueOnce(undefined as any);
    mockedAutoOpenResultsIfEnabled.mockResolvedValueOnce(undefined as any);

    await runOcrAndPersist('data:image/png;base64,QUJD', { debug: false });

    expect(mockedSetBadge).toHaveBeenCalledWith('success');
    expect(mockedAutoOpenResultsIfEnabled).toHaveBeenCalled();

    const successOrder = mockedSetBadge.mock.invocationCallOrder.find(
      (_value, index) => mockedSetBadge.mock.calls[index]?.[0] === 'success',
    );
    const autoOpenOrder = mockedAutoOpenResultsIfEnabled.mock.invocationCallOrder[0];

    expect(successOrder).toBeDefined();
    expect(autoOpenOrder).toBeDefined();
    expect((successOrder as number) < autoOpenOrder).toBe(true);
  });

  it('runs OCR and layout augment in parallel and merges layout onto OCR result', async () => {
    mockedShouldUseLayoutAugment.mockReturnValueOnce(true);
    mockedGetParserConfig.mockReturnValueOnce({ chunkStrategy: 'prompt-only' } as any);

    let resolveOcr: ((value: any) => void) | undefined;
    let resolveLayout: ((value: any) => void) | undefined;
    mockedRunOcrTranslation.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOcr = resolve;
        }) as any,
    );
    mockedFetchLayoutAugment.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveLayout = resolve;
        }) as any,
    );
    mockedParseLayoutAugment.mockReturnValueOnce({ overlayBoxes: [{ id: 'r1' }] } as any);
    mockedSaveLastResult.mockResolvedValueOnce(undefined as any);
    mockedAutoOpenResultsIfEnabled.mockResolvedValueOnce(undefined as any);

    const pending = runOcrAndPersist('data:image/png;base64,QUJD', { debug: false, enableLayoutInference: true });

    await Promise.resolve();
    await Promise.resolve();

    expect(mockedRunOcrTranslation).toHaveBeenCalledTimes(1);
    expect(mockedFetchLayoutAugment).toHaveBeenCalledTimes(1);

    resolveOcr?.({
      result: {
        ocr_text: 'ocr-from-ollama',
        translated_text: 'translated-from-ollama',
      },
      config: {
        autoOpenPopupOnComplete: false,
      },
    });
    resolveLayout?.({ ocr_text: 'ocr-from-layout' });

    await expect(pending).resolves.toEqual(
      expect.objectContaining({
        result: expect.objectContaining({
          ocr_text: 'ocr-from-ollama',
          translated_text: 'translated-from-ollama',
          layout: expect.objectContaining({
            overlayBoxes: [{ id: 'r1' }],
          }),
        }),
      }),
    );
  });
});
