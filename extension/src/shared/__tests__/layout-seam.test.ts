import { shouldUseLayoutAugment } from '../layout-seam.js';

describe('shouldUseLayoutAugment', () => {
  it('uses layout augment whenever layout inference is enabled', () => {
    expect(shouldUseLayoutAugment({ enableLayoutInference: true, layoutChunkStrategy: 'none' } as any)).toBe(true);
    expect(shouldUseLayoutAugment({ enableLayoutInference: true, layoutChunkStrategy: 'prompt-only' } as any)).toBe(true);
  });

  it('does not use layout augment when layout inference is disabled', () => {
    expect(shouldUseLayoutAugment({ enableLayoutInference: false, layoutChunkStrategy: 'prompt-only' } as any)).toBe(false);
  });
});
