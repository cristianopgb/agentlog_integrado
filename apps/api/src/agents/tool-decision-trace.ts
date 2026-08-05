import { GENERAL_CHAT_TOOL_KEYS } from './general-chat-tool-contracts';

const negativeData =
  /\b(n[aã]o encontrei dados|n[aã]o h[aá] dados suficientes|n[aã]o consta indicador|n[aã]o foi poss[ií]vel responder)\b/i;
const missingIndicator =
  /\b(n[aã]o consta indicador|indicador n[aã]o existe)\b/i;
const forbidden =
  /sql|schema|staging|raw_payload|payload\b|tenant|source_id|batch_id|secret/i;
export type RootCauseStage =
  | 'no_issue'
  | 'no_operational_intent_detected'
  | 'model_selected_wrong_tool'
  | 'resolver_failed_to_match_indicator'
  | 'resolver_rerouted_correctly'
  | 'invalid_tool_arguments'
  | 'permission_denied'
  | 'executor_returned_not_found'
  | 'executor_returned_unavailable'
  | 'executor_returned_failed'
  | 'executor_returned_empty_result'
  | 'tool_output_available_but_answer_ignored'
  | 'fallback_used_correctly'
  | 'fallback_used_incorrectly'
  | 'final_answer_not_grounded_in_tool_output'
  | 'voice_missing_user_intent'
  | 'context_continuation_failed'
  | 'unknown';
export function safeTraceValue(value: any, depth = 0): any {
  if (value == null || ['boolean', 'number'].includes(typeof value))
    return value;
  if (typeof value === 'string') return value.slice(0, 500);
  if (depth > 3) return undefined;
  if (Array.isArray(value))
    return value.slice(0, 10).map((x) => safeTraceValue(x, depth + 1));
  if (typeof value === 'object')
    return Object.entries(value)
      .filter(([key]) => !forbidden.test(key))
      .slice(0, 80)
      .reduce((out, [key, item]) => {
        const next = safeTraceValue(item, depth + 1);
        if (next !== undefined) (out as any)[key] = next;
        return out;
      }, {} as any);
  return undefined;
}
export function toolOutputFacts(output: any) {
  const hasContent = (value: unknown) =>
      value !== null && value !== undefined && value !== '',
    hasItems = (value: unknown) =>
      Array.isArray(value)
        ? value.length > 0
        : Boolean(
            value && typeof value === 'object' && Object.keys(value).length > 0,
          ),
    value = hasContent(output?.value) || hasContent(output?.display_value),
    rows =
      (Array.isArray(output?.rows) && output.rows.length > 0) ||
      (Array.isArray(output?.records) && output.records.length > 0),
    structuredData =
      hasContent(output?.total) ||
      hasContent(output?.record_count) ||
      hasContent(output?.records_used) ||
      [
        'table',
        'series',
        'matches',
        'key_indicators',
        'breakdowns',
        'rankings',
        'tables',
        'totals',
        'financial',
        'weight',
        'volume',
        'samples',
        'record',
        'fields',
      ].some((key) => hasItems(output?.[key]));
  return {
    tool_output_status: String(
      output?.status ||
        (output?.tool_error
          ? 'failed'
          : output?.found === false
            ? 'not_found'
            : 'available'),
    ),
    tool_output_found: output?.found === true,
    tool_output_has_value: value,
    tool_output_has_rows: rows,
    tool_output_has_structured_data: structuredData,
    tool_output_keys:
      output && typeof output === 'object'
        ? Object.keys(output)
            .filter((key) => !forbidden.test(key))
            .slice(0, 30)
        : [],
  };
}
export function classifyToolDecision(trace: any, answer = ''): RootCauseStage {
  const output = trace._tool_output || {},
    facts = toolOutputFacts(output),
    hasData =
      facts.tool_output_found &&
      facts.tool_output_status === 'available' &&
      (facts.tool_output_has_value ||
        facts.tool_output_has_rows ||
        facts.tool_output_has_structured_data);
  if (hasData && trace.fallback_used) return 'fallback_used_incorrectly';
  if (hasData && negativeData.test(answer))
    return 'tool_output_available_but_answer_ignored';
  if (
    facts.tool_output_found &&
    ['failed', 'unavailable'].includes(facts.tool_output_status) &&
    output?.indicator?.name &&
    missingIndicator.test(answer)
  )
    return 'final_answer_not_grounded_in_tool_output';
  if (trace.channel === 'voice' && !trace.last_user_message_found)
    return 'voice_missing_user_intent';
  if (trace.permission_checked && trace.permission_allowed === false)
    return 'permission_denied';
  if (trace.invalid_arguments) return 'invalid_tool_arguments';
  if (trace.resolved_tool_key === 'indicators.get_result' && ['custom_indicator', 'native_indicator'].includes(trace.resolved_source_type) && trace.executed_tool_key !== 'indicators.get_result' && ['analytics.context.analyze', 'analytics.result.get', 'analytics.map.get', 'treated_data.aggregate_records'].includes(trace.executed_tool_key)) return 'model_selected_wrong_tool';
  if (trace.executed_tool_key === 'dashboard.get_snapshot' && trace.model_selected_tool_key === 'treated_data.aggregate_records' && /\b(?:por\s+(?:cliente|motorista|uf|status)|m[eé]di[oa]|total)\b/i.test(trace.user_message || '') && !/\bdashboard\b/i.test(trace.user_message || '')) return 'resolver_failed_to_match_indicator';
  if (facts.tool_output_status === 'not_found')
    return 'executor_returned_not_found';
  if (facts.tool_output_status === 'unavailable')
    return 'executor_returned_unavailable';
  if (facts.tool_output_status === 'failed') return 'executor_returned_failed';
  if (
    facts.tool_output_found &&
    !facts.tool_output_has_value &&
    !facts.tool_output_has_rows &&
    !facts.tool_output_has_structured_data
  )
    return 'executor_returned_empty_result';
  if (trace.tool_rerouted) return 'resolver_rerouted_correctly';
  if (trace.fallback_used) return 'fallback_used_correctly';
  if (!trace.operational_detected) return 'no_operational_intent_detected';
  return 'no_issue';
}
export function finalizeToolDecisionTrace(trace: any, answer = '') {
  const facts = toolOutputFacts(trace._tool_output);
  const root_cause_stage = classifyToolDecision(trace, answer);
  let final_answer_classification = 'grounded_or_not_verifiable';
  if (root_cause_stage === 'tool_output_available_but_answer_ignored')
    final_answer_classification = 'contradicts_available_tool_output';
  if (root_cause_stage === 'final_answer_not_grounded_in_tool_output')
    final_answer_classification = 'misrepresented_existing_indicator';
  if (root_cause_stage === 'model_selected_wrong_tool') final_answer_classification = 'specific_indicator_not_executed';
  if (root_cause_stage === 'resolver_failed_to_match_indicator') final_answer_classification = 'resolver_rerouted_to_generic_dashboard';
  const { _tool_output, invalid_arguments, ...safe } = trace;
  return safeTraceValue({
    ...safe,
    ...facts,
    final_answer_classification,
    root_cause_stage,
    available_tool_keys: [...GENERAL_CHAT_TOOL_KEYS],
  });
}

/** Mutable per-run recorder kept outside orchestration; event methods never affect routing. */
export class ToolDecisionTrace {
  private readonly data: any;
  constructor(
    channel: 'text' | 'voice',
    message: string,
    resolvedMessage: string,
    clientContext: Record<string, unknown>,
    operational: boolean,
    extra: Record<string, unknown> = {},
  ) {
    this.data = {
      channel,
      user_message: message,
      resolved_message: resolvedMessage,
      client_context: safeTraceValue(clientContext),
      operational_detected: operational,
      fallback_considered: false,
      fallback_used: false,
      permission_checked: false,
      ...extra,
    };
  }
  resolution(value: any) {
    Object.assign(this.data, {
      metric_alias_detected: value.metric_alias_detected,
      requested_metric_text: value.requested_metric_text,
      resolver_checked: true,
      resolver_candidate_tools: value.resolved_tool_key
        ? [value.resolved_tool_key]
        : [],
      resolved_source_type: value.resolved_source_type,
      resolved_indicator_id: value.resolved_indicator_id,
      resolved_indicator_name: value.resolved_indicator_name,
      resolved_tool_key: value.resolved_tool_key || null,
    });
  }
  model(functionName: string, toolKey: string, args: unknown) {
    if (!this.data.model_selected_tool_key)
      Object.assign(this.data, {
        model_selected_function_name: functionName,
        model_selected_tool_key: toolKey,
        model_arguments_raw: safeTraceValue(args),
        arguments_before_sanitize: safeTraceValue(args),
      });
  }
  arguments(clean: unknown, normalized: unknown, resolved: unknown) {
    Object.assign(this.data, {
      arguments_after_sanitize: safeTraceValue(clean),
      arguments_after_context_normalization: safeTraceValue(normalized),
      arguments_after_resolver: safeTraceValue(resolved),
    });
  }
  reroute(from: string, to: string, rerouted: boolean, reason?: string) {
    if (rerouted)
      Object.assign(this.data, {
        tool_rerouted: true,
        reroute_reason: reason || `resolver selected ${to} instead of ${from}`,
        rejected_tool_key: from,
        rejected_reason: reason || `resolver selected ${to} instead of ${from}`,
        resolved_tool_key: to,
      });
  }
  reject(key: string, reason?: string) {
    Object.assign(this.data, {
      rejected_tool_key: key,
      rejected_reason: reason || 'resolver rejected model-selected tool',
    });
  }
  invalid(output: unknown) {
    Object.assign(this.data, { invalid_arguments: true, _tool_output: output });
  }
  executed(key: string, output: unknown) {
    Object.assign(this.data, {
      permission_checked: true,
      permission_allowed: true,
      executed_tool_key: key,
      executor_status: 'completed',
      _tool_output: output,
    });
  }
  failed(key: string, permissionDenied: boolean) {
    Object.assign(this.data, {
      permission_checked: true,
      permission_allowed: !permissionDenied,
      executed_tool_key: key,
      executor_status: permissionDenied ? 'blocked' : 'failed',
      _tool_output: { status: 'failed', tool_error: true },
    });
  }
  fallback(
    used: boolean,
    reason: string | null,
    key: string | null = null,
    blocked: string | null = null,
  ) {
    Object.assign(this.data, {
      fallback_considered: true,
      fallback_used: used,
      fallback_reason: reason,
      fallback_tool_key: key,
      fallback_blocked_reason: blocked,
    });
  }
  finish(answer: string, source: string, usedOutput: boolean) {
    Object.assign(this.data, {
      final_answer_source: source,
      final_answer_used_tool_output: usedOutput,
    });
    return finalizeToolDecisionTrace(this.data, answer);
  }
}
