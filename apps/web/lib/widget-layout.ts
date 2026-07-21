import type { CSSProperties } from 'react';

type Position = { x?: number; y?: number; w?: number };
const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));

export function isTableLikeVisual(visualType?: string, data?: unknown) {
  if (visualType === 'table' || visualType === 'matrix') return true;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const shape = (data as { result_shape?: unknown; shape?: unknown }).result_shape ?? (data as { shape?: unknown }).shape;
  return shape === 'table' || shape === 'listing' || shape === 'matrix';
}

export function getWidgetGridStyle(position: Position, visualType?: string, data?: unknown): CSSProperties {
  const requestedWidth = clamp(Number(position.w) || 1, 1, 12);
  const minimumWidth = isTableLikeVisual(visualType, data) ? 12 : visualType === 'kpi' ? 3 : 6;
  const width = Math.max(minimumWidth, requestedWidth);

  // Older dashboards often have every widget at x: 0 and use y only as an
  // insertion order. Fixed coordinates make them render as a thin vertical
  // column, so let the grid pack cards in order while preserving wide widgets.
  return { gridColumn: `span ${width}` };
}

export function getWidgetMinHeight(visualType?: string, data?: unknown) {
  if (isTableLikeVisual(visualType, data)) return 300;
  return visualType === 'kpi' ? 156 : 260;
}

export function getReportBlockLayoutClass(visualType?: string, data?: unknown, tableLikeCount = 0) {
  if (isTableLikeVisual(visualType, data)) return tableLikeCount === 1 ? 'col-span-12' : 'col-span-12 md:col-span-6';
  return visualType === 'kpi' ? 'col-span-12 sm:col-span-6 xl:col-span-4' : 'col-span-12 md:col-span-6';
}
