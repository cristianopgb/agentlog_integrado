export type VisualType = 'kpi'|'table'|'matrix'|'bar'|'pie'|'line';
const matrix: Record<string, VisualType[]> = { scalar:['kpi'], table:['table'], listing:['table'], distribution:['table','bar','pie'], ranking:['table','bar'], matrix:['matrix','table'], timeseries:['line','table','bar'], empty:['table'] };
export function allowedVisualTypes(indicator: Record<string, unknown>): VisualType[] {
  const shape = String(indicator.result_shape ?? '').toLowerCase();
  if (matrix[shape]) return matrix[shape];
  const type = String(indicator.visualization_type ?? indicator.calculation_type ?? indicator.operation_key ?? '').toLowerCase();
  if (/matrix|pivot/.test(type)) return matrix.matrix;
  if (/ranking/.test(type)) return matrix.ranking;
  if (/distribution/.test(type)) return matrix.distribution;
  if (/series|period|line/.test(type)) return matrix.timeseries;
  if (/latest|table|list/.test(type)) return matrix.table;
  return matrix.scalar;
}
