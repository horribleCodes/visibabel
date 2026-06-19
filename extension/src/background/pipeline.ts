
import { BadResponseError, runOcrTranslation } from '../shared/ocr-client.js';
import { saveLastResult } from '../shared/storage.js';
import { autoOpenResultsIfEnabled } from './popup-manager.js';
import { getConfig } from '../shared/config.js';
import { logDebug } from '../shared/logger.js';
import { setBadge } from './badge-manager.js';
import { shouldUseLayoutAugment, getParserConfig } from '../shared/layout-seam.js';
import { fetchLayoutAugment } from '../shared/layout-client.js';
import { parseLayoutAugment } from '../shared/layout-parser.js';

function broadcastResultUpdated(debug: boolean): void {
  try {
    chrome.runtime.sendMessage({ type: 'RESULT_UPDATED' }, () => {
      const message = chrome.runtime.lastError?.message || '';
      if (message && !/Receiving end does not exist/i.test(message) && debug) {
        logDebug('RESULT_UPDATED broadcast failed', { message });
      }
    });
  } catch (error) {
    if (debug) {
      logDebug('RESULT_UPDATED broadcast threw', error);
    }
  }
}

function attachSourceImage(result: any, imageData: string): any {
  if (!result || typeof result !== 'object') {
    return result;
  }
  if (typeof imageData !== 'string' || !imageData) {
    return result;
  }
  return {
    ...result,
    source_image_data: imageData,
  };
}

export async function runOcrAndPersist(imageData: string, configOverride?: Record<string, unknown>): Promise<any> {
  setBadge('ocr');
  let debug = false;
  try {
    // Prefer configOverride.debug if present, else fetch config
    let config;
    if (configOverride && typeof configOverride.debug === 'boolean') {
      debug = configOverride.debug;
    } else {
      const cfg = await getConfig();
      debug = !!cfg.debug;
    }
    config = await getConfig();
    if (configOverride) config = Object.assign({}, config, configOverride);
    if (debug) logDebug('Starting OCR/translation run', { imageData, configOverride });

    let runOutput;
    if (shouldUseLayoutAugment(config)) {
      if (debug) logDebug('Using layout-augmented OCR flow');
      const base64Image = imageData.includes(';base64,') ? imageData.split(';base64,')[1] : imageData;
      const parserConfig = getParserConfig(config);
      const [ocrOutput, layoutRaw] = await Promise.all([
        runOcrTranslation(imageData, config),
        fetchLayoutAugment(base64Image, config, parserConfig),
      ]);
      const parsed = parseLayoutAugment(layoutRaw, parserConfig);
      const hasWrappedOcrOutput =
        ocrOutput &&
        typeof ocrOutput === 'object' &&
        Object.prototype.hasOwnProperty.call(ocrOutput, 'result');
      const ocrResult = hasWrappedOcrOutput ? ocrOutput.result : ocrOutput;
      runOutput = {
        ...(hasWrappedOcrOutput && ocrOutput && typeof ocrOutput === 'object' ? ocrOutput : { config }),
        result: {
          ...(ocrResult && typeof ocrResult === 'object' ? ocrResult : {}),
          layout: {
            raw: config.layoutDebugRawPayload ? layoutRaw : undefined,
            ...parsed,
          },
        },
      };
    } else {
      runOutput = await runOcrTranslation(imageData, configOverride);
    }

    if (debug) logDebug('OCR/translation run output', runOutput);
    const hasWrappedOutput = runOutput && typeof runOutput === 'object' && Object.prototype.hasOwnProperty.call(runOutput, 'result');
    const rawResult = hasWrappedOutput ? runOutput.result : runOutput;
    const result = attachSourceImage(rawResult, imageData);
    const runId = hasWrappedOutput && runOutput.runId ? String(runOutput.runId) : undefined;

    await saveLastResult(result);
    if (debug) logDebug('Saved last result', result);
    // Broadcast result update to all extension pages
    broadcastResultUpdated(debug);
    setBadge('success');
    await autoOpenResultsIfEnabled(config, { source: 'runtime' });
    if (debug) logDebug('Auto-opened results window if enabled', config);
    return { result, runId };
  } catch (err) {
    if (err instanceof BadResponseError && err.result) {
      await saveLastResult(attachSourceImage(err.result, imageData));
      broadcastResultUpdated(debug);
    }
    setBadge('error');
    if (debug) logDebug('OCR/translation run error', err);
    throw err;
  }
}
