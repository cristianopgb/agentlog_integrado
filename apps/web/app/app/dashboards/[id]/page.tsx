'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, EmptyState, SectionHeader, StatusBadge } from '../../../../components/ui';
import { DashboardWidget, type PreviewResult, visualLabel } from '../../../../lib/dashboard-display';
import { createBrowserSupabaseClient } from '../../../../lib/supabase';
import { getPublishedDashboard, previewDashboard, type Dashboard, type Widget } from '../../../../lib/dashboards-api';

export default function PublishedDashboard() {
  const { id } = useParams<{ id: string }>(); const [dash, setDash] = useState<Dashboard>(); const [previews, setPreviews] = useState<Record<string, PreviewResult>>({}); const [message, setMessage] = useState('');
  useEffect(() => { createBrowserSupabaseClient().from('users_profile').select('active_tenant_id').maybeSingle().then(async ({ data }) => { const tenant = (data as { active_tenant_id?: string } | null)?.active_tenant_id ?? ''; if (!tenant) return; try { const version = await getPublishedDashboard(tenant, id); setDash(version.snapshot); const filters = ((version.snapshot.layout_config as { global_filters?: Record<string, unknown>[] } | undefined)?.global_filters) ?? []; const response = await previewDashboard(tenant, id, filters, true); setPreviews(Object.fromEntries(response.data.map((item) => [item.widget_id, item.result as PreviewResult]))); } catch { setMessage('Este dashboard ainda não foi publicado. Volte ao editor para publicar a versão atual.'); } }); }, [id]);
  const widgets = [...(dash?.widgets ?? [])].sort((a, b) => (a.position.y ?? 0) - (b.position.y ?? 0) || (a.position.x ?? 0) - (b.position.x ?? 0));
  return <div className="space-y-7"><SectionHeader eyebrow="Dashboards" title={dash?.title ?? 'Dashboard publicado'} description="Visualização publicada com dados atualizados e configuração controlada pelo sistema." actions={dash ? <StatusBadge tone="success">Publicado</StatusBadge> : undefined} />{message ? <EmptyState title="Publicação indisponível" description={message} /> : null}{dash && !widgets.length ? <EmptyState title="Nenhum widget publicado" description="Este dashboard ainda não possui indicadores para exibir." /> : null}<section className="grid grid-cols-12 gap-5">{widgets.map((w: Widget) => <Card key={w.id} className="col-span-12 overflow-hidden p-5 md:col-span-6 xl:col-span-4" style={{ minHeight: `${Math.max(1, w.position.h || 2) * 104}px` }}><div className="flex items-start justify-between gap-3"><div><h2 className="font-bold tracking-tight text-slate-950">{w.title}</h2><p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{visualLabel(w.visual_type)}</p></div><span className="rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">Indicador</span></div><DashboardWidget widget={w} result={previews[w.id]} /></Card>)}</section></div>;
}
