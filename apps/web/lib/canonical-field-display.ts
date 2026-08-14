const GROUPS = [
  ['carga', 'Carga'],
  ['entrega', 'Entrega'],
  ['transporte', 'Transporte'],
  ['cliente', 'Cliente'],
  ['contato', 'Contato'],
  ['ocorrencia', 'Ocorrência'],
  ['ocorrencias', 'Ocorrência'],
  ['financeiro', 'Financeiro'],
  ['canhoto', 'Canhoto'],
  ['atendimento', 'Atendimento'],
  ['armazem', 'Armazém'],
  ['estoque', 'Armazém'],
  ['equipe', 'Equipes'],
  ['tenant', 'Empresa'],
  ['user', 'Usuários'],
  ['billing', 'Faturamento'],
] as const;

const ENTITY_GROUPS: Record<string, string> = {
  operation_records: 'Carga',
  cargas: 'Carga',
  deliveries: 'Entrega',
  entregas: 'Entrega',
  transport_records: 'Transporte',
  transportes: 'Transporte',
  customers: 'Cliente',
  clientes: 'Cliente',
  contacts: 'Contato',
  contatos: 'Contato',
  occurrences: 'Ocorrência',
  finance_records: 'Financeiro',
  attendance_records: 'Atendimento',
  warehouse_records: 'Armazém',
  team_records: 'Equipes',
  tenants: 'Empresa',
  users: 'Usuários',
};

export const CANONICAL_FIELD_GROUP_ORDER = [
  'Carga', 'Entrega', 'Transporte', 'Cliente', 'Contato', 'Ocorrência',
  'Financeiro', 'Canhoto', 'Atendimento', 'Armazém', 'Equipes', 'Empresa',
  'Usuários', 'Faturamento', 'Geral',
] as const;

const LABELS: Record<string, string> = {
  carga_filial_romaneio: 'Número do romaneio', romaneio: 'Romaneio', codigo_carga: 'Código da carga',
  carga_data_desc: 'Data da descarga', data_desc: 'Data da descarga', data_descarga: 'Data da descarga',
  carga_motorista_nome: 'Motorista', motorista_nome: 'Motorista',
  carga_motorista_telefone: 'Telefone do motorista', motorista_telefone: 'Telefone do motorista', driver_phone: 'Telefone do motorista',
  carga_motorista_whatsapp: 'WhatsApp do motorista', motorista_whatsapp: 'WhatsApp do motorista', driver_whatsapp: 'WhatsApp do motorista',
  carga_erp_motorista_id: 'Código do motorista no legado', erp_motorista_id: 'Código do motorista no legado',
  carga_placa: 'Placa do veículo', veiculo_placa: 'Placa do veículo', vehicle_plate: 'Placa do veículo',
  carga_nf: 'Número da NF', numero_nf: 'Número da NF', nf_s: 'Número da NF', invoice_number: 'Número da NF',
  carga_doc: 'Documento da entrega', nro_doc: 'Documento da entrega', delivery_number: 'Número da entrega', document_number: 'Documento',
  cte_number: 'Número do CT-e', manifest_number: 'Manifesto / romaneio', cliente_nome: 'Cliente', transportadora_nome: 'Transportadora',
  status: 'Status', status_ocorrencia: 'Status da ocorrência', ocorrencia_status: 'Status da ocorrência',
  motivo_codigo: 'Código do motivo', ocorrencia_motivo_codigo: 'Código do motivo', motivo_descricao: 'Motivo', titulo: 'Título', title: 'Título',
  descricao: 'Descrição', description: 'Descrição', prioridade: 'Prioridade', priority: 'Prioridade', severidade: 'Severidade',
  canal_origem: 'Canal de origem', origin_channel: 'Canal de origem',
  data_emissao_nf: 'Data de emissão da NF', data_saida: 'Data de saída', data_previsao_entrega: 'Previsão de entrega', data_entrega: 'Data da entrega',
  cidade_origem: 'Cidade de origem', uf_origem: 'UF de origem', cidade_destino: 'Cidade de destino', uf_destino: 'UF de destino',
  quantidade: 'Quantidade', peso_kg: 'Peso em kg', volume_m3: 'Volume em m³', valor_nota: 'Valor da nota',
  receita_frete: 'Receita de frete', custo_frete: 'Custo de frete', custos_extras: 'Custos extras',
  financeiro_valor_nota: 'Valor da nota', financeiro_receita_frete: 'Receita de frete', financeiro_custo_frete: 'Custo de frete', financeiro_custos_extras: 'Custos extras',
};

export function getCanonicalFieldGroup(fieldKey: string, entityKey?: string) {
  const entity = entityKey?.trim().toLowerCase();
  if (entity && ENTITY_GROUPS[entity]) return ENTITY_GROUPS[entity];
  const key = fieldKey.trim().toLowerCase();
  return GROUPS.find(([prefix]) => key === prefix || key.startsWith(`${prefix}_`))?.[1] ?? 'Geral';
}

function withoutDisplayPrefix(fieldKey: string) {
  const key = fieldKey.trim().toLowerCase();
  const prefix = GROUPS.find(([candidate]) => key.startsWith(`${candidate}_`))?.[0];
  return prefix ? key.slice(prefix.length + 1) : key;
}

export function formatCanonicalFieldLabel(fieldKey: string, entityKey?: string) {
  const key = fieldKey.trim().toLowerCase();
  const unprefixed = withoutDisplayPrefix(key);
  if (unprefixed === 'status' && getCanonicalFieldGroup(fieldKey, entityKey) === 'Ocorrência')
    return 'Status da ocorrência';
  const known = LABELS[key] ?? LABELS[unprefixed];
  if (known) return known;
  const abbreviations: Record<string, string> = {
    nf: 'NF', cte: 'CT-e', uf: 'UF', doc: 'Documento', qtd: 'Quantidade',
    dt: 'Data', id: 'ID', erp: 'ERP', codigo: 'código', numero: 'número',
  };
  const words = unprefixed.split('_').filter(Boolean).map((word) => abbreviations[word] ?? word);
  if (!words.length) return fieldKey;
  const label = words.join(' ');
  return label.charAt(0).toLocaleUpperCase('pt-BR') + label.slice(1);
}

export function normalizeCanonicalFieldSearchText(
  fieldKey: string,
  label = formatCanonicalFieldLabel(fieldKey),
  group = getCanonicalFieldGroup(fieldKey),
) {
  const synonyms: Record<string, string> = {
    romaneio: 'manifesto', descarga: 'descarregamento', motorista: 'condutor driver',
    telefone: 'fone phone', financeiro: 'finanças frete', ocorrencia: 'ocorrência incidente',
  };
  const expanded = `${fieldKey} ${label} ${group} ${Object.entries(synonyms)
    .filter(([term]) => normalizeText(`${fieldKey} ${label} ${group}`).includes(term))
    .flatMap(([, values]) => values)
    .join(' ')}`;
  return normalizeText(expanded).replace(/[^a-z0-9]+/g, ' ').trim();
}

export function normalizeCanonicalFieldQuery(value: string) {
  return normalizeText(value).replace(/[^a-z0-9]+/g, ' ').trim();
}

function normalizeText(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
