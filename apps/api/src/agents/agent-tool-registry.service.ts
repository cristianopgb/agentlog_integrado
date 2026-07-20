import { Injectable } from '@nestjs/common'; import { SupabaseService } from '../supabase/supabase.service';
@Injectable() export class AgentToolRegistryService { constructor(private db:SupabaseService){} catalog(){return this.db.select('ai_tools','is_active=eq.true&order=name.asc')} }
