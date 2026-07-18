import type { ReactNode } from 'react';
import type { VisualType, Widget } from './dashboards-api';

export type PreviewResult = { status?: string; value?: unknown; display_value?: string | null; table?: Record<string, unknown>[]; series?: Record<string, unknown>[]; message?: string };

const technicalColumn = /(^|_)(used_count|records_used|count_used)$|_used_count$|^(id|tenant_id|indicator_id|source)$/i;
const palette = ['bg-blue-600', 'bg-cyan-500', 'bg-violet-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500'];

export function visualLabel(type: VisualType) { return ({ kpi: 'KPI', table: 'Tabela', matrix: 'Matriz', bar: 'Barra', pie: 'Pizza', line: 'Linha' } as const)[type]; }
export function sourceLabel(source: 'native' | 'custom') { return source === 'native' ? 'Nativo' : 'Personalizado'; }
export function resultRows(result?: PreviewResult) { return (result?.table?.length ? result.table : result?.series) ?? []; }
export function visibleColumns(rows: Record<string, unknown>[]) { return Object.keys(rows[0] ?? {}).filter((key) => !technicalColumn.test(key)); }
export function friendlyLabel(value: string) { return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()); }

export function formatValue(value: unknown, label = ''): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  const numeric = typeof value === 'number' ? value : (typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN);
  if (!Number.isFinite(numeric)) return String(value);
  const lower = label.toLowerCase();
  if (lower.includes('percent') || lower.includes('taxa') || lower.includes('%')) return new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(numeric) <= 1 ? numeric : numeric / 100);
  if (lower.includes('hora')) return `${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(numeric)} horas`;
  if (lower.includes('dia')) return `${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(numeric)} dias`;
  if (lower.includes('ton') && (lower.includes('custo') || lower.includes('frete') || lower.includes('r$'))) return `R$ ${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(numeric)}/t`;
  if (lower.includes('valor') || lower.includes('receita') || lower.includes('custo') || lower.includes('frete') || lower.includes('preço') || lower.includes('price')) return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(numeric);
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: Number.isInteger(numeric) ? 0 : 2, maximumFractionDigits: 2 }).format(numeric);
}

function EmptyWidget({ children }: { children: ReactNode }) { return <div className="mt-5 rounded-2xl border border-amber-100 bg-amber-50/70 px-4 py-5 text-sm leading-6 text-amber-800">{children}</div>; }
function NumericBars({ rows, line = false }: { rows: Record<string, unknown>[]; line?: boolean }) {
  const parsed = rows.slice(0, line ? 16 : 8).map((row, index) => ({ label: String(Object.values(row)[0] ?? `Item ${index + 1}`), value: Number(Object.values(row).at(-1) ?? 0) }));
  const max = Math.max(...parsed.map((item) => Math.abs(item.value)), 1);
  if (line) return <div className="mt-5"><div className="flex h-36 items-end gap-1.5 rounded-2xl border border-slate-100 bg-slate-50/80 p-4">{parsed.map((item, index) => <div key={index} title={`${item.label}: ${formatValue(item.value)}`} className="group relative flex flex-1 items-end"><div className="w-full rounded-t-md bg-gradient-to-t from-blue-600 to-cyan-400 transition group-hover:from-blue-700" style={{ height: `${Math.max(6, (Math.abs(item.value) / max) * 100)}%` }} /></div>)}</div><p className="mt-2 truncate text-xs text-slate-500">Série temporal · passe o mouse sobre as colunas para ver os valores</p></div>;
  return <div className="mt-5 space-y-4">{parsed.map((item, index) => <div key={index}><div className="mb-1.5 flex gap-3 text-sm"><span className="min-w-0 flex-1 truncate font-medium text-slate-700">{item.label}</span><span className="font-semibold tabular-nums text-slate-950">{formatValue(item.value)}</span></div><div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-400" style={{ width: `${Math.max(3, (Math.abs(item.value) / max) * 100)}%` }} /></div></div>)}</div>;
}

export function DashboardWidget({ widget, result, compatibilityMessage }: { widget: Widget; result?: PreviewResult; compatibilityMessage?: string }) {
  const rows = resultRows(result);
  const scalar = result?.display_value ?? (result?.value === null || result?.value === undefined ? null : formatValue(result.value, widget.title));
  if (compatibilityMessage) return <EmptyWidget>{compatibilityMessage}</EmptyWidget>;
  if (!result) return <div className="mt-5 animate-pulse rounded-2xl bg-slate-100 px-4 py-5 text-sm text-slate-500">Aguardando renderização da prévia.</div>;
  if (result.status === 'empty' || result.status === 'waiting_data' || (!rows.length && scalar === null)) return <EmptyWidget>{result.message ?? 'Aguardando dados suficientes para exibir este indicador.'}</EmptyWidget>;
  if (widget.visual_type === 'kpi') return <div className="mt-6"><p className="text-4xl font-black tracking-tight text-slate-950 md:text-5xl">{scalar ?? formatValue(rows.length)}</p><p className="mt-2 text-sm text-slate-500">Valor consolidado do indicador</p></div>;
  if (!rows.length) return <EmptyWidget>{result.message ?? 'Dados insuficientes para renderizar este tipo visual.'}</EmptyWidget>;
  if (widget.visual_type === 'bar') return <NumericBars rows={rows} />;
  if (widget.visual_type === 'line') return <NumericBars rows={rows} line />;
  if (widget.visual_type === 'pie') return <div className="mt-5 space-y-2.5">{rows.slice(0, 6).map((row, index) => { const values = Object.values(row); return <div key={index} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3.5 py-3"><span className={`h-3 w-3 shrink-0 rounded-full ${palette[index % palette.length]}`} /><span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700">{String(values[0] ?? `Fatia ${index + 1}`)}</span><strong className="text-sm tabular-nums text-slate-950">{formatValue(values.at(-1))}</strong></div>; })}</div>;
  const columns = visibleColumns(rows);
  if (!columns.length) return <EmptyWidget>Não há colunas relevantes para exibir neste resultado.</EmptyWidget>;
  return <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200"><table className="w-full min-w-[480px] text-left text-sm"><thead className="bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-500"><tr>{columns.map((key) => <th key={key} className="whitespace-nowrap px-4 py-3">{friendlyLabel(key)}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{rows.slice(0, 8).map((row, index) => <tr key={index} className="hover:bg-blue-50/40">{columns.map((key) => <td key={key} className="whitespace-nowrap px-4 py-3 text-slate-700">{formatValue(row[key], key)}</td>)}</tr>)}</tbody></table></div>;
}
