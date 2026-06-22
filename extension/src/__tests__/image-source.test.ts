import {
  convertWebpImageDataToJpeg,
  isWebpImageData,
  normalizeImageSourceForOcr,
  prepareImageDataForEndpoints,
} from '../shared/image-source';

describe('image-source WebP handling', () => {
  const originalCreateImageBitmap = globalThis.createImageBitmap;
  const originalOffscreenCanvas = globalThis.OffscreenCanvas;

  afterEach(() => {
    globalThis.createImageBitmap = originalCreateImageBitmap;
    globalThis.OffscreenCanvas = originalOffscreenCanvas;
    jest.restoreAllMocks();
  });

  test('isWebpImageData detects data URL mime type', () => {
    expect(isWebpImageData('data:image/webp;base64,AAAA')).toBe(true);
    expect(isWebpImageData('data:image/png;base64,QUJD')).toBe(false);
  });

  test('isWebpImageData detects RIFF/WEBP magic bytes', () => {
    const webpHeader = btoa(String.fromCharCode(
      0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00,
      0x57, 0x45, 0x42, 0x50,
    ));
    expect(isWebpImageData(`data:image/png;base64,${webpHeader}`)).toBe(true);
  });

  test('prepareImageDataForEndpoints leaves non-WebP unchanged', async () => {
    const pngDataUrl = 'data:image/png;base64,QUJD';
    await expect(prepareImageDataForEndpoints(pngDataUrl)).resolves.toBe(pngDataUrl);
  });

  test('convertWebpImageDataToJpeg returns JPEG data URL', async () => {
    const jpegBytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
    const fakeBitmap = {
      width: 2,
      height: 2,
      close: jest.fn(),
    };

    globalThis.createImageBitmap = jest.fn().mockResolvedValue(fakeBitmap) as typeof createImageBitmap;
    globalThis.OffscreenCanvas = jest.fn().mockImplementation(() => ({
      getContext: () => ({
        drawImage: jest.fn(),
      }),
      convertToBlob: jest.fn().mockResolvedValue({
        arrayBuffer: async () => jpegBytes.buffer,
      }),
    })) as unknown as typeof OffscreenCanvas;

    const webpDataUrl = 'data:image/webp;base64,QUJD';
    const converted = await convertWebpImageDataToJpeg(webpDataUrl);

    expect(converted.startsWith('data:image/jpeg;base64,')).toBe(true);
    expect(fakeBitmap.close).toHaveBeenCalled();
  });

  test('prepareImageDataForEndpoints converts WebP to JPEG', async () => {
    const jpegBytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
    const fakeBitmap = {
      width: 2,
      height: 2,
      close: jest.fn(),
    };

    globalThis.createImageBitmap = jest.fn().mockResolvedValue(fakeBitmap) as typeof createImageBitmap;
    globalThis.OffscreenCanvas = jest.fn().mockImplementation(() => ({
      getContext: () => ({
        drawImage: jest.fn(),
      }),
      convertToBlob: jest.fn().mockResolvedValue({
        arrayBuffer: async () => jpegBytes.buffer,
      }),
    })) as unknown as typeof OffscreenCanvas;

    const converted = await prepareImageDataForEndpoints('data:image/webp;base64,QUJD');
    expect(converted.startsWith('data:image/jpeg;base64,')).toBe(true);
  });
});

describe('normalizeImageSourceForOcr', () => {
  const originalFetch = (globalThis as any).fetch;

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

  test('fetched WebP responses keep WebP data URL for pipeline conversion', async () => {
    const bytes = Uint8Array.from([1, 2, 3, 4]);
    const response = {
      ok: true,
      status: 200,
      headers: {
        get: (name: string) => (name.toLowerCase() === 'content-type' ? 'image/webp' : null),
      },
      arrayBuffer: async () => bytes.buffer,
    } as unknown as Response;

    (globalThis as any).fetch = jest.fn().mockResolvedValue(response);

    const normalized = await normalizeImageSourceForOcr('https://example.com/test.webp');
    expect(normalized.startsWith('data:image/webp;base64,')).toBe(true);
  });
});
