import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { NativeIndicatorsService } from '../native-indicators/native-indicators.service';
import { CustomIndicatorsService } from '../custom-indicators/custom-indicators.service';

export const OPERATION_FIELDS = ['id','external_id','external_code','document_number','document_type','cte_number','cte_key','invoice_number','invoice_key','manifest_number','order_number','delivery_number','customer_name','customer_document','shipper_name','shipper_document','recipient_name','recipient_document','payer_name','payer_document','origin_city','origin_state','destination_city','destination_state','vehicle_plate','driver_name','driver_document','status','occurrence_status','data_quality_status','issued_at','expected_date','completed_at','status_updated_at','last_event_at','created_at','updated_at','gross_weight','cubed_weight','volume_count','total_value','freight_value'] as const;
export const FILTER_FIELDS = ['status','customer_name','driver_name','vehicle_plate','origin_state','destination_state'] as const;
export const GROUP_FIELDS = ['none','status','customer_name','driver_name','vehicle_plate','origin_state','destination_state','route'] as const;
export const METRIC_FIELDS = ['id','freight_value','gross_weight','cubed_weight','volume_count','total_value'] as const;
export type SemanticCatalog = { entities:string[]; operation:{fields:readonly string[]; filters:readonly string[]; groupBy:readonly string[]; metrics:readonly string[]; routeAvailable:boolean}; indicators:unknown[]; dashboards:unknown[]; reports:unknown[]; knowledge:{document_count:number;titles:string[];types:string[];modules:string[];chunk_count:number}; relations:Record<string,string> };

@Injectable()
export class AgentSemanticCatalogService {
  constructor(private db:SupabaseService, private native:NativeIndicatorsService, private custom:CustomIndicatorsService) {}
  async build(tenantId:string):Promise<SemanticCatalog> {
    const [native, custom, docs, chunks, dashboards, reports] = await Promise.all([
      this.native.list(tenantId), this.custom.list(tenantId),
      this.db.select<any[]>('knowledge_documents',`select=id,title,scope,module_key,document_type&tenant_id=eq.${tenantId}&status=eq.published&deleted_at=is.null&limit=100`),
      this.db.select<any[]>('knowledge_chunks',`select=id&tenant_id=eq.${tenantId}&limit=1000`),
      this.db.select<any[]>('dashboard_definitions',`select=id,title,status,created_at,updated_at&tenant_id=eq.${tenantId}&status=eq.published&limit=30`),
      this.db.select<any[]>('report_definitions',`select=id,name,description,status,updated_at&tenant_id=eq.${tenantId}&status=eq.active&deleted_at=is.null&limit=30`),
    ]);
    const indicators=[...(native.data as any[]).filter(x=>['available','partial'].includes(x.availability?.status)).map(x=>({id:x.indicator_key,type:'native',name:x.name,description:x.description,result_shape:x.result_shape,visualization_type:x.visualization_type,module:x.module_key,availability:x.availability?.status})),...(custom.data as any[]).filter(x=>x.status==='active').map(x=>({id:x.id,type:'custom',name:x.name,description:x.description,visualization_type:x.visualization_type,module:x.module_key,availability:'available'}))];
    return {entities:['operation_records','dashboards','reports','indicators','knowledge_documents'],operation:{fields:OPERATION_FIELDS,filters:FILTER_FIELDS,groupBy:GROUP_FIELDS,metrics:METRIC_FIELDS,routeAvailable:false},indicators,dashboards:dashboards.map(x=>({dashboard_id:x.id,title:x.title,status:x.status,created_at:x.created_at,updated_at:x.updated_at})),reports:reports.map(x=>({report_id:x.id,title:x.name,status:x.status,description:x.description,updated_at:x.updated_at})),knowledge:{document_count:docs.length,titles:docs.map(x=>x.title).filter(Boolean),types:[...new Set(docs.map(x=>x.document_type).filter(Boolean))],modules:[...new Set(docs.map(x=>x.module_key).filter(Boolean))],chunk_count:chunks.length},relations:{driver_name:'motorista responsável pelos registros',vehicle_plate:'veículo usado nos registros',customer_name:'cliente relacionado aos registros',status:'distribuição operacional de status',destination_state:'operação por UF de destino',origin_state:'operação por UF de origem',freight_value:'valor de frete',gross_weight:'peso',volume_count:'volumes',dashboard:'widgets e indicadores publicados',report:'jobs e análises geradas',knowledge_document:'chunks publicados'}};
  }
}
