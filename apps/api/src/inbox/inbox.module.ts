import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { ExternalInboxController, InboxController } from './inbox.controller';
import { InboxService } from './inbox.service';

@Module({
  imports: [SupabaseModule, RbacModule, AuthModule],
  controllers: [InboxController, ExternalInboxController],
  providers: [InboxService],
  exports: [InboxService],
})
export class InboxModule {}
