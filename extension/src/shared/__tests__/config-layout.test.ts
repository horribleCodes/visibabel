import { normalizeConfig, defaultConfig } from '../config.js';

describe('normalizeConfig', () => {
  it('migrates and defaults layout config fields', () => {
    const raw = { layoutChunkStrategy: 'one-group-per-request', layoutMaxChunkSize: 999, layoutDebugRawPayload: true };
    const cfg = normalizeConfig(raw);
    expect(cfg.layoutChunkStrategy).toBe('one-group-per-request');
    expect(cfg.layoutMaxChunkSize).toBe(999);
    expect(cfg.layoutDebugRawPayload).toBe(true);
  });
  it('applies defaults for missing layout fields', () => {
    const cfg = normalizeConfig({});
    expect(cfg.layoutChunkStrategy).toBe(defaultConfig.layoutChunkStrategy);
    expect(cfg.layoutMaxChunkSize).toBe(defaultConfig.layoutMaxChunkSize);
    expect(cfg.layoutDebugRawPayload).toBe(defaultConfig.layoutDebugRawPayload);
  });
});
