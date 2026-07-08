'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, EmptyState, SectionHeader, StatusBadge } from '../../../components/ui';
import { getCurrentUserPermissions, hasPermission } from '../../../lib/rbac';
import { createBrowserSupabaseClient } from '../../../lib/supabase';
import { Indicator, IndicatorPreview, getIndicator, getIndicatorsSummary, listIndicators, previewIndicator, type IndicatorStatus, type IndicatorSummary } from '../../../lib/indicators-api';

const statusLabels: Record<IndicatorStatus, string> = { available: 'Disponível', partial: 'Parcial', unavailable: 'Indisponível', empty: 'Sem dados', failed: 'Falha' };
const statusTone: Record<IndicatorStatus, 'success' | 'warning' | 'neutral' | 'info'> = { available: 'success', partial: 'warning', unavailable: 'neutral', empty: 'info', failed: 'warning' };
const moduleLabels: Record<string, string> = { core: 'Núcleo', transport: 'Transporte', attendance: 'Atendimento', finance: 'Financeiro', warehouse: 'Armazém', team: 'Equipes' };

export default function IndicatorsPage() {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [items, setItems] = useState<Indicator[]>([]);
  const [summary, setSummary] = useState<IndicatorSummary>({ total: 0, available: 0, partial: 0, unavailable: 0, empty: 0 });
  const [moduleFilter, setModuleFilter] = useState('');
  const [familyFilter, setFamilyFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selected, setSelected] = useState<(Indicator & { preview: IndicatorPreview | null }) | null>(null);
  const [preview, setPreview] = useState<IndicatorPreview | null>(null);
  const [message, setMessage] = useState('Carregando indicadores nativos...');

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { setAllowed(false); setMessage('Usuário não autenticado.'); return; }
      const { data: profile } = await supabase.from('users_profile').select('active_tenant_id').eq('id', data.user.id).maybeSingle();
      const activeTenantId = (profile as { active_tenant_id: string | null } | null)?.active_tenant_id ?? null;
      setTenantId(activeTenantId);
      const permissions = await getCurrentUserPermissions(activeTenantId);
      const canView = hasPermission(permissions, 'indicators.view');
      setAllowed(canView);
      if (!activeTenantId || !canView) { setMessage('Você não tem permissão para visualizar indicadores.'); return; }
      try {
        const [list, counts] = await Promise.all([listIndicators(activeTenantId), getIndicatorsSummary(activeTenantId)]);
        setItems(list.data); setSummary(counts); setMessage('');
      } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível carregar indicadores.'); }
    });
  }, []);

  const modules = useMemo(() => Array.from(new Set(items.map((item) => item.module_key))).sort(), [items]);
  const families = useMemo(() => Array.from(new Set(items.filter((item) => !moduleFilter || item.module_key === moduleFilter).map((item) => item.family_key))).sort(), [items, moduleFilter]);
  const filtered = items.filter((item) => (!moduleFilter || item.module_key === moduleFilter) && (!familyFilter || item.family_key === familyFilter) && (!statusFilter || item.availability.status === statusFilter));

  async function openDetail(item: Indicator) { if (!tenantId) return; setPreview(null); setSelected(null); setMessage(''); try { setSelected(await getIndicator(tenantId, item.indicator_key)); } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível abrir o detalhe.'); } }
  async function calculate(item: Indicator) { if (!tenantId) return; setMessage(''); try { const result = await previewIndicator(tenantId, item.indicator_key); setPreview(result); if (!selected || selected.indicator_key !== item.indicator_key) setSelected(await getIndicator(tenantId, item.indicator_key)); } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível calcular a prévia.'); } }

  if (allowed === false) return <div className="mx-auto max-w-4xl space-y-6"><SectionHeader eyebrow="Indicadores" title="Indicadores" description="Consulte os indicadores nativos gerados a partir dos dados tratados da base nativa."/><EmptyState title="Acesso bloqueado" description="Você precisa da permissão indicators.view para acessar o catálogo de indicadores nativos." /></div>;

  return <div className="mx-auto max-w-7xl space-y-6"><SectionHeader eyebrow="Indicadores" title="Indicadores" description="Consulte os indicadores nativos gerados a partir dos dados tratados da base nativa." />
    {message ? <Card><p className="text-sm text-slate-600">{message}</p></Card> : null}
    <div className="grid gap-4 md:grid-cols-4"><SummaryCard label="Total de indicadores nativos" value={summary.total}/><SummaryCard label="Disponíveis" value={summary.available}/><SummaryCard label="Parciais" value={summary.partial}/><SummaryCard label="Indisponíveis" value={summary.unavailable}/></div>
    <Card><div className="grid gap-4 md:grid-cols-3"><Select label="Módulo" value={moduleFilter} onChange={setModuleFilter} options={modules.map((m)=>({value:m,label:moduleLabels[m] ?? m}))}/><Select label="Família" value={familyFilter} onChange={setFamilyFilter} options={families.map((f)=>({value:f,label:f.replace(/_/g,' ')}))}/><Select label="Status" value={statusFilter} onChange={setStatusFilter} options={(['available','partial','unavailable','empty'] as IndicatorStatus[]).map((s)=>({value:s,label:statusLabels[s]}))}/></div></Card>
    <div className="grid gap-6 xl:grid-cols-[1fr_24rem]"><Card className="overflow-hidden"><div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Indicador</th><th className="px-4 py-3">Módulo</th><th className="px-4 py-3">Família</th><th className="px-4 py-3">Tipo</th><th className="px-4 py-3">Formato</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Campos necessários</th><th className="px-4 py-3">Mensagem</th><th className="px-4 py-3">Ação</th></tr></thead><tbody>{filtered.map((item)=><tr key={item.indicator_key} className="border-t border-slate-100 align-top"><td className="px-4 py-3 font-semibold text-slate-900">{item.name}</td><td className="px-4 py-3">{moduleLabels[item.module_key] ?? item.module_key}</td><td className="px-4 py-3 capitalize">{item.family_key.replace(/_/g,' ')}</td><td className="px-4 py-3">{item.indicator_type}</td><td className="px-4 py-3">{item.value_format}</td><td className="px-4 py-3"><StatusBadge tone={statusTone[item.availability.status]}>{statusLabels[item.availability.status]}</StatusBadge></td><td className="px-4 py-3">{fieldLabels(item)}</td><td className="px-4 py-3 text-slate-600">{item.availability.message}</td><td className="space-y-2 px-4 py-3"><button className="rounded-lg bg-slate-100 px-3 py-1.5 font-semibold text-slate-700" onClick={()=>openDetail(item)}>Ver detalhe</button><button className="block rounded-lg bg-blue-600 px-3 py-1.5 font-semibold text-white" onClick={()=>calculate(item)}>Calcular prévia</button></td></tr>)}</tbody></table>{filtered.length === 0 ? <EmptyState title="Nenhum indicador encontrado" description="Ajuste os filtros para visualizar outros indicadores nativos."/> : null}</div></Card>
    <Card><h2 className="text-lg font-bold text-slate-950">Detalhe do indicador</h2>{selected ? <div className="mt-4 space-y-3 text-sm"><p className="text-xl font-semibold">{selected.name}</p><p className="text-slate-600">{selected.description ?? 'Descrição não informada.'}</p><p><b>Família:</b> {selected.family_key.replace(/_/g,' ')}</p><p><b>Tipo:</b> {selected.indicator_type}</p><p><b>Formato:</b> {selected.value_format}</p><p><b>Status:</b> <StatusBadge tone={statusTone[selected.availability.status]}>{statusLabels[selected.availability.status]}</StatusBadge></p><p><b>Campos necessários:</b> {fieldLabels(selected)}</p><p><b>Campos opcionais:</b> {selected.optional_fields?.map((f)=>f.label).join(', ') || 'Sem campos opcionais nesta versão.'}</p><p className="text-slate-600">{selected.availability.message}</p><PreviewBox preview={preview ?? selected.preview}/></div> : <p className="mt-4 text-sm text-slate-600">Selecione “Ver detalhe” ou “Calcular prévia” em um indicador nativo.</p>}</Card></div>
  </div>;
}
function SummaryCard({ label, value }: { label: string; value: number }) { return <Card><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-3xl font-bold text-slate-950">{value}</p></Card>; }
function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v:string)=>void; options: Array<{ value:string; label:string }> }) { return <label className="text-sm font-semibold text-slate-700">{label}<select className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2" value={value} onChange={(e)=>onChange(e.target.value)}><option value="">Todos</option>{options.map((o)=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label>; }
function fieldLabels(item: Pick<Indicator,'required_fields'>) { return item.required_fields?.map((f)=>f.label).filter(Boolean).join(', ') || 'Campos nativos básicos'; }
function PreviewBox({ preview }: { preview: IndicatorPreview | null }) { if (!preview) return <p className="text-slate-500">Prévia ainda não calculada.</p>; return <div className="rounded-xl bg-slate-50 p-4"><p><b>Prévia:</b> {formatValue(preview.value)}</p><p><b>Registros considerados:</b> {preview.records_considered}</p><p className="mt-2 text-slate-600">{preview.message}</p>{preview.series.length ? <pre className="mt-3 max-h-52 overflow-auto rounded-lg bg-white p-3 text-xs">{JSON.stringify(preview.series.slice(0, 10), null, 2)}</pre> : null}{preview.table.length ? <pre className="mt-3 max-h-52 overflow-auto rounded-lg bg-white p-3 text-xs">{JSON.stringify(preview.table.slice(0, 10), null, 2)}</pre> : null}</div>; }
function formatValue(value: unknown) { if (value === null || value === undefined) return 'Sem valor disponível'; if (typeof value === 'number') return Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value); return String(value); }
