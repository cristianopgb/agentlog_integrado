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
  generalStatus: 'conexão pendente' | 'estrutura configurada' | 'validação pendente' | 'mapeamento pendente' | 'integração configurada';
};

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
    return { source, contract, contractFieldCount: contractFields.length, mappedFieldCount: mappedCount, latestBatch, generalStatus: getGeneralStatus(source, contract, contractFields.length, mappedCount, latestBatch) };
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

function getGeneralStatus(source: IntegrationSource, contract: DataContract | null, fieldCount: number, mappedCount: number, batch: StagingBatch | null): IntegrationSummary['generalStatus'] {
  if (!source.metadata || source.metadata.connection_declared !== true) return 'conexão pendente';
  if (!contract || fieldCount === 0) return 'estrutura configurada';
  if (batch && batch.status !== 'validated') return 'validação pendente';
  if (mappedCount < fieldCount) return 'mapeamento pendente';
  return 'integração configurada';
}
