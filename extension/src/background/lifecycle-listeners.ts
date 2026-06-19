// Handles tab and window lifecycle listeners for background cleanup and future state management

import { getConfig } from '../shared/config.js';
import { logDebug } from '../shared/logger.js';
import { getAutoPipelineImageData } from './auto-pipeline-image.js';
import { runOcrAndPersist } from './pipeline.js';
import { getResultsWindowState, setResultsWindowState } from './popup-manager.js';

// Helper to check if a URL matches a comma/space-separated whitelist pattern
function wildcardPatternToRegex(pattern: string): RegExp | null {
  if (!pattern.includes('*')) {
    return null;
  }

  // Escape regex metacharacters, then treat '*' as a wildcard that spans any substring.
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  const wildcardRegex = escaped.replace(/\*/g, '.*');
  return new RegExp(`^${wildcardRegex}$`, 'i');
}

function urlMatchesWhitelist(url: string, whitelist: string): boolean {
  if (!whitelist) return false;
  const patterns = whitelist.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
  return patterns.some((pattern) => {
    if (!pattern) {
      return false;
    }

    const wildcardRegex = wildcardPatternToRegex(pattern);
    if (wildcardRegex) {
      return wildcardRegex.test(url);
    }

    return url.includes(pattern);
  });
}

export function registerLifecycleListeners(): void {
  // Auto-pipeline whitelist: run OCR pipeline on tab update if enabled and URL matches
  if (chrome.tabs?.onUpdated) {
    chrome.tabs.onUpdated.addListener((_tabId: number, changeInfo: { status?: string }, tab: chrome.tabs.Tab) => {
      if (!changeInfo || changeInfo.status !== 'complete' || !tab || !tab.url || typeof tab.id !== 'number') {
        return;
      }
      getConfig().then((config) => {
        if (config && config.enableAutoPipeline && config.autoOcrWhitelist && urlMatchesWhitelist(tab.url!, config.autoOcrWhitelist)) {
          // Only run if not already running for this tab (could be improved with per-tab state)
          getAutoPipelineImageData(tab.id!)
            .then((imageData) => runOcrAndPersist(imageData, config))
            .catch((error) => {
              if (config.debug) {
                logDebug('Auto-pipeline skipped for tab update', {
                  tabId: tab.id,
                  url: tab.url,
                  error: error instanceof Error ? error.message : String(error),
                });
              }
            });
        }
      });
    });
  }

  // Per-tab cleanup: clear results window state if the removed tab was the tracked results tab

  if (chrome.tabs?.onRemoved) {
    chrome.tabs.onRemoved.addListener((tabId: number) => {
      const resultsState = getResultsWindowState();
      if (resultsState.lastResultsTabId === tabId) {
        setResultsWindowState({ lastResultsTabId: null });
      }
    });
  }

  // Results window cleanup: clear state if the removed window was the tracked results window
  if (chrome.windows?.onRemoved) {
    chrome.windows.onRemoved.addListener((windowId: number) => {
      const resultsState = getResultsWindowState();
      if (resultsState.lastResultsWindowId === windowId) {
        setResultsWindowState({ lastResultsWindowId: null });
      }
    });
  }
}
