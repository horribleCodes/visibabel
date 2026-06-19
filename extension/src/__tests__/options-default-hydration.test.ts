/**
 * @jest-environment jsdom
 */

import fs from 'node:fs';
import path from 'node:path';
import { defaultConfig } from '../shared/config';

const srcRoot = path.resolve(__dirname, '..');

const mockedGetRuntimeConfig = jest.fn();
const mockedListModelState = jest.fn();

jest.mock('../shared/runtime-api', () => ({
  getRuntimeConfig: (...args: unknown[]) => mockedGetRuntimeConfig(...args),
  listModelState: (...args: unknown[]) => mockedListModelState(...args),
  loadRuntimeModels: jest.fn(),
  saveRuntimeConfig: jest.fn(),
  testEndpoint: jest.fn(),
  unloadRuntimeModels: jest.fn(),
}));

describe('options default hydration', () => {
  beforeEach(() => {
    jest.resetModules();
    mockedGetRuntimeConfig.mockReset();
    mockedListModelState.mockReset();

    mockedGetRuntimeConfig.mockRejectedValue(new Error('No response from background script.'));
    mockedListModelState.mockResolvedValue({
      ollamaAvailableModels: [],
      ollamaLoadedModels: [],
      ocrSdkLoadedSessions: [],
    });

    const html = fs.readFileSync(path.resolve(srcRoot, 'options', 'options.html'), 'utf8');
    document.documentElement.innerHTML = html;
  });

  test('renders defaults when runtime config cannot be fetched', async () => {
    await import('../options/options');

    document.dispatchEvent(new Event('DOMContentLoaded'));
    await Promise.resolve();
    await Promise.resolve();

    const endpoint = document.getElementById('endpoint') as HTMLInputElement;
    const glmModel = document.getElementById('glmModel') as HTMLInputElement;
    const targetLanguage = document.getElementById('targetLanguage') as HTMLInputElement;
    const layoutChunkStrategy = document.getElementById('layoutChunkStrategy') as HTMLSelectElement;
    const layoutMaxChunkSize = document.getElementById('layoutMaxChunkSize') as HTMLInputElement;
    const layoutDebugRawPayload = document.getElementById('layoutDebugRawPayload') as HTMLInputElement;

    expect(endpoint.value).toBe(defaultConfig.ollamaServiceUrl);
    expect(glmModel.value).toBe(defaultConfig.glmModel);
    expect(targetLanguage.value).toBe(defaultConfig.targetLanguage);
    expect(layoutChunkStrategy.value).toBe(defaultConfig.layoutChunkStrategy);
    expect(layoutMaxChunkSize.value).toBe(String(defaultConfig.layoutMaxChunkSize));
    expect(layoutDebugRawPayload.checked).toBe(defaultConfig.layoutDebugRawPayload);
  });
});
