import { readServiceHealth, resolveConfiguredLayoutServiceUrl, resolveLayoutServiceUrl } from '../shared/service-health';

jest.mock('../shared/transport', () => ({
  fetchOk: jest.fn(),
}));

jest.mock('../background/badge-manager', () => ({
  setOfflineBadge: jest.fn(),
  clearOfflineBadgeIfPresent: jest.fn(),
}));

import { fetchOk } from '../shared/transport';
import { clearOfflineBadgeIfPresent, setOfflineBadge } from '../background/badge-manager';

describe('service-health layout endpoint resolution', () => {
  test('uses explicit layoutServiceUrl when configured', () => {
    expect(resolveLayoutServiceUrl({
      ollamaServiceUrl: 'http://localhost:11434/',
      layoutServiceUrl: 'http://127.0.0.1:9010/',
      enableLayoutInference: true,
    } as any)).toBe('http://127.0.0.1:9010/');
  });

  test('infers layout service endpoint from Ollama endpoint when inference enabled', () => {
    expect(resolveLayoutServiceUrl({
      ollamaServiceUrl: 'http://localhost:11434/',
      enableLayoutInference: true,
    } as any)).toBe('http://localhost:5002/');
  });

  test('still infers layout service endpoint when inference disabled', () => {
    expect(resolveLayoutServiceUrl({
      ollamaServiceUrl: 'http://localhost:11434/',
      enableLayoutInference: false,
    } as any)).toBe('http://localhost:5002/');
  });

  test('still resolves configured endpoint when inference disabled', () => {
    expect(resolveConfiguredLayoutServiceUrl({
      ollamaServiceUrl: 'http://localhost:11434/',
      enableLayoutInference: false,
    } as any)).toBe('http://localhost:5002/');
  });
});

describe('service-health action badge behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('clears OFF badge when Ollama health check recovers', async () => {
    const fetchOkMock = fetchOk as jest.MockedFunction<typeof fetchOk>;
    fetchOkMock
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(undefined as any)
      .mockResolvedValueOnce(undefined as any);

    const config = {
      ollamaServiceUrl: 'http://localhost:11434/',
      timeoutMs: 1000,
      layoutServiceUrl: 'http://127.0.0.1:5002/',
    } as any;

    await readServiceHealth(config);
    expect(setOfflineBadge).toHaveBeenCalledTimes(1);
    expect(clearOfflineBadgeIfPresent).not.toHaveBeenCalled();

    await readServiceHealth(config);
    expect(clearOfflineBadgeIfPresent).toHaveBeenCalledTimes(1);
  });
});
