import { getConfig, saveConfig } from '../shared/config';

describe('shared config persistence', () => {
  let store: Record<string, unknown>;

  beforeEach(() => {
    store = {
      config: {
        ollamaServiceUrl: 'http://localhost:11434/',
        layoutServiceUrl: 'http://127.0.0.1:5002/',
        enableLayoutInference: true,
        glmModel: 'custom-glm-model',
      },
    };

    (globalThis as any).chrome = {
      storage: {
        local: {
          get: jest.fn((keys: string[], cb: (result: any) => void) => {
            const result: Record<string, unknown> = {};
            keys.forEach((key) => {
              result[key] = store[key];
            });
            cb(result);
          }),
          set: jest.fn((value: Record<string, unknown>, cb: () => void) => {
            store = Object.assign({}, store, value);
            cb();
          }),
        },
      },
    };
  });

  afterEach(() => {
    delete (globalThis as any).chrome;
  });

  it('merges partial updates instead of resetting unrelated fields to defaults', async () => {
    await saveConfig({ enableLayoutInference: false });
    const config = await getConfig();

    expect(config.enableLayoutInference).toBe(false);
    expect(config.layoutServiceUrl).toBe('http://127.0.0.1:5002/');
    expect(config.glmModel).toBe('custom-glm-model');
  });
});
