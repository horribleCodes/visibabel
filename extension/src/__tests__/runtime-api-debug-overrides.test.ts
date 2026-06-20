import { listModelState, loadRuntimeModels, testEndpoint, unloadRuntimeModels } from '../shared/runtime-api';

describe('runtime-api debug action overrides', () => {
  const sendMessageMock = jest.fn();

  beforeEach(() => {
    sendMessageMock.mockReset();
    (globalThis as any).chrome = {
      runtime: {
        lastError: null,
        sendMessage: sendMessageMock,
      },
    };

    sendMessageMock.mockImplementation((message: any, callback: (response: any) => void) => {
      if (message.type === 'LIST_MODEL_STATE') {
        callback({
          status: 'success',
          ollamaAvailableModels: [],
          ollamaLoadedModels: [],
          ocrSdkLoadedSessions: [],
        });
        return;
      }

      if (message.type === 'LOAD_RUNTIME_MODELS' || message.type === 'UNLOAD_RUNTIME_MODELS') {
        callback({
          status: 'success',
          changedModels: [],
          failedModels: [],
        });
        return;
      }

      callback({ status: 'success' });
    });
  });

  afterEach(() => {
    delete (globalThis as any).chrome;
  });

  test('passes configOverride to TEST_ENDPOINT', async () => {
    const configOverride = { ollamaServiceUrl: 'http://127.0.0.1:22434/' };
    await testEndpoint(configOverride as any);
    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'TEST_ENDPOINT',
        configOverride,
      }),
      expect.any(Function),
    );
  });

  test('passes configOverride to LIST_MODEL_STATE', async () => {
    const configOverride = { ocrModel: 'glm-ocr:latest' };
    await listModelState(configOverride as any);
    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'LIST_MODEL_STATE',
        configOverride,
      }),
      expect.any(Function),
    );
  });

  test('passes configOverride to LOAD_RUNTIME_MODELS', async () => {
    const configOverride = { translateModel: 'kaelri/hy-mt2:1.8b' };
    await loadRuntimeModels(configOverride as any);
    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'LOAD_RUNTIME_MODELS',
        configOverride,
      }),
      expect.any(Function),
    );
  });

  test('passes configOverride to UNLOAD_RUNTIME_MODELS', async () => {
    const configOverride = { ollamaServiceUrl: 'http://localhost:11434/' };
    await unloadRuntimeModels(configOverride as any);
    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'UNLOAD_RUNTIME_MODELS',
        configOverride,
      }),
      expect.any(Function),
    );
  });

  test('passes unload options to UNLOAD_RUNTIME_MODELS', async () => {
    const configOverride = { ollamaServiceUrl: 'http://localhost:11434/' };
    await unloadRuntimeModels(configOverride as any, {
      modelNames: ['old-model:latest'],
      unloadAllLoaded: true,
    });

    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'UNLOAD_RUNTIME_MODELS',
        configOverride,
        modelNames: ['old-model:latest'],
        unloadAllLoaded: true,
      }),
      expect.any(Function),
    );
  });
});
