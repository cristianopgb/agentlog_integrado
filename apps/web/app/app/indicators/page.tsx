'use client';

import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Card, EmptyState, SectionHeader, StatusBadge } from '../../../components/ui';
import { getCurrentUserPermissions, hasPermission } from '../../../lib/rbac';
import { createBrowserSupabaseClient } from '../../../lib/supabase';
import { Indicator, IndicatorPreview, getIndicator, getIndicatorsSummary, listIndicators, previewIndicator, type IndicatorStatus, type IndicatorSummary } from '../../../lib/indicators-api';

const statusLabels: Record<IndicatorStatus, string> = { available: 'Disponível', partial: 'Parcial', unavailable: 'Indisponível', empty: 'Sem dados', failed: 'Falha' };
const statusTone: Record<IndicatorStatus, 'success' | 'warning' | 'neutral' | 'info'> = { available: 'success', partial: 'warning', unavailable: 'neutral', empty: 'info', failed: 'warning' };
const moduleLabels: Record<string, string> = { core: 'Núcleo', transport: 'Transporte', attendance: 'Atendimento', finance: 'Financeiro', warehouse: 'Armazém', team: 'Equipes' };
const familyLabels: Record<string, string> = { volume: 'Volume', qualidade: 'Qualidade', prazo_sla: 'Prazo e SLA', peso_volumetria: 'Peso e volumetria', financeiro_basico: 'Financeiro básico', produtividade: 'Produtividade', tempo: 'Tempo', auditoria: 'Auditoria', peso_volume: 'Peso e volumetria', qualidade_dados: 'Qualidade' };
const fieldFriendlyLabels: Record<string, string> = { id: 'Registro', updated_at: 'Última atualização', data_quality_status: 'Qualidade do dado', gross_weight: 'Peso bruto', cubed_weight: 'Peso cubado', volume_count: 'Quantidade de volumes', total_value: 'Valor total', freight_value: 'Valor do frete', expected_date: 'Data prevista', completed_at: 'Data de conclusão', delivered_at: 'Data de entrega', customer_name: 'Cliente', customer_document: 'Cliente', destination_state: 'UF destino', vehicle_plate: 'Placa', driver_name: 'Motorista' };
const statusMessages: Record<IndicatorStatus, string> = { available: 'Indicador disponível.', partial: 'Indicador parcial. Mapeie mais campos para melhorar a análise.', unavailable: 'Indicador indisponível. Mapeie os campos necessários na integração para habilitar esta análise.', empty: 'Ainda não há dados tratados suficientes para este indicador.', failed: 'Não foi possível calcular este indicador agora.' };

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
  const displaySummary = useMemo(() => summarizeItems(items, summary), [items, summary]);
  const filtered = items.filter((item) => (!moduleFilter || item.module_key === moduleFilter) && (!familyFilter || item.family_key === familyFilter) && (!statusFilter || item.availability.status === statusFilter));

  async function openDetail(item: Indicator) { if (!tenantId) return; setPreview(null); setSelected(null); setMessage(''); try { setSelected(await getIndicator(tenantId, item.indicator_key)); } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível abrir o detalhe.'); } }
  async function calculate(item: Indicator) { if (!tenantId) return; setMessage(''); try { const result = await previewIndicator(tenantId, item.indicator_key); setPreview(result); if (!selected || selected.indicator_key !== item.indicator_key) setSelected(await getIndicator(tenantId, item.indicator_key)); } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível calcular a prévia.'); } }

  if (allowed === false) return <div className="mx-auto max-w-4xl space-y-6"><SectionHeader eyebrow="Indicadores" title="Indicadores" description="Consulte os indicadores nativos gerados a partir dos dados tratados da base nativa."/><EmptyState title="Acesso bloqueado" description="Você precisa da permissão indicators.view para acessar o catálogo de indicadores nativos." /></div>;

  return <div className="mx-auto max-w-7xl space-y-6"><SectionHeader eyebrow="Indicadores" title="Indicadores" description="Consulte os indicadores nativos gerados a partir dos dados tratados da base nativa." />
    {message ? <Card><p className="text-sm text-slate-600">{message}</p></Card> : null}
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5"><SummaryCard label="Total de indicadores nativos" value={displaySummary.total}/><SummaryCard label="Disponíveis" value={displaySummary.available}/><SummaryCard label="Parciais" value={displaySummary.partial}/><SummaryCard label="Indisponíveis" value={displaySummary.unavailable}/><SummaryCard label="Sem dados" value={displaySummary.empty}/></div>
    <Card><div className="grid gap-4 md:grid-cols-3"><Select label="Módulo" value={moduleFilter} onChange={setModuleFilter} options={modules.map((m)=>({value:m,label:moduleLabels[m] ?? m}))}/><Select label="Família" value={familyFilter} onChange={setFamilyFilter} options={families.map((f)=>({value:f,label:familyName(f)}))}/><Select label="Status" value={statusFilter} onChange={setStatusFilter} options={(['available','partial','unavailable','empty'] as IndicatorStatus[]).map((s)=>({value:s,label:statusLabels[s]}))}/></div></Card>
    <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_20rem]"><Card className="overflow-hidden"><div className="divide-y divide-slate-100">{filtered.map((item)=><div key={item.indicator_key} className="grid gap-3 px-4 py-4 text-sm lg:grid-cols-[minmax(13rem,1.5fr)_7rem_8rem_7rem_minmax(12rem,1fr)_minmax(12rem,1fr)_6rem] lg:items-start"><div><p className="font-semibold text-slate-950">{item.name}</p><p className="mt-1 text-xs text-slate-500 lg:hidden">{moduleLabels[item.module_key] ?? item.module_key} • {familyName(item.family_key)}</p></div><Cell label="Módulo" className="hidden lg:block">{moduleLabels[item.module_key] ?? item.module_key}</Cell><Cell label="Família" className="hidden lg:block">{familyName(item.family_key)}</Cell><Cell label="Status"><StatusBadge tone={statusTone[item.availability.status]}>{statusLabels[item.availability.status]}</StatusBadge></Cell><Cell label="Campos necessários">{fieldLabels(item)}</Cell><Cell label="Mensagem"><span className="text-slate-600">{messageForStatus(item.availability.status)}</span></Cell><div className="lg:text-right"><button className="rounded-lg bg-slate-100 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-200" onClick={()=>openDetail(item)}>Ver detalhe</button></div></div>)}</div>{filtered.length === 0 ? <EmptyState title="Nenhum indicador encontrado" description="Ajuste os filtros para visualizar outros indicadores nativos."/> : null}</Card>
    <Card className="2xl:sticky 2xl:top-4 2xl:self-start"><h2 className="text-lg font-bold text-slate-950">Detalhe do indicador</h2>{selected ? <div className="mt-4 space-y-4 text-sm"><div><p className="text-xl font-semibold text-slate-950">{selected.name}</p><p className="mt-1 text-slate-600">{selected.description ?? 'Descrição não informada.'}</p></div><dl className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-1"><Detail label="Módulo" value={moduleLabels[selected.module_key] ?? selected.module_key}/><Detail label="Família" value={familyName(selected.family_key)}/><Detail label="Tipo" value={selected.indicator_type}/><Detail label="Formato" value={selected.value_format}/></dl><p><b>Status:</b> <StatusBadge tone={statusTone[selected.availability.status]}>{statusLabels[selected.availability.status]}</StatusBadge></p><FieldDetail item={selected}/><p className="text-slate-700">{messageForStatus(selected.availability.status)}</p><button className="rounded-lg bg-blue-600 px-3 py-2 font-semibold text-white hover:bg-blue-700" onClick={()=>calculate(selected)}>Calcular prévia</button><PreviewBox preview={preview ?? selected.preview}/></div> : <p className="mt-4 text-sm text-slate-600">Selecione “Ver detalhe” em um indicador nativo.</p>}</Card></div>
  </div>;
}
function SummaryCard({ label, value }: { label: string; value: number }) { return <Card><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-3xl font-bold text-slate-950">{value}</p></Card>; }
function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v:string)=>void; options: Array<{ value:string; label:string }> }) { return <label className="text-sm font-semibold text-slate-700">{label}<select className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2" value={value} onChange={(e)=>onChange(e.target.value)}><option value="">Todos</option>{options.map((o)=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label>; }
function Cell({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) { return <div className={className}><p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400 lg:hidden">{label}</p>{children}</div>; }
function Detail({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</dt><dd className="mt-1 text-slate-800">{value}</dd></div>; }
function FieldDetail({ item }: { item: Pick<Indicator,'required_fields'> }) { const fields = item.required_fields ?? []; return <div><p className="font-semibold text-slate-800">Campos necessários</p>{fields.length ? <ul className="mt-2 space-y-2">{fields.map((field)=><li key={field.key} className="rounded-lg bg-slate-50 p-3"><p className="font-medium text-slate-800">{friendlyFieldGroup(field)}</p><p className="mt-1 text-xs text-slate-500">Técnico: {technicalFieldNames(field).join(' ou ')}</p></li>)}</ul> : <p className="mt-1 text-slate-600">Campos nativos básicos.</p>}</div>; }
function fieldLabels(item: Pick<Indicator,'required_fields'>) { return item.required_fields?.map(friendlyFieldGroup).filter(Boolean).join(', ') || 'Campos nativos básicos'; }
function friendlyFieldGroup(field: Indicator['required_fields'][number]) { const explicit = fieldFriendlyLabels[field.key]; return explicit ?? ((field.label && field.label !== field.key) ? field.label : friendlyFieldName(field.any_of?.[0]?.field ?? field.key)); }
function friendlyFieldName(field: string) { return fieldFriendlyLabels[field] ?? field.replace(/_/g, ' '); }
function technicalFieldNames(field: Indicator['required_fields'][number]) { return field.any_of?.map((ref)=>`${ref.table}.${ref.field}`) ?? [field.key]; }
function familyName(family: string) { return familyLabels[family] ?? family.replace(/_/g, ' '); }
function messageForStatus(status: IndicatorStatus) { return statusMessages[status]; }
function summarizeItems(items: Indicator[], fallback: IndicatorSummary) { if (!items.length) return fallback; return items.reduce<IndicatorSummary>((acc, item) => { acc.total += 1; if (item.availability.status === 'available') acc.available += 1; else if (item.availability.status === 'partial') acc.partial += 1; else if (item.availability.status === 'unavailable' || item.availability.status === 'failed') acc.unavailable += 1; else if (item.availability.status === 'empty') acc.empty += 1; return acc; }, { total: 0, available: 0, partial: 0, unavailable: 0, empty: 0 }); }
function PreviewBox({ preview }: { preview: IndicatorPreview | null }) { if (!preview) return <p className="text-slate-500">Prévia ainda não calculada.</p>; return <div className="rounded-xl bg-slate-50 p-4"><p><b>Prévia:</b> {formatValue(preview.value)}</p><p><b>Registros considerados:</b> {preview.records_considered}</p><p className="mt-2 text-slate-600">{messageForStatus(preview.status)}</p>{preview.series.length ? <pre className="mt-3 max-h-52 overflow-auto rounded-lg bg-white p-3 text-xs">{JSON.stringify(preview.series.slice(0, 10), null, 2)}</pre> : null}{preview.table.length ? <pre className="mt-3 max-h-52 overflow-auto rounded-lg bg-white p-3 text-xs">{JSON.stringify(preview.table.slice(0, 10), null, 2)}</pre> : null}</div>; }
function formatValue(value: unknown) { if (value === null || value === undefined) return 'Sem valor disponível'; if (typeof value === 'number') return Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value); return String(value); }
