import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
const keys=['analytics.map.get','analytics.result.get','analytics.context.analyze','operational.record.find','knowledge.guidance.search'];
@Injectable() export class GeneralChatSemanticBootstrapService {constructor(private readonly db:SupabaseService){}async ensure(tenantId:string,agent:any){if(agent.agent_type!=='general_chat'||agent.status!=='active'||agent.deleted_at)return;const tools=await this.db.select<any[]>('ai_tools',`select=id,tool_key&is_active=eq.true&tool_key=in.(${keys.join(',')})`);for(const tool of tools)await this.db.upsert('ai_agent_tools',{tenant_id:tenantId,agent_id:agent.id,tool_id:tool.id,is_enabled:true,config:{}},'tenant_id,agent_id,tool_id');}}
