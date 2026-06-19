// Types for layout augmentation and overlay pipeline

export interface LayoutRegion {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  regionType?: string;
  groupId?: string;
  confidence?: number;
}

export interface LayoutGroup {
  id: string;
  regionIds: string[];
  text: string;
  order: number;
}

export interface LayoutOverlayBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
  regionType?: string;
  groupId?: string;
  zIndex?: number;
}

export interface LayoutAugmentResponse {
  ocr_text?: string;
  raw: any; // Full raw payload from /layout/augment (optional, debug only)
  regions: LayoutRegion[];
  groups: LayoutGroup[];
  overlayBoxes: LayoutOverlayBox[];
}

export type LayoutChunkStrategy = 'none' | 'prompt-only' | 'one-group-per-request' | 'hybrid-size-capped';

export interface LayoutParserConfig {
  chunkStrategy: LayoutChunkStrategy;
  maxChunkSize?: number;
  debugRawPayload?: boolean;
}
