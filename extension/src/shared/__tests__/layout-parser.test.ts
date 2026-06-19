import { parseLayoutAugment } from '../layout-parser.js';

describe('parseLayoutAugment', () => {
  it('normalizes regions, groups, and overlayBoxes', () => {
    const raw = {
      regions: [
        { id: 'r1', x: 10, y: 20, width: 100, height: 50, text: 'A', groupId: 'g1', confidence: 0.9 },
      ],
      groups: [
        { id: 'g1', regionIds: ['r1'], text: 'A', order: 0 },
      ],
    };
    const parserConfig = { chunkStrategy: 'none' };
    const result = parseLayoutAugment(raw, parserConfig);
    expect(result.regions.length).toBe(1);
    expect(result.groups.length).toBe(1);
    expect(result.overlayBoxes.length).toBe(1);
    expect(result.overlayBoxes[0].x).toBe(10);
    expect(result.overlayBoxes[0].label).toBe('A');
  });

  it('normalizes GLM-OCR region payloads that use bbox/content fields', () => {
    const raw = {
      regions: [
        {
          id: 'region-a',
          label: 'text',
          content: 'Hello world',
          bbox: { x: 12, y: 34, width: 56, height: 20 },
        },
      ],
    };
    const parserConfig = { chunkStrategy: 'none' };
    const result = parseLayoutAugment(raw, parserConfig);

    expect(result.regions).toHaveLength(1);
    expect(result.regions[0].x).toBe(12);
    expect(result.regions[0].y).toBe(34);
    expect(result.regions[0].width).toBe(56);
    expect(result.regions[0].height).toBe(20);
    expect(result.regions[0].text).toBe('Hello world');
    expect(result.overlayBoxes).toHaveLength(1);
    expect(result.overlayBoxes[0].label).toBe('Hello world');
  });
});
