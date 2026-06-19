// Shared logger/debug serializer utility
const MAX_DEBUG_VALUE_CHARS = 300;
const MAX_DEBUG_VALUE_LINE_BREAKS = 5;
const MAX_DEBUG_ARRAY_ITEMS = 6;
const MAX_DEBUG_OBJECT_KEYS = 20;

function countLineBreaks(value: string): number {
  const matches = value.match(/\n/g);
  return matches ? matches.length : 0;
}

function truncateDebugValue(value: string): string {
  const lineBreaks = countLineBreaks(value);
  if (
    (value.length <= MAX_DEBUG_VALUE_CHARS && MAX_DEBUG_VALUE_CHARS > 0) &&
    (lineBreaks <= MAX_DEBUG_VALUE_LINE_BREAKS && MAX_DEBUG_VALUE_LINE_BREAKS > 0)) {
    return value;
  }

  let truncated = value;
  if (truncated.length > MAX_DEBUG_VALUE_CHARS && MAX_DEBUG_VALUE_CHARS > 0) {
    truncated = truncated.slice(0, MAX_DEBUG_VALUE_CHARS);
  }

  const lines = truncated.split('\n');
  if (lines.length - 1 > MAX_DEBUG_VALUE_LINE_BREAKS && MAX_DEBUG_VALUE_LINE_BREAKS > 0) {
    truncated = lines.slice(0, MAX_DEBUG_VALUE_LINE_BREAKS + 1).join('\n');
  }

  return `${truncated}...[truncated length=${value.length} lineBreaks=${lineBreaks}]`;
}

function truncateDebugArray(value: unknown[]): unknown[] {
  if (value.length <= MAX_DEBUG_ARRAY_ITEMS || MAX_DEBUG_ARRAY_ITEMS <= 0) {
    return value;
  }
  const visible = value.slice(0, MAX_DEBUG_ARRAY_ITEMS);
  const omitted = value.length - MAX_DEBUG_ARRAY_ITEMS;
  return [...visible, `...[truncated items omitted=${omitted} total=${value.length}]`];
}

function truncateDebugObject(value: Record<string, unknown>): Record<string, unknown> {
  const entries = Object.entries(value);
  if (entries.length <= MAX_DEBUG_OBJECT_KEYS || MAX_DEBUG_OBJECT_KEYS <= 0) {
    return value;
  }

  const truncated = Object.fromEntries(entries.slice(0, MAX_DEBUG_OBJECT_KEYS));
  const omitted = entries.length - MAX_DEBUG_OBJECT_KEYS;
  return {
    ...truncated,
    __truncated__: `...[truncated keys omitted=${omitted} total=${entries.length}]`,
  };
}

export function stringifyDebugData(data: any): string {
  const seen = new WeakSet();
  return JSON.stringify(data, (_key, value) => {
    if (typeof value === 'string') {
      return truncateDebugValue(value);
    }
    if (value instanceof Error) {
      const serialized: any = {
        name: value.name,
        message: value.message,
        stack: value.stack,
      };
      Object.getOwnPropertyNames(value).forEach((prop) => {
        if (!(prop in serialized)) {
          serialized[prop] = (value as any)[prop];
        }
      });
      return serialized;
    }
    if (typeof value === 'bigint') {
      return value.toString();
    }
    if (value && typeof value === 'object') {
      if (seen.has(value)) {
        return '[Circular]';
      }
      seen.add(value);

      if (Array.isArray(value)) {
        return truncateDebugArray(value);
      }

      // Keep only a bounded subset of enumerable object properties in debug output.
      return truncateDebugObject(value as Record<string, unknown>);
    }
    return value;
  }, 2);
}

export function logDebug(msg: string, data?: any): void {
  // This version logs to console; can be extended to UI debug panes
  const out = `[Visibabel] ${msg}` + (data !== undefined ? `\n${stringifyDebugData(data)}` : '');
  // eslint-disable-next-line no-console
  console.log(out);
}
