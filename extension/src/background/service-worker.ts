import { autoOpenResultsIfEnabled, setResultsWindowState } from './popup-manager.js';
import { runPipelinePreflightChecks } from './preflight.js';
import { registerRuntimeMessageRouter } from './message-router.js';
import { registerContextMenuHandlers } from './context-menu.js';
import { registerLifecycleListeners } from './lifecycle-listeners.js';

registerRuntimeMessageRouter();
registerContextMenuHandlers();
registerLifecycleListeners();

if ((globalThis as any).__VISIBABEL_ENABLE_TEST_HOOKS__) {
  (globalThis as any).__VISIBABEL_TEST_HOOKS__ = {
    setResultsWindowState,
    autoOpenResultsIfEnabled,
    runPipelinePreflightChecks,
  };
}
