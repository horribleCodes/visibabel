import { clearBadgeIfResultBadge } from './badge-manager.js';
type ResultsWindowState = {
  lastResultsWindowId: number | null;
  lastResultsTabId: number | null;
  lastAutoResultsOpenAt: number;
  resultsOpenInFlight: Promise<void> | null;
};

const resultsWindowState: ResultsWindowState = {
  lastResultsWindowId: null,
  lastResultsTabId: null,
  lastAutoResultsOpenAt: 0,
  resultsOpenInFlight: null,
};

export function setResultsWindowState(next: Partial<ResultsWindowState>): void {
  if (typeof next.lastResultsWindowId !== 'undefined') {
    resultsWindowState.lastResultsWindowId = next.lastResultsWindowId;
  }
  if (typeof next.lastResultsTabId !== 'undefined') {
    resultsWindowState.lastResultsTabId = next.lastResultsTabId;
  }
  if (typeof next.lastAutoResultsOpenAt !== 'undefined') {
    resultsWindowState.lastAutoResultsOpenAt = next.lastAutoResultsOpenAt;
  }
  if (typeof next.resultsOpenInFlight !== 'undefined') {
    resultsWindowState.resultsOpenInFlight = next.resultsOpenInFlight;
  }
}

export function getResultsWindowState(): Readonly<ResultsWindowState> {
  return {
    lastResultsWindowId: resultsWindowState.lastResultsWindowId,
    lastResultsTabId: resultsWindowState.lastResultsTabId,
    lastAutoResultsOpenAt: resultsWindowState.lastAutoResultsOpenAt,
    resultsOpenInFlight: resultsWindowState.resultsOpenInFlight,
  };
}

function getResultsUrl(): string {
  return chrome.runtime.getURL('src/results/results.html');
}

function windowsGetAll(): Promise<any[]> {
  return new Promise((resolve) => {
    chrome.windows.getAll({ populate: true }, (wins) => resolve(wins || []));
  });
}

function windowsUpdate(windowId: number, updateInfo: chrome.windows.UpdateInfo): Promise<void> {
  return new Promise((resolve) => {
    chrome.windows.update(windowId, updateInfo, () => resolve());
  });
}

function tabsUpdate(tabId: number, updateProps: chrome.tabs.UpdateProperties): Promise<void> {
  return new Promise((resolve) => {
    chrome.tabs.update(tabId, updateProps, () => resolve());
  });
}

function windowsCreate(createData: chrome.windows.CreateData): Promise<chrome.windows.Window | undefined> {
  return new Promise((resolve) => {
    chrome.windows.create(createData, (win) => resolve(win));
  });
}

export async function openOrFocusResultsWindow(): Promise<void> {
  const resultsUrl = getResultsUrl();
  const resultsWindowUrl = `${resultsUrl}?window=1`;
  const wins = await windowsGetAll();
  const existingWindow = wins.find((win) =>
    Array.isArray(win.tabs) &&
    win.tabs.some((tab: any) => typeof tab?.url === 'string' && String(tab.url).startsWith(resultsUrl)),
  );

  if (existingWindow && Number.isInteger(existingWindow.id)) {
    const existingTab = (existingWindow.tabs || []).find((tab: any) =>
      typeof tab?.url === 'string' && String(tab.url).startsWith(resultsUrl),
    );
    const existingTabId = existingTab && Number.isInteger(existingTab.id) ? existingTab.id : null;
    await windowsUpdate(existingWindow.id, { focused: true });
    if (existingTabId !== null) {
      await tabsUpdate(existingTabId, { active: true, url: resultsWindowUrl });
      setResultsWindowState({
        lastResultsWindowId: existingWindow.id,
        lastResultsTabId: existingTabId,
        lastAutoResultsOpenAt: Date.now(),
      });
      clearBadgeIfResultBadge();
      return;
    }
  }

  const created = await windowsCreate({
    url: resultsWindowUrl,
    type: 'popup',
    focused: true,
    width: 420,
    height: 760,
  });
  const createdWindowId = created && Number.isInteger(created.id) ? (created.id as number) : null;
  const tabId = created && Array.isArray(created.tabs) && created.tabs[0] && Number.isInteger(created.tabs[0].id)
    ? created.tabs[0].id
    : null;

  setResultsWindowState({
    lastResultsWindowId: createdWindowId,
    lastResultsTabId: tabId,
    lastAutoResultsOpenAt: Date.now(),
  });
  clearBadgeIfResultBadge();
}

export async function autoOpenResultsIfEnabled(config: Record<string, unknown>, _meta?: Record<string, unknown>): Promise<void> {
  if (!config.autoOpenPopupOnComplete) {
    return;
  }
  await openOrFocusResultsWindow();
}
