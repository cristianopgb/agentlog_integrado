import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RbacService } from '../rbac/rbac.service';
import { SupabaseService } from '../supabase/supabase.service';
import { InboxModule } from './inbox.module';
import { InboxService } from './inbox.service';

type Row = Record<string, unknown> & { id: string };
class MemoryDb {
  sequence = 0;
  selects: { table: string; query: string }[] = [];
  tables: Record<string, Row[]> = {
    contacts: [],
    inbox_conversations: [],
    inbox_messages: [],
    inbox_events: [],
    conversation_occurrence_links: [],
    occurrences: [{ id: 'occ-a', tenant_id: 'a', deleted_at: null }],
    external_api_clients: [],
  };
  async select<T>(table: string, query: string) {
    this.selects.push({ table, query });
    let rows = [...(this.tables[table] ?? [])];
    const matches = [...query.matchAll(/(?:^|&)([a-z_]+)=eq\.([^&]+)/g)];
    for (const [, key, raw] of matches)
      rows = rows.filter((r) => String(r[key]) === decodeURIComponent(raw));
    if (query.includes('deleted_at=is.null'))
      rows = rows.filter((r) => r.deleted_at == null);
    if (query.includes('status=in.(')) {
      const values =
        query.match(/status=in\.\(([^)]+)\)/)?.[1].split(',') ?? [];
      rows = rows.filter((r) => values.includes(String(r.status)));
    }
    if (query.includes('order=last_message_at.desc')) rows.reverse();
    const limit = Number(query.match(/limit=(\d+)/)?.[1] ?? rows.length);
    return rows.slice(0, limit) as T;
  }
  async insert<T>(
    table: string,
    payload: Record<string, unknown> | Record<string, unknown>[],
  ) {
    const inputs = Array.isArray(payload) ? payload : [payload];
    const rows = inputs.map((p) => ({
      id: `${table}-${++this.sequence}`,
      created_at: new Date().toISOString(),
      deleted_at: null,
      ...p,
    }));
    this.tables[table].push(...rows);
    return rows as T;
  }
  async update<T>(
    table: string,
    query: string,
    payload: Record<string, unknown>,
  ) {
    const rows = await this.select<Row[]>(table, query);
    rows.forEach((row) => Object.assign(row, payload));
    return rows as T;
  }
}
async function main() {
  process.env.SUPABASE_URL = 'http://localhost:54321';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role';
  const app = await NestFactory.createApplicationContext(InboxModule, {
    logger: false,
  });
  assert(app.get(InboxService));
  assert(app.get(SupabaseService));
  assert(app.get(AuthGuard));
  assert(app.get(PermissionsGuard));
  assert(app.get(RbacService));
  await app.close();
  const db = new MemoryDb();
  const service = new InboxService(db as unknown as SupabaseService);
  const token = 'secret-token';
  db.tables.external_api_clients.push({
    id: 'client-a',
    tenant_id: 'a',
    token_hash: createHash('sha256').update(token).digest('hex'),
    is_active: true,
    allowed_scope: 'inbox.messages.create',
    deleted_at: null,
  });
  const first = await service.externalMessage(`Bearer ${token}`, {
    contact_phone: '+5511999999999',
    contact_name: 'Motorista',
    channel: 'api',
    body: 'Primeira',
  });
  const second = await service.externalMessage(`Bearer ${token}`, {
    contact_phone: '+5511999999999',
    channel: 'api',
    body: 'Segunda',
  });
  assert.equal(first.contact_id, second.contact_id);
  assert.equal(first.conversation_id, second.conversation_id);
  assert.equal(db.tables.contacts.length, 1);
  assert.equal(db.tables.inbox_conversations.length, 1);
  assert.equal(db.tables.inbox_messages.length, 2);
  await assert.rejects(
    () =>
      service.externalMessage('Bearer invalid', {
        contact_phone: '1',
        channel: 'api',
        body: 'x',
      }),
    UnauthorizedException,
  );
  db.tables.external_api_clients[0].is_active = false;
  await assert.rejects(
    () =>
      service.externalMessage(`Bearer ${token}`, {
        contact_phone: '1',
        channel: 'api',
        body: 'x',
      }),
    UnauthorizedException,
  );
  db.tables.external_api_clients[0].is_active = true;
  const closed = await service.changeStatus(
    'a',
    String(first.conversation_id),
    'user-a',
    { status: 'closed' },
  );
  assert.equal(closed.status, 'closed');
  assert.equal(typeof closed.closed_at, 'string');
  await assert.rejects(() =>
    service.detail('b', String(first.conversation_id)),
  );
  await assert.rejects(() =>
    service.linkOccurrence('a', String(first.conversation_id), 'user-a', {
      occurrence_id: 'foreign',
    }),
  );
  await service.createMessage('a', String(first.conversation_id), 'user-a', {
    body: 'Registro local',
    direction: 'outbound',
    sender_type: 'user',
  });
  assert.equal(db.tables.inbox_messages.length, 3);
  const source = readFileSync(__dirname + '/inbox.service.js', 'utf8');
  assert(!source.includes('select=*'));
  assert(!source.includes('WhatsApp'));
  const hardeningMigration = readFileSync(
    resolve(
      __dirname,
      '../../../../supabase/migrations/202608090002_sprint_12a_inbox_rls_hardening.sql',
    ),
    'utf8',
  );
  assert(
    hardeningMigration.includes(
      'drop policy if exists "inbox conversations update"',
    ),
  );
  assert(hardeningMigration.includes('occurrences.inbox.assign'));
  assert(hardeningMigration.includes('occurrences.inbox.close'));
  assert(!hardeningMigration.includes('occurrences.inbox.reply'));
  console.log('Inbox tests passed.');
}
void main();
