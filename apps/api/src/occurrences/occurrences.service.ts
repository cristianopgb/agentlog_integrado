import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

export const OCCURRENCE_STATUSES=['draft','open','triage','in_progress','waiting_driver','waiting_customer','waiting_carrier','waiting_approval','waiting_document','waiting_payment','waiting_redelivery','waiting_return','partially_resolved','resolved','closed','canceled','reopened'] as const;
const priorities=new Set(['low','medium','high','critical']);
const relationships=new Set(['primary','affected','source','related','return','complementary']);
const transitions:Record<string,Set<string>>={
  draft:new Set(['open','canceled']), open:new Set(['triage','in_progress','canceled']), triage:new Set(['in_progress','canceled']),
  in_progress:new Set(['waiting_driver','waiting_customer','waiting_carrier','waiting_approval','waiting_document','waiting_payment','waiting_redelivery','waiting_return','partially_resolved','resolved','canceled']),
  waiting_driver:new Set(['in_progress','resolved','canceled']), waiting_customer:new Set(['in_progress','resolved','canceled']), waiting_carrier:new Set(['in_progress','resolved','canceled']), waiting_approval:new Set(['in_progress','resolved','canceled']), waiting_document:new Set(['in_progress','resolved','canceled']), waiting_payment:new Set(['in_progress','resolved','canceled']), waiting_redelivery:new Set(['in_progress','partially_resolved','resolved','canceled']), waiting_return:new Set(['in_progress','partially_resolved','resolved','canceled']),
  partially_resolved:new Set(['in_progress','resolved','canceled']), resolved:new Set(['closed','reopened']), reopened:new Set(['triage','in_progress','resolved','canceled']), closed:new Set(['reopened']), canceled:new Set(['reopened'])
};
type Row=Record<string,unknown>&{id:string;current_status?:string;current_owner_id?:string|null};

@Injectable()
export class OccurrencesService {
  constructor(private readonly db:SupabaseService){}
  async list(tenantId:string,q:Record<string,string>={}){
    const filters=[`select=*`,`tenant_id=eq.${tenantId}`,'deleted_at=is.null'];
    if(q.status){this.status(q.status);filters.push(`current_status=eq.${encodeURIComponent(q.status)}`);}
    if(q.priority){this.priority(q.priority);filters.push(`current_priority=eq.${q.priority}`);}
    if(q.owner_id)filters.push(`current_owner_id=eq.${q.owner_id}`);
    if(q.search)filters.push(`or=(occurrence_number.ilike.*${encodeURIComponent(q.search)}*,title.ilike.*${encodeURIComponent(q.search)}*)`);
    return this.db.select<Row[]>('occurrences',`${filters.join('&')}&order=opened_at.desc&limit=${Math.min(Number(q.limit)||50,100)}`);
  }
  async create(tenantId:string,userId:string,body:Record<string,unknown>){
    this.only(body,['title','description','current_priority','source_channel','due_at','source_reference','metadata','operation_record_ids','primary_operation_record_id']);
    const title=this.required(body.title,'title'); const priority=this.priority(body.current_priority??'medium');
    const ids=this.stringArray(body.operation_record_ids); if(body.primary_operation_record_id) ids.push(this.required(body.primary_operation_record_id,'primary_operation_record_id'));
    const unique=[...new Set(ids)]; await Promise.all(unique.map(id=>this.operation(tenantId,id)));
    const suffix=`${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
    const [created]=await this.db.insert<Row[]>('occurrences',{tenant_id:tenantId,occurrence_number:`OCO-${suffix}`,title,description:this.optional(body.description),current_status:'open',current_priority:priority,source_channel:this.optional(body.source_channel)??'manual',due_at:this.optional(body.due_at),source_reference:this.optional(body.source_reference),metadata:this.object(body.metadata),created_by:userId,updated_by:userId});
    await this.event(tenantId,created.id,userId,{event_type:'created',event_title:'Ocorrência criada',new_status:'open'});
    for(const operationId of unique)await this.insertLink(tenantId,created.id,userId,operationId,operationId===body.primary_operation_record_id?'primary':'affected',operationId===body.primary_operation_record_id);
    return this.detail(tenantId,created.id);
  }
  async detail(tenantId:string,id:string){
    const occurrence=await this.find(tenantId,id);
    const [events,operation_links]=await Promise.all([
      this.db.select<Row[]>('occurrence_events',`select=*&tenant_id=eq.${tenantId}&occurrence_id=eq.${id}&order=event_at.asc,created_at.asc`),
      this.db.select<Row[]>('occurrence_operation_links',`select=*&tenant_id=eq.${tenantId}&occurrence_id=eq.${id}&order=is_primary.desc,linked_at.asc`)
    ]); return {...occurrence,events,operation_links};
  }
  async kanban(tenantId:string){const rows=await this.list(tenantId,{limit:'100'});return OCCURRENCE_STATUSES.map(status=>({status,items:rows.filter(r=>r.current_status===status)}));}
  async changeStatus(tenantId:string,id:string,userId:string,body:Record<string,unknown>){
    this.only(body,['status']);const next=this.status(body.status);const current=await this.find(tenantId,id);const old=String(current.current_status);
    if(old===next||!transitions[old]?.has(next))throw new BadRequestException(`Invalid status transition: ${old} -> ${next}`);
    const dates:Record<string,unknown>={};if(next==='resolved')dates.resolved_at=new Date().toISOString();if(next==='closed')dates.closed_at=new Date().toISOString();
    const [updated]=await this.db.update<Row[]>('occurrences',`tenant_id=eq.${tenantId}&id=eq.${id}&deleted_at=is.null`,{current_status:next,updated_by:userId,updated_at:new Date().toISOString(),...dates});
    await this.event(tenantId,id,userId,{event_type:'status_changed',event_title:'Status alterado',old_status:old,new_status:next});return updated;
  }
  async assign(tenantId:string,id:string,userId:string,body:Record<string,unknown>){
    this.only(body,['owner_id']);await this.find(tenantId,id);const owner=body.owner_id===null?null:this.required(body.owner_id,'owner_id');
    const [updated]=await this.db.update<Row[]>('occurrences',`tenant_id=eq.${tenantId}&id=eq.${id}&deleted_at=is.null`,{current_owner_id:owner,updated_by:userId,updated_at:new Date().toISOString()});
    await this.event(tenantId,id,userId,{event_type:'assigned',event_title:owner?'Responsável atribuído':'Responsável removido',metadata:{owner_id:owner}});return updated;
  }
  async addEvent(tenantId:string,id:string,userId:string,body:Record<string,unknown>){
    this.only(body,['reason_id','event_type','event_title','event_description','event_at','source_channel','source_reference','metadata']);await this.find(tenantId,id);
    if(body.reason_id)await this.reason(tenantId,this.required(body.reason_id,'reason_id'));
    return this.event(tenantId,id,userId,{event_type:this.required(body.event_type,'event_type'),reason_id:this.optional(body.reason_id),event_title:this.optional(body.event_title),event_description:this.optional(body.event_description),event_at:this.optional(body.event_at),source_channel:this.optional(body.source_channel),source_reference:this.optional(body.source_reference),metadata:this.object(body.metadata)});
  }
  async addOperationLink(tenantId:string,id:string,userId:string,body:Record<string,unknown>){
    this.only(body,['operation_record_id','relationship_type','is_primary']);await this.find(tenantId,id);const op=this.required(body.operation_record_id,'operation_record_id');await this.operation(tenantId,op);
    const relationship=String(body.relationship_type??'affected');if(!relationships.has(relationship))throw new BadRequestException('Invalid relationship_type.');
    return this.insertLink(tenantId,id,userId,op,relationship,body.is_primary===true);
  }
  async removeOperationLink(tenantId:string,id:string,linkId:string){await this.find(tenantId,id);const rows=await this.db.delete<Row[]>('occurrence_operation_links',`tenant_id=eq.${tenantId}&occurrence_id=eq.${id}&id=eq.${linkId}`);if(!rows.length)throw new NotFoundException('Operation link not found.');return {deleted:true};}
  private async insertLink(tenantId:string,id:string,userId:string,operationId:string,relationship:string,isPrimary:boolean){
    if(isPrimary)await this.db.update('occurrence_operation_links',`tenant_id=eq.${tenantId}&occurrence_id=eq.${id}&is_primary=eq.true`,{is_primary:false});
    return this.db.insert<Row[]>('occurrence_operation_links',{tenant_id:tenantId,occurrence_id:id,operation_record_id:operationId,relationship_type:relationship,is_primary:isPrimary,linked_by:userId});
  }
  private event(tenantId:string,id:string,userId:string,payload:Record<string,unknown>){return this.db.insert<Row[]>('occurrence_events',{tenant_id:tenantId,occurrence_id:id,created_by:userId,created_by_type:'user',source_channel:'manual',metadata:{},...payload});}
  private async find(tenantId:string,id:string){const rows=await this.db.select<Row[]>('occurrences',`select=*&tenant_id=eq.${tenantId}&id=eq.${id}&deleted_at=is.null&limit=1`);if(!rows.length)throw new NotFoundException('Occurrence not found.');return rows[0];}
  private async operation(tenantId:string,id:string){const rows=await this.db.select<Row[]>('operation_records',`select=id&tenant_id=eq.${tenantId}&id=eq.${id}&deleted_at=is.null&limit=1`);if(!rows.length)throw new BadRequestException('Operation does not belong to tenant.');}
  private async reason(tenantId:string,id:string){const rows=await this.db.select<Row[]>('occurrence_reasons',`select=id&tenant_id=eq.${tenantId}&id=eq.${id}&is_active=eq.true&limit=1`);if(!rows.length)throw new BadRequestException('Reason is inactive or does not belong to tenant.');}
  private only(body:Record<string,unknown>,allowed:string[]){const invalid=Object.keys(body).filter(k=>!allowed.includes(k));if(invalid.length)throw new BadRequestException(`Fields not allowed: ${invalid.join(', ')}`);}
  private required(v:unknown,name:string){if(typeof v!=='string'||!v.trim())throw new BadRequestException(`${name} is required.`);return v.trim();}
  private optional(v:unknown){return typeof v==='string'&&v.trim()?v.trim():null;}
  private object(v:unknown){if(v===undefined)return {};if(!v||typeof v!=='object'||Array.isArray(v))throw new BadRequestException('metadata must be an object.');return v;}
  private stringArray(v:unknown){if(v===undefined)return [] as string[];if(!Array.isArray(v)||v.some(x=>typeof x!=='string'||!x))throw new BadRequestException('operation_record_ids must be a string array.');return [...v] as string[];}
  private status(v:unknown){const value=String(v);if(!(OCCURRENCE_STATUSES as readonly string[]).includes(value))throw new BadRequestException('Invalid occurrence status.');return value;}
  private priority(v:unknown){const value=String(v);if(!priorities.has(value))throw new BadRequestException('Invalid occurrence priority.');return value;}
}
