import { stringifyDebugData, logDebug } from '../logger';

describe('stringifyDebugData', () => {
  it('serializes errors and bigints', () => {
    const err = new Error('fail');
    const big = BigInt(123);
    const obj = { err, big };
    const str = stringifyDebugData(obj);
    expect(str).toContain('fail');
    expect(str).toContain('123');
  });
  it('handles circular references', () => {
    const obj: any = {};
    obj.self = obj;
    expect(stringifyDebugData(obj)).toContain('[Circular]');
  });

  // Note: Assumes MAX_DEBUG_VALUE_CHARS=300 as defined in logger.ts
  it('truncates long string values over 300 characters', () => {
    const input = { value: 'a'.repeat(301) };
    const serialized = stringifyDebugData(input);
    const parsed = JSON.parse(serialized);

    expect(parsed.value).toContain('...[truncated length=301 lineBreaks=0]');
    expect(parsed.value.startsWith('a'.repeat(300))).toBe(true);
  });

  // Note: Assumes MAX_DEBUG_VALUE_LINE_BREAKS=5 as defined in logger.ts
  it('truncates string values with more than 5 line breaks', () => {
    const input = { value: 'l1\nl2\nl3\nl4\nl5\nl6\nl7' };
    const serialized = stringifyDebugData(input);
    const parsed = JSON.parse(serialized);

    expect(parsed.value).toContain('...[truncated length=20 lineBreaks=6]');
    expect((parsed.value.match(/\n/g) || []).length).toBe(5);
  });

  it('truncates array values with too many items', () => {
    const input = { values: Array.from({ length: 10 }, (_unused, index) => index + 1) };
    const serialized = stringifyDebugData(input);
    const parsed = JSON.parse(serialized);

    expect(parsed.values).toHaveLength(7);
    expect(parsed.values[6]).toBe('...[truncated items omitted=4 total=10]');
  });

  it('truncates object values with too many keys', () => {
    const manyKeys = Object.fromEntries(Array.from({ length: 25 }, (_unused, index) => [`k${index}`, index]));
    const input = { payload: manyKeys };
    const serialized = stringifyDebugData(input);
    const parsed = JSON.parse(serialized);

    expect(Object.keys(parsed.payload).length).toBe(21);
    expect(parsed.payload.__truncated__).toBe('...[truncated keys omitted=5 total=25]');
  });
});

describe('logDebug', () => {
  it('logs to console', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    logDebug('msg', { foo: 1 });
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('[Visibabel] msg'));
    spy.mockRestore();
  });
});
