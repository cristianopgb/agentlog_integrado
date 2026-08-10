import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { InboxModule } from '../inbox/inbox.module';
import { AgentsModule } from '../agents/agents.module';
import { PublicChatController } from './public-chat.controller';
import { PublicChatService } from './public-chat.service';
@Module({imports:[SupabaseModule,InboxModule,AgentsModule],controllers:[PublicChatController],providers:[PublicChatService]})
export class PublicChatModule{}
