'use client';
import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import {
  Card,
  EmptyState,
  SectionHeader,
  StatusBadge,
} from '../../../../../components/ui';
import {
  createInitialDeliveryContract,
  getIntegrationSource,
  getPrimaryContractForSource,
  linkExistingContractToIntegration,
  listReusableContracts,
  updateIntegrationConnection,
  type IntegrationSource,
} from '../../../../../lib/integrations-api';
import {
  listContractFields,
  type DataContract,
  type DataContractField,
} from '../../../../../lib/data-contracts-api';
import {
  getLatestStagingRecordForContract,
  listCanonicalEntities,
  listCanonicalFields,
  listFieldMappings,
  upsertFieldMapping,
  updateFieldMapping,
  type CanonicalEntity,
  type CanonicalField,
  type FieldMapping,
} from '../../../../../lib/canonical-api';
import {
  listStagingBatches,
  type StagingBatch,
} from '../../../../../lib/staging-api';
import {
  listNormalizationErrors,
  listNormalizationRuns,
  processNormalization,
  type NormalizationError,
  type NormalizationRun,
} from '../../../../../lib/normalization-api';
import {
  getCurrentUserPermissions,
  hasPermission,
  type UserPermission,
} from '../../../../../lib/rbac';
import { getSessionContext } from '../../../../../lib/setup-api';

const steps = [
  { key: 'connection', label: 'Conexão' },
  { key: 'mapping', label: 'Mapeamento' },
  { key: 'done', label: 'Pronto' },
] as const;
const mappingTypes = ['direct', 'transformed', 'default_value', 'ignored'];
const primaryEntityKey = 'operation_records';
const moduleEntityKeys = [
  'transport_records',
  'attendance_records',
  'finance_records',
  'warehouse_records',
  'team_records',
];
const visibleEntityOrder = [primaryEntityKey, ...moduleEntityKeys];
const mappingTypeLabels: Record<string, string> = {
  direct: 'Direto',
  transformed: 'Com transformação declarada',
  default_value: 'Valor padrão',
  ignored: 'Ignorado',
};
const canonicalEntityLabels: Record<string, string> = {
  operation_records: 'Núcleo operacional comum',
  transport_records: 'Transporte',
  attendance_records: 'Atendimento',
  finance_records: 'Financeiro',
  warehouse_records: 'Armazém',
  team_records: 'Equipes',
  deliveries: 'Entregas legado',
};
const normalizationStatusLabels: Record<string, string> = {
  completed: 'Concluída',
  completed_with_errors: 'Concluída com inconsistências',
  failed: 'Falhou',
  running: 'Em processamento',
  pending: 'Pendente',
};

function isNormalizationWarning(error: NormalizationError) {
  return error.details?.severity === 'warning';
}

function normalizationRunLabel(
  run: NormalizationRun,
  errors: NormalizationError[],
) {
  if (
    (run.status === 'completed' || run.status === 'completed_with_errors') &&
    errors.length > 0 &&
    errors.every(isNormalizationWarning)
  ) {
    return 'Concluída com avisos';
  }
  return normalizationStatusLabels[run.status] ?? run.status;
}

const canonicalFieldLabels: Record<string, string> = {
  operation_record_id: 'Registro operacional',
  external_id: 'ID externo',
  external_code: 'Código externo',
  source_system: 'Sistema de origem',
  source_data_source_id: 'Fonte de dados de origem',
  source_data_contract_id: 'Contrato de dados de origem',
  source_staging_batch_id: 'Lote de preparação de origem',
  source_staging_record_id: 'Registro de preparação de origem',
  source_payload_hash: 'Hash do payload de origem',
  module_origin: 'Módulo de origem',
  record_type: 'Tipo de registro',
  document_number: 'Número do documento',
  document_type: 'Tipo do documento',
  cte_number: 'Número do CT-e',
  cte_key: 'Chave do CT-e',
  invoice_number: 'Número da NF',
  invoice_key: 'Chave da NF',
  manifest_number: 'Número do manifesto',
  order_number: 'Número do pedido',
  delivery_number: 'Número da entrega',
  customer_name: 'Nome do cliente',
  customer_document: 'Documento do cliente',
  shipper_name: 'Nome do embarcador',
  shipper_document: 'Documento do embarcador',
  recipient_name: 'Nome do destinatário',
  recipient_document: 'Documento do destinatário',
  payer_name: 'Nome do pagador',
  payer_document: 'Documento do pagador',
  origin_city: 'Cidade de origem',
  origin_state: 'UF de origem',
  destination_city: 'Cidade de destino',
  destination_state: 'UF de destino',
  vehicle_plate: 'Placa do veículo',
  driver_name: 'Nome do motorista',
  driver_document: 'Documento do motorista',
  status: 'Status',
  status_updated_at: 'Data da atualização do status',
  occurrence_status: 'Status da ocorrência',
  last_event_at: 'Data do último evento',
  gross_weight: 'Peso bruto',
  cubed_weight: 'Peso cubado',
  volume_count: 'Quantidade de volumes',
  total_value: 'Valor total',
  freight_value: 'Valor do frete',
  issued_at: 'Data de emissão',
  expected_date: 'Data prevista',
  completed_at: 'Data de conclusão',
  data_quality_status: 'Qualidade do dado',
  transport_status: 'Status do transporte',
  route_name: 'Rota',
  trip_number: 'Número da viagem',
  vehicle_type: 'Tipo de veículo',
  driver_phone: 'Telefone do motorista',
  collected_at: 'Data da coleta',
  delivered_at: 'Data da entrega',
  delivery_performance_status: 'Performance da entrega',
  sla_status: 'Status do SLA',
  cost_center: 'Centro de custo',
  ticket_number: 'Número do ticket',
  channel: 'Canal',
  subject: 'Assunto',
  description: 'Descrição',
  occurrence_code: 'Código da ocorrência',
  occurrence_type: 'Tipo da ocorrência',
  occurrence_reason: 'Motivo da ocorrência',
  priority: 'Prioridade',
  attendance_status: 'Status do atendimento',
  assigned_to: 'Responsável',
  opened_at: 'Data de abertura',
  first_response_at: 'Primeira resposta',
  last_interaction_at: 'Última interação',
  resolved_at: 'Data de resolução',
  closed_at: 'Data de fechamento',
  sla_due_at: 'Vencimento do SLA',
  billing_reference: 'Referência de faturamento',
  billing_period: 'Período de faturamento',
  billing_status: 'Status do faturamento',
  proof_of_delivery_status: 'Status do canhoto',
  proof_received_at: 'Data de recebimento do canhoto',
  ready_to_bill: 'Pronto para faturar',
  blocked_amount: 'Valor bloqueado',
  block_status: 'Status do bloqueio',
  block_reason: 'Motivo do bloqueio',
  extra_cost_value: 'Valor de custo extra',
  discount_value: 'Valor de desconto',
  total_amount: 'Valor total',
  due_at: 'Data de vencimento',
  paid_at: 'Data de pagamento',
  product_code: 'Código do produto',
  sku: 'SKU',
  product_name: 'Nome do produto',
  warehouse_code: 'Código do armazém',
  warehouse_name: 'Nome do armazém',
  location_code: 'Código do endereço',
  batch_number: 'Lote',
  serial_number: 'Número de série',
  quantity_available: 'Quantidade disponível',
  quantity_reserved: 'Quantidade reservada',
  quantity_blocked: 'Quantidade bloqueada',
  unit_of_measure: 'Unidade de medida',
  last_movement_type: 'Tipo da última movimentação',
  last_movement_at: 'Data da última movimentação',
  warehouse_status: 'Status do armazém',
  employee_code: 'Código do colaborador',
  employee_name: 'Nome do colaborador',
  employee_document: 'Documento do colaborador',
  email: 'E-mail',
  phone: 'Telefone',
  department_name: 'Setor',
  position_name: 'Cargo',
  manager_name: 'Gestor',
  team_status: 'Status do colaborador',
  admission_date: 'Data de admissão',
  termination_date: 'Data de desligamento',
  shift_name: 'Turno',
  workload_hours: 'Carga horária',
  overtime_hours: 'Horas extras',
  worked_at: 'Data trabalhada',
};

type StepKey = (typeof steps)[number]['key'];
type Preview = {
  raw_payload: Record<string, unknown>;
  normalized_payload: Record<string, unknown>;
} | null;
type EntityWithFields = CanonicalEntity & { fields: CanonicalField[] };

function entityLabel(entity?: CanonicalEntity | null) {
  return entity
    ? (canonicalEntityLabels[entity.entity_key] ?? entity.name)
    : '';
}
function fieldLabel(field: CanonicalField) {
  return canonicalFieldLabels[field.field_key] ?? field.name;
}
function chooseInitialEntity(
  entities: CanonicalEntity[],
  chosenEntityId?: string,
) {
  if (chosenEntityId && entities.some((entity) => entity.id === chosenEntityId))
    return chosenEntityId;
  return (
    entities.find((entity) => entity.entity_key === primaryEntityKey)?.id ??
    entities[0]?.id ??
    ''
  );
}
function entitySortOrder(entity: CanonicalEntity) {
  const index = visibleEntityOrder.indexOf(entity.entity_key);
  return index === -1 ? 999 : index;
}

export default function IntegrationSetupPage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const [step, setStep] = useState<StepKey>(
    (search.get('step') as StepKey) || 'connection',
  );
  const [tenantId, setTenantId] = useState('');
  const [source, setSource] = useState<IntegrationSource | null>(null);
  const [contract, setContract] = useState<DataContract | null>(null);
  const [reusableContracts, setReusableContracts] = useState<DataContract[]>(
    [],
  );
  const [selectedContractId, setSelectedContractId] = useState('');
  const [fields, setFields] = useState<DataContractField[]>([]);
  const [entities, setEntities] = useState<CanonicalEntity[]>([]);
  const [entityId, setEntityId] = useState('');
  const [canonicalFields, setCanonicalFields] = useState<CanonicalField[]>([]);
  const [mappings, setMappings] = useState<FieldMapping[]>([]);
  const [normalizationMappings, setNormalizationMappings] = useState<
    FieldMapping[]
  >([]);
  const [preview, setPreview] = useState<Preview>(null);
  const [latestBatch, setLatestBatch] = useState<StagingBatch | null>(null);
  const [normalizationRuns, setNormalizationRuns] = useState<
    NormalizationRun[]
  >([]);
  const [normalizationErrors, setNormalizationErrors] = useState<
    NormalizationError[]
  >([]);
  const [normalizing, setNormalizing] = useState(false);
  const [query, setQuery] = useState('');
  const [perms, setPerms] = useState<UserPermission[]>([]);
  const [msg, setMsg] = useState('Carregando integração...');
  const [draftMappings, setDraftMappings] = useState<
    Record<string, { data_contract_field_id: string; mapping_type: string }>
  >({});
  const [mappingSaveState, setMappingSaveState] = useState<
    'idle' | 'dirty' | 'saving' | 'saved' | 'error'
  >('idle');

  async function load(t: string, chosenEntityId?: string) {
    const s = await getIntegrationSource(t, params.id);
    setSource(s);
    const c = await getPrimaryContractForSource(t, params.id);
    setContract(c);
    const [es, batches, reusable] = await Promise.all([
      listCanonicalEntities(t),
      listStagingBatches(t),
      listReusableContracts(t, params.id),
    ]);
    setEntities(es);
    const latestValidatedBatch =
      batches.find(
        (batch) =>
          batch.data_source_id === params.id &&
          (batch.status === 'validated' || batch.status === 'partially_valid'),
      ) ?? null;
    setLatestBatch(latestValidatedBatch);
    setReusableContracts(reusable);
    setSelectedContractId(reusable[0]?.id ?? '');
    setCanonicalFields(
      (
        await Promise.all(es.map((entity) => listCanonicalFields(t, entity.id)))
      ).flat(),
    );
    if (c) {
      const batchContractId = latestValidatedBatch?.data_contract_id ?? null;
      const [fs, ms, batchMs, pv] = await Promise.all([
        listContractFields(t, c.id),
        listFieldMappings(t, c.id),
        batchContractId
          ? listFieldMappings(t, batchContractId)
          : Promise.resolve([]),
        getLatestStagingRecordForContract(t, c.id),
      ]);
      setFields(fs);
      setMappings(ms);
      setNormalizationMappings(batchMs);
      setDraftMappings({});
      setMappingSaveState('idle');
      setPreview(pv);
      setEntityId(chooseInitialEntity(es, chosenEntityId));
      const runs = await listNormalizationRuns(t);
      const sourceRuns = runs.filter((run) =>
        latestValidatedBatch
          ? run.staging_batch_id === latestValidatedBatch.id
          : false,
      );
      setNormalizationRuns(sourceRuns);
      if (sourceRuns[0])
        setNormalizationErrors(
          await listNormalizationErrors(t, sourceRuns[0].id),
        );
      else setNormalizationErrors([]);
    } else {
      setFields([]);
      setMappings([]);
      setNormalizationMappings([]);
      setDraftMappings({});
      setMappingSaveState('idle');
      setPreview(null);
      setEntityId(chooseInitialEntity(es, chosenEntityId));
      setNormalizationRuns([]);
      setNormalizationErrors([]);
    }
  }

  useEffect(() => {
    const qStep = search.get('step') as StepKey | null;
    if (qStep && steps.some((item) => item.key === qStep)) setStep(qStep);
  }, [search]);
  useEffect(() => {
    getSessionContext()
      .then(async (ctx) => {
        if (!ctx.user) return setMsg('Faça login para configurar integrações.');
        if (!ctx.tenantId) return setMsg('Selecione um tenant ativo.');
        setTenantId(ctx.tenantId);
        const p = await getCurrentUserPermissions(ctx.tenantId);
        setPerms(p);
        if (
          !hasPermission(p, 'core.data_sources.view') ||
          !hasPermission(p, 'core.data_contracts.view')
        )
          return setMsg(
            'Acesso negado: permissões de fontes e contratos são necessárias.',
          );
        await load(ctx.tenantId);
        setMsg('');
      })
      .catch((e: Error) => setMsg(e.message));
  }, [params.id]);

  async function changeEntity(eid: string) {
    setEntityId(eid);
  }

  async function saveConnection(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!source) return;
    const f = new FormData(e.currentTarget);
    const metadata =
      source.source_type === 'api'
        ? {
            sprint_7_1: true,
            connection_declared: true,
            api_url: String(f.get('api_url') || ''),
            method: String(f.get('method') || 'GET'),
            auth_type: String(f.get('auth_type') || 'none'),
            secret_placeholder: String(f.get('secret') || '')
              ? 'configured_not_displayed'
              : 'not_configured',
            note: 'Configuração declarativa: nenhuma chamada real para API externa nesta sprint.',
          }
        : source.source_type === 'database'
          ? {
              sprint_7_1: true,
              connection_declared: true,
              database_mode: 'declarative_only',
              introspection_enabled: false,
              note: 'Conexão real com banco será implementada em sprint futura. Nesta etapa, use estrutura declarativa; não há introspecção real de tabelas ou colunas.',
            }
          : {
              sprint_7_1: true,
              connection_declared: true,
              file_type: String(f.get('file_type') || 'xlsx'),
              upload_enabled: false,
              note: 'Upload real será implementado em sprint futura.',
            };
    if (source.source_type === 'api' && !metadata.api_url)
      return setMsg(
        'Informe a URL da API para salvar a configuração declarativa.',
      );
    try {
      await updateIntegrationConnection(tenantId, source.id, {
        name: String(f.get('name') || source.name),
        source_type: source.source_type,
        module_key: String(f.get('module_key') || source.module_key),
        metadata,
      });
      await load(tenantId, entityId);
      setMsg(
        'Conexão declarativa salva. Defina a estrutura de dados para continuar na trilha principal.',
      );
      setStep(contract ? 'mapping' : 'connection');
    } catch {
      setMsg(
        'Não foi possível salvar a conexão declarativa. Tente novamente ou revise a integração.',
      );
    }
  }

  async function createStructure() {
    if (!source) return;
    try {
      await createInitialDeliveryContract(tenantId, source);
      await load(tenantId, entityId);
      setMsg(
        'Estrutura inicial de entregas criada ou reutilizada na integração.',
      );
      setStep('mapping');
    } catch {
      setMsg(
        'Não foi possível preparar a estrutura de dados. Tente novamente ou revise a integração.',
      );
    }
  }
  async function useExistingContract() {
    if (!selectedContractId)
      return setMsg('Selecione um contrato existente para vincular.');
    try {
      await linkExistingContractToIntegration(
        tenantId,
        selectedContractId,
        params.id,
      );
      await load(tenantId, entityId);
      setMsg('Contrato existente vinculado à integração.');
      setStep('mapping');
    } catch {
      setMsg(
        'Não foi possível vincular o contrato existente. Tente novamente ou revise a integração.',
      );
    }
  }
  function updateDraftMapping(
    fieldId: string,
    patch: Partial<{ data_contract_field_id: string; mapping_type: string }>,
  ) {
    const existing = mappings.find(
      (mapping) => mapping.canonical_field_id === fieldId,
    );
    setDraftMappings((current) => ({
      ...current,
      [fieldId]: {
        data_contract_field_id:
          patch.data_contract_field_id ??
          existing?.data_contract_field_id ??
          '',
        mapping_type: patch.mapping_type ?? existing?.mapping_type ?? 'direct',
      },
    }));
    setMappingSaveState('dirty');
  }

  async function handleSaveMappingsBatch(options?: {
    continueAfterSave?: boolean;
  }) {
    if (!contract || mappingSaveState === 'saving') return false;
    const changed = canonicalFields
      .map((cf) => {
        const draft = draftMappings[cf.id];
        if (!draft) return null;
        const existing = mappings.find(
          (mapping) => mapping.canonical_field_id === cf.id,
        );
        if (!draft.data_contract_field_id && draft.mapping_type !== 'ignored')
          return null;
        if (
          existing &&
          existing.data_contract_field_id === draft.data_contract_field_id &&
          existing.mapping_type === draft.mapping_type
        )
          return null;
        return { cf, draft };
      })
      .filter(Boolean) as Array<{
      cf: CanonicalField;
      draft: { data_contract_field_id: string; mapping_type: string };
    }>;
    if (!changed.length) {
      if (options?.continueAfterSave) setStep('done');
      return true;
    }
    setMappingSaveState('saving');
    try {
      await Promise.all(
        changed.map(({ cf, draft }) => {
          const existing = mappings.find(
            (mapping) => mapping.canonical_field_id === cf.id,
          );
          const payload = {
            data_contract_field_id: draft.data_contract_field_id,
            canonical_entity_id: cf.canonical_entity_id,
            canonical_field_id: cf.id,
            mapping_type: draft.mapping_type,
            status: 'active',
          };
          return existing
            ? updateFieldMapping(tenantId, existing.id, payload)
            : upsertFieldMapping(tenantId, contract.id, payload);
        }),
      );
      await load(tenantId, entityId);
      setMappingSaveState('saved');
      setMsg('Mapeamentos salvos.');
      if (options?.continueAfterSave) setStep('done');
      return true;
    } catch {
      setMappingSaveState('error');
      setMsg(
        'Erro ao salvar mapeamentos. Tente novamente ou revise a integração.',
      );
      return false;
    }
  }

  const groupedCanonicalEntities = useMemo(
    () =>
      entities
        .filter((entity) => visibleEntityOrder.includes(entity.entity_key))
        .map((entity) => ({
          ...entity,
          fields: canonicalFields.filter(
            (field) => field.canonical_entity_id === entity.id,
          ),
        }))
        .filter((entity) => entity.fields.length > 0)
        .sort((a, b) => entitySortOrder(a) - entitySortOrder(b)),
    [entities, canonicalFields],
  );
  const selectedCanonicalFields = useMemo(
    () =>
      canonicalFields.filter((field) => field.canonical_entity_id === entityId),
    [canonicalFields, entityId],
  );
  const selectedEntity = useMemo(
    () =>
      groupedCanonicalEntities.find((entity) => entity.id === entityId) as
        EntityWithFields | undefined,
    [groupedCanonicalEntities, entityId],
  );
  const filteredFields = useMemo(
    () =>
      fields.filter((field) =>
        `${field.field_key} ${field.source_field_name} ${field.data_type}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [fields, query],
  );
  const hasCommonCoreMapping = mappings.some((mapping) => {
    const entity = entities.find(
      (item) => item.id === mapping.canonical_entity_id,
    );
    return entity?.entity_key === primaryEntityKey;
  });
  const showDestinationWarning = Boolean(
    selectedEntity?.entity_key &&
    moduleEntityKeys.includes(selectedEntity.entity_key) &&
    !hasCommonCoreMapping,
  );
  const connectionDeclared = source?.metadata?.connection_declared === true;
  const activeNormalizationMappings = normalizationMappings.filter(
    (mapping) =>
      mapping.data_contract_id === latestBatch?.data_contract_id &&
      (mapping.status === 'active' || !mapping.status),
  );
  const mappedCount = activeNormalizationMappings.length;
  const contractMatchesLatestBatch = Boolean(
    contract?.id &&
    latestBatch?.data_contract_id &&
    contract.id === latestBatch.data_contract_id,
  );
  const isComplete = Boolean(
    connectionDeclared && contract && fields.length > 0 && mappedCount > 0,
  );
  const lastNormalizationRun = normalizationRuns[0] ?? null;
  const latestValidatedBatchLabel = latestBatch
    ? latestBatch.validated_at
      ? new Intl.DateTimeFormat('pt-BR', {
          dateStyle: 'short',
          timeStyle: 'short',
        }).format(new Date(latestBatch.validated_at))
      : latestBatch.batch_code || latestBatch.id.slice(0, 8)
    : 'Nenhum lote validado';
  const canManageMappings =
    hasPermission(perms, 'core.field_mappings.create') &&
    hasPermission(perms, 'core.field_mappings.update');
  const canRunNormalization =
    hasPermission(perms, 'normalization.run') &&
    hasPermission(perms, 'native_records.manage');
  const normalizationDisabledReason = !latestBatch
    ? 'Não há lote validado para processar.'
    : !contractMatchesLatestBatch
      ? 'O lote validado pertence a outro contrato de dados. Valide um novo lote ou refaça o mapeamento para este contrato.'
      : mappedCount === 0
        ? 'Mapeie pelo menos um campo antes de processar para a base nativa.'
        : !canRunNormalization
          ? 'Você não tem permissão para executar a normalização.'
          : '';

  async function refreshNormalizationSummary(
    t: string,
    batchId: string,
    preferredRunId?: string,
  ) {
    const runs = await listNormalizationRuns(t);
    const sourceRuns = runs.filter((run) => run.staging_batch_id === batchId);
    setNormalizationRuns(sourceRuns);
    const selectedRun =
      sourceRuns.find((run) => run.id === preferredRunId) ?? sourceRuns[0];
    const selectedErrors = selectedRun
      ? await listNormalizationErrors(t, selectedRun.id)
      : [];
    setNormalizationErrors(selectedErrors);
    return { run: selectedRun, errors: selectedErrors };
  }

  async function handleNormalize() {
    if (normalizing) return;
    if (!tenantId) {
      setMsg('Selecione um tenant ativo.');
      return;
    }
    if (!latestBatch?.id) {
      setMsg('Não há lote validado para processar.');
      return;
    }
    if (!contractMatchesLatestBatch) {
      setMsg(
        'O lote validado pertence a outro contrato de dados. Valide um novo lote ou refaça o mapeamento para este contrato.',
      );
      return;
    }
    if (mappedCount === 0) {
      setMsg(
        'Mapeie pelo menos um campo antes de processar para a base nativa.',
      );
      return;
    }
    if (!canRunNormalization) {
      setMsg('Você não tem permissão para executar a normalização.');
      return;
    }

    setNormalizing(true);
    try {
      const run = await processNormalization(tenantId, latestBatch.id);
      const refreshed = await refreshNormalizationSummary(
        tenantId,
        latestBatch.id,
        run.id,
      );
      const refreshedRun = refreshed.run ?? run;
      const refreshedErrors = refreshed.errors;
      const onlyWarnings =
        refreshedErrors.length > 0 &&
        refreshedErrors.every(isNormalizationWarning);
      setMsg(
        onlyWarnings
          ? 'Normalização concluída com dados parciais. O sistema gravou os dados disponíveis. Indicadores que dependem de campos não mapeados ficarão indisponíveis até que esses dados sejam adicionados.'
          : refreshedRun.status === 'completed'
            ? 'Normalização concluída. Os dados tratados foram gravados na base nativa.'
            : refreshedRun.status === 'completed_with_errors'
              ? 'Normalização concluída com inconsistências. Revise os erros.'
              : 'Não foi possível processar para a base nativa. Revise a configuração da integração ou tente novamente.',
      );
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Falha ao processar normalização.', error);
      }
      const message =
        error instanceof Error &&
        error.message.includes('API backend não configurada')
          ? error.message
          : 'Não foi possível processar para a base nativa. Revise a configuração da integração ou tente novamente.';
      setMsg(message);
    } finally {
      setNormalizing(false);
    }
  }
  const missingItems = [
    !connectionDeclared ? 'conexão declarada' : '',
    !contract ? 'contrato vinculado' : '',
    contract && fields.length === 0 ? 'campos no contrato' : '',
    mappedCount === 0 ? 'campos mapeados' : '',
  ].filter(Boolean);
  const titleType =
    source?.source_type === 'api'
      ? 'Integração com API'
      : source?.source_type === 'spreadsheet'
        ? 'Integração com Planilha'
        : source?.source_type === 'database'
          ? 'Integração com Banco'
          : 'Integração';

  const contractActions =
    !contract || fields.length < 7 ? (
      <Card className="border-amber-200 bg-amber-50">
        <h2 className="text-lg font-bold">
          Você ainda não definiu a estrutura dos dados desta integração.
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Escolha uma estrutura dentro desta trilha. Nenhum upload, parser,
          chamada externa ou leitura real de schema será executado.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto_auto]">
          <select
            value={selectedContractId}
            onChange={(e) => setSelectedContractId(e.target.value)}
            className="rounded-xl border bg-white p-3 text-sm"
          >
            {reusableContracts.length === 0 ? (
              <option value="">Nenhum contrato existente disponível</option>
            ) : (
              reusableContracts.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ·{' '}
                  {canonicalEntityLabels[item.entity_key] ?? item.name}
                </option>
              ))
            )}
          </select>
          <button
            onClick={useExistingContract}
            disabled={
              !selectedContractId ||
              !hasPermission(perms, 'core.data_contracts.update')
            }
            className="rounded-xl border bg-white px-4 py-3 text-sm font-bold disabled:text-slate-300"
            type="button"
          >
            Usar contrato existente
          </button>
          <button
            onClick={createStructure}
            disabled={
              !hasPermission(perms, 'core.data_contracts.create') ||
              !hasPermission(perms, 'core.data_contract_fields.update')
            }
            className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white disabled:bg-slate-300"
            type="button"
          >
            Criar estrutura inicial de entregas
          </button>
        </div>
      </Card>
    ) : null;

  return (
    <div className="mx-auto max-w-[96rem] space-y-8">
      <SectionHeader
        eyebrow="Setup de integração"
        title={titleType}
        description="Configure uma conexão declarativa, mapeie os campos e finalize a integração."
      />
      {msg ? <EmptyState title="Setup" description={msg} /> : null}
      <div className="grid gap-3 md:grid-cols-3">
        {steps.map((item, index) => (
          <button
            key={item.key}
            onClick={() => setStep(item.key)}
            type="button"
            className={`rounded-2xl border p-4 text-left ${step === item.key ? 'border-blue-500 bg-blue-50' : 'bg-white/80'}`}
          >
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
              {index + 1}
            </span>
            <p className="text-lg font-bold">{item.label}</p>
          </button>
        ))}
      </div>
      {step === 'connection' && source ? (
        <div className="space-y-4">
          <Card>
            <form onSubmit={saveConnection} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="text-sm font-semibold">
                  Nome da integração
                  <input
                    name="name"
                    defaultValue={source.name}
                    required
                    className="mt-2 w-full rounded-xl border p-3 font-normal"
                  />
                </label>
                <label className="text-sm font-semibold">
                  Módulo
                  <input
                    name="module_key"
                    defaultValue={source.module_key}
                    required
                    className="mt-2 w-full rounded-xl border p-3 font-normal"
                  />
                </label>
              </div>
              {source.source_type === 'api' ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="text-sm font-semibold">
                    URL declarada da API
                    <input
                      name="api_url"
                      defaultValue={String(source.metadata?.api_url ?? '')}
                      required
                      placeholder="https://api.exemplo.com/recurso"
                      className="mt-2 w-full rounded-xl border p-3 font-normal"
                    />
                  </label>
                  <label className="text-sm font-semibold">
                    Método declarado
                    <select
                      name="method"
                      defaultValue={String(source.metadata?.method ?? 'GET')}
                      className="mt-2 w-full rounded-xl border p-3 font-normal"
                    >
                      <option>GET</option>
                      <option>POST</option>
                    </select>
                  </label>
                  <label className="text-sm font-semibold">
                    Tipo de autenticação
                    <select
                      name="auth_type"
                      defaultValue={String(
                        source.metadata?.auth_type ?? 'none',
                      )}
                      className="mt-2 w-full rounded-xl border p-3 font-normal"
                    >
                      <option value="none">nenhuma</option>
                      <option value="bearer">Bearer Token</option>
                      <option value="api_key">API Key</option>
                    </select>
                  </label>
                  <label className="text-sm font-semibold">
                    Token/chave
                    <input
                      name="secret"
                      type="password"
                      placeholder="Não será exibido; apenas marcador declarativo"
                      className="mt-2 w-full rounded-xl border p-3 font-normal"
                    />
                  </label>
                  <p className="text-sm text-slate-600 md:col-span-2">
                    API permanece declarativa nesta sprint. Use campos
                    declarados ou crie a estrutura inicial de entregas; nenhuma
                    chamada externa será feita.
                  </p>
                </div>
              ) : source.source_type === 'database' ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
                  <p className="font-bold">
                    Conexão real com banco será implementada em sprint futura.
                  </p>
                  <p className="mt-2">
                    Nesta etapa, use estrutura declarativa ou API/planilha
                    declarativa. Não haverá introspecção real de tabelas ou
                    colunas.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <label className="text-sm font-semibold">
                    Tipo de arquivo esperado
                    <select
                      name="file_type"
                      defaultValue={String(
                        source.metadata?.file_type ?? 'xlsx',
                      )}
                      className="mt-2 w-full rounded-xl border p-3 font-normal"
                    >
                      <option value="xlsx">xlsx</option>
                      <option value="csv">csv</option>
                    </select>
                  </label>
                  <div className="rounded-2xl border border-dashed bg-slate-50 p-8 text-center text-sm text-slate-500">
                    Upload real será implementado em sprint futura.
                  </div>
                </div>
              )}
              <button
                disabled={!hasPermission(perms, 'core.data_sources.update')}
                className="rounded-xl bg-blue-600 px-5 py-3 font-bold text-white disabled:bg-slate-300"
              >
                Salvar conexão declarativa
              </button>
              <p className="text-xs text-slate-500">
                Nenhuma chamada externa, upload real, parser ou leitura real de
                schema é executada nesta sprint.
              </p>
            </form>
          </Card>
          {connectionDeclared ? contractActions : null}
        </div>
      ) : null}
      {step === 'mapping' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap justify-between gap-3">
            <button
              disabled
              className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-400"
            >
              Usar campos declarados
            </button>
            <div className="flex gap-2">
              <button
                onClick={() =>
                  handleSaveMappingsBatch({ continueAfterSave: true })
                }
                disabled={
                  mappingSaveState === 'saving' ||
                  (mappingSaveState === 'dirty' && !canManageMappings)
                }
                className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white disabled:bg-slate-300"
                type="button"
              >
                {mappingSaveState === 'saving'
                  ? 'Salvando...'
                  : mappingSaveState === 'dirty'
                    ? 'Salvar e continuar'
                    : 'Continuar'}
              </button>
            </div>
          </div>
          {contractActions}
          {contract ? (
            <div className="grid gap-4 xl:grid-cols-3">
              <Card>
                <h2 className="text-lg font-bold">Campos da fonte</h2>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar campo..."
                  className="mt-4 w-full rounded-xl border p-3"
                />
                <div className="mt-4 space-y-3">
                  {filteredFields.map((field) => (
                    <div key={field.id} className="rounded-2xl border p-3">
                      <StatusBadge>{field.data_type}</StatusBadge>
                      <p className="mt-2 font-semibold">
                        {field.source_field_name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {field.field_key}
                      </p>
                      {preview?.raw_payload &&
                      field.source_field_name in preview.raw_payload ? (
                        <p className="mt-2 text-xs text-slate-600">
                          Prévia:{' '}
                          {String(
                            preview.raw_payload[field.source_field_name],
                          ).slice(0, 80)}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </Card>
              <Card>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold">Mapeamento</h2>
                    <p className="mt-1 text-sm text-slate-600">
                      Mapeie os campos disponíveis no legado. Você não precisa
                      preencher todos os campos nativos. Quanto mais campos
                      forem mapeados, mais indicadores, relatórios e análises
                      ficarão disponíveis.
                    </p>
                  </div>
                  <label className="text-sm font-semibold text-slate-700">
                    Base de destino
                    <select
                      value={entityId}
                      onChange={(e) => changeEntity(e.target.value)}
                      className="mt-2 w-full rounded-xl border p-2 text-sm font-normal"
                    >
                      {groupedCanonicalEntities.map((entity) => (
                        <option key={entity.id} value={entity.id}>
                          {entityLabel(entity)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="mt-4 space-y-4">
                  {showDestinationWarning ? (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                      Recomendamos mapear primeiro o Núcleo operacional comum.
                      Os módulos específicos complementam essa base.
                    </div>
                  ) : null}
                  <div className="rounded-2xl border bg-slate-50 p-3">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                      Bases de destino
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {groupedCanonicalEntities.map((entity) => (
                        <button
                          key={entity.id}
                          onClick={() => changeEntity(entity.id)}
                          type="button"
                          className={`rounded-xl border px-3 py-2 text-xs font-semibold ${
                            entity.entity_key === primaryEntityKey
                              ? 'border-blue-300 bg-blue-50 text-blue-800 shadow-sm'
                              : 'bg-white text-slate-600'
                          } ${entityId === entity.id ? 'ring-2 ring-blue-500' : ''}`}
                        >
                          {entityLabel(entity)} · {entity.fields.length}
                          {entity.entity_key === primaryEntityKey
                            ? ' · base principal'
                            : ''}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-white p-3 text-sm">
                    <span className="font-semibold">
                      {mappingSaveState === 'dirty'
                        ? 'Alterações não salvas'
                        : mappingSaveState === 'saving'
                          ? 'Salvando...'
                          : mappingSaveState === 'saved'
                            ? 'Mapeamentos salvos'
                            : mappingSaveState === 'error'
                              ? 'Erro ao salvar mapeamentos'
                              : 'Selecione vários campos e salve tudo em lote'}
                    </span>
                    <button
                      onClick={() => handleSaveMappingsBatch()}
                      disabled={
                        mappingSaveState === 'saving' ||
                        mappingSaveState !== 'dirty' ||
                        !canManageMappings
                      }
                      className="rounded-xl bg-blue-600 px-4 py-2 font-bold text-white disabled:bg-slate-300"
                      type="button"
                    >
                      {mappingSaveState === 'saving'
                        ? 'Salvando...'
                        : 'Salvar mapeamentos'}
                    </button>
                  </div>
                  {selectedCanonicalFields.map((cf) => {
                    const mapping = mappings.find(
                      (m) => m.canonical_field_id === cf.id,
                    );
                    const draft = draftMappings[cf.id];
                    const selectedSource =
                      draft?.data_contract_field_id ??
                      mapping?.data_contract_field_id ??
                      '';
                    const selectedType =
                      draft?.mapping_type ?? mapping?.mapping_type ?? 'direct';
                    const isIgnored = selectedType === 'ignored';
                    return (
                      <div key={cf.id} className="rounded-xl border p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold">{fieldLabel(cf)}</p>
                            <p className="text-xs text-slate-500">
                              {cf.field_key} · {cf.data_type}
                            </p>
                          </div>
                          <StatusBadge
                            tone={
                              isIgnored
                                ? 'warning'
                                : selectedSource
                                  ? 'success'
                                  : undefined
                            }
                          >
                            {isIgnored
                              ? 'ignorado'
                              : selectedSource
                                ? 'mapeado'
                                : 'não mapeado'}
                          </StatusBadge>
                        </div>
                        <div className="mt-3 grid gap-2">
                          <select
                            value={selectedSource}
                            onChange={(e) =>
                              updateDraftMapping(cf.id, {
                                data_contract_field_id: e.target.value,
                              })
                            }
                            className="rounded-xl border p-2 text-sm"
                          >
                            <option value="">Selecione campo da fonte</option>
                            {fields.map((field) => (
                              <option key={field.id} value={field.id}>
                                {field.source_field_name}
                              </option>
                            ))}
                          </select>
                          <select
                            value={selectedType}
                            onChange={(e) =>
                              updateDraftMapping(cf.id, {
                                mapping_type: e.target.value,
                              })
                            }
                            className="rounded-xl border p-2 text-sm"
                          >
                            {mappingTypes.map((type) => (
                              <option key={type} value={type}>
                                {mappingTypeLabels[type] ?? type}
                              </option>
                            ))}
                          </select>
                          <p className="text-xs text-slate-500">
                            {selectedSource
                              ? 'Campo mapeado para processamento.'
                              : 'Campo não mapeado. Dado não disponível; mapeie este campo para habilitar análises futuras.'}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
              <Card>
                <h2 className="text-lg font-bold">Prévia do payload</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Somente visualização do staging recente; não grava dados
                  operacionais.
                </p>
                <h3 className="mt-4 font-semibold">Payload original</h3>
                <pre className="mt-2 max-h-72 overflow-auto rounded-2xl bg-slate-950 p-3 text-xs text-slate-100">
                  {JSON.stringify(preview?.raw_payload ?? {}, null, 2)}
                </pre>
                <h3 className="mt-4 font-semibold">Payload preparado</h3>
                <pre className="mt-2 max-h-72 overflow-auto rounded-2xl bg-slate-950 p-3 text-xs text-slate-100">
                  {JSON.stringify(preview?.normalized_payload ?? {}, null, 2)}
                </pre>
              </Card>
            </div>
          ) : null}
        </div>
      ) : null}
      {step === 'done' ? (
        <Card className="text-center">
          <div
            className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full text-3xl ${isComplete ? 'bg-emerald-100' : 'bg-amber-100'}`}
          >
            {isComplete ? '✓' : '!'}
          </div>
          <h2 className="mt-5 text-2xl font-bold">
            {isComplete
              ? 'Integração configurada'
              : 'Integração ainda incompleta'}
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-slate-600">
            {isComplete
              ? latestBatch
                ? 'A integração está configurada. Você pode processar o lote validado para gravar os dados tratados na base operacional nativa.'
                : 'A integração está configurada. Para gravar na base nativa, valide um lote de staging e execute a normalização.'
              : 'Complete os itens pendentes abaixo antes de considerar esta integração configurada.'}
          </p>
          {!isComplete ? (
            <div className="mx-auto mt-4 max-w-md rounded-2xl bg-amber-50 p-4 text-left">
              <p className="font-semibold">O que falta:</p>
              <ul className="mt-2 list-disc pl-5 text-sm text-slate-700">
                {missingItems.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <dl className="mx-auto mt-6 grid max-w-4xl gap-3 text-left md:grid-cols-2">
            <div className="rounded-2xl bg-slate-50 p-4">
              <dt className="font-semibold">Conexão declarada</dt>
              <dd>{connectionDeclared ? 'Sim' : 'Pendente'}</dd>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <dt className="font-semibold">Contrato vinculado</dt>
              <dd>{contract?.name ?? 'Não vinculado'}</dd>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <dt className="font-semibold">Campos no contrato</dt>
              <dd>{fields.length}</dd>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <dt className="font-semibold">Campos mapeados</dt>
              <dd>{mappedCount}</dd>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4 md:col-span-2">
              <dt className="font-semibold">Último lote validado</dt>
              <dd>{latestValidatedBatchLabel}</dd>
            </div>
          </dl>

          {isComplete ? (
            <div className="mx-auto mt-6 max-w-4xl rounded-2xl border bg-white p-4 text-left">
              <h3 className="text-lg font-bold">
                Normalização para base nativa
              </h3>
              <p className="mt-2 text-sm text-slate-600">
                Processa somente o lote validado e os campos mapeados desta
                integração para gravar os dados tratados na base operacional
                nativa.
              </p>
              <dl className="mt-4 grid gap-3 text-sm md:grid-cols-3">
                <div className="rounded-2xl bg-slate-50 p-3">
                  <dt className="text-slate-500">Último lote validado</dt>
                  <dd className="font-semibold">{latestValidatedBatchLabel}</dd>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <dt className="text-slate-500">Registros válidos</dt>
                  <dd className="font-semibold">
                    {latestBatch?.valid_records ?? 0}
                  </dd>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <dt className="text-slate-500">Campos mapeados</dt>
                  <dd className="font-semibold">{mappedCount}</dd>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <dt className="text-slate-500">Contrato da integração</dt>
                  <dd className="font-semibold">
                    {contract?.id.slice(0, 8) ?? 'Nenhum'}
                  </dd>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <dt className="text-slate-500">Contrato do lote</dt>
                  <dd className="font-semibold">
                    {latestBatch?.data_contract_id?.slice(0, 8) ?? 'Nenhum'}
                  </dd>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <dt className="text-slate-500">
                    Último status de normalização
                  </dt>
                  <dd>
                    {lastNormalizationRun ? (
                      <StatusBadge>
                        {normalizationRunLabel(
                          lastNormalizationRun,
                          normalizationErrors,
                        )}
                      </StatusBadge>
                    ) : (
                      'Nenhuma execução'
                    )}
                  </dd>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <dt className="text-slate-500">Criados</dt>
                  <dd className="font-semibold">
                    {lastNormalizationRun
                      ? `${
                          lastNormalizationRun.created_operation_records +
                          lastNormalizationRun.created_extension_records
                        } (${lastNormalizationRun.created_operation_records} núcleo + ${lastNormalizationRun.created_extension_records} extensão)`
                      : '0 (0 núcleo + 0 extensão)'}
                  </dd>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <dt className="text-slate-500">Atualizados</dt>
                  <dd className="font-semibold">
                    {lastNormalizationRun
                      ? lastNormalizationRun.updated_operation_records +
                        lastNormalizationRun.updated_extension_records
                      : 0}
                  </dd>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <dt className="text-slate-500">Avisos</dt>
                  <dd className="font-semibold">
                    {normalizationErrors.filter(isNormalizationWarning).length}
                  </dd>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <dt className="text-slate-500">Erros</dt>
                  <dd className="font-semibold">
                    {lastNormalizationRun?.error_records ?? 0}
                  </dd>
                </div>
              </dl>
              <button
                className="mt-4 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                disabled={!!normalizationDisabledReason || normalizing}
                onClick={handleNormalize}
                type="button"
              >
                {normalizing ? 'Processando...' : 'Processar para base nativa'}
              </button>
              {normalizationDisabledReason ? (
                <p className="mt-2 text-sm text-amber-700">
                  {normalizationDisabledReason}
                </p>
              ) : null}
              {normalizationErrors.length ? (
                <ul className="mt-3 space-y-2 text-sm">
                  {normalizationErrors.slice(0, 5).map((error) => {
                    const warning = isNormalizationWarning(error);
                    return (
                      <li
                        key={error.id}
                        className={
                          warning
                            ? 'rounded-lg bg-amber-50 p-2 text-amber-900'
                            : 'rounded-lg bg-rose-50 p-2 text-rose-900'
                        }
                      >
                        <strong>{warning ? 'Aviso' : error.error_code}</strong>:{' '}
                        {error.error_message}
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
          ) : null}
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <button
              onClick={() => setStep('connection')}
              className="rounded-xl border px-4 py-2 font-semibold"
            >
              Editar conexão
            </button>
            <button
              onClick={() => setStep('mapping')}
              className="rounded-xl border px-4 py-2 font-semibold"
            >
              Editar mapeamento
            </button>
            <Link
              href="/app/integrations"
              className="rounded-xl bg-slate-950 px-4 py-2 font-semibold text-white"
            >
              Voltar para Integrações
            </Link>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
