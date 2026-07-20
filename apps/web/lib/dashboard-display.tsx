import { WidgetRenderer } from '../components/widgets/widget-renderer';
import { displayLabel } from './report-labels';
import type { VisualType, Widget } from './dashboards-api';
export type PreviewResult = Record<string, unknown> & { status?: string; value?: unknown; display_value?: string | null; table?: Record<string, unknown>[]; series?: Record<string, unknown>[]; message?: string };
export const visualLabel = (type: VisualType) => displayLabel(type);
export const sourceLabel = (source: 'native' | 'custom') => displayLabel(source);
export function DashboardWidget({ widget, result, compatibilityMessage }: { widget: Widget; result?: PreviewResult; compatibilityMessage?: string }) { return <WidgetRenderer visualType={widget.visual_type} data={result} title={widget.title} message={compatibilityMessage} />; }
