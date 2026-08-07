import { BadRequestException } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RbacService } from '../rbac/rbac.service';
import { SupabaseService } from '../supabase/supabase.service';
import { OccurrencesController } from './occurrences.controller';
import { OccurrencesModule } from './occurrences.module';
import { OccurrencesService } from './occurrences.service';
import { REQUIRE_PERMISSION_KEY, type PermissionRequirement } from '../rbac/require-permission.decorator';
import { AppModule } from '../app.module';

type Row=Record<string,unknown>&{id:string};
const OP_A='00000000-0000-4000-8000-00000000000a',OP_B='00000000-0000-4000-8000-00000000000b',OP_X='00000000-0000-4000-8000-00000000000c';
class MemoryDb {
  tables:Record<string,Row[]>={occurrences:[],occurrence_events:[],occurrence_operation_links:[],operation_records:[{id:OP_A,tenant_id:'a',deleted_at:null},{id:OP_B,tenant_id:'a',deleted_at:null},{id:OP_X,tenant_id:'b',deleted_at:null}],occurrence_reason_categories:[],occurrence_reasons:[{id:'reason-a',tenant_id:'a',name:'Falta de item',is_active:true},{id:'reason-off',tenant_id:'a',name:'Inativo',is_active:false},{id:'reason-x',tenant_id:'b',name:'Outro tenant',is_active:true}],occurrence_reason_requirements:[{id:'req-1',tenant_id:'a',reason_id:'reason-a',stage:'opening',field_key:'quantity',is_required:true},{id:'req-2',tenant_id:'a',reason_id:'reason-a',stage:'opening',field_key:'sku',is_required:true},{id:'req-3',tenant_id:'a',reason_id:'reason-a',stage:'update',field_key:'event_description',is_required:true}]};
  async insert<T>(table:string,payload:Record<string,unknown>|Record<string,unknown>[]){const input=Array.isArray(payload)?payload:[payload];const rows=input.map(p=>({id:`${table}-${this.tables[table].length+1}`,...p}));this.tables[table].push(...rows);return rows as T;}
  async select<T>(table:string,query:string){let rows=[...this.tables[table]];for(const [,key,value] of query.matchAll(/(?:^|&)([a-z_]+)=eq\.([^&]+)/g))rows=rows.filter(r=>String(r[key])===decodeURIComponent(value));if(query.includes('deleted_at=is.null'))rows=rows.filter(r=>r.deleted_at==null);if(query.includes('is_active=eq.true'))rows=rows.filter(r=>r.is_active===true);return rows as T;}
  async update<T>(table:string,query:string,payload:Record<string,unknown>){const rows=await this.select<Row[]>(table,query);rows.forEach(r=>Object.assign(r,payload));return rows as T;}
  async delete<T>(table:string,query:string){const rows=await this.select<Row[]>(table,query);this.tables[table]=this.tables[table].filter(r=>!rows.includes(r));return rows as T;}
}
function ok(value:unknown,message:string){if(!value)throw new Error(message);}
async function rejects(run:()=>Promise<unknown>,message:string){try{await run();}catch(e){ok(e instanceof BadRequestException,message);return;}throw new Error(message);}
async function main(){
  process.env.SUPABASE_URL??='http://localhost:54321';
  process.env.SUPABASE_SERVICE_ROLE_KEY??='local-bootstrap-test-key';
  const app=await NestFactory.createApplicationContext(OccurrencesModule,{logger:false,abortOnError:false});
  ok(app.get(SupabaseService) instanceof SupabaseService,'SupabaseService must be resolved by Nest');
  ok(app.get(AuthGuard) instanceof AuthGuard,'AuthGuard must be resolved by Nest');
  ok(app.get(PermissionsGuard) instanceof PermissionsGuard,'PermissionsGuard must be resolved by Nest');
  ok(app.get(RbacService) instanceof RbacService,'RbacService must be resolved by Nest');
  await app.close();
  const imports=Reflect.getMetadata('imports',AppModule) as unknown[];ok(imports.includes(OccurrencesModule),'AppModule must import OccurrencesModule');
  const db=new MemoryDb();const service=new OccurrencesService(db as never);
  const visible=await service.listReasons('a');ok(visible.length===1&&visible[0].id==='reason-a','reason listing must be active and tenant isolated');
  await rejects(()=>service.create('a','user',{title:'Campos ausentes',reason_id:'reason-a'}),'required opening fields must fail');
  await rejects(()=>service.create('a','user',{title:'Operação inválida',reason_id:'reason-a',quantity:1,sku:'SKU-1',primary_operation_record_id:'10'}),'invalid primary operation id must be a bad request');
  await rejects(()=>service.create('a','user',{title:'Operação inválida',reason_id:'reason-a',quantity:1,sku:'SKU-1',operation_record_ids:['10']}),'invalid operation id list must be a bad request');
  const without=await service.create('a','user',{title:'Sem operação',reason_id:'reason-a',quantity:1,sku:'SKU-1'});ok((without.operation_links as unknown[]).length===0,'guided create must pass');
  const one=await service.create('a','user',{title:'Uma operação',reason_id:'reason-a',quantity:1,sku:'SKU-1',operation_record_ids:[OP_A],primary_operation_record_id:OP_A});ok((one.operation_links as unknown[]).length===1,'create with operation');
  const many=await service.create('a','user',{title:'Múltiplas operações',reason_id:'reason-a',quantity:1,sku:'SKU-1',operation_record_ids:[OP_A,OP_B],primary_operation_record_id:OP_A});ok((many.operation_links as unknown[]).length===2,'create with multiple operations');
  await rejects(()=>service.create('a','user',{title:'Cross tenant',reason_id:'reason-a',quantity:1,sku:'SKU',operation_record_ids:[OP_X]}),'cross-tenant operation must fail');
  const id=String(without.id);await rejects(()=>service.addEvent('a',id,'user',{stage:'update',event_type:'note',reason_id:'reason-a'}),'event requirement must fail');await service.addEvent('a',id,'user',{stage:'update',event_type:'note',reason_id:'reason-a',event_description:'primeiro'});ok(db.tables.occurrence_events.filter(e=>e.occurrence_id===id).length===2,'events must append');
  await service.changeStatus('a',id,'user',{status:'triage'});ok(db.tables.occurrence_events.some(e=>e.occurrence_id===id&&e.event_type==='status_changed'),'status event missing');
  await rejects(()=>service.addEvent('a',id,'user',{stage:'update',event_type:'reported',reason_id:'reason-x',event_description:'x'}),'cross-tenant reason must fail');
  await rejects(()=>service.create('a','user',{title:'Inativo',reason_id:'reason-off'}),'inactive reason must fail');
  await rejects(()=>service.changeStatus('a',id,'user',{status:'closed'}),'invalid status transition must fail');
  await rejects(()=>service.assign('a',id,'user',{owner_id:'owner',unexpected:true}),'unknown payload field must fail');
  await service.addOperationLink('a',id,'user',{operation_record_id:OP_A,relationship_type:'primary',is_primary:true});
  await service.addOperationLink('a',id,'user',{operation_record_id:OP_B,relationship_type:'primary',is_primary:true});
  const links=db.tables.occurrence_operation_links.filter(link=>link.occurrence_id===id);
  ok(links.filter(link=>link.is_primary===true).length===1&&links.find(link=>link.operation_record_id===OP_B)?.is_primary===true,'second primary operation must replace, not duplicate, the primary');
  const permission=Reflect.getMetadata(REQUIRE_PERMISSION_KEY,OccurrencesController.prototype.status) as PermissionRequirement;
  ok(permission.mode==='any'&&permission.permissionKeys?.includes('occurrences.update')&&permission.permissionKeys.includes('occurrences.kanban.move'),'status route must allow update or kanban move permission');
  ok(!('dashboard' in OccurrencesController.prototype),'dashboard endpoint must not exist');
  console.log('occurrences tests passed');
}
void main();
