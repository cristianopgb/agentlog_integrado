'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Card, EmptyState, SectionHeader, StatusBadge } from '../../../components/ui';
import { getSessionContext } from '../../../lib/setup-api';
import { listNativeRecords, type NativeRecord, type NativeRecordList } from '../../../lib/native-records-api';

const qualityLabels: Record<string, string> = { valid: 'Completo', partial: 'Parcial', invalid: 'Inválido', manual_review: 'Revisar' };
function text(v: unknown, fallback = 'Dado não informado') { return v === null || v === undefined || v === '' ? fallback : String(v); }
function doc(r: NativeRecord) { return text(r.cte_number ?? r.invoice_number ?? r.document_number ?? r.order_number ?? r.delivery_number, 'Documento não informado'); }
function money(v: unknown) { return v === null || v === undefined || v === '' ? 'Valor não informado' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v)); }
function date(v: unknown, fallback = 'Data não informada') { return v ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(String(v))) : fallback; }
function quality(q: unknown) { return qualityLabels[String(q)] ?? 'Não disponível'; }

export default function NativeDataPage() {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [data, setData] = useState<NativeRecordList | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [qualityFilter, setQualityFilter] = useState('');
  const params = useMemo(() => { const p = new URLSearchParams({ limit: '50' }); if (search) p.set('search', search); if (qualityFilter) p.set('quality', qualityFilter); return p; }, [search, qualityFilter]);
  useEffect(() => { getSessionContext().then((ctx) => setTenantId(ctx.tenantId)); }, []);
  useEffect(() => { if (!tenantId) return; listNativeRecords(tenantId, params).then(setData).catch((err: Error) => setError(err.message)); }, [tenantId, params]);
  return <div className="space-y-6"><SectionHeader eyebrow="Base nativa operacional" title="Dados tratados" description="Consulte os registros normalizados a partir das integrações validadas. Campos não enviados pelo legado aparecem como dados não informados." />
    {error ? <Card><p className="font-semibold text-amber-700">Acesso não disponível</p><p className="mt-2 text-sm text-slate-600">{error}</p></Card> : null}
    <div className="grid gap-4 md:grid-cols-4">{[['Total de registros', data?.summary.total], ['Registros completos', data?.summary.complete], ['Registros parciais', data?.summary.partial], ['Última normalização', data?.summary.lastNormalization ? date(data.summary.lastNormalization) : 'Ainda não disponível']].map(([label, value]) => <Card key={label as string}><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold">{value ?? 'Ainda não disponível'}</p></Card>)}</div>
    <Card><div className="flex flex-col gap-3 md:flex-row"><input className="flex-1 rounded-xl border px-4 py-2" placeholder="Buscar por documento, entrega, cliente ou status" value={search} onChange={(e) => setSearch(e.target.value)} /><select className="rounded-xl border px-4 py-2" value={qualityFilter} onChange={(e) => setQualityFilter(e.target.value)}><option value="">Todos</option><option value="valid">Completo</option><option value="partial">Parcial</option><option value="invalid">Inválido</option><option value="manual_review">Revisar</option></select></div></Card>
    <Card className="overflow-x-auto">{data?.data.length ? <table className="min-w-full text-sm"><thead><tr className="text-left text-slate-500"><th className="p-3">Documento</th><th className="p-3">Entrega</th><th className="p-3">Cliente</th><th className="p-3">Status</th><th className="p-3">Valor</th><th className="p-3">Data prevista</th><th className="p-3">Qualidade</th><th className="p-3">Origem</th><th className="p-3">Atualizado em</th><th className="p-3">Ação</th></tr></thead><tbody>{data.data.map((r) => <tr key={r.id} className="border-t"><td className="p-3 font-semibold">{doc(r)}</td><td className="p-3">{text(r.delivery_number, 'Entrega não informada')}</td><td className="p-3">{text(r.customer_name ?? r.customer_document, 'Cliente não informado')}</td><td className="p-3">{text(r.status, 'Status não informado')}</td><td className="p-3">{money(r.total_value ?? r.freight_value)}</td><td className="p-3">{date(r.expected_date)}</td><td className="p-3"><StatusBadge tone={r.data_quality_status === 'valid' ? 'success' : 'warning'}>{quality(r.data_quality_status)}</StatusBadge></td><td className="p-3">{text(r.source_data_source_name ?? r.source_system, 'Origem não informada')}</td><td className="p-3">{date(r.updated_at, 'Não disponível')}</td><td className="p-3"><Link className="font-semibold text-blue-600" href={`/app/native-data/${r.id}`}>Ver detalhes</Link></td></tr>)}</tbody></table> : <EmptyState title="Nenhum registro tratado encontrado" description="Quando a normalização gravar dados na base nativa, eles aparecerão aqui para consulta." />}</Card></div>;
}
