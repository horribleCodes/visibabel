import { normalizeImageSourceForOcr } from '../shared/image-source';

describe('context-menu image normalization', () => {
  const originalFetch = (globalThis as any).fetch;

  beforeEach(() => {
    jest.restoreAllMocks();
  });

  afterEach(() => {
    (globalThis as any).fetch = originalFetch;
  });

  test('returns data URL unchanged', async () => {
    const dataUrl = 'data:image/png;base64,aGVsbG8=';
    await expect(normalizeImageSourceForOcr(dataUrl)).resolves.toBe(dataUrl);
  });

  test('fetches remote image and returns base64 data URL', async () => {
    const bytes = Uint8Array.from([1, 2, 3, 4]);
    const response = {
      ok: true,
      status: 200,
      headers: {
        get: (name: string) => (name.toLowerCase() === 'content-type' ? 'image/jpeg' : null),
      },
      arrayBuffer: async () => bytes.buffer,
    } as unknown as Response;

    (globalThis as any).fetch = jest.fn().mockResolvedValue(response);

    const normalized = await normalizeImageSourceForOcr('https://example.com/test.jpg');
    expect(normalized.startsWith('data:image/jpeg;base64,')).toBe(true);
  });
});
