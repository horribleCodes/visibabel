// badge-manager.ts
// Manages browser action badge for OCR/translation pipeline and endpoint health

const BADGE_TEXT = {
  ocr: 'OCR',
  translate: 'TRN',
  success: '✓',
  error: '!',
  offline: 'OFF',
  clear: '',
};

const BADGE_COLOR = {
  ocr: '#0078D4',        // blue
  translate: '#8E24AA', // purple
  success: '#43A047',   // green
  error: '#D32F2F',     // red
  offline: '#757575',   // gray
  clear: '#00000000',   // transparent
};

export function setBadge(state: 'ocr' | 'translate' | 'success' | 'error' | 'offline' | 'clear') {
  if (!chrome?.action?.setBadgeText) return;
  chrome.action.setBadgeText({ text: BADGE_TEXT[state] });
  if (chrome?.action?.setBadgeBackgroundColor) {
    chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR[state] });
  }
}

// Dismisses success/error badge when results page is opened
export function clearBadgeIfResultBadge() {
  if (!chrome?.action?.getBadgeText) return;
  chrome.action.getBadgeText({}, (text) => {
    if (text === BADGE_TEXT.success || text === BADGE_TEXT.error) {
      setBadge('clear');
    }
  });
}

// For health checks (ollama endpoint)
export function setOfflineBadge() {
  setBadge('offline');
}

// Clears stale OFF badge once endpoint connectivity is restored.
export function clearOfflineBadgeIfPresent() {
  if (!chrome?.action?.getBadgeText) return;
  chrome.action.getBadgeText({}, (text) => {
    if (text === BADGE_TEXT.offline) {
      setBadge('clear');
    }
  });
}
