import assert from 'node:assert/strict';

import { DashboardSnapshotSummarizerService } from '../dashboards/dashboard-snapshot-summarizer.service';
import { ReportSnapshotSummarizerService } from '../reports/report-snapshot-summarizer.service';

const reportSummarizer = new ReportSnapshotSummarizerService();
const reportTable = reportSummarizer.snapshot({
  data: { table: { rows: [{ cliente: 'Cliente A', valor: 120, status: 'entregue' }, { cliente: 'Cliente B', valor: 80, status: 'em trânsito' }] } },
}, 'table');

assert.deepEqual(reportTable.dataSummary.columns, ['cliente', 'valor', 'status']);
assert.equal((reportTable.dataSummary.sample_rows as unknown[]).length, 2);
assert.deepEqual(reportTable.dataSummary.numeric_columns, ['valor']);
assert.equal((reportTable.dataSummary.top_numeric_values as Array<{ value: number }>)[0]?.value, 120);
assert.deepEqual(reportTable.deterministicSummary.data_quality_notes, []);

const reportMatrix = reportSummarizer.snapshot({
  data: { columns: ['Entregue', 'Pendente'], rows: [['SP', 12, 3], ['RJ', 8, 5]], row_labels: ['SP', 'RJ'] },
}, 'matrix');

assert.equal(reportMatrix.dataSummary.rows_count, 2);
assert.equal(reportMatrix.dataSummary.columns_count, 2);
assert.deepEqual(reportMatrix.dataSummary.column_labels_sample, ['Entregue', 'Pendente']);
assert.equal(reportMatrix.dataSummary.non_empty_cells_count, 4);
assert.equal(reportMatrix.dataSummary.max_cell_label, 'SP / Entregue');
assert.equal(reportMatrix.dataSummary.max_cell_value, 12);
assert.equal((reportMatrix.deterministicSummary.sample_rows as unknown[]).length, 2);

const dashboardMatrix = new DashboardSnapshotSummarizerService().snapshot({
  data: { values: [{ row: 'SP', column: 'Entregue', value: 12 }, { row: 'RJ', column: 'Entregue', value: 8 }] },
}, 'matrix');
assert.equal(dashboardMatrix.deterministicSummary.rows_count, 2);
assert.equal(dashboardMatrix.deterministicSummary.columns_count, 1);

console.log('widget result snapshot local test passed');
