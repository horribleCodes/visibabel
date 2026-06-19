import type { LayoutRegion, LayoutGroup, LayoutOverlayBox, LayoutParserConfig } from '../shared/layout-types.js';

// Normalize raw layout response into regions, groups, and overlay boxes
export function parseLayoutAugment(raw: any, _parserConfig: LayoutParserConfig): {
  regions: LayoutRegion[];
  groups: LayoutGroup[];
  overlayBoxes: LayoutOverlayBox[];
} {
  const readNumber = (value: unknown, fallback = 0): number => {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  };

  const toRect = (region: any): { x: number; y: number; width: number; height: number } => {
    const bbox = region?.bbox || {};

    const explicitX = readNumber(region?.x, NaN);
    const explicitY = readNumber(region?.y, NaN);
    const explicitWidth = readNumber(region?.width, NaN);
    const explicitHeight = readNumber(region?.height, NaN);

    if (
      Number.isFinite(explicitX) &&
      Number.isFinite(explicitY) &&
      Number.isFinite(explicitWidth) &&
      Number.isFinite(explicitHeight)
    ) {
      return {
        x: explicitX,
        y: explicitY,
        width: explicitWidth,
        height: explicitHeight,
      };
    }

    const x1 = readNumber(bbox?.x1, NaN);
    const y1 = readNumber(bbox?.y1, NaN);
    const x2 = readNumber(bbox?.x2, NaN);
    const y2 = readNumber(bbox?.y2, NaN);

    if (Number.isFinite(x1) && Number.isFinite(y1) && Number.isFinite(x2) && Number.isFinite(y2)) {
      return {
        x: x1,
        y: y1,
        width: Math.max(0, x2 - x1),
        height: Math.max(0, y2 - y1),
      };
    }

    const x = readNumber(region?.x, readNumber(bbox?.x, readNumber(bbox?.left, readNumber(bbox?.top_left_x, 0))));
    const y = readNumber(region?.y, readNumber(bbox?.y, readNumber(bbox?.top, readNumber(bbox?.top_left_y, 0))));
    const width = readNumber(region?.width, readNumber(bbox?.width, 0));
    const height = readNumber(region?.height, readNumber(bbox?.height, 0));

    return { x, y, width, height };
  };

  const regions: LayoutRegion[] = Array.isArray(raw?.regions)
    ? raw.regions.map((r: any, i: number) => {
        const rect = toRect(r);
        return {
          id: r.id || `region_${i}`,
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          text: String(r.text || r.content || ''),
          regionType: String(r.label || r.type || ''),
          groupId: r.groupId,
          confidence: r.confidence,
        };
      })
    : [];

  const groups: LayoutGroup[] = Array.isArray(raw?.groups)
    ? raw.groups.map((g: any, i: number) => ({
        id: g.id || `group_${i}`,
        regionIds: Array.isArray(g.regionIds) ? g.regionIds : [],
        text: g.text || '',
        order: typeof g.order === 'number' ? g.order : i,
      }))
    : [];

  // Overlay boxes are derived from regions for now
  const overlayBoxes: LayoutOverlayBox[] = regions.map((r) => ({
    id: r.id,
    x: r.x,
    y: r.y,
    width: r.width,
    height: r.height,
    label: r.text,
    regionType: r.regionType,
    groupId: r.groupId,
    zIndex: 10 + (r.groupId ? 1 : 0),
  }));

  return { regions, groups, overlayBoxes };
}
