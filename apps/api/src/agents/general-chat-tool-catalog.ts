import {
  GENERAL_CHAT_ALLOWED_ARGUMENTS,
  GENERAL_CHAT_FILTER_FIELDS,
  GENERAL_CHAT_FUNCTION_TO_KEY,
  GENERAL_CHAT_TOOL_KEYS,
  GeneralChatToolKey,
  generalChatToolDefinitions,
} from './general-chat-tool-contracts';

type Authority =
  | 'indicator_catalog'
  | 'indicator_result'
  | 'dashboard_snapshot'
  | 'report_snapshot'
  | 'canonical_metric'
  | 'canonical_aggregation'
  | 'canonical_search'
  | 'operational_record'
  | 'knowledge';
const metadata: Record<
  GeneralChatToolKey,
  {
    authority_level: Authority;
    use_when: string;
    output_contract: string[];
    fallback_allowed: boolean;
  }
> = {
  'analytics.map.get': {
    authority_level: 'indicator_catalog',
    use_when: 'Descobrir resultados analíticos homologados.',
    output_contract: ['found', 'status', 'results'],
    fallback_allowed: true,
  },
  'analytics.result.get': {
    authority_level: 'canonical_metric',
    use_when: 'Consultar métrica canônica homologada.',
    output_contract: ['found', 'status', 'value', 'display_value', 'rows'],
    fallback_allowed: true,
  },
  'analytics.context.analyze': {
    authority_level: 'canonical_metric',
    use_when: 'Analisar contexto operacional controlado.',
    output_contract: ['found', 'status', 'summary'],
    fallback_allowed: true,
  },
  'operational.record.find': {
    authority_level: 'operational_record',
    use_when: 'Localizar registro operacional canônico.',
    output_contract: ['found', 'status', 'records'],
    fallback_allowed: true,
  },
  'knowledge.guidance.search': {
    authority_level: 'knowledge',
    use_when: 'Buscar orientação funcional publicada.',
    output_contract: ['found', 'status', 'results'],
    fallback_allowed: false,
  },
  'indicators.list_available': {
    authority_level: 'indicator_catalog',
    use_when: 'Descobrir indicadores liberados.',
    output_contract: ['status', 'indicators'],
    fallback_allowed: false,
  },
  'indicators.get_result': {
    authority_level: 'indicator_result',
    use_when: 'Consultar indicador identificado no catálogo.',
    output_contract: [
      'found',
      'status',
      'indicator',
      'value',
      'display_value',
      'rows',
    ],
    fallback_allowed: true,
  },
  'dashboard.get_snapshot': {
    authority_level: 'dashboard_snapshot',
    use_when: 'Consultar dashboard publicado.',
    output_contract: [
      'found',
      'status',
      'key_indicators',
      'breakdowns',
      'rankings',
      'tables',
    ],
    fallback_allowed: true,
  },
  'reports.get_job_snapshot': {
    authority_level: 'report_snapshot',
    use_when: 'Consultar relatório determinístico concluído.',
    output_contract: ['found', 'status', 'sections'],
    fallback_allowed: true,
  },
  'treated_data.summary.get': {
    authority_level: 'canonical_aggregation',
    use_when: 'Resumir a base canônica vigente.',
    output_contract: ['found', 'status', 'record_count'],
    fallback_allowed: true,
  },
  'treated_data.aggregate_records': {
    authority_level: 'canonical_aggregation',
    use_when: 'Agregar métrica canônica permitida.',
    output_contract: ['found', 'status', 'value', 'rows'],
    fallback_allowed: true,
  },
  'treated_data.search_records': {
    authority_level: 'canonical_search',
    use_when: 'Pesquisar registros canônicos.',
    output_contract: ['found', 'status', 'rows'],
    fallback_allowed: true,
  },
  'treated_data.get_record_detail': {
    authority_level: 'canonical_search',
    use_when: 'Detalhar registro canônico identificado.',
    output_contract: ['found', 'status', 'record'],
    fallback_allowed: true,
  },
};
/** Safe inspection only; it is never referenced by the OpenAI request path. */
export function inspectGeneralChatToolContract() {
  const definitions = generalChatToolDefinitions();
  return {
    tools: GENERAL_CHAT_TOOL_KEYS.map((tool_key) => {
      const function_name = Object.entries(GENERAL_CHAT_FUNCTION_TO_KEY).find(
          ([, key]) => key === tool_key,
        )![0],
        definition = definitions.find((item) => item.name === function_name)!,
        allowed_args = Object.keys(definition.parameters.properties),
        required_args = [...((definition.parameters as any).required || [])],
        doc = metadata[tool_key];
      return {
        tool_key,
        function_name,
        description: definition.description,
        authority_level: doc.authority_level,
        use_when: doc.use_when,
        do_not_use_when:
          'Quando uma autoridade mais específica representa o recurso solicitado.',
        required_args,
        optional_args: allowed_args.filter(
          (arg) => !required_args.includes(arg),
        ),
        allowed_args,
        filter_fields: GENERAL_CHAT_ALLOWED_ARGUMENTS[tool_key].includes(
          'filters' as never,
        )
          ? [
              ...new Set([
                ...GENERAL_CHAT_FILTER_FIELDS.record,
                ...GENERAL_CHAT_FILTER_FIELDS.analytics,
              ]),
            ]
          : [],
        output_contract: doc.output_contract,
        possible_statuses: [
          'available',
          'partial',
          'failed',
          'unavailable',
          'not_found',
        ],
        fallback_allowed: doc.fallback_allowed,
        model_allowed: true,
        backend_fallback_allowed: doc.fallback_allowed,
        voice_allowed: true,
        required_permission: 'tool enabled for agent and tenant',
        example_input: {},
        example_available: { found: true, status: 'available' },
        example_unavailable: { found: false, status: 'unavailable' },
      };
    }),
  };
}
