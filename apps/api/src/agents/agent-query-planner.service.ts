import { BadRequestException, Injectable } from '@nestjs/common';
import { FILTER_FIELDS, GROUP_FIELDS, METRIC_FIELDS, SemanticCatalog } from './agent-semantic-catalog.service';
export type AgentQueryPlan = {intent:string;confidence:number;reason:string;entity:string;query:string;identifier:string;filters:Record<string,any>;aggregate?:{operation:string;field:string;group_by:string;include_percentage:boolean;limit:number};include:string[];clarification_question?:string};
@Injectable() export class AgentQueryPlannerService {
  async plan(input:{tenantId:string;userId:string;message:string;recentMessages:Array<{role:string;content:string}>;capabilityCatalog:SemanticCatalog}):Promise<AgentQueryPlan>{
    const m=input.message.trim(), s=this.normalize(m); let intent='general_guidance', entity='auto', filters:Record<string,any>={}, aggregate:AgentQueryPlan['aggregate'];
    const name=(label:string)=>new RegExp(`${label}\\s+([\\p{L}][\\p{L} .'-]{2,80})`,'iu').exec(m)?.[1]?.trim(); const plate=/\b[A-Z]{3}[0-9][A-Z0-9][0-9]{2}\b/i.exec(m)?.[0];
    if(plate){filters.vehicle_plate=plate.toUpperCase();entity='vehicle';} else if(name('motorista')){filters.driver_name=name('motorista');entity='driver';} else if(name('cliente')){filters.customer_name=name('cliente');entity='customer';}
    if(/\b(?:uf )?(?:destino|para)\s+([a-z]{2})\b/i.test(m))filters.destination_state=RegExp.$1.toUpperCase(); if(/\b(?:origem|de)\s+([a-z]{2})\b/i.test(m))filters.origin_state=RegExp.$1.toUpperCase();
    const status=this.status(s); if(status)filters.status=status;
    const identifier=/(?:entrega|nf|nota fiscal|cte|ct-e|manifesto)\s*[:#-]?\s*([a-z0-9-]{2,})\b/i.exec(m)?.[1]||'';
    if(/manual|tela|menu|processo|como crio|base de conhecimento/.test(s))intent='knowledge_search';
    else if(/dashboard/.test(s))intent='dashboard_context'; else if(/relatorio/.test(s))intent='report_context';
    else if(/plano de acao|pontos de atencao|riscos operacionais|melhorar/.test(s))intent='operational_overview';
    else if(/indicador/.test(s))intent='indicator_lookup';
    else if(/performance|me fale sobre/.test(s)&&Object.keys(filters).length)intent='entity_performance';
    else if(/quant|total|frete|peso|volumes|media|percentual|participacao| por /.test(s)){intent='aggregate';const field=/frete/.test(s)?'freight_value':/peso/.test(s)?'gross_weight':/volume/.test(s)?'volume_count':'id';const operation=/media/.test(s)?'avg':/menor/.test(s)?'min':/maior/.test(s)?'max':field==='id'?'count':'sum';const group=/por cliente/.test(s)?'customer_name':/por motorista/.test(s)?'driver_name':/por status/.test(s)?'status':/uf destino/.test(s)?'destination_state':/uf origem/.test(s)?'origin_state':'none';aggregate={operation,field,group_by:group,include_percentage:/percentual|participacao/.test(s),limit:20};}
    else if(Object.keys(filters).length)intent=/ultima|ultimo|mais recente|quais entregas/.test(s)?'list_records':'entity_performance';
    else if(/nf|cte|ct-e|manifesto|entrega/.test(s)){intent='record_search';entity='operation_record';}
    const plan:AgentQueryPlan={intent,confidence:intent==='general_guidance'?0.5:0.8,reason:'Plano determinístico validado pela camada semântica.',entity,query:m.slice(0,240),identifier,filters,aggregate,include:['totals','sample_records',...( /quantas.*quais|quais.*quantas/.test(s)?['count_and_list']:[])]};
    if(intent==='general_guidance'){plan.intent='clarification';plan.clarification_question='Você pode informar se deseja consultar registros, indicadores, dashboards, relatórios ou a Base de Conhecimento?';}
    return this.validate(plan,input.capabilityCatalog);
  }
  validate(plan:AgentQueryPlan,catalog:SemanticCatalog):AgentQueryPlan { if(plan.confidence<.55) return {...plan,intent:'clarification',clarification_question:plan.clarification_question||'Pode detalhar a consulta?'}; for(const k of Object.keys(plan.filters))if(!(FILTER_FIELDS as readonly string[]).includes(k))throw new BadRequestException('Filtro fora do catálogo.'); const a=plan.aggregate;if(a&&(!(METRIC_FIELDS as readonly string[]).includes(a.field)||!(GROUP_FIELDS as readonly string[]).includes(a.group_by)||!['count','sum','avg','min','max'].includes(a.operation)))throw new BadRequestException('Agregação fora do catálogo.'); return plan; }
  private normalize(v:string){return v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
  private status(s:string){const map:Record<string,string>={delivered:'delivered',entregue:'delivered',entregues:'delivered',finalizada:'delivered',finalizadas:'delivered',concluida:'delivered',concluidas:'delivered',pending:'pending',pendente:'pending',pendentes:'pending',delayed:'delayed',atrasada:'delayed',atrasadas:'delayed',atraso:'delayed',in_transit:'in_transit','em transito':'in_transit',transito:'in_transit','em rota':'in_transit',canceled:'canceled',cancelada:'canceled',canceladas:'canceled',cancelado:'canceled'};return Object.entries(map).find(([key])=>s.includes(key))?.[1];}
}
