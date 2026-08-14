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
  console.log('attendance-agent.local-test: ok');
}
void main();
