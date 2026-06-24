import { test, expect } from '@playwright/test';

import { setupEndpointMode } from './helpers/endpoint-mode-helper';

test.describe('endpoint mode helper', () => {
  const originalFetch = globalThis.fetch;
  const originalMode = process.env.VISIBABEL_ENDPOINT_MODE;
  const originalFailOnFallback = process.env.VISIBABEL_FAIL_ON_FALLBACK;

  test.afterEach(() => {
    globalThis.fetch = originalFetch;
    if (typeof originalMode === 'undefined') {
      delete process.env.VISIBABEL_ENDPOINT_MODE;
    } else {
      process.env.VISIBABEL_ENDPOINT_MODE = originalMode;
    }

    if (typeof originalFailOnFallback === 'undefined') {
      delete process.env.VISIBABEL_FAIL_ON_FALLBACK;
    } else {
      process.env.VISIBABEL_FAIL_ON_FALLBACK = originalFailOnFallback;
    }
  });

  test('registers mock handlers when provided even if endpoint probes are healthy in auto mode', async () => {
    delete process.env.VISIBABEL_ENDPOINT_MODE;
    delete process.env.VISIBABEL_FAIL_ON_FALLBACK;

    const fetchCalls: string[] = [];
    globalThis.fetch = (async (url: string | URL) => {
      fetchCalls.push(String(url));
      return { ok: true } as Response;
    }) as typeof fetch;

    let mockCalled = 0;
    const testContext = { title: 'healthy endpoints', annotations: [] as Array<{ type: string; description: string }> };

    await setupEndpointMode(testContext, ['ollama', 'layout'], () => {
      mockCalled += 1;
    });

    expect(mockCalled).toBe(1);
    expect(fetchCalls.some((url) => url.endsWith('/api/tags'))).toBe(true);
    expect(fetchCalls.some((url) => url.endsWith('/health'))).toBe(true);
    expect(testContext.annotations.some((entry) => entry.type === 'warning')).toBe(false);
  });

  test('falls back to mock when required endpoint probe fails in auto mode and emits warning', async () => {
    process.env.VISIBABEL_ENDPOINT_MODE = 'auto';
    process.env.VISIBABEL_FAIL_ON_FALLBACK = 'false';

    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (message?: unknown, ...optionalParams: unknown[]) => {
      warnings.push(String(message ?? ''));
      if (optionalParams.length > 0) {
        warnings.push(optionalParams.map(String).join(' '));
      }
    };

    try {
      globalThis.fetch = (async () => {
        throw new Error('offline');
      }) as typeof fetch;

      let mockCalled = 0;
      const testContext = { title: 'offline ollama', annotations: [] as Array<{ type: string; description: string }> };

      await setupEndpointMode(testContext, ['ollama'], () => {
        mockCalled += 1;
      });

      expect(mockCalled).toBe(1);
      const warningAnnotation = testContext.annotations.find((entry) => entry.type === 'warning');
      expect(warningAnnotation).toBeDefined();
      expect(String(warningAnnotation?.description || '')).toContain('[endpoint-fallback]');
      expect(String(warningAnnotation?.description || '')).toContain('ollama');
      expect(warnings.some((line) => line.includes('[endpoint-fallback]'))).toBe(true);
    } finally {
      console.warn = originalWarn;
    }
  });

  test('throws when fallback happens and fail-on-fallback is enabled', async () => {
    process.env.VISIBABEL_ENDPOINT_MODE = 'auto';
    process.env.VISIBABEL_FAIL_ON_FALLBACK = 'true';

    globalThis.fetch = (async () => {
      throw new Error('offline');
    }) as typeof fetch;

    const testContext = { title: 'strict fallback handling', annotations: [] as Array<{ type: string; description: string }> };

    let mockCalled = 0;
    await expect(
      setupEndpointMode(testContext, ['layout'], () => {
        mockCalled += 1;
      }),
    ).rejects.toThrow('endpoint-fallback');

    expect(mockCalled).toBe(1);
  });
});
