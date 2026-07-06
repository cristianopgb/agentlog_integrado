import { createBrowserSupabaseClient } from './supabase';
import { type DataContract, type DataContractField, type DataSource } from './data-contracts-api';
import { type FieldMapping } from './canonical-api';
import { type StagingBatch } from './staging-api';

const sourceSelect = 'id,tenant_id,name,description,source_type,module_key,status,owner_user_id,metadata';
const contractSelect = 'id,tenant_id,data_source_id,name,description,module_key,entity_key,contract_version,format,direction,status,periodicity';

export type IntegrationSource = DataSource & { metadata?: Record<string, unknown> | null };
export type IntegrationSummary = {
  source: IntegrationSource;
  contract: DataContract | null;
  contractFieldCount: number;
  mappedFieldCount: number;
  latestBatch: StagingBatch | null;
  generalStatus: 'conexão pendente' | 'estrutura pendente' | 'mapeamento pendente' | 'integração configurada';
};

type NormalizedInitialDeliveryField = {
  tenant_id: string;
  data_contract_id: string;
  field_key: string;
  source_field_name: string;
  description: string | null;
  data_type: string;
  is_required: boolean;
  is_unique: boolean;
  allow_null: boolean;
  min_length: number | null;
  max_length: number | null;
  min_value: number | null;
  max_value: number | null;
  regex_pattern: string | null;
  date_format: string | null;
  sort_order: number;
};

type InitialDeliveryFieldDefinition = Omit<NormalizedInitialDeliveryField, 'tenant_id' | 'data_contract_id'>;

const initialDeliveryFields: InitialDeliveryFieldDefinition[] = [
  { field_key: 'delivery_number', source_field_name: 'Numero Entrega', description: null, data_type: 'text', is_required: true, is_unique: false, allow_null: false, min_length: null, max_length: null, min_value: null, max_value: null, regex_pattern: null, date_format: null, sort_order: 10 },
  { field_key: 'customer_document', source_field_name: 'Documento Cliente', description: null, data_type: 'text', is_required: true, is_unique: false, allow_null: false, min_length: null, max_length: null, min_value: null, max_value: null, regex_pattern: null, date_format: null, sort_order: 20 },
  { field_key: 'customer_name', source_field_name: 'Nome Cliente', description: null, data_type: 'text', is_required: true, is_unique: false, allow_null: false, min_length: null, max_length: null, min_value: null, max_value: null, regex_pattern: null, date_format: null, sort_order: 30 },
  { field_key: 'delivery_status', source_field_name: 'Status Entrega', description: null, data_type: 'enum', is_required: true, is_unique: false, allow_null: false, min_length: null, max_length: null, min_value: null, max_value: null, regex_pattern: null, date_format: null, sort_order: 40 },
  { field_key: 'expected_delivery_date', source_field_name: 'Data Prevista', description: null, data_type: 'date', is_required: false, is_unique: false, allow_null: true, min_length: null, max_length: null, min_value: null, max_value: null, regex_pattern: null, date_format: 'YYYY-MM-DD', sort_order: 50 },
  { field_key: 'delivered_at', source_field_name: 'Data Entrega', description: null, data_type: 'datetime', is_required: false, is_unique: false, allow_null: true, min_length: null, max_length: null, min_value: null, max_value: null, regex_pattern: null, date_format: null, sort_order: 60 },
  { field_key: 'total_value', source_field_name: 'Valor Total', description: null, data_type: 'decimal', is_required: false, is_unique: false, allow_null: true, min_length: null, max_length: null, min_value: null, max_value: null, regex_pattern: null, date_format: null, sort_order: 70 },
];

const deliveryStatusValues = ['pending', 'in_transit', 'delivered', 'failed', 'cancelled'];

function isDuplicateContractError(error: { code?: string; status?: number; message?: string } | null) {
  return error?.code === '23505' || error?.status === 409 || error?.message?.toLowerCase().includes('duplicate key');
}

function normalizeInitialDeliveryField(tenantId: string, contractId: string, field: InitialDeliveryFieldDefinition): NormalizedInitialDeliveryField {
  return {
    tenant_id: tenantId,
    data_contract_id: contractId,
    field_key: field.field_key,
    source_field_name: field.source_field_name,
    description: field.description,
    data_type: field.data_type,
    is_required: field.is_required,
    is_unique: field.is_unique,
    allow_null: field.allow_null,
    min_length: field.min_length,
    max_length: field.max_length,
    min_value: field.min_value,
    max_value: field.max_value,
    regex_pattern: field.regex_pattern,
    date_format: field.date_format,
    sort_order: field.sort_order,
  };
}

export async function listIntegrations(tenantId: string): Promise<IntegrationSummary[]> {
  const supabase = createBrowserSupabaseClient();
  const { data: sources, error: sourceError } = await supabase.from('data_sources').select(sourceSelect).eq('tenant_id', tenantId).order('created_at', { ascending: false });
  if (sourceError) throw sourceError;
  const { data: contracts, error: contractError } = await supabase.from('data_contracts').select(contractSelect).eq('tenant_id', tenantId);
  if (contractError) throw contractError;
  const { data: fields, error: fieldError } = await supabase.from('data_contract_fields').select('id,tenant_id,data_contract_id').eq('tenant_id', tenantId);
  if (fieldError) throw fieldError;
  const { data: mappings, error: mappingError } = await supabase.from('field_mappings').select('id,tenant_id,data_contract_id').eq('tenant_id', tenantId);
  if (mappingError) throw mappingError;
  const { data: batches, error: batchError } = await supabase.from('staging_batches').select('id,tenant_id,data_source_id,data_contract_id,batch_code,source_reference,status,total_records,valid_records,invalid_records,error_count,metadata,received_at,validated_at,created_at').eq('tenant_id', tenantId).order('created_at', { ascending: false });
  if (batchError) throw batchError;

  return ((sources ?? []) as IntegrationSource[]).map((source) => {
    const contract = ((contracts ?? []) as DataContract[]).find((item) => item.data_source_id === source.id) ?? null;
    const contractFields = contract ? ((fields ?? []) as DataContractField[]).filter((item) => item.data_contract_id === contract.id) : [];
    const mappedCount = contract ? new Set(((mappings ?? []) as FieldMapping[]).filter((item) => item.data_contract_id === contract.id).map((item) => item.id)).size : 0;
    const latestBatch = ((batches ?? []) as StagingBatch[]).find((item) => item.data_source_id === source.id) ?? null;
    return { source, contract, contractFieldCount: contractFields.length, mappedFieldCount: mappedCount, latestBatch, generalStatus: getGeneralStatus(source, contract, contractFields.length, mappedCount) };
  });
}

export async function getIntegrationSource(tenantId: string, sourceId: string) {
  const { data, error } = await createBrowserSupabaseClient().from('data_sources').select(sourceSelect).eq('tenant_id', tenantId).eq('id', sourceId).maybeSingle();
  if (error) throw error;
  return data as IntegrationSource | null;
}

export async function createIntegrationSource(tenantId: string, input: { name: string; source_type: string; module_key: string }) {
  const { data, error } = await createBrowserSupabaseClient().from('data_sources').insert({ tenant_id: tenantId, name: input.name, source_type: input.source_type, module_key: input.module_key, status: 'draft', description: 'Integração declarativa criada pela Sprint 7.1.', metadata: { sprint_7_1: true, connection_declared: false } }).select('id');
  if (error) throw error;
  return ((data as { id: string }[])[0]).id;
}

export async function updateIntegrationConnection(tenantId: string, sourceId: string, input: { name: string; source_type: string; module_key: string; metadata: Record<string, unknown> }) {
  const { error } = await createBrowserSupabaseClient().from('data_sources').update({ name: input.name, source_type: input.source_type, module_key: input.module_key, status: 'active', metadata: input.metadata }).eq('tenant_id', tenantId).eq('id', sourceId);
  if (error) throw error;
}

export async function getPrimaryContractForSource(tenantId: string, sourceId: string) {
  const { data, error } = await createBrowserSupabaseClient().from('data_contracts').select(contractSelect).eq('tenant_id', tenantId).eq('data_source_id', sourceId).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data as DataContract | null;
}

export async function listReusableContracts(tenantId: string, currentSourceId: string) {
  const { data, error } = await createBrowserSupabaseClient().from('data_contracts').select(contractSelect).eq('tenant_id', tenantId).order('created_at', { ascending: false });
  if (error) throw error;
  return ((data as DataContract[]) ?? []).filter((contract) => contract.data_source_id !== currentSourceId);
}

export async function linkExistingContractToIntegration(tenantId: string, contractId: string, sourceId: string) {
  const { error } = await createBrowserSupabaseClient().from('data_contracts').update({ data_source_id: sourceId }).eq('tenant_id', tenantId).eq('id', contractId);
  if (error) throw error;
}

export async function createInitialDeliveryContract(tenantId: string, source: IntegrationSource) {
  const supabase = createBrowserSupabaseClient();
  const fetchExistingContract = async () => {
    const { data, error } = await supabase.from('data_contracts').select(contractSelect).eq('tenant_id', tenantId).eq('data_source_id', source.id).eq('entity_key', 'deliveries').eq('contract_version', '1').maybeSingle();
    if (error) throw error;
    return data as DataContract | null;
  };

  let contract = await fetchExistingContract();
  if (!contract) {
    const { data: contracts, error: contractError } = await supabase.from('data_contracts').insert({
      tenant_id: tenantId,
      data_source_id: source.id,
      name: 'Estrutura inicial de entregas',
      description: 'Contrato declarativo inicial de entregas criado pela trilha principal da integração. Não realiza upload, API real ou gravação operacional nesta sprint.',
      module_key: source.module_key,
      entity_key: 'deliveries',
      contract_version: 1,
      format: source.source_type === 'api' ? 'api_json' : source.source_type === 'spreadsheet' ? String(source.metadata?.file_type ?? 'xlsx') : 'other',
      direction: 'inbound',
      status: 'draft',
      periodicity: 'on_demand',
    }).select(contractSelect);

    if (contractError) {
      if (!isDuplicateContractError(contractError)) throw contractError;
      contract = await fetchExistingContract();
    } else {
      contract = (contracts as DataContract[])[0];
    }
  }

  if (!contract) throw new Error('Não foi possível localizar o contrato declarativo inicial de entregas.');

  const { error: fieldError } = await supabase.from('data_contract_fields').upsert(
    initialDeliveryFields.map((field) => normalizeInitialDeliveryField(tenantId, contract.id, field)),
    { onConflict: 'data_contract_id,field_key' },
  );
  if (fieldError) throw fieldError;

  const { data: fields, error: fieldsError } = await supabase
    .from('data_contract_fields')
    .select('id,field_key')
    .eq('tenant_id', tenantId)
    .eq('data_contract_id', contract.id);
  if (fieldsError) throw fieldsError;

  const statusField = (fields as { id: string; field_key: string }[]).find((field) => field.field_key === 'delivery_status');
  if (statusField) {
    const { error: allowedError } = await supabase.from('data_contract_allowed_values').upsert(
      deliveryStatusValues.map((value, index) => ({
        tenant_id: tenantId,
        data_contract_id: contract.id,
        data_contract_field_id: statusField.id,
        value,
        label: value,
        normalized_value: value,
        is_active: true,
        sort_order: (index + 1) * 10,
      })),
      { onConflict: 'data_contract_field_id,value' },
    );
    if (allowedError) throw allowedError;
  }

  return contract;
}

function getGeneralStatus(source: IntegrationSource, contract: DataContract | null, fieldCount: number, mappedCount: number): IntegrationSummary['generalStatus'] {
  if (!source.metadata || source.metadata.connection_declared !== true) return 'conexão pendente';
  if (!contract || fieldCount === 0) return 'estrutura pendente';
  if (mappedCount === 0) return 'mapeamento pendente';
  return 'integração configurada';
}
