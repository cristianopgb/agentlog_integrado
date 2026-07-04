import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { PlansController } from './plans.controller';

@Module({
  imports: [SupabaseModule],
  controllers: [PlansController],
})
export class PlansModule {}
