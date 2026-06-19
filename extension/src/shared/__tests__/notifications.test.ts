import { createNotification } from '../notifications';

describe('createNotification', () => {
  it('should resolve after calling chrome.notifications.create', async () => {
    // Mock chrome.notifications.create
    const createMock = jest.fn((_id, _opts, cb) => cb && cb());
    global.chrome = { notifications: { create: createMock } } as any;
    await expect(createNotification('Test message')).resolves.toBeUndefined();
    expect(createMock).toHaveBeenCalledWith(
      '',
      expect.objectContaining({
        type: 'basic',
        title: 'Visibabel',
        message: 'Test message',
        iconUrl: 'assets/icons/icon48.png',
      }),
      expect.any(Function)
    );
  });
});
