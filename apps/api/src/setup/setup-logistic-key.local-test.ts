import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RbacService } from '../rbac/rbac.service';
import { TenantLogisticKeyService } from '../normalization/tenant-logistic-key.service';
import { SetupLogisticKeyController } from './setup-logistic-key.controller';

async function run() {
  const settings: Array<Record<string, unknown>> = [];
  const db: any = {
    select: async (table: string, query: string) => {
      if (table === 'tenant_integration_settings')
        return settings.filter((row) => query.includes(`tenant_id=eq.${row.tenant_id}`));
      if (table === 'user_roles')
        return query.includes('user_id=eq.user-a') && query.includes('tenant_id=eq.tenant-a')
          ? [{ role_id: 'role-a' }]
          : [];
      if (table === 'role_permissions') return [{ id: 'permission-a' }];
      return [];
    },
    insert: async (table: string, payload: Record<string, unknown>) => {
      if (table === 'tenant_integration_settings') settings.push(payload);
      return [payload];
    },
  };
  const keys = new TenantLogisticKeyService(db);
  const controller = new SetupLogisticKeyController(keys);
  const request: any = { user: { id: 'user-a' } };

  assert.throws(
    () => controller.establish('tenant-a', request, { primary_logistic_key: 'cte_number', confirmed: false }),
    BadRequestException,
    'setup requires explicit confirmation',
  );
  const setting = await controller.establish('tenant-a', request, { primary_logistic_key: 'cte_number', confirmed: true });
  assert.equal(setting.established_by_data_source_id, null, 'setup establishes the key without a data source');
  await assert.rejects(
    () => controller.establish('tenant-a', request, { primary_logistic_key: 'delivery_number', confirmed: true }),
    /não pode ser alterada/,
    'the official key is immutable',
  );

  const reflector: any = { getAllAndOverride: () => ({ permissionKeys: ['integrations.api.configure'] }) };
  const guard = new PermissionsGuard(reflector, new RbacService(db));
  const contextFor = (tenantId: string): any => ({
    getHandler: () => controller.get,
    getClass: () => SetupLogisticKeyController,
    switchToHttp: () => ({ getRequest: () => ({ params: { tenantId }, user: { id: 'user-a' } }) }),
  });
  assert.equal(await guard.canActivate(contextFor('tenant-a')), true, 'tenant A permission grants tenant A access');
  await assert.rejects(
    () => guard.canActivate(contextFor('tenant-b')),
    ForbiddenException,
    'tenant A membership and permission cannot read or establish tenant B settings',
  );

  const migration = readFileSync(
    join(process.cwd(), '..', '..', 'supabase', 'migrations', '202608190001_explicit_logistic_key_setup.sql'),
    'utf8',
  );
  assert.match(migration, /drop trigger if exists ensure_api_delivery_canonical_mapping\s+on public\.data_contract_fields/);
  assert.doesNotMatch(migration, /on public\.data_source_api_field_mappings/);
  assert.match(migration, /procedure\.proname = 'ensure_api_delivery_canonical_mapping'/, 'migration aborts if a residual trigger invokes the compatibility function');
  const compatibilityBody = migration.match(/create or replace function public\.ensure_api_delivery_canonical_mapping\(\)[\s\S]*?\$\$;/)?.[0] ?? '';
  assert.doesNotMatch(compatibilityBody, /insert into public\.field_mappings/i, 'inserting a contract field cannot create a mapping through the compatibility function');

  console.log('setup logistic key tests passed');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
