import assert from 'node:assert/strict';
import { ApiConnectorSyncService } from './api-connector-sync.service';
import { TenantLogisticKeyService } from '../normalization/tenant-logistic-key.service';

type Target = { entity: string; field: string; operational?: boolean };

function fixture(entityKey: string, targets: Target[], configuredKey?: string) {
  const settings: Array<Record<string, unknown>> = configuredKey
    ? [{ tenant_id: 'tenant-a', primary_logistic_key: configuredKey }]
    : [];
  const inserts: Array<{ table: string; payload: any }> = [];
  const db: any = {
    select: async (table: string, query: string) => {
      if (table === 'tenant_integration_settings') return settings;
      if (table === 'data_contracts') return [{ id: `contract-${entityKey}`, entity_key: entityKey }];
      if (table === 'data_contract_fields') return [{ id: 'contract-field-delivery', source_field_name: 'numero_entrega', field_key: 'numero_entrega', data_type: 'text', is_required: true, allow_null: false }];
      if (table === 'field_mappings') {
        if (query.includes('operational_key=eq.true')) return targets.filter(item => item.operational !== false).map(item => ({ canonical_entity: { entity_key: item.entity }, canonical_field: { field_key: item.field } }));
        if (query.includes('select=data_contract_field_id')) return [{ data_contract_field_id: 'contract-field-delivery', canonical_entity_id: `entity-${targets[0].entity}`, canonical_field_id: `field-${targets[0].field}` }];
        if (query.includes('select=id&') && query.includes('canonical_field_id=in.(')) {
          const fieldId = query.match(/canonical_field_id=in\.\(([^)]+)\)/)?.[1];
          const expectedField = entityKey === 'occurrences' ? 'linked_delivery_number' : 'delivery_number';
          return fieldId === `field-${expectedField}` && targets.some(item => item.entity === (entityKey === 'occurrences' ? 'occurrences' : 'operation_records') && item.field === expectedField)
            ? [{ id: `mapping-${expectedField}` }]
            : [];
        }
        return [{ canonical_entity: { entity_key: targets[0].entity }, canonical_field: { field_key: targets[0].field } }];
      }
      if (table === 'data_source_api_field_mappings') return [{ id: 'api-mapping', data_contract_field_id: 'contract-field-delivery', source_field_name: 'numero_entrega', status: 'active', data_contract_field: { field_key: 'numero_entrega', data_type: 'text' } }];
      if (table === 'canonical_entities') {
        if (query.includes('entity_key=eq.deliveries')) return [];
        if (query.includes('entity_key=eq.operation_records')) return targets.some(item => item.entity === 'operation_records') ? [{ id: 'entity-operation_records', entity_key: 'operation_records', name: 'operation_records' }] : [];
        if (query.includes('entity_key=eq.occurrences')) return targets.some(item => item.entity === 'occurrences') ? [{ id: 'entity-occurrences', entity_key: 'occurrences', name: 'occurrences' }] : [];
        return targets.map(item => ({ id: `entity-${item.entity}`, entity_key: item.entity, name: item.entity }));
      }
      if (table === 'canonical_fields') {
        if (query.includes('field_key=eq.delivery_number')) return query.includes('canonical_entity_id=eq.entity-operation_records') && targets.some(item => item.entity === 'operation_records' && item.field === 'delivery_number') ? [{ id: 'field-delivery_number', field_key: 'delivery_number', name: 'delivery_number' }] : [];
        if (query.includes('field_key=eq.linked_delivery_number')) return query.includes('canonical_entity_id=eq.entity-occurrences') && targets.some(item => item.entity === 'occurrences' && item.field === 'linked_delivery_number') ? [{ id: 'field-linked_delivery_number', field_key: 'linked_delivery_number', name: 'linked_delivery_number' }] : [];
        return targets.map(item => ({ id: `field-${item.field}`, field_key: item.field, name: item.field }));
      }
      return [];
    },
    insert: async (table: string, payload: any) => {
      inserts.push({ table, payload });
      if (table === 'tenant_integration_settings') settings.push(payload);
      return Array.isArray(payload) ? payload : [payload];
    },
    delete: async () => [],
    update: async () => [],
  };
  const configs: any = { get: async () => ({ detected_fields: ['numero_entrega'] }) };
  const logisticKeys = new TenantLogisticKeyService(db);
  const service = new ApiConnectorSyncService(db, configs, {} as any, {} as any, {} as any, {} as any, logisticKeys);
  const save = (primary_logistic_key = 'delivery_number') => service.saveApiMappings('tenant-a', 'source-a', 'user-a', {
    primary_logistic_key,
    mappings: [{ source_field_name: 'numero_entrega', data_contract_field_id: 'contract-field-delivery' }],
  });
  return { save, settings, inserts, logisticKeys, db };
}

async function run() {
  // Regression fixture: before this hotfix the validation compared the target
  // with contract.entity_key=deliveries and rejected this canonical mapping.
  const first = fixture('deliveries', [{ entity: 'operation_records', field: 'delivery_number' }]);
  await first.save();
  assert.equal(first.settings[0]?.primary_logistic_key, 'delivery_number', 'numero_entrega is validated by its canonical operation_records.delivery_number target');
  assert.equal(first.inserts.filter(item => item.table === 'tenant_integration_settings').length, 1, 'the explicit first-connection flow establishes one tenant setting');
  assert.deepEqual(
    await first.db.select('canonical_entities', 'select=id&tenant_id=eq.tenant-a&entity_key=eq.deliveries&limit=1'),
    [],
    'the former deliveries canonical-entity lookup reproduces the pre-hotfix validation failure',
  );
  assert.equal(
    (await first.logisticKeys.validateSourceMapping('tenant-a', 'contract-deliveries', 'deliveries')).expected_field,
    'delivery_number',
    'the validation used by normalization resolves a deliveries contract to operation_records.delivery_number',
  );

  await assert.rejects(
    () => fixture('deliveries', [{ entity: 'operation_records', field: 'delivery_number', operational: false }]).save(),
    /não existe mapping operacional ativo e válido/,
    'zero valid operational mappings are explicit and blocked',
  );
  const severalOperationalKeys = fixture('deliveries', [
    { entity: 'operation_records', field: 'delivery_number' },
    { entity: 'operation_records', field: 'invoice_number' },
    { entity: 'operation_records', field: 'cte_number' },
  ]);
  await severalOperationalKeys.save();
  assert.equal(severalOperationalKeys.settings[0]?.primary_logistic_key, 'delivery_number', 'other operational keys do not make the selected canonical destination ambiguous');
  await assert.rejects(
    () => fixture('deliveries', [
      { entity: 'operation_records', field: 'delivery_number' },
      { entity: 'operation_records', field: 'delivery_number' },
    ]).save(),
    /mais de um mapping operacional ativo para Documento da entrega/,
    'duplicate mappings for the selected canonical destination are blocked',
  );

  const configured = fixture('deliveries', [{ entity: 'operation_records', field: 'delivery_number' }], 'delivery_number');
  await configured.save();
  assert.equal(configured.inserts.filter(item => item.table === 'tenant_integration_settings').length, 0, 'a later connection does not create another setting');
  await assert.rejects(() => configured.save('cte_number'), /chave não pode ser alterada/, 'an established key cannot change silently');

  const occurrence = fixture('occurrences', [{ entity: 'operation_records', field: 'delivery_number' }], 'delivery_number');
  await assert.rejects(() => occurrence.save(), /Fontes de Ocorrências não podem mapear destinos de Operações/, 'occurrences cannot target operation_records.delivery_number');
  const linkedOccurrence = fixture('occurrences', [{ entity: 'occurrences', field: 'linked_delivery_number' }], 'delivery_number');
  await linkedOccurrence.save();
  assert.equal(
    (await linkedOccurrence.logisticKeys.validateSourceMapping('tenant-a', 'contract-occurrences', 'occurrences')).expected_field,
    'linked_delivery_number',
    'normalization validates occurrences against occurrences.linked_delivery_number',
  );
  assert.equal(linkedOccurrence.inserts.filter(item => item.table === 'tenant_integration_settings').length, 0, 'the occurrences connection preserves the established delivery key');

  console.log('api connector logistic key tests passed');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
