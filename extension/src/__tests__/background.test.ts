// Unit tests for background logic (service worker)
// Framework: Jest

import { runOcrAndPersist } from '../background/pipeline';
import { captureRegionImage } from '../background/region-capture';
import { getLastResult } from '../shared/storage';

jest.mock('../background/pipeline', () => ({
  runOcrAndPersist: jest.fn(),
}));

jest.mock('../background/region-capture', () => ({
  captureRegionImage: jest.fn(),
}));

jest.mock('../shared/storage', () => ({
  getLastResult: jest.fn(),
}));

jest.mock('../shared/config', () => ({
  getConfig: jest.fn(),
  saveConfig: jest.fn(),
}));

describe('Service Worker', () => {

  const mockedRunOcrAndPersist = runOcrAndPersist as jest.MockedFunction<typeof runOcrAndPersist>;
  const mockedCaptureRegionImage = captureRegionImage as jest.MockedFunction<typeof captureRegionImage>;
  const mockedGetLastResult = getLastResult as jest.MockedFunction<typeof getLastResult>;
  let capturedListener: ((message: any, sender: any, sendResponse: (response?: any) => void) => boolean) | null = null;

  beforeAll(async () => {
    (globalThis as any).chrome = {
      runtime: {
        onMessage: {
          addListener: jest.fn((listener: any) => {
            capturedListener = listener;
          }),
        },
        onInstalled: { addListener: jest.fn() },
        lastError: null,
        getURL: jest.fn((path: string) => `chrome-extension://test-id/${path}`),
      },
      contextMenus: {
        removeAll: jest.fn((cb?: () => void) => cb && cb()),
        create: jest.fn(),
        onClicked: { addListener: jest.fn() },
      },
      tabs: {
        update: jest.fn(),
        query: jest.fn((_opts: any, cb: (tabs: any[]) => void) => cb([])),
        captureVisibleTab: jest.fn((_windowId: number, _opts: any, cb: (dataUrl?: string) => void) => cb('data:image/png;base64,aaa')),
        onUpdated: { addListener: jest.fn() },
        onRemoved: { addListener: jest.fn() },
      },
      windows: {
        get: jest.fn((_windowId: number, _opts: any, cb: (win?: any) => void) => cb(undefined)),
        getAll: jest.fn((_opts: any, cb: (wins: any[]) => void) => cb([])),
        update: jest.fn((windowId: number, _opts: any, cb: (win: any) => void) => cb({ id: windowId })),
        create: jest.fn((_opts: any, cb: (win: any) => void) => cb({ id: 99, tabs: [{ id: 199 }] })),
        onRemoved: { addListener: jest.fn() },
        WINDOW_ID_CURRENT: -2,
      },
      notifications: {
        create: jest.fn((_id: string, _opts: any, cb: () => void) => cb()),
        onClicked: { addListener: jest.fn() },
      },
      scripting: {
        executeScript: jest.fn(),
      },
      storage: {
        local: {
          get: jest.fn((_keys: any, cb: (result: any) => void) => cb({})),
          set: jest.fn((_value: any, cb: () => void) => cb()),
        },
      },
    };

    await import('../background/service-worker');
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should handle OCR request messages', async () => {
    expect(capturedListener).not.toBeNull();

    mockedRunOcrAndPersist.mockResolvedValueOnce({ result: { translated_text: 'hello' } } as any);

    const sendResponse = jest.fn();
    const keepChannelOpen = capturedListener!({
      type: 'RUN_OCR_TRANSLATE',
      imageData: 'img-data',
      configOverride: { retryCount: 1 },
    }, {}, sendResponse);

    expect(keepChannelOpen).toBe(true);

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(mockedRunOcrAndPersist).toHaveBeenCalledWith('img-data', { retryCount: 1 });
    expect(sendResponse).toHaveBeenCalledWith({
      status: 'success',
      result: { translated_text: 'hello' },
    });
  });

  it('should handle translation request messages', async () => {
    expect(capturedListener).not.toBeNull();

    mockedGetLastResult.mockResolvedValueOnce({
      ocr_text: 'bonjour',
      translated_text: 'hello',
    } as any);

    const sendResponse = jest.fn();
    const keepChannelOpen = capturedListener!({ type: 'GET_LAST_RESULT' }, {}, sendResponse);

    expect(keepChannelOpen).toBe(true);

    await Promise.resolve();

    expect(sendResponse).toHaveBeenCalledWith({
      status: 'success',
      result: {
        ocr_text: 'bonjour',
        translated_text: 'hello',
      },
    });
  });

  it('should handle region OCR request messages', async () => {
    expect(capturedListener).not.toBeNull();

    const region = { x: 10, y: 20, width: 100, height: 40, devicePixelRatio: 2 };
    mockedCaptureRegionImage.mockResolvedValueOnce('data:image/png;base64,cropped');
    mockedRunOcrAndPersist.mockResolvedValueOnce({ result: { translated_text: 'hello' }, runId: 'run-2' } as any);

    const sendResponse = jest.fn();
    const keepChannelOpen = capturedListener!(
      {
        type: 'RUN_OCR_TRANSLATE_REGION',
        tabId: 5,
        region,
      },
      {},
      sendResponse,
    );

    expect(keepChannelOpen).toBe(true);

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(mockedCaptureRegionImage).toHaveBeenCalledWith(5, region);
    expect(mockedRunOcrAndPersist).toHaveBeenCalledWith('data:image/png;base64,cropped', undefined);
    expect(sendResponse).toHaveBeenCalledWith({
      status: 'success',
      result: { translated_text: 'hello' },
      runId: 'run-2',
    });
  });

  it('should handle error cases gracefully', async () => {
    expect(capturedListener).not.toBeNull();

    mockedRunOcrAndPersist.mockRejectedValueOnce(new Error('OCR failed'));

    const sendResponse = jest.fn();
    const keepChannelOpen = capturedListener!({
      type: 'RUN_OCR_TRANSLATE',
      imageData: 'img-data',
    }, {}, sendResponse);

    expect(keepChannelOpen).toBe(true);

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(sendResponse).toHaveBeenCalledWith({
      status: 'error',
      error: 'OCR failed',
    });
  });
});
