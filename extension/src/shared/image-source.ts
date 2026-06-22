function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function base64ToBytes(base64Payload: string): Uint8Array {
  const binary = atob(base64Payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
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

function extractMimeType(imageData: string): string {
  const raw = String(imageData || '').trim();
  const match = raw.match(/^data:([^;,]+)/i);
  return match?.[1]?.toLowerCase() || '';
}

export function isWebpImageData(imageData: string): boolean {
  const raw = String(imageData || '').trim();
  if (!raw) {
    return false;
  }

  if (/^data:image\/webp/i.test(raw)) {
    return true;
  }

  const payload = extractBase64Payload(raw);
  if (!payload) {
    return false;
  }

  try {
    const bytes = base64ToBytes(payload.slice(0, 16));
    if (bytes.length < 12) {
      return false;
    }
    const riff = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
    const webp = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    return riff === 'RIFF' && webp === 'WEBP';
  } catch {
    return false;
  }
}

export async function convertWebpImageDataToJpeg(imageData: string): Promise<string> {
  const payload = extractBase64Payload(imageData);
  if (!payload) {
    throw new Error('WebP image data is empty.');
  }

  const mimeType = extractMimeType(imageData) || 'image/webp';
  const bytes = base64ToBytes(payload);
  const blob = new Blob([Uint8Array.from(bytes)], { type: mimeType });
  const bitmap = await createImageBitmap(blob);

  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Failed to initialize WebP conversion canvas.');
    }

    context.drawImage(bitmap, 0, 0);
    const jpegBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
    const jpegBytes = new Uint8Array(await jpegBlob.arrayBuffer());
    return `data:image/jpeg;base64,${bytesToBase64(jpegBytes)}`;
  } finally {
    bitmap.close?.();
  }
}

export async function prepareImageDataForEndpoints(imageData: string): Promise<string> {
  if (!isWebpImageData(imageData)) {
    return imageData;
  }
  return convertWebpImageDataToJpeg(imageData);
}

export async function normalizeImageSourceForOcr(srcUrl: string): Promise<string> {
  const raw = String(srcUrl || '').trim();
  if (!raw) {
    throw new Error('Image source URL is empty.');
  }
  if (raw.startsWith('data:')) {
    return raw;
  }

  const response = await fetch(raw);
  if (!response.ok) {
    throw new Error(`Failed to fetch image (${response.status}).`);
  }

  const contentType = response.headers.get('content-type') || 'image/png';
  const bytes = new Uint8Array(await response.arrayBuffer());
  return `data:${contentType};base64,${bytesToBase64(bytes)}`;
}
