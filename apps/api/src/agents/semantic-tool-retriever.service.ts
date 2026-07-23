import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
const normalize=(v:string)=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
@Injectable() export class SemanticToolRetrieverService {
  constructor(private readonly db:SupabaseService){}
  normalize(question:string){return normalize(question)}
  async retrieve(tenantId:string,agentId:string,question:string){const terms=normalize(question).split(/\W+/).filter(x=>x.length>2).slice(0,12); const [items,memory]=await Promise.all([
    this.db.select<any[]>('agent_semantic_items',`select=item_type,item_key,title,description,synonyms,tool_key,tool_args_template,metadata&tenant_id=eq.${tenantId}&is_active=eq.true&or=(agent_id.is.null,agent_id.eq.${agentId})&limit=100`),
    this.db.select<any[]>('agent_tool_memory',`select=normalized_question,tool_plan,tool_result_shape,success_count,approved_by_user&tenant_id=eq.${tenantId}&agent_id=eq.${agentId}&is_active=eq.true&order=last_used_at.desc&limit=50`)
  ]); const score=(value:any)=>terms.reduce((n,t)=>n+(normalize(JSON.stringify(value)).includes(t)?1:0),0);
  return {semanticMatches:items.map(x=>({...x,score:score(x)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,12),toolMemoryMatches:memory.map(x=>({...x,score:score(x)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,5)};
 }
}
