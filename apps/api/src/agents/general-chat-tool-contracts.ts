export const GENERAL_CHAT_TOOL_KEYS = [
  'analytics.map.get','analytics.result.get','analytics.context.analyze','operational.record.find','knowledge.guidance.search',
  'indicators.list_available','indicators.get_result','dashboard.get_snapshot','reports.get_job_snapshot',
  'treated_data.summary.get','treated_data.aggregate_records','treated_data.search_records','treated_data.get_record_detail',
] as const;

export type GeneralChatToolKey=(typeof GENERAL_CHAT_TOOL_KEYS)[number];

export const GENERAL_CHAT_FUNCTION_TO_KEY:Record<string,GeneralChatToolKey>={
  analytics_map_get:'analytics.map.get',analytics_result_get:'analytics.result.get',analytics_context_analyze:'analytics.context.analyze',
  operational_record_find:'operational.record.find',knowledge_guidance_search:'knowledge.guidance.search',
  indicators_list_available:'indicators.list_available',indicators_get_result:'indicators.get_result',
  dashboard_get_snapshot:'dashboard.get_snapshot',reports_get_job_snapshot:'reports.get_job_snapshot',
  treated_data_summary_get:'treated_data.summary.get',treated_data_aggregate_records:'treated_data.aggregate_records',
  treated_data_search_records:'treated_data.search_records',treated_data_get_record_detail:'treated_data.get_record_detail',
};

export const GENERAL_CHAT_FUNCTION_NAMES=Object.keys(GENERAL_CHAT_FUNCTION_TO_KEY);

export function isOperationalMessage(message:string){return /\b(opera[cç][aã]o|dashboard|relat[oó]rio|entregas?|status|frete|cliente|motorista|ve[ií]culo|placa|atraso|indicadores?|resumo|melhoria|performance|sla|dados tratados|registros?|cte|nota|manifesto)\b/i.test(message);}

const period={type:'object',properties:{preset:{type:'string',enum:['today','current_week','current_month','previous_month','custom']},start:{type:'string'},end:{type:'string'}},additionalProperties:false};
const filters={type:'object',properties:{delivery_number:{type:'string'},cte_number:{type:'string'},invoice_number:{type:'string'},manifest_number:{type:'string'},customer_name:{type:'string'},shipper_name:{type:'string'},driver_name:{type:'string'},vehicle_plate:{type:'string'},status:{type:'string'},origin_state:{type:'string'},origin_city:{type:'string'},destination_state:{type:'string'},destination_city:{type:'string'}},additionalProperties:false};
const fn=(name:string,description:string,properties:Record<string,unknown>,required:string[]=[])=>( {type:'function',name,description,parameters:{type:'object',properties,...(required.length?{required}:{}),additionalProperties:false}} );

/** Single OpenAI function contract used by typed chat; Realtime mirrors these strict schemas in the web client. */
export function generalChatToolDefinitions(){return [
  fn('analytics_map_get','Lista resultados analíticos, dashboards, relatórios e indicadores configurados.',{search:{type:'string'}}),
  fn('analytics_result_get','Consulta uma métrica ou resultado analítico homologado na base tratada.',{result_key:{type:'string'},metric_key:{type:'string',enum:['frete_total','frete_medio','peso_total','volume_total','total_entregas','entregas_atrasadas','entregas_canceladas']},breakdown_by:{type:'string',enum:['status','customer_name','shipper_name','driver_name','vehicle_plate','route','origin','destination']},filters,period}),
  fn('analytics_context_analyze','Analisa contexto de operação, entidade, dashboard publicado ou relatório concluído.',{context_type:{type:'string',enum:['dashboard','report','customer','driver','vehicle_plate','shipper','operation']},context_value:{type:'string'},period},['context_type']),
  fn('operational_record_find','Localiza até cinco registros canônicos vigentes por identificador ou filtros.',{identifier_type:{type:'string',enum:['delivery_number','cte_number','invoice_number','manifest_number','vehicle_plate']},identifier_value:{type:'string'},filters,period,limit:{type:'integer',minimum:1,maximum:5}}),
  fn('knowledge_guidance_search','Busca orientação funcional publicada; não substitui dados operacionais.',{topic:{type:'string'},user_question:{type:'string'},limit:{type:'integer',minimum:1,maximum:5}},['topic','user_question']),
  fn('indicators_list_available','Lista indicadores nativos e personalizados disponíveis para o tenant.',{}),
  fn('indicators_get_result','Consulta o resultado oficial de um indicador disponível.',{id:{type:'string'},name:{type:'string'} }),
  fn('dashboard_get_snapshot','Consulta widgets e valores reais do dashboard publicado informado ou mais recente.',{dashboard_id:{type:'string'}}),
  fn('reports_get_job_snapshot','Consulta o snapshot determinístico do job informado ou relatório concluído mais recente.',{report_job_id:{type:'string'}}),
  fn('treated_data_summary_get','Retorna resumo seguro dos registros canônicos vigentes.',{}),
  fn('treated_data_aggregate_records','Executa agregação permitida sobre registros canônicos vigentes.',{metric:{type:'string',enum:['deliveries_count','occurrences_count','cte_count','sum_freight','sum_weight','volume_count','avg_freight_informed']},group_by:{type:'string',enum:['driver_name','customer_name','shipper_name','status','origin_city','origin_state','destination_city','destination_state','origin','destination','route','none']},filters},['metric']),
  fn('treated_data_search_records','Busca limitada de registros canônicos vigentes.',{identifier:{type:'string'},filters,limit:{type:'integer',minimum:1,maximum:10}}),
  fn('treated_data_get_record_detail','Obtém detalhe seguro de um registro canônico vigente.',{id:{type:'string'}},['id']),
];}
