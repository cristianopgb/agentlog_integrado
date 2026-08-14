import { strict as assert } from 'node:assert';
import { NestFactory } from '@nestjs/core';
import { PublicChatModule } from './public-chat.module';
import { PublicChatService } from './public-chat.service';
import { AttendanceAgentService } from '../agents/attendance-agent.service';
import { SupabaseService } from '../supabase/supabase.service';

async function main(){
 process.env.SUPABASE_URL='http://localhost:54321';process.env.SUPABASE_SERVICE_ROLE_KEY='test-service-role';
 const app=await NestFactory.createApplicationContext(PublicChatModule,{logger:false});
 assert(app.get(PublicChatService));assert(app.get(AttendanceAgentService));await app.close();
 const hash='8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918';
 const db:any={select:async()=>[
  {id:'newest',contact_id:null,visitor_token_hash:hash,created_at:'2026-08-14T02:00:00Z'},
  {id:'identified',contact_id:'contact-a',visitor_token_hash:hash,created_at:'2026-08-14T01:00:00Z'},
 ]};
 const service=new PublicChatService(db as SupabaseService,{} as AttendanceAgentService);
 const identity=await (service as any).visitor('tenant-a','admin');
 assert.equal(identity.id,'identified');
 console.log('public-chat.local-test: ok');
}
void main();
