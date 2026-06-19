export type RequestOptions = {
  timeoutMs?: number;
  method?: string;
  headers?: HeadersInit;
  body?: BodyInit | null;
};

function buildRequestInit(options: RequestOptions): RequestInit {
  const timeoutMs = typeof options.timeoutMs === 'number' && options.timeoutMs > 0 ? options.timeoutMs : undefined;
  return {
    method: options.method || 'GET',
    headers: options.headers,
    body: options.body,
    signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
  };
}

export async function fetchOk(url: string, options: RequestOptions = {}): Promise<Response> {
  const response = await fetch(url, buildRequestInit(options));
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${url}`);
  }
  return response;
}

export async function fetchJson<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetchOk(url, options);
  return response.json() as Promise<T>;
}
