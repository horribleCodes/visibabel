export async function getLastResult(): Promise<any> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['lastResult'], (result) => {
      resolve(result?.lastResult || null);
    });
  });
}

export async function saveLastResult(result: any): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ lastResult: result }, () => resolve());
  });
}
