import { Injectable, NotFoundException } from '@nestjs/common';
import { CustomIndicatorsService } from '../custom-indicators/custom-indicators.service';
import { NativeIndicatorsService } from '../native-indicators/native-indicators.service';
import { SupabaseService } from '../supabase/supabase.service';

export type PublishedDashboardWidget = {
  id: string;
  indicator_source: 'native' | 'custom';
  indicator_id: string;
  title: string;
  visual_type: 'kpi' | 'table' | 'matrix' | 'bar' | 'pie' | 'line';
  position?: { x?: number; y?: number };
  properties?: Record<string, unknown>;
};

/** The single calculation path for published widgets, shared by the UI preview and AI tools. */
@Injectable()
export class PublishedDashboardPreviewService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly nativeIndicators: NativeIndicatorsService,
    private readonly customIndicators: CustomIndicatorsService,
  ) {}

  async load(tenantId: string, dashboardId: string) {
    const [dashboard] = await this.supabase.select<
      Array<{ published_version_id?: string }>
    >(
      'dashboard_definitions',
      `select=published_version_id&tenant_id=eq.${tenantId}&id=eq.${dashboardId}&status=neq.archived&limit=1`,
    );
    if (!dashboard?.published_version_id)
      throw new NotFoundException('Dashboard sem versão publicada.');
    const [version] = await this.supabase.select<
      Array<{
        id: string;
        snapshot?: {
          data?: { widgets?: PublishedDashboardWidget[] };
          widgets?: PublishedDashboardWidget[];
        };
      }>
    >(
      'dashboard_versions',
      `select=id,snapshot&tenant_id=eq.${tenantId}&dashboard_id=eq.${dashboardId}&id=eq.${dashboard.published_version_id}&limit=1`,
    );
    if (!version)
      throw new NotFoundException('Versão publicada não encontrada.');
    const root = version.snapshot?.data ?? version.snapshot;
    const widgets = [...(root?.widgets ?? [])].sort(
      (a, b) =>
        (a.position?.y ?? 0) - (b.position?.y ?? 0) ||
        (a.position?.x ?? 0) - (b.position?.x ?? 0),
    );
    return { version, widgets };
  }

  previewWidget(
    tenantId: string,
    widget: PublishedDashboardWidget,
    userId = '',
    filters: Record<string, unknown> = {},
  ) {
    return widget.indicator_source === 'native'
      ? this.nativeIndicators.preview(
          tenantId,
          widget.indicator_id,
          userId || undefined,
          false,
          filters,
        )
      : this.customIndicators.previewSaved(
          tenantId,
          widget.indicator_id,
          userId,
          filters,
        );
  }

  async preview(
    tenantId: string,
    dashboardId: string,
    userId: string,
    filters: Record<string, unknown>,
  ) {
    const { widgets } = await this.load(tenantId, dashboardId);
    return Promise.all(
      widgets.map(async (widget) => ({
        widget_id: widget.id,
        result: await this.previewWidget(tenantId, widget, userId, filters),
      })),
    );
  }
}
