import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { UsageController } from './usage.controller';

@Module({
  imports: [SupabaseModule],
  controllers: [UsageController],
})
export class UsageModule {}
