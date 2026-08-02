import { strict as assert } from 'node:assert';
import { GeneralChatOrchestratorService } from './general-chat-orchestrator.service';
import { generalChatToolDefinitions, GENERAL_CHAT_ALLOWED_ARGUMENTS, GENERAL_CHAT_FUNCTION_TO_KEY } from './general-chat-tool-contracts';
import { ChatService } from './chat.service';
import { AgentToolExecutorService } from './agent-tool-executor.service';
import { AiGatewayService } from './ai-gateway.service';

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
  assert.equal(inputs[2].dashboard_id,'dashboard-1');assert.equal(inputs[3].report_job_id,'job-1');assert.equal(inputs[5].report_id,'report-1');
  const voice=await orchestrator.executeRealtimeTool('tenant','agent','treated_data_summary_get',{},'voice-run');assert.equal((voice as any).record_count,60);
  assert.deepEqual(executed,[...cases.map(item=>item[2]),'treated_data.summary.get']);
  assert.deepEqual(logged,executed);
  const exposed=new Set(generalChatToolDefinitions().map((tool:any)=>tool.name));for(const name of Object.keys(GENERAL_CHAT_FUNCTION_TO_KEY))assert.ok(exposed.has(name),`${name} não foi exposta pelo gateway`);
  for(const definition of generalChatToolDefinitions()){const key=GENERAL_CHAT_FUNCTION_TO_KEY[definition.name];assert.deepEqual(Object.keys(definition.parameters.properties).sort(),[...GENERAL_CHAT_ALLOWED_ARGUMENTS[key]].sort(),`${key} divergiu do contrato público`);}
  const continued:any[]=[];const multiGateway:any={generalChatToolCall:async()=>({response_id:'multi',calls:[{id:'call-1',name:'analytics_result_get',arguments:{metric_key:'frete_total',filters:{customer_name:'  Cliente A  ',cte_number:'',invoice_number:null},period:{start:'',end:''}}},...Array.from({length:4},(_,index)=>({id:`call-${index+2}`,name:'treated_data_summary_get',arguments:{}}))]}),generalChatToolContinue:async(input:any)=>{continued.push(input);return{done:true,answer:'Resposta compacta.'}},generalChatToolFinal:async()=>({answer:'Resposta compacta.'})};
  const sanitizedInputs:any[]=[];const multiTools:any={execute:async(_tenant:string,key:string,input:any)=>{sanitizedInputs.push({key,input});return{found:true}}};const multi=new GeneralChatOrchestratorService(multiGateway,multiTools,db);const multiResult:any=await multi.execute('tenant',agent,'qual o frete total do periodo',[],'run',{});assert.equal(continued[0].toolResults.length,5);assert.deepEqual(continued[0].toolResults.map((item:any)=>item.call_id),['call-1','call-2','call-3','call-4','call-5']);assert.equal(continued[0].toolResults[4].result.error_code,'TOOL_CALL_LIMIT_REACHED');assert.equal(sanitizedInputs.length,4);assert.equal(sanitizedInputs[0].input.filters.customer_name,'Cliente A');assert.equal(sanitizedInputs[0].input.filters.cte_number,undefined);assert.equal(sanitizedInputs[0].input.period,undefined);assert.equal(multiResult.output_json.sanitized_args,true);
  let round=0,roundFinalCalls=0;const roundOutputs:any[]=[];const roundCall=(id:string)=>({id,name:'treated_data_summary_get',arguments:{}});const roundGateway:any={generalChatToolCall:async()=>({response_id:'round-0',calls:[roundCall('round-call-1')]}),generalChatToolContinue:async(input:any)=>{roundOutputs.push(input.toolResults);round++;return round===4?{response_id:'round-4',calls:[],done:true,answer:'Limite encerrado com segurança.'}:{response_id:`round-${round}`,calls:[roundCall(`round-call-${round+1}`)],done:false}},generalChatToolFinal:async()=>{roundFinalCalls++;return{answer:'não deveria finalizar com chamada pendente'}}};const roundOrchestrator=new GeneralChatOrchestratorService(roundGateway,multiTools,db);await roundOrchestrator.execute('tenant',agent,'faça um resumo operacional',[],'run',{});assert.equal(roundOutputs.length,4);assert.equal(roundOutputs[3][0].call_id,'round-call-4');assert.equal(roundOutputs[3][0].result.error_code,'TOOL_CALL_ROUND_LIMIT_REACHED');assert.equal(roundFinalCalls,0);
  let realtimeInput:any;const realtimeTools:any={execute:async(_tenant:string,_key:string,input:any)=>{realtimeInput=input;return{found:true}}};const realtime=new GeneralChatOrchestratorService(gateway,realtimeTools,db);await realtime.executeRealtimeTool('tenant','agent','analytics_result_get',{metric_key:'frete_total',filters:{customer_name:'  Cliente A  ',cte_number:'',invoice_number:null},period:{start:'',end:''}},'realtime-run');assert.deepEqual(realtimeInput.filters,{customer_name:'Cliente A'});assert.equal(realtimeInput.period,undefined);
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
  console.log('general-chat-tools.local-test: ok');
}

void main();
