import { getLastResult, saveLastResult } from '../storage';

describe('storage', () => {
  beforeEach(() => {
    global.chrome = {
      storage: {
        local: {
          get: jest.fn((_keys, cb) => cb({ lastResult: 'foo' })),
          set: jest.fn((_obj, cb) => cb && cb()),
        },
      },
    } as any;
  });

  it('getLastResult returns lastResult', async () => {
    await expect(getLastResult()).resolves.toBe('foo');
  });

  it('saveLastResult sets lastResult', async () => {
    await expect(saveLastResult('bar')).resolves.toBeUndefined();
    expect(global.chrome.storage.local.set).toHaveBeenCalledWith({ lastResult: 'bar' }, expect.any(Function));
  });
});
