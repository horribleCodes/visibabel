// Unit tests for runtime service worker auto-popup behavior
// Framework: Jest

type Listener = (...args: any[]) => any;


import { setupEndpointMode } from './endpoint-mode-helper';

describe('Runtime Service Worker Auto Results Window', () => {
  let runtimeMessageListener: Listener | null = null;
  let windowsGetMock: jest.Mock;
  let windowsGetAllMock: jest.Mock;
  let windowsUpdateMock: jest.Mock;
  let windowsCreateMock: jest.Mock;
  let tabsUpdateMock: jest.Mock;
  let notificationsCreateMock: jest.Mock;

  beforeEach(async () => {
    jest.resetModules();
    (globalThis as any).fetch = jest.fn();
    await setupEndpointMode(['ollama'], () => {
      (globalThis as any).fetch = jest.fn();
    }, 'Runtime Service Worker Auto Results Window');

    runtimeMessageListener = null;

    windowsGetMock = jest.fn((_windowId: number, _opts: any, cb: (win?: any) => void) => cb(undefined));
    windowsGetAllMock = jest.fn((_opts: any, cb: (wins: any[]) => void) => cb([]));
    windowsUpdateMock = jest.fn((windowId: number, _opts: any, cb: (win: any) => void) => cb({ id: windowId }));
    windowsCreateMock = jest.fn((_opts: any, cb: (win: any) => void) => cb({ id: 99, tabs: [{ id: 199 }] }));
    tabsUpdateMock = jest.fn((tabId: number, _opts: any, cb: (tab: any) => void) => cb({ id: tabId }));
    notificationsCreateMock = jest.fn((_id: string, _opts: any, cb: () => void) => cb());

    (globalThis as any).__VISIBABEL_ENABLE_TEST_HOOKS__ = true;
    (globalThis as any).__VISIBABEL_TEST_HOOKS__ = undefined;

    (globalThis as any).chrome = {
      runtime: {
        lastError: null,
        getURL: jest.fn((path: string) => `chrome-extension://test-id/${path}`),
        onInstalled: { addListener: jest.fn() },
        onMessage: {
          addListener: jest.fn((listener: Listener) => {
            runtimeMessageListener = listener;
          }),
        },
      },
      contextMenus: {
        removeAll: jest.fn((cb?: () => void) => cb && cb()),
        create: jest.fn(),
        onClicked: { addListener: jest.fn() },
      },
      tabs: {
        update: tabsUpdateMock,
        query: jest.fn((_opts: any, cb: (tabs: any[]) => void) => cb([])),
        captureVisibleTab: jest.fn((_windowId: number, _opts: any, cb: (dataUrl?: string) => void) => cb('data:image/png;base64,aaa')),
        onUpdated: { addListener: jest.fn() },
        onRemoved: { addListener: jest.fn() },
      },
      windows: {
        get: windowsGetMock,
        getAll: windowsGetAllMock,
        update: windowsUpdateMock,
        create: windowsCreateMock,
        onRemoved: { addListener: jest.fn() },
        WINDOW_ID_CURRENT: -2,
      },
      notifications: {
        create: notificationsCreateMock,
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

  afterEach(() => {
    delete (globalThis as any).__VISIBABEL_ENABLE_TEST_HOOKS__;
    delete (globalThis as any).__VISIBABEL_TEST_HOOKS__;
    delete (globalThis as any).chrome;
    delete (globalThis as any).fetch;
  });

  it('Triggering auto-open with no existing results window opens a new window', async () => {
    const hooks = (globalThis as any).__VISIBABEL_TEST_HOOKS__;
    expect(hooks).toBeDefined();

    hooks.setResultsWindowState({
      lastResultsWindowId: null,
      lastResultsTabId: null,
      lastAutoResultsOpenAt: 0,
      resultsOpenInFlight: null,
    });

    await hooks.autoOpenResultsIfEnabled({ autoOpenPopupOnComplete: true }, { source: 'test' });

    expect(windowsCreateMock).toHaveBeenCalledTimes(1);
    expect(windowsUpdateMock).not.toHaveBeenCalled();
    expect(tabsUpdateMock).not.toHaveBeenCalled();
  });

  it('Triggering auto-open with an existing results window focuses and reuses that window/tab', async () => {
    const hooks = (globalThis as any).__VISIBABEL_TEST_HOOKS__;
    expect(hooks).toBeDefined();

    const popupBaseUrl = 'chrome-extension://test-id/src/results/results.html';

    windowsGetAllMock.mockImplementationOnce((_opts: any, cb: (wins: any[]) => void) => {
      cb([
        {
          id: 42,
          focused: false,
          tabs: [
            {
              id: 420,
              active: false,
              url: popupBaseUrl,
            },
          ],
        },
      ]);
    });

    windowsGetMock.mockImplementationOnce((_windowId: number, _opts: any, cb: (win?: any) => void) => {
      cb({ id: 42, tabs: [{ id: 420, url: popupBaseUrl }] });
    });

    hooks.setResultsWindowState({
      lastResultsWindowId: null,
      lastResultsTabId: null,
      lastAutoResultsOpenAt: 0,
      resultsOpenInFlight: null,
    });

    await hooks.autoOpenResultsIfEnabled({ autoOpenPopupOnComplete: true }, { source: 'test' });

    expect(windowsCreateMock).not.toHaveBeenCalled();
    expect(windowsUpdateMock).toHaveBeenCalledWith(42, { focused: true }, expect.any(Function));
    expect(tabsUpdateMock).toHaveBeenCalledWith(
      420,
      { active: true, url: 'chrome-extension://test-id/src/results/results.html?window=1' },
      expect.any(Function),
    );
  });

  it('Triggering auto-open still happens only after output is saved for RUN_OCR_TRANSLATE', async () => {
    const hooks = (globalThis as any).__VISIBABEL_TEST_HOOKS__;
    expect(hooks).toBeDefined();
    expect(runtimeMessageListener).not.toBeNull();

    const callOrder: string[] = [];


    // Patch runOcrAndPersist to simulate the pipeline and call order
    jest.spyOn(require('../background/pipeline'), 'runOcrAndPersist').mockImplementation(async (_imageData, _configOverride) => {
      callOrder.push('runOcrTranslation');
      callOrder.push('saveLastResult');
      callOrder.push('autoOpenResultsIfEnabled');
      return {
        result: { translated_text: 'new-output' },
        runId: 'run-1',
      };
    });

    const sendResponse = jest.fn();
    const keepChannelOpen = runtimeMessageListener!(
      { type: 'RUN_OCR_TRANSLATE', imageData: 'data:image/png;base64,abc', runId: 'run-1' },
      {},
      sendResponse,
    );

    expect(keepChannelOpen).toBe(true);

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(callOrder).toEqual(['runOcrTranslation', 'saveLastResult', 'autoOpenResultsIfEnabled']);
    expect(sendResponse).toHaveBeenCalledWith({
      status: 'success',
      result: { translated_text: 'new-output' },
      runId: 'run-1',
    });
  });

  it('Preflight cancels pipeline with notification when Ollama endpoint is unreachable', async () => {
    const hooks = (globalThis as any).__VISIBABEL_TEST_HOOKS__;
    expect(hooks).toBeDefined();

    const fetchMock = globalThis.fetch as jest.Mock;
    fetchMock.mockRejectedValue(new Error('connect ECONNREFUSED'));

    const updateProgress = jest.fn();
    await expect(
      hooks.runPipelinePreflightChecks({
        ollamaServiceUrl: 'http://localhost:11434/',
        timeoutMs: 1500,
        enableNotifications: true,
        enableLayoutInference: true,
      }, updateProgress, {
        startedStage: 'ocr_started',
        progressPrefix: 'OCR',
      })
    ).rejects.toThrow('Pipeline cancelled: Ollama endpoint is unreachable.');

    expect(notificationsCreateMock).toHaveBeenCalledTimes(1);
    expect(updateProgress).toHaveBeenCalledWith(
      'error',
      'OCR pipeline cancelled.',
      expect.objectContaining({
        error: expect.stringContaining('Pipeline cancelled: Ollama endpoint is unreachable.'),
      }),
    );
  });

  it('Preflight warns and disables layout inference for current run when layout endpoint is unreachable', async () => {
    const hooks = (globalThis as any).__VISIBABEL_TEST_HOOKS__;
    expect(hooks).toBeDefined();

    const okJson = async () => ({ models: [{ model: 'glm-ocr:latest' }] });
    const fetchMock = globalThis.fetch as jest.Mock;
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: okJson })
      .mockResolvedValueOnce({ ok: true, json: okJson })
      .mockRejectedValueOnce(new Error('layout service down'));

    const updateProgress = jest.fn();
    const effectiveConfig = await hooks.runPipelinePreflightChecks({
      ollamaServiceUrl: 'http://localhost:11434/',
      layoutServiceUrl: 'http://127.0.0.1:5002',
      timeoutMs: 2000,
      enableNotifications: true,
      enableLayoutInference: true,
    }, updateProgress, {
      startedStage: 'ocr_started',
      progressPrefix: 'OCR',
    });

    expect(effectiveConfig.enableLayoutInference).toBe(false);
    expect(notificationsCreateMock).toHaveBeenCalledTimes(1);
    expect(updateProgress).toHaveBeenCalledWith(
      'ocr_started',
      'Layout endpoint unavailable. Continuing without layout inference...',
      expect.objectContaining({
        warning: expect.stringContaining('Layout endpoint is unreachable.'),
      }),
    );
  });
});
