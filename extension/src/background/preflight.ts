
import { fetchJson, fetchOk } from '../shared/transport.js';
import { createNotification } from '../shared/notifications.js';
import { resolveLayoutServiceUrl } from '../shared/service-health.js';

type ProgressUpdater = (stage: string, message: string, data?: Record<string, unknown>) => void;


type PreflightOptions = {
  startedStage?: string;
  progressPrefix?: string;
};



export async function runPipelinePreflightChecks(
  config: Record<string, unknown>,
  updateProgress: ProgressUpdater,
  options: PreflightOptions,
): Promise<Record<string, unknown>> {
  const endpoint = String(config.endpoint || 'http://localhost:11434/');
  const timeoutMs = Number(config.timeoutMs) || 2000;
  const effectiveConfig = { ...config };

  try {
    const tagsUrl = new URL('api/tags', endpoint).toString();
    await fetchJson(tagsUrl, { method: 'GET', timeoutMs });
    await fetchJson(tagsUrl, { method: 'GET', timeoutMs });
  } catch (error: any) {
    const pipelineError = 'Pipeline cancelled: Ollama endpoint is unreachable.';
    if (config.enableNotifications) {
      await createNotification('OCR pipeline cancelled.');
    }
    updateProgress('error', 'OCR pipeline cancelled.', {
      error: `${pipelineError} ${error?.message || String(error)}`,
    });
    throw new Error(pipelineError);
  }

  const effectiveLayoutServiceUrl = resolveLayoutServiceUrl(effectiveConfig as any);

  if (effectiveConfig.enableLayoutInference && effectiveLayoutServiceUrl) {
    try {
      const layoutUrl = new URL('health', String(effectiveLayoutServiceUrl)).toString();
      await fetchOk(layoutUrl, { method: 'GET', timeoutMs });
      effectiveConfig.layoutServiceUrl = effectiveLayoutServiceUrl;
    } catch (error: any) {
      effectiveConfig.enableLayoutInference = false;
      if (config.enableNotifications) {
        await createNotification('Layout endpoint unavailable. Continuing without layout inference...');
      }
      updateProgress(options.startedStage || 'ocr_started', 'Layout endpoint unavailable. Continuing without layout inference...', {
        warning: `Layout endpoint is unreachable. ${error?.message || String(error)}`,
      });
    }
  }

  return effectiveConfig;
}
