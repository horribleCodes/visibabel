// Unit tests for storage logic
// Framework: Jest

import { saveLastResult, getLastResult } from '../shared/storage';

describe('Storage', () => {
  let store: Record<string, unknown>;

  beforeEach(() => {
    store = {};
    (globalThis as any).chrome = {
      storage: {
        local: {
          get: jest.fn((keys: string[], cb: (result: any) => void) => {
            const out: Record<string, unknown> = {};
            keys.forEach((key) => {
              out[key] = store[key];
            });
            cb(out);
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

  it('should return null when no result has been saved yet', async () => {
    const result = await getLastResult();
    expect(result).toBeNull();
  });

  it('should persist and read back last OCR result', async () => {
    const payload = { ocr_text: 'bonjour', translated_text: 'hello' };
    await saveLastResult(payload);
    await expect(getLastResult()).resolves.toEqual(payload);
  });
});
