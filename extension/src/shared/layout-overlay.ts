import type { LayoutRegion, LayoutOverlayBox } from '../shared/layout-types.js';

// Converts normalized layout regions to overlay boxes in image pixel space
export function layoutToOverlayBoxes(regions: LayoutRegion[]): LayoutOverlayBox[] {
  return regions.map((r) => ({
    id: r.id,
    x: r.x,
    y: r.y,
    width: r.width,
    height: r.height,
    label: r.text,
    groupId: r.groupId,
    zIndex: 10 + (r.groupId ? 1 : 0),
  }));
}
