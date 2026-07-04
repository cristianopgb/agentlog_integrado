import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { PermissionsGuard } from './permissions.guard';
import { RbacService } from './rbac.service';

@Module({
  imports: [SupabaseModule],
  providers: [RbacService, PermissionsGuard],
  exports: [RbacService, PermissionsGuard],
})
export class RbacModule {}
