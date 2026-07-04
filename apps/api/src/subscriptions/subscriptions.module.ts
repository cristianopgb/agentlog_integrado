import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { SubscriptionsController } from './subscriptions.controller';

@Module({
  imports: [SupabaseModule],
  controllers: [SubscriptionsController],
})
export class SubscriptionsModule {}
