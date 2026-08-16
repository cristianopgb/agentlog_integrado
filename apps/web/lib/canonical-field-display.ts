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

export const MAPPING_SOURCE_FIELD_GROUP_ORDER = [
  'Carga', 'Entrega', 'Transporte', 'Cliente', 'Contato', 'Ocorrência',
  'Eventos de Ocorrência', 'Financeiro', 'Canhoto', 'Geral',
] as const;

const MAPPING_SOURCE_PREFIXES = [
  ['ocorrencia_evento', 'Eventos de Ocorrência'],
  ['ocorrencias', 'Ocorrência'],
  ['ocorrencia', 'Ocorrência'],
  ['financeiro', 'Financeiro'],
  ['transporte', 'Transporte'],
  ['entrega', 'Entrega'],
  ['contato', 'Contato'],
  ['cliente', 'Cliente'],
  ['canhoto', 'Canhoto'],
  ['carga', 'Carga'],
] as const;

const MAPPING_SOURCE_LABELS: Record<string, string> = {
  nro_doc: 'Documento',
  carga_id: 'Código da carga', carga_filial_romaneio: 'Número do romaneio', carga_romaneio: 'Romaneio',
  carga_filial_doc: 'Filial do documento', carga_serie_doc: 'Série do documento', carga_nro_doc: 'Documento da carga informado pela API',
  carga_data_desc: 'Data da descarga', carga_data_nf: 'Data da NF', carga_dle: 'DLE', carga_agendamento: 'Agendamento',
  carga_conf: 'Conferência', carga_peso: 'Peso', carga_valor_mercadoria: 'Valor da mercadoria', carga_qtd: 'Quantidade',
  carga_peso_cubado: 'Peso cubado', carga_classificacao: 'Classificação', carga_tomador: 'Tomador',
  carga_destinatario: 'Destinatário', carga_bairro: 'Bairro', carga_cidade: 'Cidade', carga_uf: 'UF',
  carga_nf_s: 'NF informada pela API', carga_tipo_carga: 'Tipo de carga', carga_qtd_nf: 'Quantidade de NFs',
  carga_mesoregiao: 'Mesorregião', carga_sub_regiao: 'Sub-região', carga_ocorrencias: 'Ocorrências',
  carga_remetente: 'Remetente', carga_observacao: 'Observação', carga_ref_cliente: 'Referência do cliente',
  carga_cidade_destino: 'Cidade de destino', carga_agenda: 'Agenda', carga_tipo_carga_operacional: 'Tipo de carga operacional',
  carga_ultima_ocorrencia: 'Última ocorrência', carga_latitude: 'Latitude', carga_longitude: 'Longitude',
  carga_peso_calculo: 'Peso de cálculo', carga_prioridade: 'Prioridade', carga_restricao_veiculo: 'Restrição de veículo',
  carga_carro_dedicado: 'Carro dedicado', carga_restricao_horario: 'Restrição de horário', carga_redespacho: 'Redespacho',
  carga_erp_cliente_id: 'Código do cliente no legado', carga_erp_transportadora_id: 'Código da transportadora no legado',
  carga_transportadora_nome: 'Transportadora', carga_erp_motorista_id: 'Código do motorista no legado',
  carga_motorista_nome: 'Motorista informado pela API', carga_motorista_telefone: 'Telefone do motorista informado pela API',
  carga_motorista_whatsapp: 'WhatsApp do motorista', carga_veiculo_placa: 'Placa informada pela API',
  carga_cidade_origem: 'Cidade de origem', carga_uf_origem: 'UF de origem', carga_volume_m3: 'Volume em m³',
  entrega_id: 'Código da entrega', entrega_nro_doc_tomador: 'Documento do tomador', entrega_destinatario: 'Destinatário',
  entrega_data_entrega: 'Data da entrega', entrega_status_entrega: 'Status da entrega', entrega_ocorrencia: 'Ocorrência da entrega',
  financeiro_id: 'Código financeiro', financeiro_nro_doc_tomador: 'Documento do tomador', financeiro_destinatario: 'Destinatário',
  financeiro_data_entrega: 'Data da entrega', financeiro_status_entrega: 'Status financeiro da entrega',
  financeiro_valor_frete: 'Valor do frete', financeiro_cte: 'CT-e', financeiro_data_emissao: 'Data de emissão',
  financeiro_custo_frete: 'Custo de frete', financeiro_custos_extras: 'Custos extras',
  ocorrencia_id: 'Código da ocorrência', ocorrencia_numero_legado: 'Número da ocorrência no legado',
  ocorrencia_nro_doc: 'Documento da entrega informado pela ocorrência', ocorrencia_nf: 'NF informada pela ocorrência', ocorrencia_romaneio: 'Romaneio da ocorrência',
  ocorrencia_motivo_codigo: 'Código do motivo', ocorrencia_motivo_descricao: 'Motivo informado pelo legado', ocorrencia_titulo: 'Título informado pela ocorrência',
  ocorrencia_descricao: 'Descrição informada pela ocorrência', ocorrencia_status: 'Status informado pelo legado', ocorrencia_prioridade: 'Prioridade',
  ocorrencia_severidade: 'Severidade', ocorrencia_canal_origem: 'Canal de origem', ocorrencia_motorista_nome: 'Motorista',
  ocorrencia_motorista_telefone: 'Telefone do motorista', ocorrencia_veiculo_placa: 'Placa do veículo',
  ocorrencia_criado_em: 'Data de abertura informada pelo legado', ocorrencia_atualizado_em: 'Data de atualização', ocorrencia_encerrado_em: 'Data de encerramento',
  ocorrencia_evento_id: 'Código do evento', ocorrencia_evento_id_ocorrencia: 'Código da ocorrência',
  ocorrencia_evento_numero_ocorrencia: 'Número da ocorrência', ocorrencia_evento_tipo: 'Tipo do evento',
  ocorrencia_evento_titulo: 'Título do evento', ocorrencia_evento_descricao: 'Descrição do evento',
  ocorrencia_evento_status_anterior: 'Status anterior', ocorrencia_evento_status_novo: 'Novo status',
  ocorrencia_evento_autor_tipo: 'Tipo do autor', ocorrencia_evento_autor_nome: 'Autor', ocorrencia_evento_canal: 'Canal',
  ocorrencia_evento_criado_em: 'Data do evento',
};

export function getMappingSourceFieldGroup(fieldKey: string) {
  const key = fieldKey.trim().toLowerCase();
  return MAPPING_SOURCE_PREFIXES.find(([prefix]) => key.startsWith(`${prefix}_`))?.[1] ?? 'Geral';
}

export function formatMappingSourceFieldLabel(fieldKey: string) {
  const key = fieldKey.trim().toLowerCase();
  const known = MAPPING_SOURCE_LABELS[key];
  if (known) return known;
  const prefix = MAPPING_SOURCE_PREFIXES.find(([candidate]) => key.startsWith(`${candidate}_`))?.[0];
  const displayKey = prefix ? key.slice(prefix.length + 1) : key;
  const abbreviations: Record<string, string> = {
    nf: 'NF', cte: 'CT-e', uf: 'UF', doc: 'documento', nro: 'número', qtd: 'quantidade',
    dt: 'data', desc: 'descrição', id: 'ID', erp: 'ERP',
  };
  const label = displayKey.split('_').filter(Boolean).map((word) => abbreviations[word] ?? word).join(' ');
  return label ? label.charAt(0).toLocaleUpperCase('pt-BR') + label.slice(1) : fieldKey;
}

export function normalizeMappingSourceFieldSearchText(fieldKey: string) {
  return normalizeCanonicalFieldSearchText(
    fieldKey,
    formatMappingSourceFieldLabel(fieldKey),
    getMappingSourceFieldGroup(fieldKey),
  );
}

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
