export type VisualType = 'kpi'|'table'|'matrix'|'bar'|'pie'|'line';
export type ResultShape = 'scalar'|'table'|'matrix'|'distribution'|'ranking'|'timeseries'|'empty';
export type VisualCompatibility = { result_shape: ResultShape; allowed_visual_types: VisualType[]; recommended_visual_type: VisualType; reason: string };

const compatibility: Record<ResultShape, VisualCompatibility> = {
  scalar:{result_shape:'scalar',allowed_visual_types:['kpi'],recommended_visual_type:'kpi',reason:'Este indicador retorna um valor único. Use KPI.'},
  table:{result_shape:'table',allowed_visual_types:['table'],recommended_visual_type:'table',reason:'Este indicador retorna uma lista de registros. Use tabela.'},
  distribution:{result_shape:'distribution',allowed_visual_types:['table','bar','pie'],recommended_visual_type:'bar',reason:'Este indicador retorna uma distribuição por categoria. Use tabela, barra ou pizza.'},
  ranking:{result_shape:'ranking',allowed_visual_types:['table','bar'],recommended_visual_type:'bar',reason:'Este indicador retorna um ranking. Use tabela ou barra.'},
  matrix:{result_shape:'matrix',allowed_visual_types:['matrix','table'],recommended_visual_type:'matrix',reason:'Este indicador cruza linhas e colunas. Use matriz ou tabela.'},
  timeseries:{result_shape:'timeseries',allowed_visual_types:['line','table','bar'],recommended_visual_type:'line',reason:'Este indicador retorna uma evolução temporal. Use linha, tabela ou barra.'},
  empty:{result_shape:'empty',allowed_visual_types:['table'],recommended_visual_type:'table',reason:'Não foi possível determinar a estrutura do resultado. Use tabela; o widget mostrará dados insuficientes quando necessário.'},
};
const nativeShapes: Record<string, ResultShape> = {total_native_records:'scalar',transport_total_deliveries:'scalar',complete_native_records:'scalar',partial_native_records:'scalar',total_value_informed:'scalar',total_freight_informed:'scalar',total_weight_informed:'scalar',transport_total_weight:'scalar',transport_avg_delay:'scalar',latest_treated_records:'table',records_by_document_type:'distribution',records_by_customer:'ranking',records_by_origin_state:'distribution',records_by_destination_state:'distribution',transport_deliveries_by_status:'distribution',transport_deliveries_by_customer:'ranking',transport_deliveries_by_driver:'ranking',transport_deliveries_by_vehicle:'ranking',records_by_period:'timeseries'};

export function resolveResultShape(indicator: Record<string, unknown>): ResultShape {
  const declared = String(indicator.result_shape ?? '').toLowerCase();
  if (declared in compatibility) return declared as ResultShape;
  const key = String(indicator.indicator_key ?? '');
  if (nativeShapes[key]) return nativeShapes[key];
  const config = (indicator.calculation_config && typeof indicator.calculation_config === 'object' ? indicator.calculation_config : {}) as Record<string, unknown>;
  const rows = Array.isArray(config.rows) ? config.rows : [];
  const columns = Array.isArray(config.columns) ? config.columns : [];
  const fields = [...rows, ...columns].map(item => typeof item === 'object' && item ? String((item as Record<string, unknown>).field ?? '') : '');
  const operation = String(config.operation_key ?? indicator.operation_key ?? '').toUpperCase();
  const signal = `${indicator.visualization_type ?? ''} ${indicator.indicator_type ?? ''} ${indicator.calculation_type ?? ''} ${operation}`.toLowerCase();
  const period = config.period && typeof config.period === 'object' ? config.period as Record<string, unknown> : {};
  if (operation === 'PIVOT_CONTROLLED' || rows.length && columns.length || /matrix|pivot/.test(signal)) return 'matrix';
  if (operation === 'SÉRIE_TEMPORAL' || Boolean(period.field) || fields.some(field => /(date|_at$|data|period|periodo|mes|month|dia|day|ano|year)/i.test(field)) || /series|period|line/.test(signal)) return 'timeseries';
  if (operation === 'DISTRIBUIÇÃO_POR_CATEGORIA' || /distribution|group_by/.test(signal)) return 'distribution';
  if (operation === 'RANKING' || /ranking/.test(signal)) return 'ranking';
  if (rows.length || columns.length) return fields.some(field => /(status|state|_uf|origin_state|destination_state|document_type|categoria|category|priority|channel|tipo)/i.test(field)) ? 'distribution' : 'ranking';
  if (/latest|table|list/.test(signal)) return 'table';
  if (/count|sum|avg|min|max|percentage|duration|kpi|monetary|number|contagem|soma|média|mínimo|máximo|percentual|razão_divisão|tempo_médio_entre_datas/.test(signal)) return 'scalar';
  return 'empty';
}
export function visualCompatibility(indicator: Record<string, unknown>): VisualCompatibility { return compatibility[resolveResultShape(indicator)]; }
export function allowedVisualTypes(indicator: Record<string, unknown>): VisualType[] { return visualCompatibility(indicator).allowed_visual_types; }
