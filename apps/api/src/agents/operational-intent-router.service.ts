import { Injectable } from '@nestjs/common';
export type OperationalIntent='direct_metric'|'distribution'|'record_lookup'|'entity_analysis'|'operation_analysis'|'knowledge'|'dashboard_summary'|'report_summary'|'clarification';
export type IntentResult={intent:OperationalIntent;metric?:string;dimension?:string;filters:Record<string,unknown>;period?:Record<string,unknown>;confidence:number;clarification_options?:string[]};
@Injectable() export class OperationalIntentRouterService {
 route(message:string):IntentResult { const q=this.norm(message), current=/este m[eê]s|m[eê]s atual/.test(q)?{preset:'current_month'}:undefined;
  if(/analise.*dashboard/.test(q))return this.r('dashboard_summary'); if(/analise.*relat[oó]rio/.test(q))return this.r('report_summary');
  if(/como configuro|manual|processo|\bregra\b/.test(q))return this.r('knowledge');
  const dimension=/(entregas?|peso).*por status/.test(q)?'status':/(entregas?|peso|frete).*por cliente/.test(q)?'customer_name':/(entregas?|peso).*por motorista/.test(q)?'driver_name':/(entregas?|peso).*por (veiculo|placa)/.test(q)?'vehicle_plate':/entregas?.*por (uf )?destino/.test(q)?'destination_state':/frete.*por embarcador/.test(q)?'shipper_name':undefined;
  if(dimension)return {...this.r('distribution'),metric:/frete/.test(q)?'frete_total':/peso/.test(q)?'peso_total':'total_entregas',dimension,period:current};
  const entity=/(motorista|cliente|veiculo|veículo|embarcador)\s+(.+)/.exec(q); if(entity&&(/analise|como esta/.test(q)))return {...this.r('entity_analysis'),filters:{[entity[1].startsWith('motorista')?'driver_name':entity[1].startsWith('cliente')?'customer_name':entity[1].startsWith('veiculo')||entity[1].startsWith('veículo')?'vehicle_plate':'shipper_name']:entity[2].replace(/^(o|a)\s+/, '')},period:current};
  if(/analise.*opera[cç][aã]o/.test(q))return {...this.r('operation_analysis'),period:current};
  if(/\b(ent-|nf\s*[-:]?|cte\s*[-:]?|manifesto|placa)\s*[a-z0-9-]+/.test(q)||/status da entrega/.test(q))return {...this.r('record_lookup'),filters:{identifier:this.identifier(message)}};
  const metric=/frete|custo.*frete/.test(q)?'frete_total':/peso/.test(q)?'peso_total':/volume/.test(q)?'volume_total':/quantas entregas|total de entregas/.test(q)?'total_entregas':/cancelad/.test(q)?'entregas_canceladas':/atrasad/.test(q)?'entregas_atrasadas':undefined;
  if(metric)return {...this.r('direct_metric'),metric,period:current};
  return {intent:'clarification',filters:{},confidence:.2,clarification_options:['Ver o total de frete, peso, volumes ou entregas.','Detalhar entregas por status, cliente, motorista, veículo ou destino.']}; }
 private r(intent:OperationalIntent):IntentResult{return {intent,filters:{},confidence:.9}} private norm(x:string){return x.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()} private identifier(x:string){return (x.match(/(?:ENT|NF|CTE|MANIFESTO|PLACA)[\s:-]*[A-Z0-9-]+/i)?.[0]||'').trim()}
}
