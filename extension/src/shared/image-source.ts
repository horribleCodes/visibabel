function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
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
