
// TODO: Implement a chrome API mock for integration testing in Jest/node
// Skipping this test for now due to chrome API dependency
import { runOcrAndPersist } from '../background/pipeline';

describe.skip('pipeline persistence shape', () => {
  it('persists layout overlay fields when layout is enabled', async () => {
    // Mock imageData and configOverride for test
    const imageData = 'data:image/png;base64,FAKEBASE64DATA';
    const configOverride = { enableLayoutInference: true, layoutChunkStrategy: 'prompt-only' };
    // Mock fetchLayoutAugment and parseLayoutAugment if needed
    // This is a stub; real test would mock fetch and check result shape
    const result = await runOcrAndPersist(imageData, configOverride);
    expect(result.result.layout).toBeDefined();
    expect(result.result.layout.overlayBoxes).toBeInstanceOf(Array);
  });
});
