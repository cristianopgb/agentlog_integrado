import { strict as assert } from 'node:assert';
import { NestFactory } from '@nestjs/core';
import { PublicChatModule } from './public-chat.module';
import { PublicChatService } from './public-chat.service';
import { AttendanceAgentService } from '../agents/attendance-agent.service';

async function main(){
 process.env.SUPABASE_URL='http://localhost:54321';process.env.SUPABASE_SERVICE_ROLE_KEY='test-service-role';
 const app=await NestFactory.createApplicationContext(PublicChatModule,{logger:false});
 assert(app.get(PublicChatService));assert(app.get(AttendanceAgentService));await app.close();
 console.log('public-chat.local-test: ok');
}
void main();
