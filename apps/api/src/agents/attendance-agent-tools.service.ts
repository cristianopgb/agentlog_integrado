import { BadRequestException, Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { OccurrencesService } from '../occurrences/occurrences.service';
import { RbacService } from '../rbac/rbac.service';

type Args = Record<string, unknown>;
const text=(v:unknown,n:string,max=4000)=>{if(typeof v!=='string'||!v.trim()||v.length>max)throw new BadRequestException(`${n} inválido.`);return v.trim()};
const phone=(v:unknown)=>text(v,'phone',30).replace(/\D/g,'');

@Injectable()
export class AttendanceAgentToolsService {
  constructor(private readonly db:SupabaseService,private readonly occurrences:OccurrencesService,private readonly rbac:RbacService){}
  async execute(tenantId:string,key:string,args:Args,actorId:string){
    const permission:Record<string,string[]>={
      'attendance.occurrence.create':['occurrences.ai.create_draft','occurrences.ai.create_confirmed'],
      'attendance.occurrence.add_treatment':['occurrence_treatments.create','occurrences.ai.add_treatment'],
      'attendance.occurrence.get_detail':['occurrences.view'],
      'attendance.legacy.create_if_configured':['occurrences.legacy.push'],
    };
    if(permission[key])await this.rbac.ensurePermission(actorId,tenantId,permission[key]);
    const handlers:Record<string,()=>Promise<unknown>>={
      'attendance.contacts.find_by_phone':()=>this.findContact(tenantId,args),
      'attendance.inbox.get_context':()=>this.context(tenantId,args),
      'attendance.operation.find_by_document':()=>this.findOperation(tenantId,args),
      'attendance.operation.verify_driver_document':()=>this.verifyDriver(tenantId,args),
      'attendance.knowledge.search':()=>this.knowledge(tenantId,args),
      'attendance.occurrence.create':()=>this.createOccurrence(tenantId,args,actorId),
      'attendance.occurrence.add_treatment':()=>this.addTreatment(tenantId,args,actorId),
      'attendance.occurrence.get_detail':()=>this.occurrenceDetail(tenantId,args),
      'attendance.legacy.check_capability':()=>this.capability(tenantId,args),
      'attendance.legacy.create_if_configured':()=>this.legacyCreate(tenantId,args),
    }; if(!handlers[key])throw new BadRequestException('Ferramenta de atendimento não permitida.');return handlers[key]();
  }
  private async findContact(t:string,a:Args){const p=phone(a.phone),rows=await this.db.select<any[]>('contacts',`select=id,name,phone,contact_type,driver_id,customer_id&tenant_id=eq.${t}&phone=eq.${p}&deleted_at=is.null&limit=1`);return rows[0]?{found:true,contact_id:rows[0].id,name:rows[0].name,phone:rows[0].phone,contact_type:rows[0].contact_type,driver_id:rows[0].driver_id,customer_id:rows[0].customer_id}:{found:false};}
  private async context(t:string,a:Args){const id=text(a.conversation_id,'conversation_id',80),conversations=await this.db.select<any[]>('inbox_conversations',`select=id,contact_id,channel&tenant_id=eq.${t}&id=eq.${id}&deleted_at=is.null&limit=1`);if(!conversations[0])throw new BadRequestException('Conversa não encontrada.');const c=conversations[0],[messages,contacts,links]=await Promise.all([this.db.select<any[]>('inbox_messages',`select=id,direction,sender_type,body,created_at&tenant_id=eq.${t}&conversation_id=eq.${id}&direction=in.(inbound,outbound)&deleted_at=is.null&order=created_at.desc&limit=20`),this.db.select<any[]>('contacts',`select=id,name,phone,contact_type&tenant_id=eq.${t}&id=eq.${c.contact_id}&deleted_at=is.null&limit=1`),this.db.select<any[]>('conversation_occurrence_links',`select=occurrence_id&tenant_id=eq.${t}&conversation_id=eq.${id}&deleted_at=is.null&limit=1`)]);let occurrence=null;if(links[0]){const rows=await this.db.select<any[]>('occurrences',`select=id,occurrence_number,current_status&tenant_id=eq.${t}&id=eq.${links[0].occurrence_id}&deleted_at=is.null&limit=1`);occurrence=rows[0]??null;}return{channel:c.channel,contact:contacts[0]??null,messages:messages.reverse(),occurrence};}
  private async findOperation(t:string,a:Args){const n=encodeURIComponent(text(a.document_number,'document_number',100)),fields=['document_number','invoice_number','cte_number','manifest_number','delivery_number'],or=fields.map(f=>`${f}.eq.${n}`).join(','),rows=await this.db.select<any[]>('operation_records',`select=id,document_number,invoice_number,cte_number,manifest_number,delivery_number,customer_name,driver_name,vehicle_plate,status,delivery_status,carrier_name,cargo_type,priority,volume_m3&tenant_id=eq.${t}&or=(${or})&deleted_at=is.null&limit=1`),r=rows[0];if(!r)return{found:false};const transports=await this.db.select<any[]>('transport_records',`select=driver_phone,driver_whatsapp,vehicle_type&tenant_id=eq.${t}&operation_record_id=eq.${r.id}&deleted_at=is.null&limit=1`);return{found:true,operation_record_id:r.id,...r,driver_phone:transports[0]?.driver_phone??null,driver_whatsapp:transports[0]?.driver_whatsapp??null,vehicle_type:transports[0]?.vehicle_type??null};}
  private async verifyDriver(t:string,a:Args){const id=text(a.operation_record_id,'operation_record_id',80),p=phone(a.phone),rows=await this.db.select<any[]>('operation_records',`select=id,driver_name&tenant_id=eq.${t}&id=eq.${id}&deleted_at=is.null&limit=1`);if(!rows[0])return{matched:'uncertain',reason:'operation_not_found',safe_summary:'Operação não localizada.'};const transports=await this.db.select<any[]>('transport_records',`select=driver_phone,driver_whatsapp&tenant_id=eq.${t}&operation_record_id=eq.${id}&deleted_at=is.null&limit=1`),phones=[transports[0]?.driver_phone,transports[0]?.driver_whatsapp].map(v=>String(v??'').replace(/\D/g,'')).filter(Boolean);if(!phones.length)return{matched:'uncertain',reason:'driver_phone_missing',safe_summary:'A operação não possui telefone tratado para conferência.'};const matched=phones.includes(p);return{matched,reason:matched?'phone_matches':'phone_mismatch',safe_summary:matched?'Motorista conferido pela operação.':'Telefone não corresponde ao motorista da operação.'};}
  private async occurrenceDetail(t:string,a:Args){
    let id=typeof a.occurrence_id==='string'&&a.occurrence_id.trim()?text(a.occurrence_id,'occurrence_id',80):'';
    if(!id){
      const number=encodeURIComponent(text(a.occurrence_number,'occurrence_number',80));
      const rows=await this.db.select<any[]>('occurrences',`select=id&tenant_id=eq.${t}&occurrence_number=eq.${number}&deleted_at=is.null&limit=1`);
      if(!rows[0])throw new BadRequestException('Ocorrência não encontrada.');
      id=rows[0].id;
    }
    return this.sanitizeOccurrence(await this.occurrences.detail(t,id) as any);
  }
  private sanitizeOccurrence(o:any){
    const freeText=new Set(['event_title','event_description','notes','description','title','product_name','sku','resolution_summary','closed_reason']);
    const clean=(rows:any[],fields:string[])=>rows.map(row=>Object.fromEntries(fields.filter(field=>row?.[field]!==undefined).map(field=>{
      const value=row[field];
      return [field,freeText.has(field)&&typeof value==='string'?value.slice(0,500):value];
    })));
    return {
      occurrence_number:o.occurrence_number,title:typeof o.title==='string'?o.title.slice(0,300):o.title,
      description:typeof o.description==='string'?o.description.slice(0,1200):null,
      status:o.current_status,priority:o.current_priority,sla_status:o.sla_status,
      opened_at:o.opened_at,due_at:o.due_at,resolved_at:o.resolved_at,closed_at:o.closed_at,
      resolution_summary:typeof o.resolution_summary==='string'?o.resolution_summary.slice(0,500):o.resolution_summary,closed_reason:typeof o.closed_reason==='string'?o.closed_reason.slice(0,300):o.closed_reason,
      operation_links:clean(o.operation_links??[],['relationship_type','is_primary']),
      events:clean(o.events??[],['event_type','event_status','event_title','event_description','event_at','old_status','new_status']),
      items:clean(o.items??[],['item_type','sku','product_name','quantity','unit','amount','currency','notes']),
      financial_summary:{count:(o.financial_entries??[]).length,total:(o.financial_entries??[]).filter((x:any)=>!['rejected','canceled'].includes(x.status)).reduce((sum:number,x:any)=>sum+(Number(x.amount)||0),0)},
      documents:clean(o.documents??[],['document_type','document_number','amount','issued_at']),
      attachments:clean(o.attachments??[],['attachment_type','mime_type','size_bytes','description']),
      treatments:clean(o.treatments??[],['treatment_type','description','responsible_team','status','started_at','completed_at']),
      pending_actions:clean(o.pending_actions??[],['action_type','title','description','responsible_team','status','due_at','completed_at']),
    };
  }
  private async knowledge(t:string,a:Args){const q=encodeURIComponent(text(a.query??a.message,'query',300)),docs=await this.db.select<any[]>('knowledge_documents',`select=id,title&tenant_id=eq.${t}&status=eq.published&deleted_at=is.null&order=updated_at.desc&limit=50`);if(!docs.length)return{found:false,guidance:null,checklist:[],source_title:null};const ids=docs.map(x=>x.id).join(','),chunks=await this.db.select<any[]>('knowledge_chunks',`select=document_id,content&tenant_id=eq.${t}&document_id=in.(${ids})&content=ilike.*${q}*&order=chunk_index.asc&limit=3`),doc=docs.find(x=>x.id===chunks[0]?.document_id);return{found:chunks.length>0,guidance:chunks.map(x=>x.content).join('\n').slice(0,3000)||null,checklist:[],source_title:doc?.title??null};}
  private async createOccurrence(t:string,a:Args,u:string){if(!a.reason_id)return{created:false,needs_more_data:['reason_id']};const occurrence:any=await this.occurrences.create(t,u,{title:a.title,description:a.description,current_priority:a.priority??a.severity??'medium',source_channel:'public_chat',source_reference:a.conversation_id,reason_id:a.reason_id,operation_record_ids:a.operation_record_id?[a.operation_record_id]:[],event_description:'Ocorrência criada pelo agente de atendimento.',metadata:{requires_human_review:Boolean(a.requires_human_review),evidence_summary:a.evidence_summary}});await this.db.insert('conversation_occurrence_links',{tenant_id:t,conversation_id:text(a.conversation_id,'conversation_id',80),occurrence_id:occurrence.id,relationship_type:'created_from',created_by:u});return{created:true,occurrence_id:occurrence.id,occurrence_number:occurrence.occurrence_number,status:occurrence.current_status,needs_more_data:[]};}
  private async addTreatment(t:string,a:Args,u:string){const row=await this.occurrences.createTreatment(t,text(a.occurrence_id,'occurrence_id',80),u,{treatment_type:a.treatment_type??'other',description:a.description,status:'open'});return{created:true,treatment_id:(row as any).id};}
  private async capability(t:string,a:Args){const key=text(a.capability_key??'occurrences.create','capability_key',100),rows=await this.db.select<any[]>('integration_action_capabilities',`select=id,direction,is_active,requires_human_approval&tenant_id=eq.${t}&capability_key=eq.${key}&deleted_at=is.null&order=updated_at.desc&limit=1`),r=rows[0];if(!r||!r.is_active)return{status:'not_configured',safe_message:'Integração de escrita não configurada.'};if(r.direction==='read')return{status:'read_only',capability_id:r.id,safe_message:'Integração disponível somente para leitura.'};if(r.requires_human_approval)return{status:'requires_approval',capability_id:r.id,safe_message:'Envio depende de aprovação humana.'};return{status:'write_available',capability_id:r.id,safe_message:'Capability de escrita ativa.'};}
  private async legacyCreate(t:string,a:Args){const occurrenceId=text(a.occurrence_id,'occurrence_id',80),cap:any=await this.capability(t,{capability_key:'occurrences.create'});const status=cap.status==='not_configured'||cap.status==='read_only'?'not_configured':cap.status==='requires_approval'?'pending_send':'pending_configuration';await this.db.insert('occurrence_legacy_sync_logs',{tenant_id:t,occurrence_id:occurrenceId,capability_id:cap.capability_id??null,status,action:'occurrences.create',request_payload:{occurrence_id:occurrenceId},error_code:status==='pending_configuration'?'safe_executor_not_configured':null,error_message:status==='pending_send'?'Aprovação humana necessária.':null});return{sent:false,status,safe_message:status==='not_configured'?'Ocorrência mantida somente no AgentLog.':status==='pending_send'?'Envio aguardando aprovação humana.':'Executor seguro ainda não configurado.'};}
}
