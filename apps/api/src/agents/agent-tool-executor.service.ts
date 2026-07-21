import { BadRequestException, Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

const recordFields = 'id,document_number,cte_number,invoice_number,manifest_number,delivery_number,customer_name,driver_name,vehicle_plate,status,expected_date,completed_at,freight_value,gross_weight,volume_count,origin_state,destination_state,last_event_at';
const entities = new Set(['delivery','cte','invoice','manifest','customer','driver','vehicle','occurrence','auto']);
const metrics = new Set(['deliveries_count','occurrences_count','cte_count','sum_freight','sum_weight','volume_count']);
const groups = new Set(['driver_name','customer_name','status','origin_state','destination_state','none']);

@Injectable()
export class AgentToolExecutorService {
  constructor(private readonly db: SupabaseService) {}
  async execute(tenantId: string, tool: string, input: Record<string, unknown>) {
    if (tool === 'knowledge_base.search') return this.knowledge(tenantId, input);
    if (tool === 'treated_data.search_records') return this.search(tenantId, input);
    if (tool === 'treated_data.get_record_detail') return this.detail(tenantId, input);
    if (tool === 'treated_data.aggregate_records') return this.aggregate(tenantId, input);
    throw new BadRequestException('Ferramenta não permitida.');
  }
  private async knowledge(tenantId: string, input: Record<string, unknown>) {
    const query = this.text(input.query, 240); const scope = ['system','tenant','all'].includes(String(input.scope)) ? String(input.scope) : 'all';
    const limit = Math.min(Math.max(Number(input.limit) || 5, 1), 10); const module = typeof input.module_key === 'string' ? input.module_key.slice(0,80) : '';
    const docs = await this.db.select<Array<{id:string;title:string;scope:string;module_key:string|null}>>('knowledge_documents', `select=id,title,scope,module_key&tenant_id=eq.${tenantId}&status=eq.published&deleted_at=is.null${scope === 'all' ? '' : `&scope=eq.${scope}`}${module ? `&module_key=eq.${encodeURIComponent(module)}` : ''}&limit=100`);
    if (!docs.length) return { results: [] };
    const ids = docs.map(d => `"${d.id}"`).join(','); const term = encodeURIComponent(`*${query}*`);
    const chunks = await this.db.select<Array<{document_id:string;title:string|null;content:string}>>('knowledge_chunks', `select=document_id,title,content&tenant_id=eq.${tenantId}&document_id=in.(${ids})&or=(content.ilike.${term},title.ilike.${term})&limit=${limit}`);
    return { results: chunks.map(c => { const d = docs.find(x => x.id === c.document_id)!; return { document_id:c.document_id,title:c.title || d.title,chunk:c.content.slice(0,1600),score:1,source:d.scope }; }) };
  }
  private async search(tenantId: string, input: Record<string, unknown>) {
    const entity = String(input.entity || 'auto'); if (!entities.has(entity)) throw new BadRequestException('Entidade inválida.');
    const identifier = this.text(input.identifier, 160); const term = encodeURIComponent(`*${identifier}*`);
    const columns = entity === 'customer' ? 'customer_name,customer_document' : entity === 'driver' ? 'driver_name,driver_document' : entity === 'vehicle' ? 'vehicle_plate' : entity === 'delivery' ? 'delivery_number,document_number,invoice_number,cte_number' : entity === 'cte' ? 'cte_number,document_number' : entity === 'invoice' ? 'invoice_number,document_number' : entity === 'manifest' ? 'manifest_number' : 'document_number,cte_number,invoice_number,manifest_number,delivery_number,customer_name,driver_name,vehicle_plate';
    const rows = await this.db.select<Record<string, unknown>[]>('operation_records', `select=${recordFields}&tenant_id=eq.${tenantId}&deleted_at=is.null&or=(${columns.split(',').map(c=>`${c}.ilike.${term}`).join(',')})&order=updated_at.desc&limit=10`);
    return { matches: rows.map(r => ({entity:'operation_record',id:String(r.id),title:String(r.delivery_number || r.invoice_number || r.cte_number || r.document_number || r.id),summary:this.safeSummary(r),source:'canonical'})), total:rows.length };
  }
  private async detail(tenantId: string, input: Record<string, unknown>) {
    if (String(input.entity) !== 'operation_record') throw new BadRequestException('Registro não permitido.'); const id = this.text(input.id, 64);
    const rows = await this.db.select<Record<string, unknown>[]>('operation_records', `select=${recordFields}&tenant_id=eq.${tenantId}&id=eq.${encodeURIComponent(id)}&deleted_at=is.null&limit=1`);
    if (!rows[0]) return {entity:'operation_record',id,fields:{},events:[]};
    const events = await this.db.select<Record<string, unknown>[]>('entity_events', `select=id,event_type,event_title,event_description,occurred_at&tenant_id=eq.${tenantId}&entity_type=eq.operation_record&entity_id=eq.${encodeURIComponent(id)}&order=occurred_at.desc&limit=20`);
    return {entity:'operation_record',id,fields:this.safeSummary(rows[0]),events};
  }
  private async aggregate(tenantId:string,input:Record<string,unknown>) {
    const metric=String(input.metric); const group=String(input.group_by || 'none'); if(!metrics.has(metric)||!groups.has(group)) throw new BadRequestException('Agregação não permitida.');
    const f=(input.filters && typeof input.filters==='object' ? input.filters : {}) as Record<string,unknown>; const allowed=['driver_name','customer_name','status','vehicle_plate'];
    const filters=[`select=${recordFields}`,`tenant_id=eq.${tenantId}`,'deleted_at=is.null']; for(const k of allowed) if(typeof f[k]==='string'&&f[k]) filters.push(`${k}=ilike.${encodeURIComponent(`*${String(f[k]).slice(0,100)}*`)}`);
    const date=f.date_range as Record<string,unknown>|undefined; if(date&&typeof date.start==='string')filters.push(`completed_at=gte.${encodeURIComponent(date.start)}`); if(date&&typeof date.end==='string')filters.push(`completed_at=lte.${encodeURIComponent(date.end)}`);
    if(metric==='occurrences_count') return {metric,unavailable:true,message:'A contagem de ocorrências ainda não está disponível para esta base tratada.',rows:[]};
    const rows=await this.db.select<Record<string,unknown>[]>('operation_records',`${filters.join('&')}&limit=10000`); const selected=metric==='cte_count'?rows.filter(r=>r.cte_number):rows;
    const value=(rs:Record<string,unknown>[])=>metric==='sum_freight'?rs.reduce((n,r)=>n+(Number(r.freight_value)||0),0):metric==='sum_weight'?rs.reduce((n,r)=>n+(Number(r.gross_weight)||0),0):metric==='volume_count'?rs.reduce((n,r)=>n+(Number(r.volume_count)||0),0):rs.length;
    if(group==='none')return {metric,group_by:'none',total:value(selected),rows:[]}; const map=new Map<string,Record<string,unknown>[]>(); selected.forEach(r=>{const k=String(r[group]||'Não informado');map.set(k,[...(map.get(k)||[]),r])}); const limit=Math.min(Math.max(Number(input.limit)||10,1),20); return {metric,group_by:group,rows:[...map.entries()].map(([label,items])=>({label,value:value(items)})).sort((a,b)=>b.value-a.value).slice(0,limit)};
  }
  private text(value:unknown,max:number){const v=typeof value==='string'?value.replace(/<[^>]*>/g,'').trim().slice(0,max):'';if(!v)throw new BadRequestException('Texto obrigatório.');return v;}
  private safeSummary(row:Record<string,unknown>){return Object.fromEntries(Object.entries(row).filter(([k])=>!['tenant_id','source_payload_hash'].includes(k)));}
}
