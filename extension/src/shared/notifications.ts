/**
 * Shared Chrome notification utility for consistent notification creation.
 */
export function createNotification(message: string): Promise<void> {
  return new Promise((resolve) => {
    chrome.notifications.create(
      '',
      {
        type: 'basic',
        title: 'Visibabel',
        message,
        iconUrl: 'assets/icons/icon48.png',
      },
      () => resolve(),
    );
  });
}
