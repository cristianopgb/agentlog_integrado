import { BadRequestException } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RbacService } from '../rbac/rbac.service';
import { SupabaseService } from '../supabase/supabase.service';
import { OccurrencesController } from './occurrences.controller';
import { OccurrencesModule } from './occurrences.module';
import { OccurrencesService } from './occurrences.service';
import {
  REQUIRE_PERMISSION_KEY,
  type PermissionRequirement,
} from '../rbac/require-permission.decorator';
import { AppModule } from '../app.module';

type Row = Record<string, unknown> & { id: string };
const OP_A = '00000000-0000-4000-8000-00000000000a',
  OP_B = '00000000-0000-4000-8000-00000000000b',
  OP_X = '00000000-0000-4000-8000-00000000000c',
  EVENT_OTHER = '00000000-0000-4000-8000-00000000000d',
  EVENT_FOREIGN = '00000000-0000-4000-8000-00000000000e',
  DOCUMENT_OTHER = '00000000-0000-4000-8000-00000000000f',
  DOCUMENT_FOREIGN = '00000000-0000-4000-8000-000000000010';
class MemoryDb {
  inserts: Record<string, unknown>[] = [];
  selects: { table: string; query: string }[] = [];
  tables: Record<string, Row[]> = {
    occurrences: [],
    occurrence_events: [],
    occurrence_operation_links: [],
    occurrence_items: [],
    occurrence_financial_entries: [],
    occurrence_documents: [],
    occurrence_attachments: [],
    occurrence_treatments: [],
    occurrence_pending_actions: [],
    occurrence_code_catalog: [
      {
        id: 'closure-00-a',
        tenant_id: 'a',
        code: '00',
        description: 'Entregue com sucesso',
        kind: 'closure',
        is_active: true,
        deleted_at: null,
      },
      {
        id: 'closure-00-b',
        tenant_id: 'b',
        code: '00',
        description: 'Entregue com sucesso',
        kind: 'closure',
        is_active: true,
        deleted_at: null,
      },
    ],
    operation_records: [
      {
        id: OP_A,
        tenant_id: 'a',
        deleted_at: null,
        invoice_number: 'NF-100',
        customer_name: 'Cliente A',
      },
      {
        id: OP_B,
        tenant_id: 'a',
        deleted_at: null,
        manifest_number: 'MAN-200',
      },
      {
        id: OP_X,
        tenant_id: 'b',
        deleted_at: null,
        invoice_number: 'NF-100',
        customer_name: 'Outro tenant',
      },
    ],
    occurrence_reason_categories: [],
    occurrence_reasons: [
      {
        id: 'reason-a',
        tenant_id: 'a',
        name: 'Falta de item',
        is_active: true,
      },
      {
        id: 'reason-time',
        tenant_id: 'a',
        name: 'Com horário',
        is_active: true,
      },
      { id: 'reason-off', tenant_id: 'a', name: 'Inativo', is_active: false },
      { id: 'reason-x', tenant_id: 'b', name: 'Outro tenant', is_active: true },
    ],
    occurrence_reason_requirements: [
      {
        id: 'req-1',
        tenant_id: 'a',
        reason_id: 'reason-a',
        stage: 'opening',
        field_key: 'quantity',
        is_required: true,
      },
      {
        id: 'req-2',
        tenant_id: 'a',
        reason_id: 'reason-a',
        stage: 'opening',
        field_key: 'sku',
        is_required: true,
      },
      {
        id: 'req-3',
        tenant_id: 'a',
        reason_id: 'reason-a',
        stage: 'update',
        field_key: 'event_description',
        is_required: true,
      },
      {
        id: 'req-4',
        tenant_id: 'a',
        reason_id: 'reason-time',
        stage: 'opening',
        field_key: 'occurred_at',
        is_required: true,
      },
    ],
  };
  counters: Record<string, number> = {};
  async rpc<T>(_name: string, payload: Record<string, unknown>) {
    const tenant = String(payload.p_tenant_id);
    const number = this.counters[tenant] ?? 1;
    this.counters[tenant] = number + 1;
    return `OC${String(number).padStart(7, '0')}` as T;
  }
  async insert<T>(
    table: string,
    payload: Record<string, unknown> | Record<string, unknown>[],
  ) {
    const input = Array.isArray(payload) ? payload : [payload];
    for (const p of input) {
      this.inserts.push({ table, ...p });
      if (table === 'occurrence_events') {
        for (const field of ['event_at', 'source_channel', 'metadata'])
          if (p[field] === null)
            throw new Error(`occurrence_events.${field} cannot be null`);
      }
    }
    const rows = input.map((p) => ({
      id: `${table}-${this.tables[table].length + 1}`,
      ...(table === 'occurrence_events'
        ? {
            event_at: new Date().toISOString(),
            source_channel: 'manual',
            metadata: {},
          }
        : {}),
      ...p,
    }));
    this.tables[table].push(...rows);
    return rows as T;
  }
  async select<T>(table: string, query: string) {
    this.selects.push({ table, query });
    let rows = [...this.tables[table]];
    for (const [, key, value] of query.matchAll(
      /(?:^|&)([a-z_]+)=eq\.([^&]+)/g,
    ))
      rows = rows.filter((r) => String(r[key]) === decodeURIComponent(value));
    if (query.includes('deleted_at=is.null'))
      rows = rows.filter((r) => r.deleted_at == null);
    if (query.includes('is_active=eq.true'))
      rows = rows.filter((r) => r.is_active === true);
    const search = query.match(/\.ilike\.\*([^*]+)\*/);
    if (search) {
      const term = decodeURIComponent(search[1]).toLowerCase();
      rows = rows.filter((r) =>
        Object.values(r).some(
          (v) => typeof v === 'string' && v.toLowerCase().includes(term),
        ),
      );
    }
    const limit = query.match(/(?:^|&)limit=(\d+)/);
    if (limit) rows = rows.slice(0, Number(limit[1]));
    return rows as T;
  }
  async update<T>(
    table: string,
    query: string,
    payload: Record<string, unknown>,
  ) {
    const rows = await this.select<Row[]>(table, query);
    rows.forEach((r) => Object.assign(r, payload));
    return rows as T;
  }
  async delete<T>(table: string, query: string) {
    const rows = await this.select<Row[]>(table, query);
    this.tables[table] = this.tables[table].filter((r) => !rows.includes(r));
    return rows as T;
  }
}
function ok(value: unknown, message: string) {
  if (!value) throw new Error(message);
}
async function rejects(run: () => Promise<unknown>, message: string) {
  try {
    await run();
  } catch (e) {
    ok(e instanceof BadRequestException, message);
    return;
  }
  throw new Error(message);
}
async function main() {
  process.env.SUPABASE_URL ??= 'http://localhost:54321';
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'local-bootstrap-test-key';
  const app = await NestFactory.createApplicationContext(OccurrencesModule, {
    logger: false,
    abortOnError: false,
  });
  ok(
    app.get(SupabaseService) instanceof SupabaseService,
    'SupabaseService must be resolved by Nest',
  );
  ok(
    app.get(AuthGuard) instanceof AuthGuard,
    'AuthGuard must be resolved by Nest',
  );
  ok(
    app.get(PermissionsGuard) instanceof PermissionsGuard,
    'PermissionsGuard must be resolved by Nest',
  );
  ok(
    app.get(RbacService) instanceof RbacService,
    'RbacService must be resolved by Nest',
  );
  await app.close();
  const imports = Reflect.getMetadata('imports', AppModule) as unknown[];
  ok(
    imports.includes(OccurrencesModule),
    'AppModule must import OccurrencesModule',
  );
  const db = new MemoryDb();
  const service = new OccurrencesService(db as never);
  const visible = await service.listReasons('a');
  ok(
    visible.length === 2 && visible.every((reason) => reason.tenant_id === 'a'),
    'reason listing must be active and tenant isolated',
  );
  const options = await service.operationOptions('a', 'NF-100');
  ok(
    options.length === 1 && options[0].id === OP_A,
    'operation search must not return another tenant',
  );
  const optionQuery = db.selects.at(-1)?.query ?? '';
  ok(
    optionQuery.includes('tenant_id=eq.a') &&
      optionQuery.includes('deleted_at=is.null') &&
      optionQuery.includes('limit=20'),
    'operation search must be tenant-aware, exclude deleted rows and limit results',
  );
  await rejects(
    () =>
      service.create('a', 'user', {
        title: 'Campos ausentes',
        reason_id: 'reason-a',
      }),
    'required opening fields must fail',
  );
  await rejects(
    () =>
      service.create('a', 'user', {
        title: 'Operação inválida',
        reason_id: 'reason-a',
        quantity: 1,
        sku: 'SKU-1',
        primary_operation_record_id: '10',
      }),
    'invalid primary operation id must be a bad request',
  );
  await rejects(
    () =>
      service.create('a', 'user', {
        title: 'Operação inválida',
        reason_id: 'reason-a',
        quantity: 1,
        sku: 'SKU-1',
        operation_record_ids: ['10'],
      }),
    'invalid operation id list must be a bad request',
  );
  const without = await service.create('a', 'user', {
    title: 'Sem operação',
    reason_id: 'reason-a',
    quantity: 1,
    sku: 'SKU-1',
    due_at: new Date(Date.now() + 60_000).toISOString(),
  });
  ok(
    (without as Row).occurrence_number === 'OC0000001',
    'first tenant occurrence must use OC0000001',
  );
  ok(without.sla_status === 'on_track', 'future SLA must be on track');
  ok(
    (without.operation_links as unknown[]).length === 0,
    'guided create without operation id or occurred_at must pass',
  );
  const initialInsert = db.inserts.find(
    (row) =>
      row.table === 'occurrence_events' && row.occurrence_id === without.id,
  );
  ok(
    initialInsert && !('event_at' in initialInsert),
    'initial event must omit empty event_at',
  );
  const initialEvent = db.tables.occurrence_events.find(
    (event) => event.occurrence_id === without.id,
  );
  ok(
    typeof initialEvent?.event_at === 'string',
    'database mock must apply the event_at default',
  );
  await rejects(
    () =>
      service.create('a', 'user', {
        title: 'Horário obrigatório',
        reason_id: 'reason-time',
      }),
    'reason requiring occurred_at must fail without occurred_at',
  );
  const withOptionalTime = await service.create('a', 'user', {
    title: 'Horário não obrigatório',
    reason_id: 'reason-a',
    quantity: 1,
    sku: 'SKU-2',
  });
  ok(
    (withOptionalTime as Row).occurrence_number === 'OC0000002',
    'second tenant occurrence must use OC0000002',
  );
  const otherTenant = await service.create('b', 'user', {
    title: 'Primeira ocorrência de outro tenant',
    reason_id: 'reason-x',
  });
  ok(
    (otherTenant as Row).occurrence_number === 'OC0000001',
    'first occurrence in another tenant must use OC0000001',
  );
  await rejects(
    () =>
      service.create('a', 'user', {
        title: 'Prazo inválido',
        reason_id: 'reason-a',
        quantity: 1,
        sku: 'SKU-1',
        due_at: 'inválido',
      }),
    'invalid due_at must fail',
  );

  const hardeningMigration = readFileSync(
    join(
      __dirname,
      '../../../../supabase/migrations/202608080002_sprint_10r_f_function_and_numbering_hardening.sql',
    ),
    'utf8',
  );
  for (const signature of [
    'seed_occurrence_codes(uuid)',
    'seed_occurrence_codes_for_new_tenant()',
  ])
    ok(
      hardeningMigration.includes(
        `revoke all on function public.${signature} from public, anon, authenticated;`,
      ),
      `${signature} must not be executable by public, anon or authenticated`,
    );
  ok(
    hardeningMigration.includes('unique (tenant_id, occurrence_number)') &&
      hardeningMigration.includes('having count(*) > 1'),
    'migration must enforce tenant occurrence number uniqueness and fail on historical duplicates',
  );
  ok(
    Boolean(withOptionalTime.id),
    'reason not requiring occurred_at must pass without occurred_at',
  );
  const one = await service.create('a', 'user', {
    title: 'Uma operação',
    reason_id: 'reason-a',
    quantity: 1,
    sku: 'SKU-1',
    operation_record_ids: [OP_A],
    primary_operation_record_id: OP_A,
  });
  ok((one.operation_links as unknown[]).length === 1, 'create with operation');
  const many = await service.create('a', 'user', {
    title: 'Múltiplas operações',
    reason_id: 'reason-a',
    quantity: 1,
    sku: 'SKU-1',
    operation_record_ids: [OP_A, OP_B],
    primary_operation_record_id: OP_A,
  });
  ok(
    (many.operation_links as unknown[]).length === 2,
    'create with multiple operations',
  );
  await rejects(
    () =>
      service.create('a', 'user', {
        title: 'Cross tenant',
        reason_id: 'reason-a',
        quantity: 1,
        sku: 'SKU',
        operation_record_ids: [OP_X],
      }),
    'cross-tenant operation must fail',
  );
  const id = String(without.id);
  await rejects(
    () =>
      service.addEvent('a', id, 'user', {
        stage: 'update',
        event_type: 'note',
        reason_id: 'reason-a',
      }),
    'event requirement must fail',
  );
  await service.addEvent('a', id, 'user', {
    stage: 'update',
    event_type: 'note',
    reason_id: 'reason-a',
    event_description: 'primeiro',
  });
  ok(
    db.tables.occurrence_events.filter((e) => e.occurrence_id === id).length ===
      2,
    'events must append',
  );
  const addedInsert =
    db.inserts
      .filter(
        (row) => row.table === 'occurrence_events' && row.occurrence_id === id,
      )
      .at(-1) ?? {};
  ok(!('event_at' in addedInsert), 'addEvent must omit empty event_at');
  ok(
    addedInsert.source_channel === 'manual',
    'addEvent must preserve the manual source_channel default instead of sending null',
  );
  ok(
    !('source_reference' in addedInsert),
    'addEvent must omit empty source_reference',
  );
  ok(
    Boolean(addedInsert.metadata) && typeof addedInsert.metadata === 'object',
    'addEvent metadata must remain an object',
  );
  await service.changeStatus('a', id, 'user', { status: 'triage' });
  ok(
    db.tables.occurrence_events.some(
      (e) => e.occurrence_id === id && e.event_type === 'status_changed',
    ),
    'status event missing',
  );
  await rejects(
    () =>
      service.addEvent('a', id, 'user', {
        stage: 'update',
        event_type: 'reported',
        reason_id: 'reason-x',
        event_description: 'x',
      }),
    'cross-tenant reason must fail',
  );
  await rejects(
    () =>
      service.create('a', 'user', {
        title: 'Inativo',
        reason_id: 'reason-off',
      }),
    'inactive reason must fail',
  );
  await rejects(
    () => service.changeStatus('a', id, 'user', { status: 'closed' }),
    'invalid status transition must fail',
  );
  await rejects(
    () =>
      service.assign('a', id, 'user', { owner_id: 'owner', unexpected: true }),
    'unknown payload field must fail',
  );
  await rejects(
    () =>
      service.addOperationLink('a', id, 'user', {
        operation_record_id: '10',
        relationship_type: 'affected',
      }),
    'invalid link operation id must fail',
  );
  await rejects(
    () =>
      service.addOperationLink('a', id, 'user', {
        operation_record_id: OP_X,
        relationship_type: 'affected',
      }),
    'cross-tenant link operation must fail',
  );
  await service.addOperationLink('a', id, 'user', {
    operation_record_id: OP_A,
    relationship_type: 'primary',
    is_primary: true,
  });
  await service.addOperationLink('a', id, 'user', {
    operation_record_id: OP_B,
    relationship_type: 'primary',
    is_primary: true,
  });
  const links = db.tables.occurrence_operation_links.filter(
    (link) => link.occurrence_id === id,
  );
  ok(
    links.filter((link) => link.is_primary === true).length === 1 &&
      links.find((link) => link.operation_record_id === OP_B)?.is_primary ===
        true,
    'second primary operation must replace, not duplicate, the primary',
  );
  const item = await service.createItem('a', id, 'user', {
    item_type: 'missing',
    quantity: 2,
    sku: 'SKU-10',
  });
  ok(item.item_type === 'missing', 'valid item must be created');
  db.tables.occurrence_events.push(
    { id: EVENT_OTHER, tenant_id: 'a', occurrence_id: 'another-occurrence' },
    { id: EVENT_FOREIGN, tenant_id: 'b', occurrence_id: id },
  );
  db.tables.occurrence_documents.push(
    {
      id: DOCUMENT_OTHER,
      tenant_id: 'a',
      occurrence_id: 'another-occurrence',
      deleted_at: null,
    },
    {
      id: DOCUMENT_FOREIGN,
      tenant_id: 'b',
      occurrence_id: id,
      deleted_at: null,
    },
  );
  await rejects(
    () =>
      service.createItem('a', id, 'user', {
        item_type: 'missing',
        operation_record_id: OP_X,
      }),
    'item operation from another tenant must fail',
  );
  await rejects(
    () =>
      service.createItem('a', id, 'user', {
        item_type: 'missing',
        event_id: EVENT_OTHER,
      }),
    'item event from another occurrence must fail',
  );
  await rejects(
    () =>
      service.createItem('a', id, 'user', {
        item_type: 'missing',
        event_id: EVENT_FOREIGN,
      }),
    'item event from another tenant must fail',
  );
  await rejects(
    () =>
      service.createItem('a', id, 'user', {
        item_type: 'missing',
        quantity: -1,
      }),
    'negative quantity must fail',
  );
  const financial = await service.createFinancialEntry('a', id, 'user', {
    entry_type: 'unloading',
    amount: 120,
  });
  ok(financial.amount === 120, 'valid financial entry must be created');
  await rejects(
    () =>
      service.createFinancialEntry('a', id, 'user', {
        entry_type: 'refund',
        amount: 1,
        receipt_document_id: DOCUMENT_OTHER,
      }),
    'financial receipt from another occurrence must fail',
  );
  await rejects(
    () =>
      service.createFinancialEntry('a', id, 'user', {
        entry_type: 'refund',
        amount: 1,
        receipt_document_id: DOCUMENT_FOREIGN,
      }),
    'financial receipt from another tenant must fail',
  );
  await rejects(
    () =>
      service.createFinancialEntry('a', id, 'user', {
        entry_type: 'daily',
        amount: -1,
      }),
    'negative financial amount must fail',
  );
  await service.createDocument('a', id, 'user', {
    document_type: 'cte',
    document_number: '1',
  });
  await rejects(
    () =>
      service.createDocument('a', id, 'user', {
        document_type: 'cte',
        event_id: EVENT_OTHER,
      }),
    'document event from another occurrence must fail',
  );
  await rejects(
    () =>
      service.createDocument('a', id, 'user', {
        document_type: 'cte',
        event_id: EVENT_FOREIGN,
      }),
    'document event from another tenant must fail',
  );
  await service.createAttachment('a', id, 'user', {
    attachment_type: 'photo',
    file_name: 'foto.jpg',
  });
  await rejects(
    () =>
      service.createAttachment('a', id, 'user', {
        attachment_type: 'photo',
        document_id: DOCUMENT_OTHER,
      }),
    'attachment document from another occurrence must fail',
  );
  await rejects(
    () =>
      service.createAttachment('a', id, 'user', {
        attachment_type: 'photo',
        document_id: DOCUMENT_FOREIGN,
      }),
    'attachment document from another tenant must fail',
  );
  await rejects(
    () =>
      service.createAttachment('a', id, 'user', {
        attachment_type: 'photo',
        event_id: EVENT_OTHER,
      }),
    'attachment event from another occurrence must fail',
  );
  await rejects(
    () =>
      service.createAttachment('a', id, 'user', {
        attachment_type: 'photo',
        event_id: EVENT_FOREIGN,
      }),
    'attachment event from another tenant must fail',
  );
  const detail = await service.detail('a', id);
  ok(
    Array.isArray(detail.items) &&
      Array.isArray(detail.financial_entries) &&
      Array.isArray(detail.documents) &&
      Array.isArray(detail.attachments),
    'detail must include all structured record collections',
  );
  ok(
    Array.isArray(detail.treatments) && Array.isArray(detail.pending_actions),
    'detail must include treatments and pending actions',
  );
  const treatment = await service.createTreatment('a', id, 'user', {
    treatment_type: 'contact_driver',
    description: 'Contato realizado',
    responsible_team: 'Operação',
  });
  await rejects(
    () =>
      service.createTreatment('a', id, 'user', {
        treatment_type: 'invalid',
        description: 'x',
      }),
    'invalid treatment type must fail',
  );
  await service.updateTreatment('a', id, 'user', treatment.id, {
    status: 'done',
  });
  ok(
    db.tables.occurrence_events.some(
      (e) => e.event_type === 'treatment_completed',
    ),
    'completing treatment must append treatment_completed',
  );
  const pending = await service.createPendingAction('a', id, 'user', {
    title: 'Enviar documento',
    due_at: new Date().toISOString(),
  });
  await service.updatePendingAction('a', id, 'user', pending.id, {
    status: 'done',
  });
  ok(
    db.tables.occurrence_events.some(
      (e) => e.event_type === 'pending_action_completed',
    ),
    'completing pending action must append pending_action_completed',
  );
  await service.updateSla('a', id, 'user', {
    due_at: new Date(Date.now() + 60000).toISOString(),
  });
  await rejects(
    () =>
      service.updateSla('a', id, 'user', {
        due_at: null,
        sla_status: 'on_track',
      }),
    'manual SLA status must be rejected',
  );
  ok(
    db.tables.occurrence_events.some((e) => e.event_type === 'sla_updated'),
    'SLA update must append event',
  );
  await service.changeStatus('a', id, 'user', { status: 'in_progress' });
  await rejects(
    () => service.changeStatus('a', id, 'user', { status: 'resolved' }),
    'generic status must reject resolved',
  );
  await service.resolve('a', id, 'user', {
    resolution_summary: 'Operação regularizada',
  });
  ok(
    db.tables.occurrence_events.some(
      (e) => e.event_type === 'occurrence_resolved',
    ),
    'resolve must append event',
  );
  const openPending = await service.createPendingAction('a', id, 'user', {
    title: 'Ainda aberta',
  });
  await rejects(
    () => service.close('a', id, 'user', { closed_reason: 'Concluída' }),
    'close with pending must fail without force',
  );
  await rejects(
    () => service.close('a', id, 'user', { force_close_with_pending: true }),
    'close reason is required',
  );
  await service.close('a', id, 'user', {
    closed_reason: 'Concluída',
    force_close_with_pending: true,
  });
  ok(
    Boolean(openPending) &&
      db.tables.occurrence_events.some(
        (e) => e.event_type === 'occurrence_closed',
      ),
    'forced close must append event',
  );
  const snapshot = links.find((link) => link.operation_record_id === OP_A)
    ?.snapshot as Record<string, unknown>;
  ok(
    Boolean(snapshot?.label && snapshot?.reference) &&
      'customer_name' in snapshot &&
      'record_type' in snapshot,
    'operation link must save safe friendly snapshot',
  );
  ok(
    db.tables.occurrence_events.some(
      (event) => event.event_type === 'item_added',
    ) &&
      db.tables.occurrence_events.some(
        (event) => event.event_type === 'financial_entry_added',
      ) &&
      db.tables.occurrence_events.some(
        (event) => event.event_type === 'document_added',
      ) &&
      db.tables.occurrence_events.some(
        (event) => event.event_type === 'attachment_added',
      ),
    'each record creation must append a timeline event',
  );
  db.tables.occurrence_items.push({
    id: 'foreign-item',
    tenant_id: 'b',
    occurrence_id: id,
    item_type: 'extra',
    deleted_at: null,
  });
  await service.deleteItem('a', id, 'user', 'foreign-item').then(
    () => {
      throw new Error('cross-tenant delete must fail');
    },
    () => undefined,
  );
  ok(
    db.tables.occurrence_items.find((record) => record.id === 'foreign-item')
      ?.deleted_at === null,
    'soft delete must not affect another tenant',
  );
  const permission = Reflect.getMetadata(
    REQUIRE_PERMISSION_KEY,
    OccurrencesController.prototype.status,
  ) as PermissionRequirement;
  ok(
    permission.mode === 'any' &&
      permission.permissionKeys?.includes('occurrences.update') &&
      permission.permissionKeys.includes('occurrences.kanban.move'),
    'status route must allow update or kanban move permission',
  );
  ok(
    !('dashboard' in OccurrencesController.prototype),
    'dashboard endpoint must not exist',
  );
  console.log('occurrences tests passed');
}
void main();
