const MAX_ROWS = 20;
const MAX_COLUMNS = 20;
const MAX_MATRIX_CELLS = 50;
const MAX_TEXT_LENGTH = 240;
const SENSITIVE_KEY = /(^|_)(id|tenant_id|indicator_id|source|raw_payload|staging|secret|token|password|client_secret|api_key)$/i;
type Row = Record<string, unknown>;

export type WidgetResultSnapshot = { dataSummary: Record<string, unknown>; deterministicSummary: Record<string, unknown> };

/** Creates a bounded, sanitized summary from an already calculated widget result. */
export function summarizeWidgetResult(result: unknown, resultShape: string, emptyNote: string): WidgetResultSnapshot {
  const notes: string[] = [];
  const data = unwrap(result);
  const shape = ['scalar', 'table', 'matrix', 'distribution', 'ranking', 'timeseries'].includes(resultShape) ? resultShape : 'table';
  const base = { result_available: result !== undefined && result !== null, result_shape: shape };
  let deterministicSummary: Record<string, unknown>;

  if (shape === 'scalar') {
    const value = sanitizeValue(numberOrValue(data));
    deterministicSummary = withNotes({ type: 'scalar', value, summary: `Indicador escalar com valor ${String(value ?? 'indisponível')}.` }, notes);
  } else if (shape === 'matrix') {
    deterministicSummary = matrixSummary(data, notes, emptyNote);
  } else {
    const allRows = extractRows(data);
    const truncated = allRows.length > MAX_ROWS;
    if (truncated) notes.push('Resultado truncado para os primeiros 20 itens visíveis.');
    const rows = allRows.slice(0, MAX_ROWS);
    if (shape === 'ranking' || shape === 'distribution') deterministicSummary = categoricalSummary(shape, rows, notes, emptyNote, allRows.length, truncated);
    else if (shape === 'timeseries') deterministicSummary = timeseriesSummary(rows, notes, allRows.length, truncated);
    else deterministicSummary = tableSummary(rows, notes, emptyNote, allRows.length, truncated);
  }
  const truncated = deterministicSummary.truncated === true;
  const { type: _type, ...summaryData } = deterministicSummary;
  const dataSummary = { ...base, ...summaryData, truncated, data_quality_notes: deterministicSummary.data_quality_notes ?? [] };
  return { dataSummary, deterministicSummary };
}

function tableSummary(rows: Row[], notes: string[], emptyNote: string, rowsCount = rows.length, rowsTruncated = false) {
  if (!rows.length) notes.push(emptyNote);
  const { columns, sampleRows, truncatedColumns } = tabularSample(rows);
  if (truncatedColumns) notes.push('Colunas truncadas para as primeiras 20 colunas visíveis.');
  const numericColumns = columns.filter(column => sampleRows.some(row => number(row[column]) !== undefined));
  const topNumericValues = numericColumns.flatMap(column => sampleRows.map((row, index) => ({ column, label: label(row, index), value: number(row[column]) })).filter((entry): entry is { column: string; label: string; value: number } => entry.value !== undefined)).sort((a, b) => b.value - a.value).slice(0, 10);
  return withNotes({ type: 'table', rows_count: rowsCount, columns_count: columns.length, columns, sample_rows: sampleRows, numeric_columns: numericColumns, top_numeric_values: topNumericValues, truncated: rowsTruncated || truncatedColumns }, notes);
}

function categoricalSummary(shape: string, rows: Row[], notes: string[], emptyNote: string, itemsCount = rows.length, truncated = false) {
  if (!rows.length) notes.push(emptyNote);
  const itemsSample = rows.map((row, index) => ({ label: label(row, index), value: value(row), ...tabularSample([row]).sampleRows[0] }));
  const numericItems = itemsSample.filter((item): item is typeof item & { value: number } => typeof item.value === 'number');
  if (numericItems.length !== itemsSample.length) notes.push('Há valores não numéricos; participações percentuais não foram calculadas para esses itens.');
  const total = numericItems.length === itemsSample.length ? numericItems.reduce((sum, item) => sum + item.value, 0) : null;
  const topItems: Array<{ label: string; value: number; percent?: number }> = [...numericItems].sort((a, b) => b.value - a.value).slice(0, 5).map(item => ({ label: item.label, value: item.value, percent: total === null ? undefined : percent(item.value, total) }));
  const top = topItems[0];
  const base: Record<string, unknown> = { type: shape, items_count: itemsCount, items_sample: itemsSample, top_items: topItems, total_visible_value: total, truncated };
  if (shape === 'ranking') Object.assign(base, { top_item: top?.label, top_value: top?.value, second_item: topItems[1]?.label, second_value: topItems[1]?.value, top_share_percent: top?.percent });
  else Object.assign(base, { categories_count: itemsCount, largest_category: top?.label, largest_value: top?.value, largest_share_percent: top?.percent });
  return withNotes(base, notes);
}

function timeseriesSummary(rows: Row[], notes: string[], pointsCount = rows.length, truncated = false) {
  const pointsSample = rows.map((row, index) => ({ label: label(row, index), value: value(row), ...tabularSample([row]).sampleRows[0] }));
  const numeric = pointsSample.filter((point): point is typeof point & { value: number } => typeof point.value === 'number');
  if (numeric.length < 2) notes.push('Série sem dados numéricos suficientes para identificar tendência.');
  const first = numeric[0]; const last = numeric.at(-1);
  return withNotes({ type: 'timeseries', points_count: pointsCount, points_sample: pointsSample, first_point: first, last_point: last, trend: numeric.length > 1 ? last!.value > first!.value ? 'up' : last!.value < first!.value ? 'down' : 'stable' : undefined, min_value: numeric.length ? Math.min(...numeric.map(point => point.value)) : undefined, max_value: numeric.length ? Math.max(...numeric.map(point => point.value)) : undefined, truncated }, notes);
}

function matrixSummary(data: unknown, notes: string[], emptyNote: string) {
  const parsed = extractMatrix(data);
  if (!parsed.rows.length) notes.push(emptyNote);
  if (parsed.fallback) notes.push('A matriz foi enviada como amostra tabular porque não foi possível identificar células numéricas com segurança.');
  if (parsed.truncated) notes.push('Matriz truncada para os limites seguros de linhas, colunas ou células.');
  const cells = parsed.rows.flatMap((row, rowIndex) => parsed.columns.map(column => ({ label: `${parsed.rowLabels[rowIndex] ?? `Linha ${rowIndex + 1}`} / ${column}`, value: number(row[column]) })).filter((cell): cell is { label: string; value: number } => cell.value !== undefined)).slice(0, MAX_MATRIX_CELLS);
  const max = [...cells].sort((a, b) => b.value - a.value)[0];
  return withNotes({ type: 'matrix', rows_count: parsed.rowsCount, columns_count: parsed.columnsCount, row_labels_sample: parsed.rowLabels.slice(0, MAX_ROWS), column_labels_sample: parsed.columns.slice(0, MAX_COLUMNS), non_empty_cells_count: cells.length, max_cell_label: max?.label, max_cell_value: max?.value, sample_rows: parsed.rows, truncated: parsed.truncated }, notes);
}

function extractMatrix(data: unknown) {
  const d = object(data) ? data : {};
  const nested = object(d.data) ? d.data : {};
  const rawRows = [data, d.matrix, d.rows, d.records, d.values, object(d.table) ? d.table.rows : undefined, d.series, nested.matrix, nested.rows, nested.data, nested.series, nested.values, d.data].find(Array.isArray) as unknown[] | undefined;
  const explicitColumns = [d.columns, nested.columns].find(Array.isArray) as unknown[] | undefined;
  const rowLabels = (([d.row_labels, d.rowLabels, nested.row_labels, nested.rowLabels].find(Array.isArray) as unknown[] | undefined) ?? []).map(text);
  const pointRows = (rawRows ?? []).filter(object);
  const isPointFormat = pointRows.length > 0 && pointRows.every(row => ('row' in row || 'row_label' in row) && ('column' in row || 'column_label' in row) && 'value' in row);
  let rows: Row[];
  let columns: string[];
  let labels: string[];
  if (isPointFormat) {
    columns = unique(pointRows.map(row => text(row.column ?? row.column_label))).filter(Boolean);
    labels = unique(pointRows.map(row => text(row.row ?? row.row_label))).filter(Boolean);
    rows = labels.map(rowLabel => Object.fromEntries(columns.map(column => [column, pointRows.find(row => text(row.row ?? row.row_label) === rowLabel && text(row.column ?? row.column_label) === column)?.value ?? null])));
  } else if ((rawRows ?? []).every(Array.isArray)) {
    columns = (explicitColumns ?? []).map(columnName).filter(Boolean);
    const width = Math.max(0, ...(rawRows ?? []).map(row => Array.isArray(row) ? row.length : 0));
    const hasLeadingRowLabel = columns.length > 0 && width === columns.length + 1;
    if (!columns.length) columns = Array.from({ length: width }, (_, index) => `Coluna ${index + 1}`);
    labels = rowLabels.length ? rowLabels : hasLeadingRowLabel ? (rawRows ?? []).map(row => text((row as unknown[])[0]) || '') : [];
    rows = (rawRows ?? []).map(row => Object.fromEntries((row as unknown[]).slice(hasLeadingRowLabel ? 1 : 0, (hasLeadingRowLabel ? 1 : 0) + MAX_COLUMNS).map((cell, index) => [columns[index] ?? `Coluna ${index + 1}`, cell])));
  } else {
    rows = (rawRows ?? []).filter(object);
    columns = (explicitColumns ?? []).map(columnName).filter(Boolean);
    if (!columns.length) columns = unique(rows.flatMap(row => Object.keys(row).filter(key => !SENSITIVE_KEY.test(key) && !/^(row|row_label|label|name)$/i.test(key))));
    labels = rowLabels.length ? rowLabels : rows.map((row, index) => text(row.row_label ?? row.row ?? row.label ?? row.name) || `Linha ${index + 1}`);
  }
  const rowsCount = rows.length; const columnsCount = columns.length;
  const truncated = rowsCount > MAX_ROWS || columnsCount > MAX_COLUMNS || rowsCount * columnsCount > MAX_MATRIX_CELLS;
  const safeColumns = columns.slice(0, MAX_COLUMNS);
  const maxRowsByCells = Math.max(1, Math.floor(MAX_MATRIX_CELLS / Math.max(1, safeColumns.length)));
  const safeRows = rows.slice(0, Math.min(MAX_ROWS, maxRowsByCells)).map(row => sanitizeRow(row, safeColumns));
  const numericFound = safeRows.some(row => safeColumns.some(column => number(row[column]) !== undefined));
  return { rows: safeRows, columns: safeColumns, rowLabels: labels, rowsCount, columnsCount, truncated, fallback: !numericFound && safeRows.length > 0 };
}

function extractRows(data: unknown): Row[] { const d = object(data) ? data : {}; const nested = object(d.data) ? d.data : {}; for (const candidate of [data, d.rows, d.records, object(d.table) ? d.table.rows : undefined, d.series, nested.rows, nested.data, nested.series]) if (Array.isArray(candidate)) return candidate.filter(object); return []; }
function tabularSample(rows: Row[]) { const allColumns = unique(rows.flatMap(row => Object.keys(row).filter(key => !SENSITIVE_KEY.test(key)))); const columns = allColumns.slice(0, MAX_COLUMNS); return { columns, sampleRows: rows.map(row => sanitizeRow(row, columns)), truncatedColumns: allColumns.length > MAX_COLUMNS }; }
function sanitizeRow(row: Row, columns: string[]) { return Object.fromEntries(columns.map(column => [column, sanitizeValue(row[column])])) as Row; }
function sanitizeValue(value: unknown): unknown { if (value === null || value === undefined) return null; if (typeof value === 'string') return value.length > MAX_TEXT_LENGTH ? `${value.slice(0, MAX_TEXT_LENGTH)}…` : value; if (typeof value === 'number' || typeof value === 'boolean') return value; if (value instanceof Date) return value.toISOString(); return text(value); }
function unwrap(result: any) { return result?.data ?? result?.result ?? result ?? {}; }
function object(value: unknown): value is Row { return !!value && typeof value === 'object' && !Array.isArray(value); }
function number(value: unknown): number | undefined { const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN; return Number.isFinite(parsed) ? parsed : undefined; }
function value(row: Row): number | undefined { return [row.value, row.total, row.count, row.y, ...Object.values(row)].map(number).find((candidate): candidate is number => candidate !== undefined); }
function label(row: Row, index: number) { return text(row.label ?? row.name ?? row.category ?? row.key ?? row.x ?? row.period) || `Item ${index + 1}`; }
function numberOrValue(data: any): unknown { return typeof data === 'number' || typeof data === 'string' ? data : data?.value ?? data?.current_value ?? data?.result ?? null; }
function columnName(value: unknown) { return object(value) ? text(value.label ?? value.name ?? value.key) : text(value); }
function text(value: unknown): string { return typeof value === 'string' || typeof value === 'number' ? String(value).slice(0, MAX_TEXT_LENGTH) : ''; }
function unique(values: string[]) { return [...new Set(values)]; }
function percent(value: number, total: number) { return total ? Math.round(value / total * 1000) / 10 : undefined; }
function withNotes(summary: Record<string, unknown>, notes: string[]) { return { ...summary, data_quality_notes: notes }; }
