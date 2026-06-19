import { getConfig } from '../shared/config.js';
import { normalizeImageSourceForOcr } from '../shared/image-source.js';
import { logDebug } from '../shared/logger.js';
import { runOcrAndPersist } from '../background/pipeline.js';
import { registerLifecycleListeners } from '../background/lifecycle-listeners.js';

jest.mock('../shared/config.js', () => ({
  getConfig: jest.fn(),
}));

jest.mock('../background/pipeline.js', () => ({
  runOcrAndPersist: jest.fn(() => Promise.resolve({ result: {} })),
}));

jest.mock('../shared/image-source.js', () => ({
  normalizeImageSourceForOcr: jest.fn(),
}));

jest.mock('../shared/logger.js', () => ({
  logDebug: jest.fn(),
}));

jest.mock('../background/popup-manager.js', () => ({
  getResultsWindowState: jest.fn(() => ({
    lastResultsWindowId: null,
    lastResultsTabId: null,
  })),
  setResultsWindowState: jest.fn(),
}));

describe('Lifecycle listeners auto-pipeline whitelist matching', () => {
  const mockedGetConfig = getConfig as jest.MockedFunction<typeof getConfig>;
  const mockedNormalizeImageSourceForOcr = normalizeImageSourceForOcr as jest.MockedFunction<typeof normalizeImageSourceForOcr>;
  const mockedLogDebug = logDebug as jest.MockedFunction<typeof logDebug>;
  const mockedRunOcrAndPersist = runOcrAndPersist as jest.MockedFunction<typeof runOcrAndPersist>;

  let onUpdatedListener: ((tabId: number, changeInfo: { status?: string }, tab: chrome.tabs.Tab) => void) | null = null;
  let executeScriptMock: jest.Mock;

  async function flushAsyncQueue(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  }

  beforeEach(() => {
    jest.clearAllMocks();
    onUpdatedListener = null;
    executeScriptMock = jest.fn(async () => [{ result: 'https://cdn.example.com/image.png' }]);

    (globalThis as any).chrome = {
      tabs: {
        onUpdated: {
          addListener: jest.fn((listener: typeof onUpdatedListener) => {
            onUpdatedListener = listener;
          }),
        },
        onRemoved: {
          addListener: jest.fn(),
        },
      },
      scripting: {
        executeScript: executeScriptMock,
      },
      windows: {
        onRemoved: {
          addListener: jest.fn(),
        },
      },
    };

    registerLifecycleListeners();
  });

  afterEach(() => {
    delete (globalThis as any).chrome;
  });

  it('runs auto-pipeline for wildcard URL match', async () => {
    mockedGetConfig.mockResolvedValueOnce({
      enableAutoPipeline: true,
      autoOcrWhitelist: 'https://example.com/*',
    } as any);

    mockedNormalizeImageSourceForOcr.mockResolvedValueOnce('data:image/png;base64,QUJD');

    onUpdatedListener!(1, { status: 'complete' }, { id: 1, url: 'https://example.com/docs/page-1' } as chrome.tabs.Tab);
    await flushAsyncQueue();

    expect(executeScriptMock).toHaveBeenCalledWith(expect.objectContaining({
      target: { tabId: 1 },
      func: expect.any(Function),
    }));
    expect(mockedNormalizeImageSourceForOcr).toHaveBeenCalledWith('https://cdn.example.com/image.png');
    expect(mockedRunOcrAndPersist).toHaveBeenCalledWith(
      'data:image/png;base64,QUJD',
      expect.objectContaining({
        enableAutoPipeline: true,
      }),
    );
  });

  it('runs auto-pipeline for wildcard subdomain pattern', async () => {
    mockedGetConfig.mockResolvedValueOnce({
      enableAutoPipeline: true,
      autoOcrWhitelist: 'https://*.my-site.org/view?*',
    } as any);

    mockedNormalizeImageSourceForOcr.mockResolvedValueOnce('data:image/png;base64,REVG');

    onUpdatedListener!(2, { status: 'complete' }, { id: 2, url: 'https://app.my-site.org/view?tab=home' } as chrome.tabs.Tab);
    await flushAsyncQueue();

    expect(mockedRunOcrAndPersist).toHaveBeenCalledWith(
      'data:image/png;base64,REVG',
      expect.objectContaining({
        enableAutoPipeline: true,
      }),
    );
  });

  it('does not run auto-pipeline when wildcard pattern does not match', async () => {
    mockedGetConfig.mockResolvedValueOnce({
      enableAutoPipeline: true,
      autoOcrWhitelist: 'https://example.com/*',
    } as any);

    onUpdatedListener!(3, { status: 'complete' }, { id: 3, url: 'https://another-site.com/page' } as chrome.tabs.Tab);
    await flushAsyncQueue();

    expect(mockedRunOcrAndPersist).not.toHaveBeenCalled();
  });

  it('does not run auto-pipeline when page has no #img element', async () => {
    mockedGetConfig.mockResolvedValueOnce({
      enableAutoPipeline: true,
      debug: true,
      autoOcrWhitelist: 'https://example.com/*',
    } as any);

    executeScriptMock.mockResolvedValueOnce([{ result: '' }]);

    onUpdatedListener!(4, { status: 'complete' }, { id: 4, url: 'https://example.com/without-image' } as chrome.tabs.Tab);
    await flushAsyncQueue();

    expect(mockedNormalizeImageSourceForOcr).not.toHaveBeenCalled();
    expect(mockedRunOcrAndPersist).not.toHaveBeenCalled();
    expect(mockedLogDebug).toHaveBeenCalledWith(
      'Auto-pipeline skipped for tab update',
      expect.objectContaining({
        tabId: 4,
        url: 'https://example.com/without-image',
        error: 'Auto-pipeline could not find an image element with id "img".',
      }),
    );
  });
});
