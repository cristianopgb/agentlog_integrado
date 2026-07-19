'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, EmptyState, SectionHeader, StatusBadge } from '../../../../components/ui';
import { DashboardWidget, type PreviewResult, visualLabel } from '../../../../lib/dashboard-display';
import { createBrowserSupabaseClient } from '../../../../lib/supabase';
import { getPublishedDashboard, listDashboardNativeFilters, previewDashboard, type Dashboard, type DashboardNativeFilter, type DashboardRuntimeFilter, type Widget } from '../../../../lib/dashboards-api';

type FilterMap = Record<string, DashboardRuntimeFilter>;

function selectionSummary(count: number) {
  return count === 0 ? 'Nenhum selecionado' : `${count} selecionado${count === 1 ? '' : 's'}`;
}

function MultiSelect({ filter, values, onChange }: { filter: DashboardNativeFilter; values: string[]; onChange: (values: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const options = filter.options.filter((option) => option.label.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const placeholder = filter.placeholder || `Selecionar ${filter.label.toLocaleLowerCase()}`;

  function toggle(value: string) {
    onChange(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);
  }

  return <div className="relative mt-1.5">
    <button type="button" className="field-control flex items-center justify-between gap-3 text-left disabled:cursor-not-allowed" disabled={!filter.available || !filter.options.length} onClick={() => setOpen((current) => !current)} aria-expanded={open}>
      <span className="truncate">{values.length ? selectionSummary(values.length) : placeholder}</span><span className="text-slate-400">⌄</span>
    </button>
    {open ? <div className="absolute z-20 mt-2 w-full rounded-xl border border-slate-200 bg-white p-2 shadow-xl shadow-slate-900/10">
      {filter.options.length > 8 ? <input autoFocus className="field-control mb-2 !py-2" placeholder="Buscar..." value={query} onChange={(event) => setQuery(event.target.value)} /> : null}
      <div className="max-h-52 space-y-1 overflow-y-auto pr-1">
        {options.map((option) => <label key={option.value} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm text-slate-700 hover:bg-slate-50"><input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" checked={values.includes(option.value)} onChange={() => toggle(option.value)} />{option.label}</label>)}
        {!options.length ? <p className="px-2 py-3 text-sm text-slate-500">Nenhum valor encontrado.</p> : null}
      </div>
      {values.length ? <button type="button" className="mt-2 w-full rounded-lg px-2 py-1.5 text-left text-xs font-bold text-blue-700 hover:bg-blue-50" onClick={() => onChange([])}>Limpar seleção</button> : null}
    </div> : null}
  </div>;
}

function filterValues(filters: FilterMap, key: string) {
  const value = filters[key];
  return value?.type === 'multi_select' ? value.values : [];
}

function filterDate(filters: FilterMap, key: string, part: 'from' | 'to') {
  const value = filters[key];
  return value?.type === 'date_range' ? value[part] ?? '' : '';
}

export default function PublishedDashboard() {
  const { id } = useParams<{ id: string }>();
  const [tenant, setTenant] = useState('');
  const [dash, setDash] = useState<Dashboard>();
  const [catalog, setCatalog] = useState<DashboardNativeFilter[]>([]);
  const [selected, setSelected] = useState<FilterMap>({});
  const [draft, setDraft] = useState<FilterMap>({});
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [previews, setPreviews] = useState<Record<string, PreviewResult>>({});
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function refresh(filters: DashboardRuntimeFilter[]) {
    if (!tenant) return;
    setLoading(true);
    try {
      const response = await previewDashboard(tenant, id, filters, true);
      setPreviews(Object.fromEntries(response.data.map((item) => [item.widget_id, item.result as PreviewResult])));
    } catch { setMessage('Não foi possível atualizar o dashboard.'); } finally { setLoading(false); }
  }

  useEffect(() => {
    createBrowserSupabaseClient().from('users_profile').select('active_tenant_id').maybeSingle().then(async ({ data }) => {
      const active = (data as { active_tenant_id?: string } | null)?.active_tenant_id ?? '';
      setTenant(active);
      if (!active) return;
      try {
        const [version, filters] = await Promise.all([getPublishedDashboard(active, id), listDashboardNativeFilters(active)]);
        setDash(version.snapshot); setCatalog(filters.data); setLoading(true);
        const response = await previewDashboard(active, id, [], true);
        setPreviews(Object.fromEntries(response.data.map((item) => [item.widget_id, item.result as PreviewResult])));
      } catch { setMessage('Este dashboard ainda não foi publicado. Volte ao editor para publicar a versão atual.'); } finally { setLoading(false); }
    });
  }, [id]);

  const groups = useMemo(() => ['Período', 'Entidades', 'Localidade', 'Operação'].map((group) => ({ group, filters: catalog.filter((filter) => filter.group === group) })), [catalog]);
  const active = Object.values(selected);
  const widgets = [...(dash?.widgets ?? [])].sort((a, b) => (a.position.y ?? 0) - (b.position.y ?? 0) || (a.position.x ?? 0) - (b.position.x ?? 0));

  function updateDate(filter: DashboardNativeFilter, part: 'from' | 'to', value: string) {
    setDraft((current) => {
      const existing = current[filter.key];
      const next = { key: filter.key, type: 'date_range' as const, from: existing?.type === 'date_range' ? existing.from : undefined, to: existing?.type === 'date_range' ? existing.to : undefined, [part]: value || undefined };
      if (!next.from && !next.to) { const copy = { ...current }; delete copy[filter.key]; return copy; }
      return { ...current, [filter.key]: next };
    });
  }

  function updateValues(filter: DashboardNativeFilter, values: string[]) {
    setDraft((current) => {
      if (!values.length) { const copy = { ...current }; delete copy[filter.key]; return copy; }
      return { ...current, [filter.key]: { key: filter.key, type: 'multi_select', values } };
    });
  }

  function openFilters() { setDraft(selected); setFiltersOpen(true); }
  function applyFilters() { setSelected(draft); setFiltersOpen(false); void refresh(Object.values(draft)); }
  function clearFilters() { setSelected({}); setDraft({}); void refresh([]); }
  function removeFilter(key: string) { const next = { ...selected }; delete next[key]; setSelected(next); setDraft(next); void refresh(Object.values(next)); }
  function chipValue(runtime: DashboardRuntimeFilter) {
    if (runtime.type === 'date_range') return [runtime.from && new Date(`${runtime.from}T00:00:00`).toLocaleDateString('pt-BR'), runtime.to && new Date(`${runtime.to}T00:00:00`).toLocaleDateString('pt-BR')].filter(Boolean).join(' a ');
    const labels = runtime.values.map((value) => catalog.find((filter) => filter.key === runtime.key)?.options.find((option) => option.value === value)?.label ?? value);
    return labels.join(', ');
  }

  return <div className="page-stack app-page">
    <SectionHeader eyebrow="Dashboards" title={dash?.title ?? 'Dashboard publicado'} description="Visualização publicada com dados atualizados e configuração controlada pelo sistema." actions={dash ? <StatusBadge tone="success">Publicado</StatusBadge> : undefined} />
    {message ? <EmptyState title="Publicação indisponível" description={message} /> : null}
    {dash ? <Card className="p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold text-slate-950">Filtros do dashboard</h2><p className="mt-1 text-sm text-slate-500">{active.length ? `${active.length} filtro${active.length === 1 ? '' : 's'} ativo${active.length === 1 ? '' : 's'}` : 'Nenhum filtro ativo'}</p></div><div className="flex flex-wrap gap-2"><button className="btn-secondary" disabled={loading} onClick={openFilters}>Filtrar{active.length ? ` · ${active.length}` : ''}</button>{active.length ? <button className="btn-secondary" disabled={loading} onClick={clearFilters}>Limpar filtros</button> : null}</div></div>{active.length ? <div className="mt-3 flex flex-wrap gap-2">{active.map((filter) => <span key={filter.key} className="inline-flex max-w-full items-center gap-1 rounded-full bg-blue-50 py-1 pl-3 pr-1 text-xs font-semibold text-blue-700"><span className="truncate">{catalog.find((item) => item.key === filter.key)?.label}: {chipValue(filter)}</span><button type="button" aria-label={`Remover filtro ${catalog.find((item) => item.key === filter.key)?.label}`} className="rounded-full px-1.5 py-0.5 text-base leading-none hover:bg-blue-100" onClick={() => removeFilter(filter.key)}>×</button></span>)}</div> : null}</Card> : null}
    {loading ? <p role="status" className="text-sm font-medium text-blue-700">Atualizando dashboard...</p> : null}
    {dash && !widgets.length ? <EmptyState title="Nenhum widget publicado" description="Este dashboard ainda não possui indicadores para exibir." /> : null}
    {dash && !loading && widgets.length && active.length && Object.values(previews).every((result) => Boolean((result as { records_used?: number }).records_used === 0)) ? <p className="text-sm text-slate-500">Nenhum dado encontrado para os filtros aplicados.</p> : null}
    <section className="grid grid-cols-12 gap-5">{widgets.map((w: Widget) => <Card key={w.id} className="col-span-12 overflow-hidden p-5 md:col-span-6 xl:col-span-4" style={{ minHeight: `${Math.max(1, w.position.h || 2) * 104}px` }}><div className="flex items-start justify-between gap-3"><div><h2 className="font-bold tracking-tight text-slate-950">{w.title}</h2><p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{visualLabel(w.visual_type)}</p></div><span className="rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">Indicador</span></div><DashboardWidget widget={w} result={previews[w.id]} /></Card>)}</section>
    {filtersOpen ? <div className="fixed inset-0 z-50 bg-slate-950/40" role="presentation" onMouseDown={() => setFiltersOpen(false)}><aside className="ml-auto flex h-full w-full max-w-xl flex-col bg-white shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="filter-panel-title" onMouseDown={(event) => event.stopPropagation()}><header className="border-b border-slate-200 px-5 py-5 sm:px-6"><div className="flex items-start justify-between gap-4"><div><h2 id="filter-panel-title" className="text-xl font-bold text-slate-950">Filtrar dashboard</h2><p className="mt-1 text-sm leading-6 text-slate-500">Os filtros serão aplicados aos widgets compatíveis.</p></div><button type="button" aria-label="Fechar filtros" className="rounded-lg px-2 py-1 text-xl text-slate-500 hover:bg-slate-100" onClick={() => setFiltersOpen(false)}>×</button></div></header><div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6"><div className="space-y-7">{groups.map(({ group, filters }) => filters.length ? <section key={group}><h3 className="text-sm font-bold text-slate-900">{group}</h3><div className="mt-3 space-y-4">{filters.map((filter) => <div key={filter.key} className={!filter.available ? 'rounded-xl bg-slate-50 p-3' : ''}><label className="field-label">{filter.label}</label>{!filter.available ? <><button type="button" disabled className="field-control mt-1.5 text-left">Filtro indisponível</button><p className="mt-1 text-xs normal-case tracking-normal text-slate-500">Filtro não disponível para a base atual.</p></> : filter.type === 'date_range' ? <div className="mt-1.5 grid grid-cols-2 gap-2"><label className="text-xs font-medium text-slate-500">De<input type="date" className="field-control mt-1 !py-2" value={filterDate(draft, filter.key, 'from')} onChange={(event) => updateDate(filter, 'from', event.target.value)} /></label><label className="text-xs font-medium text-slate-500">Até<input type="date" className="field-control mt-1 !py-2" value={filterDate(draft, filter.key, 'to')} onChange={(event) => updateDate(filter, 'to', event.target.value)} /></label></div> : <MultiSelect filter={filter} values={filterValues(draft, filter.key)} onChange={(values) => updateValues(filter, values)} />}</div>)}</div></section> : null)}</div></div><footer className="flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-white px-5 py-4 sm:px-6"><button className="btn-secondary mr-auto" onClick={() => setDraft({})}>Limpar filtros</button><button className="btn-secondary" onClick={() => setFiltersOpen(false)}>Cancelar</button><button className="btn-primary" disabled={loading} onClick={applyFilters}>Aplicar filtros</button></footer></aside></div> : null}
  </div>;
}
