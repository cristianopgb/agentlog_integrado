import { strict as assert } from 'node:assert';
import { AttendanceAgentService } from './attendance-agent.service';
import { AttendanceAgentToolsService } from './attendance-agent-tools.service';

async function main() {
  const writes: any[] = [];
  const db: any = {
    select: async (table: string) => (table === 'ai_agents' ? [] : []),
    insert: async () => [],
    update: async () => [],
  };
  const service = new AttendanceAgentService(db as any, {} as any, {} as any);
  const result = await service.processPublicConversation(
    'tenant-a',
    'conversation-a',
  );
  assert.equal(result.configured, false);
  assert.match(result.answer, /ainda não configurado/);
  assert.equal(writes.length, 0);
  const executed: any[] = [];
  let turn = 0;
  const configuredDb: any = {
    select: async (table: string) =>
      table === 'ai_agents'
        ? [
            {
              id: 'agent-a',
              created_by: 'actor-a',
              agent_type: 'attendance_inbox',
            },
          ]
        : table === 'ai_agent_tools'
          ? [{ tool_id: 'tool-a' }]
          : table === 'ai_tools'
            ? [{ id: 'tool-a', tool_key: 'attendance.occurrence.create' }]
            : [],
    insert: async (table: string) =>
      table === 'ai_runs' ? [{ id: 'run-a' }] : [],
    update: async () => [],
  };
  const gateway: any = {
    attendanceTurn: async () =>
      turn++ === 0
        ? {
            calls: [
              {
                id: 'call-a',
                name: 'attendance__occurrence__create',
                args: {
                  conversation_id: 'operation-record-a',
                  operation_record_id: 'operation-record-a',
                },
              },
            ],
            answer: '',
            responseId: 'response-a',
          }
        : {
            calls: [],
            answer: 'Registro realizado.',
            responseId: 'response-b',
            modelName: 'test',
            usage: {},
          },
  };
  const tools: any = {
    execute: async (
      _tenant: string,
      key: string,
      args: Record<string, unknown>,
    ) => {
      executed.push({ key, args });
      return { created: true };
    },
  };
  const configured = new AttendanceAgentService(configuredDb, gateway, tools);
  await configured.processPublicConversation('tenant-a', 'real-conversation-a');
  assert.equal(executed[0].args.conversation_id, 'real-conversation-a');
  assert.equal(executed[0].args.operation_record_id, 'operation-record-a');

  const occurrenceId = '11111111-1111-4111-8111-111111111111',
    detailIds: string[] = [],
    treatmentIds: string[] = [];
  const toolDb: any = {
    select: async (table: string, query: string) => {
      if (
        table === 'occurrences' &&
        query.includes('occurrence_number=eq.OC0000003')
      )
        return [{ id: occurrenceId, occurrence_number: 'OC0000003' }];
      if (table === 'occurrences' && query.includes(`id=eq.${occurrenceId}`))
        return [{ id: occurrenceId, occurrence_number: 'OC0000003' }];
      if (table === 'conversation_occurrence_links')
        return [{ occurrence_id: occurrenceId }];
      if (table === 'inbox_conversations')
        return [{ id: 'conversation-a', contact_id: 'contact-a' }];
      return [];
    },
    update: async () => [],
    insert: async () => [],
  };
  const occurrenceService: any = {
    detail: async (_t: string, id: string) => {
      detailIds.push(id);
      return {
        occurrence_number: 'OC0000003',
        current_status: 'open',
        current_priority: 'medium',
      };
    },
    createTreatment: async (_t: string, id: string) => {
      treatmentIds.push(id);
      return { id: 'treatment-a' };
    },
  };
  const controlled = new AttendanceAgentToolsService(
    toolDb,
    occurrenceService,
    { ensurePermission: async () => undefined } as any,
  );
  await controlled.execute(
    'tenant-a',
    'attendance.occurrence.get_detail',
    { occurrence_number: 'OC0000003' },
    'actor-a',
  );
  await controlled.execute(
    'tenant-a',
    'attendance.occurrence.get_detail',
    { identifier: 'OC0000003' },
    'actor-a',
  );
  await controlled.execute(
    'tenant-a',
    'attendance.occurrence.get_detail',
    { conversation_id: 'conversation-a' },
    'actor-a',
  );
  assert.deepEqual(detailIds, [occurrenceId, occurrenceId, occurrenceId]);
  await controlled.execute(
    'tenant-a',
    'attendance.occurrence.add_treatment',
    { occurrence_number: 'OC0000003', description: 'Já descarreguei.' },
    'actor-a',
  );
  await controlled.execute(
    'tenant-a',
    'attendance.occurrence.add_treatment',
    { identifier: 'OC0000003', description: 'Deu tudo certo.' },
    'actor-a',
  );
  await controlled.execute(
    'tenant-a',
    'attendance.occurrence.add_treatment',
    { conversation_id: 'conversation-a', description: 'Posso seguir?' },
    'actor-a',
  );
  assert.deepEqual(treatmentIds, [occurrenceId, occurrenceId, occurrenceId]);
  const duplicate: any = await controlled.execute(
    'tenant-a',
    'attendance.occurrence.create',
    {
      conversation_id: 'conversation-a',
      contact_id: 'contact-a',
      title: 'Mesmo problema',
      description: 'Atualização',
    },
    'actor-a',
  );
  assert.equal(duplicate.duplicate_blocked, true);
  assert.equal(duplicate.existing_occurrence.occurrence_number, 'OC0000003');
  assert.equal(
    duplicate.recommended_tool,
    'attendance.occurrence.add_treatment',
  );

  const searchQueries: string[] = [];
  const operationalContacts: any[] = [];
  const operationalTools = new AttendanceAgentToolsService(
    {
      select: async (table: string, query: string) => {
        if (table === 'contacts') return operationalContacts;
        if (
          table === 'transport_records' &&
          query.includes('driver_phone.eq.61982757782')
        )
          return [
            {
              operation_record_id: occurrenceId,
              driver_phone: '61982757782',
              driver_whatsapp: null,
            },
          ];
        if (
          table === 'operation_records' &&
          query.includes(`id=eq.${occurrenceId}`)
        )
          return [{ driver_name: 'Marcos' }];
        if (table === 'operation_records') {
          searchQueries.push(query);
          if (query.includes('delivery_number=eq.DOC-2026-000051'))
            return [
              {
                id: occurrenceId,
                delivery_number: 'DOC-2026-000051',
                driver_name: 'Marcos',
              },
            ];
        }
        return [];
      },
      insert: async (table: string, payload: any) => {
        if (table === 'contacts') {
          const row = { id: 'operational-contact-a', ...payload };
          operationalContacts.push(row);
          return [row];
        }
        return [];
      },
      update: async () => [],
    } as any,
    occurrenceService,
    { ensurePermission: async () => undefined } as any,
  );
  const found: any = await operationalTools.execute(
    'tenant-a',
    'attendance.operation.find_by_document',
    { document_number: 'DOC-2026-000051' },
    'actor-a',
  );
  assert.equal(found.document_number_received, 'DOC-2026-000051');
  assert.equal(found.document_number_used, 'DOC-2026-000051');
  assert.equal(found.matched_field, 'delivery_number');
  assert(searchQueries[0].includes('DOC-2026-000051'));
  const operationalContact: any = await operationalTools.execute(
    'tenant-a',
    'attendance.contacts.find_by_phone',
    { phone: '61982757782' },
    'actor-a',
  );
  assert.equal(operationalContact.contact_type, 'driver_operational');
  assert.equal(operationalContact.contact_id, 'operational-contact-a');
  assert.equal(operationalContacts.length, 1);
  assert.equal(operationalContacts[0].metadata.origin, 'operational_match');
  assert.equal(operationalContact.source, 'treated_transport_records');

  const operationId = '22222222-2222-4222-8222-222222222222';
  const linkQueries: string[] = [];
  let occurrenceCreates = 0;
  let createdOccurrenceBody: any;
  const treatmentWrites: string[] = [];
  const hotfixDb: any = {
    select: async (table: string, query: string) => {
      if (table === 'inbox_conversations')
        return [{ id: 'conversation-hotfix', contact_id: null }];
      if (table === 'operation_records')
        return [
          {
            id: operationId,
            document_number: query.includes('DOC-2026-000011')
              ? 'DOC-2026-000011'
              : 'DOC-2026-000001',
          },
        ];
      if (table === 'occurrence_operation_links') {
        linkQueries.push(query);
        return query.includes('operation_record_id') &&
          !query.includes('DOC-2026-000011-marker')
          ? [{ occurrence_id: occurrenceId }]
          : [];
      }
      if (table === 'occurrences' && query.includes('id=in.'))
        return [
          {
            id: occurrenceId,
            occurrence_number: 'OC0000001',
            current_status: 'open',
          },
        ];
      if (table === 'public_chat_sessions') return [];
      return [];
    },
    insert: async () => [],
    update: async () => [],
  };
  const hotfixOccurrences: any = {
    create: async (_t: string, _u: string, body: any) => {
      occurrenceCreates++;
      createdOccurrenceBody = body;
      return {
        id: '33333333-3333-4333-8333-333333333333',
        occurrence_number: 'OC0000012',
        current_status: 'open',
      };
    },
    createTreatment: async (_t: string, id: string, _u: string, body: any) => {
      treatmentWrites.push(`${id}:${body.description}`);
      return { id: 'treatment-hotfix', status: 'open' };
    },
  };
  const hotfixTools = new AttendanceAgentToolsService(
    hotfixDb,
    hotfixOccurrences,
    { ensurePermission: async () => undefined } as any,
  );
  const updated: any = await hotfixTools.execute(
    'tenant-a',
    'attendance.occurrence.create',
    {
      conversation_id: 'conversation-hotfix',
      operation_record_id: operationId,
      title: 'Atraso',
      description: 'Motorista continua aguardando.',
    },
    'actor-a',
  );
  assert.equal(occurrenceCreates, 0, 'open occurrence must not be duplicated');
  assert.equal(updated.treatment_created, true);
  assert.equal(updated.occurrence_number, 'OC0000001');
  assert.deepEqual(treatmentWrites, [
    `${occurrenceId}:Motorista continua aguardando.`,
  ]);
  assert(
    linkQueries.every((query) => !query.includes('deleted_at')),
    'occurrence_operation_links queries must follow the actual schema',
  );
  const newOccurrenceTools = new AttendanceAgentToolsService(
    {
      ...hotfixDb,
      select: async (table: string, query: string) => {
        if (table === 'inbox_conversations')
          return [{ id: 'conversation-new', contact_id: null }];
        if (table === 'operation_records')
          return [{ id: operationId, document_number: 'DOC-2026-000011' }];
        if (table === 'occurrence_operation_links') {
          linkQueries.push(query);
          return [];
        }
        if (table === 'conversation_occurrence_links') return [];
        if (table === 'public_chat_sessions') return [];
        if (table === 'occurrence_reasons') return [{ id: 'reason-a' }];
        return [];
      },
    },
    hotfixOccurrences,
    { ensurePermission: async () => undefined } as any,
  );
  const created: any = await newOccurrenceTools.execute(
    'tenant-a',
    'attendance.occurrence.create',
    {
      conversation_id: 'conversation-new',
      operation_record_id: operationId,
      title: 'Avaria',
      description: 'Carga avariada.',
      reason_code: 'AVARIA',
    },
    'actor-a',
  );
  assert.equal(created.created, true);
  assert.equal(created.occurrence_number, 'OC0000012');
  assert.equal(occurrenceCreates, 1);
  assert.deepEqual(createdOccurrenceBody.operation_record_ids, [operationId]);
  const failedCreate: any = await new AttendanceAgentToolsService(
    (newOccurrenceTools as any).db,
    {
      ...hotfixOccurrences,
      create: async () => {
        throw new Error('database_write_failed');
      },
    },
    { ensurePermission: async () => undefined } as any,
  ).execute(
    'tenant-a',
    'attendance.occurrence.create',
    {
      conversation_id: 'conversation-new',
      operation_record_id: operationId,
      title: 'Avaria',
      description: 'Carga avariada.',
      reason_code: 'AVARIA',
    },
    'actor-a',
  );
  assert.equal(failedCreate.created, false);
  assert.equal(failedCreate.failure_reason, 'occurrence_creation_failed');
  assert.equal(failedCreate.technical_error, 'database_write_failed');

  let failedTurn = 0;
  const failedGateway: any = {
    attendanceTurn: async () =>
      failedTurn++ === 0
        ? {
            calls: [
              {
                id: 'failed-call',
                name: 'attendance__occurrence__create',
                args: { title: 'Falha', description: 'Falha' },
              },
            ],
            answer: '',
            responseId: 'failed-response',
          }
        : {
            calls: [],
            answer: 'Registrei a ocorrência com sucesso.',
            responseId: 'failed-response-2',
            modelName: 'test',
            usage: {},
          },
  };
  const falseSuccessService = new AttendanceAgentService(
    configuredDb,
    failedGateway,
    {
      execute: async () => ({
        created: false,
        duplicate_blocked: true,
        safe_message: 'Não foi possível registrar agora.',
      }),
    } as any,
  );
  const falseSuccess = await falseSuccessService.processPublicConversation(
    'tenant-a',
    'conversation-hotfix',
  );
  assert.equal(falseSuccess.answer, 'Não foi possível registrar agora.');
  console.log('attendance-agent.local-test: ok');
}
void main();
