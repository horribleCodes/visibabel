import { parseLayoutAugment } from '../shared/layout-parser.js';

describe('parseLayoutAugment', () => {
  it('maps SDK bbox x1/y1/x2/y2 into non-zero region geometry', () => {
    const raw = {
      regions: [
        {
          id: 'r1',
          label: 'text',
          content: 'hello',
          bbox: {
            x1: 100,
            y1: 40,
            x2: 190,
            y2: 120,
          },
        },
      ],
      groups: [],
    };

    const parsed = parseLayoutAugment(raw, {
      chunkStrategy: 'none',
    });

    expect(parsed.regions).toHaveLength(1);
    expect(parsed.regions[0]).toMatchObject({
      id: 'r1',
      x: 100,
      y: 40,
      width: 90,
      height: 80,
      text: 'hello',
    });

    expect(parsed.overlayBoxes).toHaveLength(1);
    expect(parsed.overlayBoxes[0]).toMatchObject({
      id: 'r1',
      x: 100,
      y: 40,
      width: 90,
      height: 80,
    });
    expect(parsed.overlayBoxes[0].width).toBeGreaterThan(0);
    expect(parsed.overlayBoxes[0].height).toBeGreaterThan(0);
  });
});
