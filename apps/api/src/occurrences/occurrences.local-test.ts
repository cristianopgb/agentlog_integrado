import { BadRequestException } from '@nestjs/common';
import { OccurrencesController } from './occurrences.controller';
import { OccurrencesService } from './occurrences.service';
import { REQUIRE_PERMISSION_KEY, type PermissionRequirement } from '../rbac/require-permission.decorator';

type Row=Record<string,unknown>&{id:string};
class MemoryDb {
  tables:Record<string,Row[]>={occurrences:[],occurrence_events:[],occurrence_operation_links:[],operation_records:[{id:'op-a',tenant_id:'a',deleted_at:null},{id:'op-b',tenant_id:'a',deleted_at:null},{id:'op-x',tenant_id:'b',deleted_at:null}],occurrence_reasons:[{id:'reason-a',tenant_id:'a',is_active:true},{id:'reason-x',tenant_id:'b',is_active:true}]};
  async insert<T>(table:string,payload:Record<string,unknown>|Record<string,unknown>[]){const input=Array.isArray(payload)?payload:[payload];const rows=input.map(p=>({id:`${table}-${this.tables[table].length+1}`,...p}));this.tables[table].push(...rows);return rows as T;}
  async select<T>(table:string,query:string){let rows=[...this.tables[table]];for(const [,key,value] of query.matchAll(/(?:^|&)([a-z_]+)=eq\.([^&]+)/g))rows=rows.filter(r=>String(r[key])===decodeURIComponent(value));if(query.includes('deleted_at=is.null'))rows=rows.filter(r=>r.deleted_at==null);if(query.includes('is_active=eq.true'))rows=rows.filter(r=>r.is_active===true);return rows as T;}
  async update<T>(table:string,query:string,payload:Record<string,unknown>){const rows=await this.select<Row[]>(table,query);rows.forEach(r=>Object.assign(r,payload));return rows as T;}
  async delete<T>(table:string,query:string){const rows=await this.select<Row[]>(table,query);this.tables[table]=this.tables[table].filter(r=>!rows.includes(r));return rows as T;}
}
function ok(value:unknown,message:string){if(!value)throw new Error(message);}
async function rejects(run:()=>Promise<unknown>,message:string){try{await run();}catch(e){ok(e instanceof BadRequestException,message);return;}throw new Error(message);}
async function main(){
  const db=new MemoryDb();const service=new OccurrencesService(db as never);
  const without=await service.create('a','user',{title:'Sem operação'});ok((without.operation_links as unknown[]).length===0,'create without operation');
  const one=await service.create('a','user',{title:'Uma operação',operation_record_ids:['op-a'],primary_operation_record_id:'op-a'});ok((one.operation_links as unknown[]).length===1,'create with operation');
  const many=await service.create('a','user',{title:'Múltiplas operações',operation_record_ids:['op-a','op-b'],primary_operation_record_id:'op-a'});ok((many.operation_links as unknown[]).length===2,'create with multiple operations');
  await rejects(()=>service.create('a','user',{title:'Cross tenant',operation_record_ids:['op-x']}),'cross-tenant operation must fail');
  const id=String(without.id);await service.addEvent('a',id,'user',{event_type:'note',event_description:'primeiro'});await service.addEvent('a',id,'user',{event_type:'note',event_description:'segundo'});ok(db.tables.occurrence_events.filter(e=>e.occurrence_id===id).length===3,'events must append');
  await service.changeStatus('a',id,'user',{status:'triage'});ok(db.tables.occurrence_events.some(e=>e.occurrence_id===id&&e.event_type==='status_changed'),'status event missing');
  await rejects(()=>service.addEvent('a',id,'user',{event_type:'reported',reason_id:'reason-x'}),'cross-tenant reason must fail');
  await rejects(()=>service.changeStatus('a',id,'user',{status:'closed'}),'invalid status transition must fail');
  await rejects(()=>service.assign('a',id,'user',{owner_id:'owner',unexpected:true}),'unknown payload field must fail');
  await service.addOperationLink('a',id,'user',{operation_record_id:'op-a',relationship_type:'primary',is_primary:true});
  await service.addOperationLink('a',id,'user',{operation_record_id:'op-b',relationship_type:'primary',is_primary:true});
  const links=db.tables.occurrence_operation_links.filter(link=>link.occurrence_id===id);
  ok(links.filter(link=>link.is_primary===true).length===1&&links.find(link=>link.operation_record_id==='op-b')?.is_primary===true,'second primary operation must replace, not duplicate, the primary');
  const permission=Reflect.getMetadata(REQUIRE_PERMISSION_KEY,OccurrencesController.prototype.status) as PermissionRequirement;
  ok(permission.mode==='any'&&permission.permissionKeys?.includes('occurrences.update')&&permission.permissionKeys.includes('occurrences.kanban.move'),'status route must allow update or kanban move permission');
  ok(!('dashboard' in OccurrencesController.prototype),'dashboard endpoint must not exist');
  console.log('occurrences tests passed');
}
void main();
