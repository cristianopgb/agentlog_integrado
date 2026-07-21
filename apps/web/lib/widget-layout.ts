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
  const width = isTableLikeVisual(visualType, data) ? Math.max(6, requestedWidth) : requestedWidth;
  const start = clamp((Number(position.x) || 0) + 1, 1, 13 - width);
  return { gridColumn: `${start} / span ${width}`, gridRowStart: Math.max(1, (Number(position.y) || 0) + 1) };
}

export function getReportBlockLayoutClass(visualType?: string, data?: unknown, tableLikeCount = 0) {
  if (isTableLikeVisual(visualType, data)) return tableLikeCount === 1 ? 'col-span-12' : 'col-span-12 md:col-span-6';
  return visualType === 'kpi' ? 'col-span-12 sm:col-span-6 xl:col-span-4' : 'col-span-12 md:col-span-6';
}
