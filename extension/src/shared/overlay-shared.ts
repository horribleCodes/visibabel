// Shared overlay converter API and message contract placeholder for future in-page overlay reuse
import type { LayoutRegion, LayoutOverlayBox } from './layout-types.js';

export function convertLayoutToOverlay(layout: { regions: LayoutRegion[] }): LayoutOverlayBox[] {
  // For now, just map regions to overlay boxes
  return (layout.regions || []).map(r => ({
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

// Placeholder for future message contract
export type OverlayMessage = {
  type: 'SHOW_OVERLAY',
  payload: {
    imageId: string;
    overlayBoxes: LayoutOverlayBox[];
  }
};
