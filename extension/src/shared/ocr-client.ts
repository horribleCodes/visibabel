import { getConfig, normalizeConfig, type ExtensionConfig } from './config.js';
import { logDebug } from './logger.js';
import { buildPrompt } from './prompt.js';
import { cleanOcrText } from './ocr-text-cleaner.js';
import { buildOcrOllamaOptions } from './ollama-options.js';

function isGlmOcrModel(model: string): boolean {
  const normalized = String(model || '').trim().toLowerCase();
  return normalized.includes('glm-ocr');
}

export class NoTextDetectedError extends Error {
  constructor(message = 'No text detected after OCR.') {
    super(message);
    this.name = 'NoTextDetectedError';
  }
}

export class BadResponseError extends Error {
  result: Record<string, unknown>;

  constructor(message: string, result: Record<string, unknown>) {
    super(message);
    this.name = 'BadResponseError';
    this.result = result;
  }
}

function isValidOcrText(text: string): boolean {
  const normalized = String(text || '').trim().toLowerCase();
  const badPatterns = [
    'line text:',
    '```markdown\n\n```'
  ];
  if (!normalized) {
    return false;
  }

  // Clean and trim each bad pattern, discard if text is empty after cleaning
  for (const pattern of badPatterns) {
    let cleaned = normalized;
    if (cleaned.startsWith(pattern)) {
      cleaned = cleaned.slice(pattern.length).trim();
    }
    if (cleaned === '') {
      return false;
    }
  }
  return true;
}

function extractBase64Payload(imageData: string): string {
  const raw = String(imageData || '').trim();
  if (!raw) {
    return '';
  }

  const base64Prefix = ';base64,';
  const idx = raw.indexOf(base64Prefix);
  if (idx >= 0) {
    return raw.slice(idx + base64Prefix.length).trim();
  }

  return raw;
}

async function buildHttpError(response: Response, pathLabel: string): Promise<Error> {
  const body = await response.text().catch(() => '');
  const details = body ? ` ${body}` : '';
  return new Error(`HTTP ${response.status} at ${pathLabel}.${details}`.trim());
}

async function withRetry<T>(operation: () => Promise<T>, retryCount: number): Promise<T> {
  let lastError: unknown = null;
  const attempts = Math.max(1, Number(retryCount) + 1);

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt >= attempts) {
        throw error;
      }
    }
  }

  throw lastError || new Error('Request failed.');
}

async function postJsonWithTimeout(url: string, body: unknown, timeoutMs: number, retryCount: number, pathLabel: string): Promise<any> {
  return withRetry(async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw await buildHttpError(response, pathLabel);
      }

      return await response.json();
    } finally {
      clearTimeout(timeoutId);
    }
  }, retryCount);
}

async function runChatRequest(endpointBase: string, body: unknown, timeoutMs: number, retryCount: number, pathLabel: string): Promise<any> {
  return postJsonWithTimeout(`${endpointBase}/api/chat`, body, timeoutMs, retryCount, pathLabel || '/api/chat');
}

async function runGenerateRequest(endpointBase: string, body: unknown, timeoutMs: number, retryCount: number, pathLabel: string): Promise<any> {
  return postJsonWithTimeout(`${endpointBase}/api/generate`, body, timeoutMs, retryCount, pathLabel || '/api/generate');
}

async function runStep(
  endpointBase: string,
  mode: string,
  chatBody: unknown,
  generateBody: unknown,
  timeoutMs: number,
  retryCount: number,
  label: string,
): Promise<{ raw: any; text: string }> {
  if (mode === 'completion') {
    const raw = await runGenerateRequest(endpointBase, generateBody, timeoutMs, retryCount, `/api/generate (${label})`);
    return { raw, text: typeof raw.response === 'string' ? raw.response.trim() : '' };
  }

  if (mode === 'chat') {
    const raw = await runChatRequest(endpointBase, chatBody, timeoutMs, retryCount, `/api/chat (${label})`);
    return {
      raw,
      text: raw?.message && typeof raw.message.content === 'string' ? raw.message.content.trim() : '',
    };
  }

  let chatError: unknown = null;
  try {
    const raw = await runChatRequest(endpointBase, chatBody, timeoutMs, retryCount, `/api/chat (${label})`);
    const text = raw?.message && typeof raw.message.content === 'string' ? raw.message.content.trim() : '';
    if (text) {
      return { raw, text };
    }
  } catch (error) {
    chatError = error;
    logDebug(`${label} chat failed, falling back to completion`, {
      error: (error as Error)?.message || String(error),
    });
  }

  const fallbackRaw = await runGenerateRequest(endpointBase, generateBody, timeoutMs, retryCount, `/api/generate (${label} fallback)`);
  const fallbackText = typeof fallbackRaw.response === 'string' ? fallbackRaw.response.trim() : '';
  if (!fallbackText && chatError) {
    throw new Error(`${label} step produced no text. Chat failed first: ${(chatError as Error).message || String(chatError)}`);
  }

  return { raw: fallbackRaw, text: fallbackText };
}

async function runOcrStep(base64Image: string, config: ExtensionConfig): Promise<{ raw: any; text: string }> {
  const endpointBase = String(config.ollamaServiceUrl || '').replace(/\/+$/, '');
  const ocrPrompt = buildPrompt(config.ocrPromptTemplate, {
    target_language: config.targetLanguage,
  });

  const ocrOptions = buildOcrOllamaOptions();

  const ocrMessages: Array<{ role: string; content: string; images?: string[] }> = [];
  if (!isGlmOcrModel(config.ocrModel)) {
    ocrMessages.push({
      role: 'system',
      content: 'You are an OCR engine. Extract text faithfully with preserved reading order and line breaks.',
    });
  }
  ocrMessages.push({
    role: 'user',
    content: ocrPrompt,
    images: [base64Image],
  });

  const chatBody = {
    model: config.ocrModel,
    stream: false,
    options: ocrOptions,
    messages: ocrMessages,
  };

  const generateBody = {
    model: config.ocrModel,
    prompt: ocrPrompt,
    images: [base64Image],
    stream: false,
    options: ocrOptions,
  };

  const output = await runStep(endpointBase, config.ocrType, chatBody, generateBody, config.timeoutMs, config.retryCount, 'ocr');

  // Post-process output to remove extraneous text/artifacts
  const processedText = cleanOcrText(output.text, { dedupe: config.enableOcrDedupe });
  if (!processedText) {
    throw new NoTextDetectedError();
  }
  return { ...output, text: processedText };
}

async function runTranslateStep(sourceText: string, config: ExtensionConfig): Promise<{ raw: any; text: string }> {
  const endpointBase = String(config.ollamaServiceUrl || '').replace(/\/+$/, '');
  const translatePrompt = buildPrompt(config.translatePromptTemplate, {
    target_language: config.targetLanguage,
    ocr_text: sourceText,
  });

  const chatBody = {
    model: config.translateModel,
    stream: false,
    options: { temperature: 0 },
    messages: [
      {
        role: 'user',
        content: translatePrompt,
      },
    ],
  };

  const generateBody = {
    model: config.translateModel,
    prompt: translatePrompt,
    stream: false,
    options: { temperature: 0 },
  };

  const output = await runStep(endpointBase, config.translateType, chatBody, generateBody, config.timeoutMs, config.retryCount, 'translate');
  if (!output.text) {
    throw new Error('Translation step produced no text.');
  }

  return output;
}

export async function runOcrTranslation(imageData: string, configOverride?: Partial<ExtensionConfig>): Promise<any> {
  const baseConfig = await getConfig();
  const config = normalizeConfig(Object.assign({}, baseConfig, configOverride || {}));
  const base64Image = extractBase64Payload(imageData);

  if (!base64Image) {
    throw new Error('No image data provided');
  }

  const ocr = await runOcrStep(base64Image, config);
  const ocrText = String(ocr.text || '').trim();
  if (!ocrText) {
    throw new NoTextDetectedError();
  }

  if (!isValidOcrText(ocrText)) {
    throw new BadResponseError('OCR step produced invalid text.', {
      ocr_text: ocrText,
      translated_text: ocrText,
      skip_translation: true,
      ocr_raw: ocr.raw,
      bad_response: true,
    });
  }

  if (config.skipTranslation) {
    return {
      result: {
        ocr_text: ocrText,
        translated_text: ocrText,
        skip_translation: true,
        ocr_raw: ocr.raw,
      },
      config,
    };
  }

  const translated = await runTranslateStep(ocrText, config);
  return {
    result: {
      ocr_text: ocrText,
      translated_text: translated.text,
      skip_translation: false,
      ocr_raw: ocr.raw,
      translate_raw: translated.raw,
    },
    config,
  };
}
