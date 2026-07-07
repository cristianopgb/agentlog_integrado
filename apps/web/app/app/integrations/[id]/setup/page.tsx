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
  type CanonicalEntity,
  type CanonicalField,
  type FieldMapping,
} from '../../../../../lib/canonical-api';
import {
  listStagingBatches,
  type StagingBatch,
} from '../../../../../lib/staging-api';
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
};
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
const deliveryFieldHints = [
  'entrega',
  'delivery',
  'transporte',
  'transport',
  'cte',
  'ct-e',
  'nota',
  'invoice',
  'cliente',
  'customer',
  'motorista',
  'driver',
  'frete',
];

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
function sourceLooksLikeDelivery(
  fields: DataContractField[],
  contract: DataContract | null,
  source: IntegrationSource | null,
) {
  const text = [
    contract?.name,
    contract?.module_key,
    contract?.entity_key,
    source?.name,
    source?.module_key,
    ...fields.flatMap((field) => [field.field_key, field.source_field_name]),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return deliveryFieldHints.some((hint) => text.includes(hint));
}
function chooseInitialEntity(
  entities: CanonicalEntity[],
  fields: DataContractField[],
  contract: DataContract | null,
  source: IntegrationSource | null,
  chosenEntityId?: string,
) {
  if (chosenEntityId && entities.some((entity) => entity.id === chosenEntityId))
    return chosenEntityId;
  const byKey = (key: string) =>
    entities.find((entity) => entity.entity_key === key)?.id;
  if (sourceLooksLikeDelivery(fields, contract, source))
    return (
      byKey('operation_records') ??
      byKey('transport_records') ??
      entities[0]?.id ??
      ''
    );
  return byKey('operation_records') ?? entities[0]?.id ?? '';
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
  const [preview, setPreview] = useState<Preview>(null);
  const [latestBatch, setLatestBatch] = useState<StagingBatch | null>(null);
  const [query, setQuery] = useState('');
  const [perms, setPerms] = useState<UserPermission[]>([]);
  const [msg, setMsg] = useState('Carregando integração...');

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
    setLatestBatch(
      batches.find((batch) => batch.data_source_id === params.id) ?? null,
    );
    setReusableContracts(reusable);
    setSelectedContractId(reusable[0]?.id ?? '');
    setCanonicalFields(
      (
        await Promise.all(es.map((entity) => listCanonicalFields(t, entity.id)))
      ).flat(),
    );
    if (c) {
      const [fs, ms, pv] = await Promise.all([
        listContractFields(t, c.id),
        listFieldMappings(t, c.id),
        getLatestStagingRecordForContract(t, c.id),
      ]);
      setFields(fs);
      setMappings(ms);
      setPreview(pv);
      setEntityId(chooseInitialEntity(es, fs, c, s, chosenEntityId));
    } else {
      setFields([]);
      setMappings([]);
      setPreview(null);
      setEntityId(chooseInitialEntity(es, [], c, s, chosenEntityId));
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
  async function saveMapping(cf: CanonicalField, form: HTMLFormElement) {
    if (!contract) return;
    const f = new FormData(form);
    const fieldId = String(f.get('data_contract_field_id') || '');
    if (!fieldId) return;
    try {
      await upsertFieldMapping(tenantId, contract.id, {
        data_contract_field_id: fieldId,
        canonical_entity_id: cf.canonical_entity_id,
        canonical_field_id: cf.id,
        mapping_type: String(f.get('mapping_type') || 'direct'),
        status: 'draft',
      });
      await load(tenantId, entityId);
      setMsg('Mapeamento salvo.');
    } catch {
      setMsg(
        'Não foi possível salvar o mapeamento. Tente novamente ou revise a integração.',
      );
    }
  }

  const groupedCanonicalEntities = useMemo(
    () =>
      entities
        .map((entity) => ({
          ...entity,
          fields: canonicalFields.filter(
            (field) => field.canonical_entity_id === entity.id,
          ),
        }))
        .filter((entity) => entity.fields.length > 0),
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
  const showDestinationWarning = Boolean(
    sourceLooksLikeDelivery(fields, contract, source) &&
    selectedEntity?.entity_key &&
    !['operation_records', 'transport_records'].includes(
      selectedEntity.entity_key,
    ),
  );
  const connectionDeclared = source?.metadata?.connection_declared === true;
  const mappedCount = mappings.length;
  const isComplete = Boolean(
    connectionDeclared && contract && fields.length > 0 && mappedCount > 0,
  );
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
                onClick={() => setStep('done')}
                className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white"
                type="button"
              >
                Continuar
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
                    <p className="mt-1 text-xs text-slate-500">
                      O núcleo operacional comum contém dados básicos usados por
                      vários módulos, como CTe, NF, cliente, embarcador,
                      destinatário, origem, destino, peso, valor, placa,
                      motorista, status e datas.
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
                      Os campos da fonte parecem ser de entrega/transporte.
                      Confira se a base de destino selecionada está correta.
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
                          className={`rounded-xl border px-3 py-2 text-xs font-semibold ${entityId === entity.id ? 'border-blue-500 bg-blue-50 text-blue-700' : 'bg-white text-slate-600'}`}
                        >
                          {entityLabel(entity)} · {entity.fields.length}
                        </button>
                      ))}
                    </div>
                  </div>
                  {selectedCanonicalFields.map((cf) => {
                    const mapping = mappings.find(
                      (m) => m.canonical_field_id === cf.id,
                    );
                    return (
                      <form
                        key={cf.id}
                        onSubmit={(e) => {
                          e.preventDefault();
                          saveMapping(cf, e.currentTarget);
                        }}
                        className="rounded-2xl border p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold">{fieldLabel(cf)}</p>
                            <p className="text-xs text-slate-500">
                              {cf.field_key} · {cf.data_type}
                            </p>
                          </div>
                          <StatusBadge tone={mapping ? 'success' : 'warning'}>
                            {mapping ? 'mapeado' : 'pendente'}
                          </StatusBadge>
                        </div>
                        <div className="mt-3 grid gap-2">
                          <select
                            name="data_contract_field_id"
                            defaultValue={mapping?.data_contract_field_id ?? ''}
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
                            name="mapping_type"
                            defaultValue={mapping?.mapping_type ?? 'direct'}
                            className="rounded-xl border p-2 text-sm"
                          >
                            {mappingTypes.map((type) => (
                              <option key={type} value={type}>
                                {mappingTypeLabels[type] ?? type}
                              </option>
                            ))}
                          </select>
                          <button
                            disabled={
                              !hasPermission(
                                perms,
                                mapping
                                  ? 'core.field_mappings.update'
                                  : 'core.field_mappings.create',
                              )
                            }
                            className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-bold text-white disabled:bg-slate-300"
                          >
                            Salvar mapeamento
                          </button>
                        </div>
                      </form>
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
              ? 'A conexão declarativa, a estrutura de dados e o mapeamento foram configurados. A gravação automática na base operacional nativa será implementada em sprint futura.'
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
              <dd>{latestBatch?.validated_at ?? 'Nenhum lote validado'}</dd>
            </div>
          </dl>
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
