import { Injectable } from '@nestjs/common';

/** Summarizes only already-rendered widget results; it never queries data sources. */
@Injectable()
export class DashboardSnapshotSummarizerService {
  summarize(result: unknown, resultShape: string): Record<string, unknown> {
    const notes: string[] = [];
    const data = this.unwrap(result);
    if (resultShape === 'scalar') {
      const value = this.numberOrValue(data);
      return this.withNotes({ type: 'scalar', value, summary: `Indicador escalar com valor ${String(value ?? 'indisponível')}.` }, notes);
    }
    const items = this.items(data);
    const truncated = items.length > 20;
    const visible = items.slice(0, 20);
    if (truncated) notes.push('Resultado truncado para os primeiros 20 itens visíveis.');
    if (resultShape === 'ranking' || resultShape === 'distribution') {
      const entries = visible.map((item, index) => ({ label: this.label(item, index), value: this.value(item) }));
      const numeric = entries.every((entry) => typeof entry.value === 'number');
      const total = numeric ? entries.reduce((sum, entry) => sum + Number(entry.value), 0) : null;
      if (!numeric || !total) notes.push('Não foi possível calcular participações percentuais com segurança.');
      const sorted = [...entries].sort((a, b) => Number(b.value ?? -Infinity) - Number(a.value ?? -Infinity));
      const top = sorted[0]; const second = sorted[1];
      const base: Record<string, unknown> = resultShape === 'ranking'
        ? { type: 'ranking', items_count: visible.length, top_item: top?.label, top_value: top?.value, second_item: second?.label, second_value: second?.value, total_visible_value: total }
        : { type: 'distribution', categories_count: visible.length, largest_category: top?.label, largest_value: top?.value, total_visible_value: total };
      if (total && typeof top?.value === 'number') base[resultShape === 'ranking' ? 'top_share_percent' : 'largest_share_percent'] = this.percent(top.value, total);
      if (total && typeof top?.value === 'number' && typeof second?.value === 'number' && resultShape === 'ranking') base.top_two_share_percent = this.percent(top.value + second.value, total);
      return this.withNotes(base, notes);
    }
    if (resultShape === 'timeseries') {
      const values = visible.map((item) => this.value(item)).filter((value): value is number => typeof value === 'number');
      if (!values.length) notes.push('Série sem valores numéricos suficientes para identificar tendência.');
      return this.withNotes({ type: 'timeseries', points_count: visible.length, first_value: values[0], last_value: values.at(-1), min_value: values.length ? Math.min(...values) : undefined, max_value: values.length ? Math.max(...values) : undefined, trend: values.length > 1 ? (values.at(-1)! > values[0] ? 'up' : values.at(-1)! < values[0] ? 'down' : 'stable') : undefined }, notes);
    }
    if (resultShape === 'matrix') {
      const rows = Array.isArray(data) ? data : Array.isArray((data as any)?.rows) ? (data as any).rows : [];
      const cells: Array<{ label: string; value?: number }> = rows.flatMap((row: any, rowIndex: number) => Object.entries(row ?? {}).map(([key, value]) => ({ label: `${rowIndex + 1}:${key}`, value: typeof value === 'number' ? value : undefined }))).filter((cell: { label: string; value?: number }) => cell.value !== undefined);
      const max = cells.sort((a: { value?: number }, b: { value?: number }) => b.value! - a.value!)[0];
      return this.withNotes({ type: 'matrix', rows_count: rows.length, columns_count: rows[0] && typeof rows[0] === 'object' ? Object.keys(rows[0]).length : 0, max_cell_label: max?.label, max_cell_value: max?.value }, notes);
    }
    const rows = visible;
    if (!rows.length) notes.push('Dados insuficientes no widget para uma análise detalhada.');
    return this.withNotes({ type: 'table', rows_count: rows.length, columns_count: rows[0] && typeof rows[0] === 'object' ? Object.keys(rows[0] as object).length : 0, sampled_rows: rows.length }, notes);
  }
  private unwrap(result: any) { return result?.data ?? result?.result ?? result ?? {}; }
  private items(data: any): any[] { if (Array.isArray(data)) return data; for (const key of ['items', 'rows', 'data', 'series']) if (Array.isArray(data?.[key])) return data[key]; return []; }
  private numberOrValue(data: any): unknown { if (typeof data === 'number' || typeof data === 'string') return data; return data?.value ?? data?.current_value ?? data?.result ?? null; }
  private value(item: any): number | undefined { const value = typeof item === 'number' ? item : item?.value ?? item?.total ?? item?.count ?? item?.y; return typeof value === 'number' && Number.isFinite(value) ? value : undefined; }
  private label(item: any, index: number) { const value = item?.label ?? item?.name ?? item?.category ?? item?.key ?? item?.x; return typeof value === 'string' || typeof value === 'number' ? String(value) : `Item ${index + 1}`; }
  private percent(value: number, total: number) { return Math.round((value / total) * 1000) / 10; }
  private withNotes(summary: Record<string, unknown>, notes: string[]) { return notes.length ? { ...summary, data_quality_notes: notes } : summary; }
}
