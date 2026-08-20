const primaryLogisticKeys = new Set([
  'delivery_number',
  'document_number',
  'invoice_number',
  'cte_number',
  'manifest_number',
  'order_number',
]);

export function isTenantLogisticKeySetting(value) {
  return Boolean(
    value &&
    !Array.isArray(value) &&
    typeof value === 'object' &&
    typeof value.tenant_id === 'string' &&
    primaryLogisticKeys.has(value.primary_logistic_key) &&
    (value.established_by_data_source_id === null ||
      typeof value.established_by_data_source_id === 'string') &&
    typeof value.established_at === 'string',
  );
}

export function normalizeTenantLogisticKeySetting(response) {
  if (response === null) return null;
  if (Array.isArray(response) && response.length === 0) return null;
  if (Array.isArray(response) && response.length !== 1)
    throw new Error('Resposta inválida ao consultar a chave logística oficial.');
  const candidate = Array.isArray(response) ? response[0] : response;
  if (isTenantLogisticKeySetting(candidate)) return candidate;
  throw new Error('Resposta inválida ao consultar a chave logística oficial.');
}
