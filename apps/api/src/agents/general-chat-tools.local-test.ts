import { strict as assert } from 'node:assert';
import { GeneralChatOrchestratorService } from './general-chat-orchestrator.service';
import { generalChatToolDefinitions, GENERAL_CHAT_ALLOWED_ARGUMENTS, GENERAL_CHAT_FUNCTION_TO_KEY } from './general-chat-tool-contracts';
import { ChatService } from './chat.service';
import { AgentToolExecutorService } from './agent-tool-executor.service';
import { AiGatewayService } from './ai-gateway.service';
import { inspectGeneralChatToolContract } from './general-chat-tool-catalog';
import { finalizeToolDecisionTrace } from './tool-decision-trace';
import { CustomIndicatorsService } from '../custom-indicators/custom-indicators.service';

async function main(){
  const hotfixCalls:Array<{key:string;input:any}>=[];
  const hotfixTools:any={execute:async(_tenant:string,key:string,input:any)=>{hotfixCalls.push({key,input});if(key==='indicators.list_available')return{indicators:[{id:'transitime',name:'Transitime médio',type:'native'}]};if(key==='indicators.get_result')return{found:true,total:18,indicator:{name:'Transitime médio'}};if(key==='treated_data.summary.get')return{found:true,record_count:60,freight_total:1000,gross_weight_total:500,volume_total:20,status:{delivered:8}};if(key==='treated_data.aggregate_records')return{total:input.metric==='deliveries_count'?10:100,metric:input.metric,group_by:input.group_by};if(key==='treated_data.search_records')return{matches:[{id:'record',title:'Registro oficial',summary:{driver_name:'Rafael de Souza Martins'}}]};if(key==='treated_data.get_record_detail')return{fields:{driver_name:'Rafael de Souza Martins',status:'delivered'}};if(key==='knowledge_base.search')return{results:[]};return{found:true};}};
  const hotfixDb:any={select:async(table:string)=>table==='ai_tools'?[{id:'tool'}]:table==='ai_agent_tools'?[{id:'enabled'}]:[],insert:async()=>[],update:async()=>[]};
  const hotfixChat:any=new ChatService(hotfixDb,{} as any,hotfixTools,{} as any),hotfixAgent={id:'agent'};
  const driver='qual a performance do motorista Rafael de Souza Martins';
  const driverPack=await hotfixChat.buildOfficialEvidencePack('tenant','run',hotfixAgent,driver,null,{});assert.equal(driverPack.ambiguity,null);assert.ok(driverPack.evidence.some((item:any)=>item.source_type==='treated_data_summary'));assert.ok(hotfixCalls.some(call=>call.key==='treated_data.search_records'));
  const customer='qual o total de entregas do Materiais de Construcao Planalto Ltda',customerPack=await hotfixChat.buildOfficialEvidencePack('tenant','run',hotfixAgent,customer,null,{});assert.equal(customerPack.ambiguity,null);assert.ok(customerPack.evidence.length>0);assert.ok(!hotfixCalls.some(call=>call.key==='analytics.result.get'));
  const operationPack=await hotfixChat.buildOfficialEvidencePack('tenant','run',hotfixAgent,'faça um resumo operacional',null,{});assert.ok(operationPack.evidence.some((item:any)=>item.source_type==='treated_data_summary'));
  hotfixTools.execute=async(_tenant:string,key:string,input:any)=>{hotfixCalls.push({key,input});if(key==='indicators.list_available')throw new Error('fonte parcial indisponível');if(key==='treated_data.summary.get')return{found:true,record_count:60};if(key==='knowledge_base.search')return{results:[]};return{found:false}};
  const transitimePack=await hotfixChat.buildOfficialEvidencePack('tenant','run',hotfixAgent,'qual o transitime médio de todos os registros',null,{});assert.ok(transitimePack.evidence.length>0);
  const gatewayNormalizer:any=new AiGatewayService({} as any,{inspect:()=>({bytes:0,blocked:false})} as any);assert.match(gatewayNormalizer.answerFromResponse('{"resumo":"60 entregas","alertas":["12 pendentes"]}'),/60 entregas/);
  let narrated=0,orchestratedDirectly=0;const sendDb:any={select:async(table:string)=>{if(table==='ai_chat_conversations')return[{id:'conversation',title:'Operação'}];if(table==='ai_agents')return[{id:'agent',agent_type:'general_chat'}];if(table==='ai_chat_messages'||table==='ai_tool_calls'||table==='ai_runs')return[];return[]},insert:async(table:string,row:any)=>table==='ai_runs'?[{id:'run',...row}]:[{id:'saved',...row}],update:async()=>[]};
  const restoredGateway:any={generalChat:async()=>{narrated++;return{answer:'Resumo com 60 registros.',model_provider:'openai',model_name:'test',input_tokens:1,output_tokens:1,total_tokens:2,dry_run:false}}};
  const restoredOrchestrator:any={execute:async()=>{orchestratedDirectly++;return{content:'direto',response:{model_provider:'system'},observability:{main_tool:'treated_data.summary.get',tool_keys:['treated_data.summary.get'],tool_calls_count:1},output_json:{flow:'controlled_tool_calling'}}}};
  const restoredChat:any=new ChatService(sendDb,restoredGateway,{} as any,restoredOrchestrator);restoredChat.buildOfficialEvidencePack=async()=>{throw new Error('evidence pack não deve ser montado')};await restoredChat.send('tenant','user','conversation',{message:'faça um resumo operacional'});assert.equal(narrated,0);assert.equal(orchestratedDirectly,1);

  const executed:string[]=[],logged:string[]=[],inputs:any[]=[];
  const gateway:any={generalChatToolCall:async()=>({calls:[],response_id:'selection',tool_choice:'auto'}),generalChatToolFinal:async()=>({answer:'Resposta baseada em evidência controlada.',model_provider:'system',llm_final_called:true})};
  const tools:any={execute:async(_tenant:string,key:string,input:any)=>{executed.push(key);inputs.push(input);return key==='treated_data.summary.get'?{found:true,record_count:60}:{found:true,tool_key:key};}};
  const db:any={select:async(table:string)=>table==='ai_tools'?[{id:'tool'}]:[{id:'link'}],insert:async(table:string,row:any)=>{if(table==='ai_tool_calls')logged.push(row.tool_key);return [row];},update:async()=>[]};
  const orchestrator=new GeneralChatOrchestratorService(gateway,tools,db),agent={id:'agent'};
  const cases:Array<[string,Record<string,unknown>,string]>=[
    ['Como está minha operação?',{},'analytics.context.analyze'],
    ['Me mostre resumo dos dados tratados',{},'treated_data.summary.get'],
    ['Analise o dashboard',{page:'dashboard',dashboard_id:'dashboard-1'},'dashboard.get_snapshot'],
    ['Analise o relatório',{page:'report',report_job_id:'job-1'},'reports.get_job_snapshot'],
    ['vc não falou do transitime',{page:'dashboard',dashboard_id:'dashboard-1'},'dashboard.get_snapshot'],
    ['geral do periodo total',{page:'report',report_id:'report-1'},'reports.get_job_snapshot'],
  ];
  for(const [message,context,expected] of cases){const result:any=await orchestrator.execute('tenant',agent,message,[],'run',{channel:'text',...context});assert.equal(result.observability.main_tool,expected);assert.equal(result.output_json.fallback_used,true);}
  assert.equal(inputs[executed.indexOf('dashboard.get_snapshot')].dashboard_id,'dashboard-1');assert.equal(inputs[executed.indexOf('reports.get_job_snapshot')].report_job_id,'job-1');assert.ok(inputs.some((input,index)=>executed[index]==='reports.get_job_snapshot'&&input.report_id==='report-1'));
  const voice=await orchestrator.executeRealtimeTool('tenant','agent','treated_data_summary_get',{},'voice-run');assert.equal((voice as any).record_count,60);
  assert.deepEqual(executed,[...cases.flatMap(item=>item[0].includes('transitime')?['indicators.list_available',item[2]]:[item[2]]),'treated_data.summary.get']);
  assert.deepEqual(logged,executed);
  const exposed=new Set(generalChatToolDefinitions().map((tool:any)=>tool.name));for(const name of Object.keys(GENERAL_CHAT_FUNCTION_TO_KEY))assert.ok(exposed.has(name),`${name} não foi exposta pelo gateway`);
  for(const definition of generalChatToolDefinitions()){const key=GENERAL_CHAT_FUNCTION_TO_KEY[definition.name];assert.deepEqual(Object.keys(definition.parameters.properties).sort(),[...GENERAL_CHAT_ALLOWED_ARGUMENTS[key]].sort(),`${key} divergiu do contrato público`);}
  const continued:any[]=[];const multiGateway:any={generalChatToolCall:async()=>({response_id:'multi',calls:[{id:'call-1',name:'analytics_result_get',arguments:{metric_key:'frete_total',filters:{customer_name:'  Cliente A  ',cte_number:'',invoice_number:null},period:{start:'',end:''}}},...Array.from({length:4},(_,index)=>({id:`call-${index+2}`,name:'treated_data_summary_get',arguments:{}}))]}),generalChatToolContinue:async(input:any)=>{continued.push(input);return{done:true,answer:'Resposta compacta.'}},generalChatToolFinal:async()=>({answer:'Resposta compacta.'})};
  const sanitizedInputs:any[]=[];const multiTools:any={execute:async(_tenant:string,key:string,input:any)=>{sanitizedInputs.push({key,input});return{found:true}}};const multi=new GeneralChatOrchestratorService(multiGateway,multiTools,db);const multiResult:any=await multi.execute('tenant',agent,'qual o frete total do periodo',[],'run',{});assert.equal(continued[0].toolResults.length,5);assert.deepEqual(continued[0].toolResults.map((item:any)=>item.call_id),['call-1','call-2','call-3','call-4','call-5']);assert.equal(continued[0].toolResults[4].result.error_code,'TOOL_CALL_LIMIT_REACHED');assert.equal(sanitizedInputs.length,5);const sanitizedMetric=sanitizedInputs.find(x=>x.key==='analytics.result.get');assert.equal(sanitizedMetric.input.filters.customer_name,'Cliente A');assert.equal(sanitizedMetric.input.filters.cte_number,undefined);assert.equal(sanitizedMetric.input.period,undefined);assert.equal(multiResult.output_json.sanitized_args,true);
  let round=0,roundFinalCalls=0;const roundOutputs:any[]=[];const roundCall=(id:string)=>({id,name:'treated_data_summary_get',arguments:{}});const roundGateway:any={generalChatToolCall:async()=>({response_id:'round-0',calls:[roundCall('round-call-1')]}),generalChatToolContinue:async(input:any)=>{roundOutputs.push(input.toolResults);round++;return round===4?{response_id:'round-4',calls:[],done:true,answer:'Limite encerrado com segurança.'}:{response_id:`round-${round}`,calls:[roundCall(`round-call-${round+1}`)],done:false}},generalChatToolFinal:async()=>{roundFinalCalls++;return{answer:'não deveria finalizar com chamada pendente'}}};const roundOrchestrator=new GeneralChatOrchestratorService(roundGateway,multiTools,db);await roundOrchestrator.execute('tenant',agent,'faça um resumo operacional',[],'run',{});assert.equal(roundOutputs.length,4);assert.equal(roundOutputs[3][0].call_id,'round-call-4');assert.equal(roundOutputs[3][0].result.error_code,'TOOL_CALL_ROUND_LIMIT_REACHED');assert.equal(roundFinalCalls,0);
  let realtimeInput:any;const realtimeTools:any={execute:async(_tenant:string,_key:string,input:any)=>{realtimeInput=input;return{found:true}}};const realtime=new GeneralChatOrchestratorService(gateway,realtimeTools,db);await realtime.executeRealtimeTool('tenant','agent','analytics_result_get',{metric_key:'frete_total',filters:{customer_name:'  Cliente A  ',cte_number:'',invoice_number:null},period:{start:'',end:''}},'realtime-run');assert.deepEqual(realtimeInput.filters,{customer_name:'Cliente A'});assert.equal(realtimeInput.period,undefined);
  const contextualCase=async(message:string,toolName:string,args:any,history:any[]=[])=>{let selectionMessage='',executedInput:any;const caseGateway:any={generalChatToolCall:async(input:any)=>{selectionMessage=input.message;return{response_id:'context',calls:[{id:'context-call',name:toolName,arguments:args}]}},generalChatToolContinue:async()=>({done:true,answer:'Resposta com os dados encontrados.'})};const caseTools:any={execute:async(_tenant:string,_key:string,input:any)=>{executedInput=input;return{found:true,total:5}}};const service=new GeneralChatOrchestratorService(caseGateway,caseTools,db);const result:any=await service.execute('tenant',agent,message,history,'run',{});return{selectionMessage,executedInput,result};};
  const exact=await contextualCase('como está a entrega DOC-2026-000045','operational_record_find',{identifier_value:'DOC-2026-000045',period:{preset:'custom',start:'2023-01-01',end:'2024-06-10'}});assert.equal(exact.executedInput.period,undefined);assert.equal(exact.result.output_json.period_source,'removed_not_explicit');assert.equal(exact.result.output_json.period_sanitized,true);
  const customerPerformance=await contextualCase('faça uma analise da performance do Hospital e Maternidade Sao Lucas','treated_data_aggregate_records',{metric:'deliveries_count',group_by:'status',filters:{customer_name:'Hospital e Maternidade Sao Lucas'},period:{preset:'current_month'}});assert.equal(customerPerformance.executedInput.period,undefined);assert.equal(customerPerformance.executedInput.filters.customer_name,'Hospital e Maternidade Sao Lucas');
  const transitimeHistory=[{role:'user',content:'faça uma analise do transitime do mes de julho'},{role:'assistant',content:'Resultado de julho.'}],transitimeTotal=await contextualCase('faça então do periodo total do sistema','analytics_map_get',{search:'transitime',period:{preset:'current_month'}},transitimeHistory);assert.match(transitimeTotal.selectionMessage,/transitime do mes de julho/i);assert.equal(transitimeTotal.executedInput.period,undefined);assert.equal(transitimeTotal.result.output_json.context_subject_preserved,true);assert.equal(transitimeTotal.result.output_json.period_source,'total_system');
  const driverHistory=[{role:'user',content:'como está a entrega DOC-ANTIGA'},{role:'assistant',content:'Entregue.'},{role:'user',content:'qual a performance do motorista Rafael de Souza Martins'},{role:'assistant',content:'Performance localizada.'}],driverContinuation=await contextualCase('qual o numero dessas entregas','treated_data_aggregate_records',{metric:'deliveries_count',filters:{driver_name:'Rafael de Souza Martins'}},driverHistory);assert.match(driverContinuation.selectionMessage,/motorista Rafael de Souza Martins/i);assert.equal(driverContinuation.executedInput.filters.driver_name,'Rafael de Souza Martins');assert.doesNotMatch(driverContinuation.selectionMessage,/DOC-ANTIGA/);
  const july=await contextualCase('faça a análise em julho','analytics_result_get',{metric_key:'total_entregas',period:{preset:'custom',start:'2026-07-01',end:'2026-07-31'}});assert.deepEqual(july.executedInput.period,{preset:'custom',start:'2026-07-01',end:'2026-07-31'});assert.equal(july.result.output_json.period_source,'explicit_user_message');assert.equal(july.result.output_json.period_sanitized,false);
  const updates:any[]=[],voiceDb:any={select:async(table:string)=>{if(table==='ai_chat_conversations')return[{id:'conversation'}];if(table==='ai_agents')return[{id:'agent',status:'active'}];if(table==='ai_runs')return[{id:'voice-run',output_json:{}}];if(table==='ai_chat_messages')return[{content:'Como está minha operação?',created_at:'2026-07-31T00:00:00.000Z'}];if(table==='ai_tool_calls')return[];return[];},insert:async(_table:string,row:any)=>[{id:'event',...row}],update:async(table:string,_query:string,row:any)=>{if(table==='ai_runs')updates.push(row);return[row];}};
  const chat=new ChatService(voiceDb,{} as any,{} as any,orchestrator);await chat.realtimeEvent('tenant','user','conversation',{ai_run_id:'voice-run',stage:'responded',text:'Resposta sem consulta.'});assert.equal(updates[0].output_json.operational_response_without_tool,true);assert.equal(updates[0].output_json.error_code,'voice_tool_required');
  voiceDb.select=async(table:string)=>{if(table==='ai_chat_conversations')return[{id:'conversation'}];if(table==='ai_agents')return[{id:'agent',status:'active'}];if(table==='ai_runs')return[{id:'voice-run',output_json:{}}];if(table==='ai_chat_messages')return[{content:'Qual o transitime?',created_at:'2026-07-31T00:00:00.000Z'}];if(table==='ai_tool_calls')return[{tool_key:'dashboard.get_snapshot',output_json:{found:true,status:'available'}}];return[];};
  await chat.realtimeEvent('tenant','user','conversation',{ai_run_id:'voice-run',stage:'responded',text:'Resposta consultada.'});assert.equal(updates[1].output_json.operational_response_without_tool,false);assert.equal(updates[1].output_json.main_tool,'dashboard.get_snapshot');assert.equal(updates[1].output_json.error_code,null);assert.equal(updates[1].output_json.tool_results_summary[0].found,true);

  const dashboardId = 'ed99a93f-7ae5-44ce-824d-7fd6847c9653',
    otherDashboard = '11111111-1111-4111-8111-111111111111',
    reportId = '22222222-2222-4222-8222-222222222222',
    jobId = '33333333-3333-4333-8333-333333333333';
  const queries: string[] = [];
  const executorDb: any = {
    activeOperationalSourceFilter: async () => 'data_source_id=in.(source)',
    select: async (table: string, query: string) => {
      queries.push(`${table}?${query}`);
      if (table === 'dashboard_definitions')
        return [
          {
            id: query.includes(otherDashboard) ? otherDashboard : dashboardId,
            title: 'Operação',
            published_version_id: 'version-1',
          },
        ];
      if (table === 'dashboard_versions')
        return [
          {
            id: 'version-1',
            snapshot: {
              widgets: [
                {
                  id: 'w1',
                  title: 'Frete total',
                  visual_type: 'kpi',
                  indicator_id: 'freight',
                  result: { value: 1200 },
                },
                {
                  id: 'w2',
                  title: 'Entregas por cliente',
                  visual_type: 'bar',
                  indicator_id: 'deliveries',
                  result: { rows: [{ label: 'Cliente A', value: 60 }] },
                },
                {
                  id: 'w3',
                  title: 'Transitime médio',
                  visual_type: 'kpi',
                  indicator_id: 'transitime',
                  deterministic_summary: { value: 23 },
                },
              ],
            },
          },
        ];
      if (table === 'dashboard_widgets') return [];
      if (table === 'report_definitions')
        return [{ id: reportId, name: 'TesteV10' }];
      if (table === 'report_jobs')
        return [
          {
            id: jobId,
            report_definition_id: reportId,
            created_at: '2026-07-31',
            render_snapshot: { blocks: [{ title: 'Transitime', value: 23 }] },
            data_snapshot: { records_count: 60 },
            ai_snapshot: null,
          },
        ];
      return [];
    },
  };
  const widgets: any[] = [
    {
      id: 'freight',
      title: 'Frete total',
      visual_type: 'kpi',
      indicator_source: 'native',
      indicator_id: 'freight',
    },
    {
      id: 'records',
      title: 'Registros totais',
      visual_type: 'kpi',
      indicator_source: 'native',
      indicator_id: 'records',
    },
    {
      id: 'transitime',
      title: 'Transitime médio do período',
      visual_type: 'kpi',
      indicator_source: 'native',
      indicator_id: 'transitime',
    },
    {
      id: 'status',
      title: 'Entregas por status',
      visual_type: 'pie',
      indicator_source: 'native',
      indicator_id: 'status',
    },
    {
      id: 'ranking',
      title: 'Entregas por cliente',
      visual_type: 'bar',
      indicator_source: 'native',
      indicator_id: 'ranking',
    },
    {
      id: 'timeline',
      title: 'Entregas no período',
      visual_type: 'line',
      indicator_source: 'native',
      indicator_id: 'timeline',
    },
    {
      id: 'table',
      title: 'Entregas',
      visual_type: 'table',
      indicator_source: 'custom',
      indicator_id: 'table',
    },
    {
      id: 'matrix',
      title: 'Matriz de rotas',
      visual_type: 'matrix',
      indicator_source: 'custom',
      indicator_id: 'matrix',
    },
  ];
  const previews: any = {
    freight: { status: 'available', value: 1200 },
    records: { status: 'available', display_value: '60 registros' },
    transitime: { status: 'partial', value: 23, display_value: '23 horas' },
    status: {
      status: 'available',
      series: [
        { label: 'Entregue', value: 40 },
        { label: 'Em trânsito', value: 20 },
      ],
    },
    ranking: {
      status: 'available',
      series: [{ label: 'Cliente A', value: 60 }],
    },
    timeline: { status: 'available', series: [{ label: 'Julho', value: 60 }] },
    table: {
      status: 'available',
      table: { rows: [{ documento: 'CTE-1', status: 'Entregue' }] },
    },
    matrix: {
      status: 'available',
      table: { rows: [{ rota: 'SP/RJ', entregas: 12 }] },
      series: [{ label: 'SP/RJ', value: 12 }],
    },
  };
  const publishedPreview: any = {
    load: async () => ({ version: { id: 'version-1' }, widgets }),
    previewWidget: async (_t: string, w: any) => previews[w.id],
  };
  const executor = new AgentToolExecutorService(
    executorDb,
    { list: async () => ({ data: [] }) } as any,
    { list: async () => ({ data: [] }) } as any,
    publishedPreview,
  );
  const real: any = await executor.execute('tenant', 'dashboard.get_snapshot', {
    dashboard_id: dashboardId,
  });
  assert.equal(real.dashboard_id, dashboardId);
  assert.equal(real.key_indicators.length, 3);
  assert.equal(real.key_indicators[0].value, 1200);
  assert.equal(real.key_indicators[1].value, '60 registros');
  assert.equal(real.rankings[0].series[0].value, 60);
  assert.ok(real.breakdowns.length > 1);
  assert.equal(real.tables.length, 2);
  assert.equal(real.unavailable_widgets.length, 0);
  assert.equal(
    real.key_indicators.find((widget: any) =>
      widget.title.includes('Transitime'),
    ).value,
    23,
  );
  await executor.execute('tenant', 'dashboard.get_snapshot', {
    dashboard_id: 'latest',
  });
  assert.ok(!queries.some((query) => query.includes('id=eq.latest')));
  const contextual: any = await executor.execute(
    'tenant',
    'dashboard.get_snapshot',
    {
      dashboard_id: 'latest',
      client_context: { dashboard_id: otherDashboard },
    },
  );
  assert.equal(contextual.dashboard_id, otherDashboard);
  assert.ok(queries.some((query) => query.includes(`id=eq.${otherDashboard}`)));
  const byContext: any = await executor.execute(
    'tenant',
    'reports.get_job_snapshot',
    { client_context: { report_id: reportId } },
  );
  assert.equal(byContext.report_job_id, jobId);
  assert.ok(
    queries.some((query) =>
      query.includes(`report_definition_id=eq.${reportId}`),
    ),
  );
  await executor.execute('tenant', 'reports.get_job_snapshot', {
    report_job_id: 'testev10',
  });
  assert.ok(!queries.some((query) => query.includes('id=eq.testev10')));
  assert.ok(queries.some((query) => query.includes('report_definitions?')));
  await executor.execute('tenant', 'reports.get_job_snapshot', {
    report_job_id: 'latest',
  });
  assert.ok(!queries.some((query) => query.includes('id=eq.latest')));
  const sixty = Array.from({ length: 60 }, (_, index) => ({
    id: String(index),
    status: index < 12 ? 'delivered' : 'in_transit',
    created_at: '2026-01-01T00:00:00.000Z',
    freight_value: 1,
    gross_weight: 1,
    volume_count: 1,
  }));
  const totalDb: any = {
    activeOperationalSourceFilter: async () => 'data_source_id=in.(source)',
    select: async (table: string) =>
      table === 'operation_records' ? sixty : [],
  };
  const totalExecutor = new AgentToolExecutorService(
      totalDb,
      { list: async () => ({ data: [] }) } as any,
      { list: async () => ({ data: [] }) } as any,
      publishedPreview,
    ),
    total: any = await totalExecutor.execute(
      'tenant',
      'analytics.context.analyze',
      {
        context_type: 'operation',
        period: { preset: 'custom', start: '2000-01-01', end: '2099-12-31' },
      },
    );
  assert.equal(total.totals.total_records, 60);
  assert.equal(total.totals.delivered, 12);
  assert.ok(
    !total.data_quality_notes.some((note: string) =>
      note.includes('ficaram fora do período'),
    ),
  );
  // Sprint 17: catalog-first routing is identical for text and Realtime.
  const sprintCatalog=[{id:'custom-r-ton',name:'R$/ton por Cliente',source_type:'custom',aliases:['r$/ton','reais por tonelada'],available_for_dashboard:true,available_for_reports:true},{id:'custom-transitime',name:'transitime médio por entrega',source_type:'custom',aliases:['transitime'],available_for_dashboard:true,available_for_reports:true},{id:'custom-weight',name:'Clientes / peso',source_type:'custom',aliases:['peso por cliente'],available_for_dashboard:true,available_for_reports:true}];
  const sprintCalls:any[]=[],sprintTools:any={execute:async(_t:string,key:string,input:any)=>{if(key==='indicators.list_available')return{indicators:sprintCatalog};sprintCalls.push({key,input});return{found:true,value:12.5,unit:'BRL/t',display_value:'R$ 12,50/t',value_format:'currency_per_ton',records_used:4,filters_applied:input.filters||{},data_quality_notes:[]};}},sprintDb:any={select:async(table:string)=>table==='ai_tools'?[{id:'tool'}]:[{id:'enabled'}],insert:async()=>[],update:async()=>[]};
  const sprintGateway:any={generalChatToolCall:async()=>({response_id:'s17',calls:[{id:'s17-call',name:'analytics_result_get',arguments:{metric_key:'frete_medio'}}]}),generalChatToolContinue:async()=>({done:true,answer:'R$ 12,50/t'})},sprint=new GeneralChatOrchestratorService(sprintGateway,sprintTools,sprintDb);
  const sprintText:any=await sprint.execute('tenant',{id:'agent'},'faça uma análise do reais por tonelada médio e compare com o da Clinica Integrada Santa Clara',[],'s17-run',{});assert.equal(sprintCalls[0].key,'indicators.get_result');assert.equal(sprintCalls[0].input.id,'custom-r-ton');assert.equal(sprintCalls[0].input.compare,true);assert.equal(sprintText.output_json.tool_rerouted,true);assert.equal(sprintText.output_json.resolved_source_type,'custom_indicator');assert.notEqual(sprintCalls[0].input.metric_key,'frete_medio');
  assert.equal(sprintText.output_json.tool_decision_trace.model_selected_tool_key,'analytics.result.get');assert.equal(sprintText.output_json.tool_decision_trace.resolved_tool_key,'indicators.get_result');assert.equal(sprintText.output_json.tool_decision_trace.root_cause_stage,'resolver_rerouted_correctly');
  const contradiction=finalizeToolDecisionTrace({channel:'text',operational_detected:true,_tool_output:{found:true,status:'available',value:12}},'não encontrei dados');assert.equal(contradiction.final_answer_classification,'contradicts_available_tool_output');assert.equal(contradiction.root_cause_stage,'tool_output_available_but_answer_ignored');
  const nullValue=finalizeToolDecisionTrace({channel:'text',operational_detected:true,_tool_output:{found:true,status:'available',value:null,display_value:null}},'não encontrei dados');assert.equal(nullValue.tool_output_has_value,false);assert.notEqual(nullValue.root_cause_stage,'tool_output_available_but_answer_ignored');
  for(const output of [{found:true,status:'available',record_count:60},{found:true,status:'available',key_indicators:[{title:'Total',value:60}]},{found:true,status:'available',totals:{total_records:60}}]){const structured=finalizeToolDecisionTrace({channel:'text',operational_detected:true,_tool_output:output},'resultado disponível');assert.equal(structured.tool_output_has_structured_data,true);assert.equal(structured.root_cause_stage,'no_issue');}
  const misrepresented=finalizeToolDecisionTrace({channel:'text',operational_detected:true,_tool_output:{found:true,status:'failed',indicator:{name:'Indicador'}}},'indicador não existe');assert.equal(misrepresented.root_cause_stage,'final_answer_not_grounded_in_tool_output');
  assert.equal(finalizeToolDecisionTrace({channel:'text',operational_detected:true,fallback_used:true,_tool_output:{found:true,status:'available',rows:[{value:1}]}},'resultado').root_cause_stage,'fallback_used_incorrectly');
  assert.equal(finalizeToolDecisionTrace({channel:'voice',last_user_message_found:false,operational_detected:false,_tool_output:{}},'').root_cause_stage,'voice_missing_user_intent');
  const inspected=inspectGeneralChatToolContract();assert.equal(inspected.tools.length,13);for(const tool of inspected.tools){const definition=generalChatToolDefinitions().find(item=>item.name===tool.function_name)!;assert.deepEqual(tool.allowed_args.sort(),Object.keys(definition.parameters.properties).sort());}
  const realtimeUpdates:any[]=[],invalidRealtimeDb:any={select:async(table:string)=>table==='ai_tools'?[{id:'tool'}]:[{id:'enabled'}],insert:async()=>[],update:async(_table:string,_query:string,value:any)=>{realtimeUpdates.push(value);return[value];}},invalidRealtime=new GeneralChatOrchestratorService(sprintGateway,sprintTools,invalidRealtimeDb),invalidRealtimeResult:any=await invalidRealtime.executeRealtimeTool('tenant','agent','indicators_get_result',{id:'custom-r-ton',compare:'sim'},'invalid-voice',{last_user_message:'compare o indicador'});assert.equal(invalidRealtimeResult.error_code,'TOOL_NOT_ALLOWED');assert.equal(realtimeUpdates.length,1);assert.equal(realtimeUpdates[0].output_json.tool_decision_trace.root_cause_stage,'invalid_tool_arguments');
  const dashboardMetric:any=await sprint.execute('tenant',{id:'agent'},'faça análise do R$/ton da Clínica Integrada Santa Clara',[],'dashboard-metric',{page:'dashboard',dashboard_id:'dashboard-context'});assert.equal(dashboardMetric.output_json.resolved_source_type,'custom_indicator');assert.equal(dashboardMetric.output_json.resolved_indicator_name,'R$/ton por Cliente');assert.equal(sprintCalls.at(-1).key,'indicators.get_result');
  await sprint.executeRealtimeTool('tenant','agent','analytics_result_get',{metric_key:'frete_medio'},'voice-run',{last_user_message:'analise o R$/ton da Clínica Integrada Santa Clara'});assert.equal(sprintCalls.at(-1).key,'indicators.get_result');assert.equal(sprintCalls.at(-1).input.id,'custom-r-ton');
  let recoveredVoiceContext:any;const recoveryDb:any={select:async(table:string)=>table==='ai_chat_conversations'?[{id:'conversation'}]:table==='ai_agents'?[{id:'agent',status:'active'}]:table==='ai_runs'?[{id:'voice-run',input_snapshot:{client_context:{page:'dashboard'}}}]:table==='ai_chat_messages'?[{content:'analise o R$/ton da Clínica Integrada Santa Clara'}]:[],insert:async()=>[],update:async()=>[]},recoveryOrchestrator:any={executeRealtimeTool:async(_t:string,_a:string,_n:string,_args:any,_run:string,context:any)=>{recoveredVoiceContext=context;return{found:true}}},recoveryChat=new ChatService(recoveryDb,{} as any,{} as any,recoveryOrchestrator);await recoveryChat.realtimeTool('tenant','user','conversation',{ai_run_id:'voice-run',name:'analytics_result_get',arguments:{metric_key:'frete_medio'}});assert.equal(recoveredVoiceContext.last_user_message,'analise o R$/ton da Clínica Integrada Santa Clara');
  await sprint.executeRealtimeTool('tenant','agent','analytics_result_get',{metric_key:'frete_medio'},'voice-run',{last_user_message:'me fale o transitime médio das entregas'});assert.equal(sprintCalls.at(-1).input.id,'custom-transitime');
  const noPermissionDb:any={select:async(table:string)=>table==='ai_tools'?[]:[{id:'enabled'}],insert:async()=>[],update:async()=>[]},noPermission=new GeneralChatOrchestratorService(sprintGateway,sprintTools,noPermissionDb),denied:any=await noPermission.resolveAnalyticSource('tenant','agent','R$/ton','R$/ton',{},'denied-run');assert.equal(denied.catalog_permission_checked,true);assert.equal(denied.catalog_available,false);assert.equal(denied.resolved_source_type,'unavailable');assert.equal(denied.resolved_indicator_name,null);
  let deniedFinalCalls=0,deniedToolExecutions=0;const deniedGateway:any={generalChatToolCall:async()=>({response_id:'denied',calls:[]}),generalChatToolFinal:async()=>{deniedFinalCalls++;return{answer:'não deve chamar'}}},deniedTools:any={execute:async()=>{deniedToolExecutions++;return{}}},deniedService=new GeneralChatOrchestratorService(deniedGateway,deniedTools,noPermissionDb),deniedFallback:any=await deniedService.execute('tenant',{id:'agent'},'me fale o R$/ton',[],'denied-fallback',{});assert.equal(deniedFallback.output_json.error_code,'indicator_catalog_not_available');assert.equal(deniedFallback.output_json.fallback_used,false);assert.equal(deniedFallback.output_json.resolved_source_type,'unavailable');assert.equal(deniedFinalCalls,0);assert.equal(deniedToolExecutions,0);assert.match(deniedFallback.content,/precisa estar liberado para o agente/);
  assert.throws(()=>((sprint as any).validateCall('indicators.get_result',{id:'custom-r-ton',compare:'sim'})),/Comparação inválida/);let invalidCompareOutput:any;const invalidCompareGateway:any={generalChatToolCall:async()=>({response_id:'invalid-compare',calls:[{id:'invalid-compare-call',name:'indicators_get_result',arguments:{id:'custom-r-ton',compare:'sim'}}]}),generalChatToolContinue:async(input:any)=>{invalidCompareOutput=input.toolResults[0].result;return{done:true,answer:'Parâmetros inválidos.'}}},invalidCompareService=new GeneralChatOrchestratorService(invalidCompareGateway,sprintTools,sprintDb);await invalidCompareService.execute('tenant',{id:'agent'},'consulte este indicador',[],'invalid-compare',{});assert.equal(invalidCompareOutput.error_code,'INVALID_TOOL_ARGUMENTS');
  let dashboardInput:any;const dashboardTools:any={execute:async(_t:string,key:string,input:any)=>{if(key==='indicators.list_available')return{indicators:[]};dashboardInput=input;return{found:true,key_indicators:[]};}};const dashboardService=new GeneralChatOrchestratorService(sprintGateway,dashboardTools,sprintDb);const dashboardSummary:any=await dashboardService.execute('tenant',{id:'agent'},'resumo do dashboard',[],'dashboard-run',{page:'dashboard',dashboard_id:'dashboard-context'});assert.equal(dashboardSummary.output_json.resolved_tool_key,'dashboard.get_snapshot');assert.equal(dashboardInput.dashboard_id,'dashboard-context');
  const transitimeGateway:any={generalChatToolCall:async()=>({response_id:'transitime',calls:[{id:'call',name:'analytics_context_analyze',arguments:{context_type:'operation'}}]}),generalChatToolContinue:async()=>({done:true,answer:'Análise.'})},transitimeResult:any=await new GeneralChatOrchestratorService(transitimeGateway,sprintTools,sprintDb).execute('tenant',{id:'agent'},'faça uma analise do transitime',[],'transitime-run',{});assert.equal(transitimeResult.output_json.tool_decision_trace.executed_tool_key,'indicators.get_result');assert.match(transitimeResult.output_json.resolved_indicator_name,/transitime/i);assert.equal(transitimeResult.output_json.tool_rerouted,true);assert.equal(transitimeResult.output_json.tool_decision_trace.reroute_reason,'specific_indicator_overrides_generic_context');assert.notEqual(transitimeResult.output_json.tool_decision_trace.root_cause_stage,'no_issue');
  const aggregateCalls:string[]=[],aggregateGateway:any={generalChatToolCall:async()=>({response_id:'aggregate',calls:[{id:'call',name:'treated_data_aggregate_records',arguments:{metric:'avg_freight_informed',group_by:'customer_name'}}]}),generalChatToolContinue:async()=>({done:true,answer:'Agregação.'})},aggregateTools:any={execute:async(_t:string,key:string)=>{if(key==='indicators.list_available')return{indicators:[]};aggregateCalls.push(key);return{found:true,rows:[{value:10}]};}},aggregateResult:any=await new GeneralChatOrchestratorService(aggregateGateway,aggregateTools,sprintDb).execute('tenant',{id:'agent'},'e o frete médio e custo total por cliente',[],'aggregate-run',{page:'dashboard'});assert.ok(['treated_data.aggregate_records','indicators.get_result'].includes(aggregateResult.output_json.tool_decision_trace.executed_tool_key));assert.ok(!aggregateCalls.includes('dashboard.get_snapshot'));
  const recordCalls:string[]=[],recordGateway:any={generalChatToolCall:async()=>({response_id:'record',calls:[{id:'call',name:'operational_record_find',arguments:{identifier_value:'DOC-2026-000045'}}]}),generalChatToolContinue:async()=>({done:true,answer:'Documento.'})},recordTools:any={execute:async(_t:string,key:string)=>{recordCalls.push(key);return{found:true,record:{delivery_number:'DOC-2026-000045'}};}},recordResult:any=await new GeneralChatOrchestratorService(recordGateway,recordTools,sprintDb).execute('tenant',{id:'agent'},'faça um resumo da entrega DOC-2026-000045',[],'record-run',{page:'dashboard'});assert.equal(recordResult.output_json.tool_decision_trace.executed_tool_key,'operational.record.find');assert.notEqual(recordResult.output_json.resolved_tool_key,'dashboard.get_snapshot');assert.notEqual(recordResult.output_json.metric_alias_detected,'entregas');assert.deepEqual(recordCalls,['operational.record.find']);
  const fallbackRecordCalls:string[]=[],fallbackRecordGateway:any={generalChatToolCall:async()=>({response_id:'record-fallback',calls:[]}),generalChatToolFinal:async()=>({answer:'Documento via fallback.',model_provider:'openai',llm_final_called:true})},fallbackRecordTools:any={execute:async(_t:string,key:string)=>{fallbackRecordCalls.push(key);return{found:true,record:{delivery_number:'DOC-2026-000045'}};}};const fallbackRecordResult:any=await new GeneralChatOrchestratorService(fallbackRecordGateway,fallbackRecordTools,sprintDb).execute('tenant',{id:'agent'},'faça um resumo da entrega DOC-2026-000045',[],'record-fallback-run',{page:'dashboard'});assert.equal(fallbackRecordResult.output_json.tool_decision_trace.executed_tool_key,'operational.record.find');assert.ok(!fallbackRecordCalls.includes('dashboard.get_snapshot'));assert.deepEqual(fallbackRecordCalls,['operational.record.find']);
  const indicatorNotExecuted=finalizeToolDecisionTrace({channel:'text',user_message:'transitime',operational_detected:true,metric_alias_detected:'transitime',resolved_tool_key:'indicators.get_result',resolved_source_type:'custom_indicator',executed_tool_key:'analytics.context.analyze',_tool_output:{found:true,status:'available',totals:{total_records:60}}},'Análise.');assert.equal(indicatorNotExecuted.root_cause_stage,'model_selected_wrong_tool');assert.equal(indicatorNotExecuted.final_answer_classification,'specific_indicator_not_executed');const dashboardMisroute=finalizeToolDecisionTrace({channel:'text',user_message:'frete total por cliente',operational_detected:true,model_selected_tool_key:'treated_data.aggregate_records',executed_tool_key:'dashboard.get_snapshot',tool_rerouted:true,_tool_output:{found:true,status:'available',key_indicators:[]}},'Dashboard.');assert.equal(dashboardMisroute.root_cause_stage,'resolver_failed_to_match_indicator');assert.equal(dashboardMisroute.final_answer_classification,'resolver_rerouted_to_generic_dashboard');
  const catalogRows:any[]=[{id:'customer_name',tenant_id:null,module_key:'operation',base_table:'operation_records',field_key:'customer_name',label:'Cliente',data_type:'text',semantic_type:'customer',allowed_operations:['CONTAGEM'],allowed_filters:['igual a','contém'],is_dimension:true,is_measure:false,is_active:true},{id:'freight_value',tenant_id:null,module_key:'operation',base_table:'operation_records',field_key:'freight_value',label:'Frete',data_type:'number',semantic_type:'money',allowed_operations:['SOMA'],allowed_filters:['preenchido'],is_dimension:false,is_measure:true,is_active:true}],operationRows:any[]=[{customer_name:'Rede Mercantil Boa Compra Ltda',freight_value:100},{customer_name:'Outro Cliente',freight_value:200}],customDb:any={select:async(table:string)=>table==='indicator_field_catalog'?catalogRows:table==='custom_calculated_fields'?[]:table==='operation_records'?operationRows:table==='custom_indicator_definitions'?[{calculation_config:{base_table:'operation_records',operation_key:'SOMA',primary_field:'freight_value'}}]:[],insert:async()=>[],update:async()=>[],activeOperationalSourceFilter:async()=>''},customService:any=new CustomIndicatorsService(customDb);
  const invalidPreview:any=await customService.previewConfig('tenant',{base_table:'operation_records',operation_key:'SOMA',primary_field:'campo_inexistente'},undefined,'user',{});assert.equal(invalidPreview.status,'failed');assert.equal(invalidPreview.failure_stage,'validate_config');assert.match(invalidPreview.failure_reason,/catálogo controlado/);assert.ok(!JSON.stringify(invalidPreview).match(/stack|tenant_id|source_id|staging|raw_payload|payload/i));
  const filteredPreview:any=await customService.previewSaved('tenant','custom-id','user',{customer_name:'Rede Mercantil Boa Compra Ltda'});assert.equal(filteredPreview.status,'success');assert.equal(filteredPreview.filters_applied.customer_name.operator,'igual a');assert.equal(filteredPreview.records_considered,1);assert.equal(filteredPreview.config_diagnostics.records_after_runtime_filter,1);
  const emptyPreview:any=await customService.previewSaved('tenant','custom-id','user',{customer_name:'Cliente Inexistente'});assert.equal(emptyPreview.status,'empty');assert.equal(emptyPreview.records_used,0);assert.notEqual(emptyPreview.status,'failed');
  const uuidLogInserts:any[]=[],uuidLogDb:any={...customDb,insert:async(_table:string,value:any)=>{uuidLogInserts.push(value);return[];}};const uuidLogService:any=new CustomIndicatorsService(uuidLogDb);await uuidLogService.log('tenant','custom-id','',{status:'success'});assert.equal(uuidLogInserts.at(-1).user_id,null);assert.notEqual(uuidLogInserts.at(-1).user_id,'');await uuidLogService.log('tenant','','user',{status:'success'});assert.equal(uuidLogInserts.at(-1).custom_indicator_id,null);assert.notEqual(uuidLogInserts.at(-1).custom_indicator_id,'');
  let executorUserId:any='not-called',executorGlobalUserId:any='not-called';const noUserExecutor=new AgentToolExecutorService({} as any,{list:async()=>({data:[]})} as any,{list:async()=>({data:[{id:'custom-id',name:'Indicador sem usuário',status:'active',available_for_dashboard:true,available_for_reports:true}]}),previewSaved:async(_t:string,_id:string,userId:any,input:any)=>{if(Object.keys(input||{}).length)executorUserId=userId;else executorGlobalUserId=userId;return{status:'success',value:10,records_used:1,data_quality_notes:[]};}} as any,{} as any);await noUserExecutor.execute('tenant','indicators.get_result',{id:'custom-id',filters:{customer_name:'X'},compare:true});assert.equal(executorUserId,undefined);assert.equal(executorGlobalUserId,undefined);
  const logFailureDb:any={...customDb,insert:async()=>{throw new Error('invalid input syntax for type uuid: ""');}};const logFailureService:any=new CustomIndicatorsService(logFailureDb);const logFailurePreview:any=await logFailureService.previewSaved('tenant','custom-id','',{customer_name:'Rede Mercantil Boa Compra Ltda'});assert.equal(logFailurePreview.status,'success');assert.equal(logFailurePreview.value,100);assert.ok(logFailurePreview.data_quality_notes.includes('O cálculo foi concluído, mas o registro de auditoria não pôde ser salvo.'));assert.ok(!JSON.stringify(logFailurePreview).includes('invalid input syntax'));assert.ok(!JSON.stringify(logFailurePreview).includes('22P02'));const logFailureExecutor=new AgentToolExecutorService({} as any,{list:async()=>({data:[]})} as any,{list:async()=>({data:[{id:'custom-id',name:'Indicador auditoria',status:'active',available_for_dashboard:true,available_for_reports:true}]}),previewSaved:async()=>logFailurePreview} as any,{} as any);const logFailureTool:any=await logFailureExecutor.execute('tenant','indicators.get_result',{id:'custom-id'});assert.equal(logFailureTool.status,'available');assert.equal(logFailureTool.value,100);assert.ok(logFailureTool.data_quality_notes.includes('O cálculo foi concluído, mas o registro de auditoria não pôde ser salvo.'));assert.ok(!JSON.stringify(logFailureTool).includes('invalid input syntax'));assert.ok(!JSON.stringify(logFailureTool).includes('22P02'));
  const preservingExecutor=new AgentToolExecutorService({} as any,{list:async()=>({data:[]})} as any,{list:async()=>({data:[{id:'custom-id',name:'R$/ton por Cliente',status:'active',available_for_dashboard:true,available_for_reports:true}]}),previewSaved:async()=>({status:'failed',value:null,failure_stage:'calculate',failure_reason:'Fórmula calculada inválida.',failure_code:'calculate_formula_invalida',config_diagnostics:{records_before_filter:2},records_considered:2,records_used:0,records_ignored_missing_data:2,filters_applied:{customer_name:{operator:'igual a',value:'X'}},data_quality_notes:['Fórmula calculada inválida.']})} as any,{} as any);const preserved:any=await preservingExecutor.execute('tenant','indicators.get_result',{id:'custom-id',filters:{customer_name:'X'}});assert.equal(preserved.failure_stage,'calculate');assert.equal(preserved.failure_reason,'Fórmula calculada inválida.');assert.equal(preserved.config_diagnostics.records_before_filter,2);assert.equal(preserved.records_considered,2);assert.equal(preserved.records_used,0);assert.equal(preserved.records_ignored_missing_data,2);assert.equal(preserved.filters_applied.customer_name.operator,'igual a');assert.ok(!preserved.data_quality_notes.includes('Revise os seletores controlados'));
  const successExecutor=new AgentToolExecutorService({} as any,{list:async()=>({data:[]})} as any,{list:async()=>({data:[{id:'success-id',name:'Indicador sucesso',status:'active',available_for_dashboard:true,available_for_reports:true}]}),previewSaved:async()=>({status:'success',value:42,records_used:7,data_quality_notes:[]})} as any,{} as any);const successResult:any=await successExecutor.execute('tenant','indicators.get_result',{id:'success-id'});assert.equal(successResult.status,'available');assert.equal(successResult.value,42);assert.equal(successResult.records_used,7);
  const failedCompareExecutor=new AgentToolExecutorService({} as any,{list:async()=>({data:[]})} as any,{list:async()=>({data:[{id:'failed-id',name:'Indicador falho',status:'active',available_for_dashboard:true,available_for_reports:true}]}),previewSaved:async()=>({status:'failed',value:null,failure_stage:'calculate',failure_reason:'Fórmula calculada inválida.',failure_code:'calculate_formula_invalida',records_used:0,data_quality_notes:['Fórmula calculada inválida.']})} as any,{} as any);const failedCompare:any=await failedCompareExecutor.execute('tenant','indicators.get_result',{id:'failed-id',compare:true});assert.equal(failedCompare.status,'failed');assert.equal(failedCompare.failure_stage,'calculate');assert.equal(failedCompare.failure_reason,'Fórmula calculada inválida.');assert.notEqual(failedCompare.status,'unavailable');
  const emptyCompareExecutor=new AgentToolExecutorService({} as any,{list:async()=>({data:[]})} as any,{list:async()=>({data:[{id:'empty-id',name:'Indicador vazio',status:'active',available_for_dashboard:true,available_for_reports:true}]}),previewSaved:async()=>({status:'empty',value:null,records_used:0,data_quality_notes:['Não há registros compatíveis com o filtro informado.']})} as any,{} as any);const emptyCompare:any=await emptyCompareExecutor.execute('tenant','indicators.get_result',{id:'empty-id',compare:true});assert.equal(emptyCompare.status,'empty');assert.equal(emptyCompare.records_used,0);assert.notEqual(emptyCompare.status,'unavailable');
  const serraRows=[...Array.from({length:15},(_,index)=>({id:`outro-${index}`,customer_name:`Cliente ${index}`,delivery_number:`OUT-${index}`,invoice_number:`100${index}`,cte_number:`200${index}`,status:'delivered',freight_value:50,gross_weight:5,volume_count:1})),...Array.from({length:5},(_,index)=>({id:`serra-${index}`,customer_name:'Industria Alimenticia Serra Azul Ltda',delivery_number:`DOC-${index}`,invoice_number:`900${index}`,cte_number:`800${index}`,status:'delivered',freight_value:100,gross_weight:10,volume_count:1}))];
  const limited=(query:string)=>serraRows.slice(0,Number(query.match(/limit=(\d+)/)?.[1]||serraRows.length));
  const canonicalDb:any={activeOperationalSourceFilter:async()=>'',select:async(table:string,query:string)=>table==='operation_records'?limited(query):[],insert:async()=>[],update:async()=>[]};
  const canonicalExecutor:any=new AgentToolExecutorService(canonicalDb,{list:async()=>({data:[]})} as any,{list:async()=>({data:[]})} as any,{} as any);
  const canonicalRecord:any=await canonicalExecutor.execute('tenant','operational.record.find',{filters:{customer_name:'Indústria Alimentícia Serra Azul ltda'},identifier_type:'invoice_number',identifier_value:'Indústria Alimentícia Serra Azul ltda',limit:5});assert.equal(canonicalRecord.found,true);assert.equal(canonicalRecord.filters_applied.customer_name.matched_value,'Industria Alimenticia Serra Azul Ltda');assert.ok(!JSON.stringify(canonicalRecord.filters_applied).includes('invoice_number'));assert.ok(canonicalRecord.data_quality_notes.includes('O identificador fiscal informado foi ignorado porque parecia ser nome de cliente.'));
  const serraCustomService:any=new CustomIndicatorsService({...customDb,select:async(table:string)=>table==='indicator_field_catalog'?catalogRows:table==='custom_calculated_fields'?[]:table==='operation_records'?serraRows:table==='custom_indicator_definitions'?[{calculation_config:{base_table:'operation_records',operation_key:'SOMA',primary_field:'freight_value'}}]:[]});const canonicalPreview:any=await serraCustomService.previewSaved('tenant','custom-id','user',{customer_name:'Indústria Alimentícia Serra Azul Limitada'});assert.equal(canonicalPreview.config_diagnostics.records_after_runtime_filter,5);assert.equal(canonicalPreview.filters_applied.customer_name.matched_value,'Industria Alimenticia Serra Azul Ltda');
  const ambiguousDb:any={activeOperationalSourceFilter:async()=>'',select:async()=>[{id:'a',customer_name:'Industria Alimenticia Serra Azul Ltda'},{id:'b',customer_name:'Industria Alimenticia Serra Azul Distribuidora Ltda'}],insert:async()=>[],update:async()=>[]};const ambiguousExecutor:any=new AgentToolExecutorService(ambiguousDb,{list:async()=>({data:[]})} as any,{list:async()=>({data:[]})} as any,{} as any);const ambiguousRecord:any=await ambiguousExecutor.execute('tenant','operational.record.find',{filters:{customer_name:'Industria Alimenticia Serra Azul'},limit:5});assert.equal(ambiguousRecord.found,false);assert.equal(ambiguousRecord.needs_clarification,true);assert.equal(ambiguousRecord.ambiguous_candidates.length,2);assert.ok(ambiguousRecord.data_quality_notes.includes('O filtro de cliente ficou ambíguo; confirme o cliente desejado.'));
  const ambiguousCustom:any=new CustomIndicatorsService({...customDb,select:async(table:string)=>table==='indicator_field_catalog'?catalogRows:table==='custom_calculated_fields'?[]:table==='operation_records'?[{customer_name:'Industria Alimenticia Serra Azul Ltda',freight_value:100},{customer_name:'Industria Alimenticia Serra Azul Distribuidora Ltda',freight_value:200}]:table==='custom_indicator_definitions'?[{calculation_config:{base_table:'operation_records',operation_key:'SOMA',primary_field:'freight_value'}}]:[]});const ambiguousPreview:any=await ambiguousCustom.previewSaved('tenant','custom-id','user',{customer_name:'Industria Alimenticia Serra Azul'});assert.equal(ambiguousPreview.status,'empty');assert.ok(ambiguousPreview.data_quality_notes.includes('O filtro de cliente ficou ambíguo; confirme o cliente desejado.'));
  const renderableRowsExecutor=new AgentToolExecutorService({} as any,{list:async()=>({data:[]})} as any,{list:async()=>({data:[{id:'rows-id',name:'R$/ton por Cliente',status:'active',available_for_dashboard:true,available_for_reports:true}]}),previewSaved:async()=>({status:'success',value:null,display_value:null,records_used:5,table:[],series:[{label:'Entrega 1',value:2.5,records:1}],data_quality_notes:[]})} as any,{} as any);const renderableTool:any=await renderableRowsExecutor.execute('tenant','indicators.get_result',{id:'rows-id'});assert.equal(renderableTool.status,'available');assert.equal(renderableTool.value,2.5);assert.equal(renderableTool.rows.length,1);assert.ok(renderableTool.display_value);
  const emptyRenderable:any=await customService.enforceRenderableResult({status:'success',value:null,records_used:5,table:[],series:[]});assert.equal(emptyRenderable.status,'failed');assert.equal(emptyRenderable.failure_stage,'build_result');assert.equal(emptyRenderable.failure_reason,'Indicador calculou registros, mas não gerou saída renderizável.');
  console.log('general-chat-tools.local-test: ok');
}

void main();
