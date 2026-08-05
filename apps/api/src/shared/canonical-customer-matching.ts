const legalSuffixes = new Set([
  'ltda','limitada','sa','s a','s/a','eireli','me','mei','epp','ss','s s','s/s','spe','scp','ei','sl','cia','companhia','corp','corporacao','inc','llc','lp','llp','plc','co','company','grupo','holding','participacoes','participacao','comercio','industria','servicos','transportes'
]);

export type CanonicalNameMatch = { input_value:string; matched_value:string; operator:'igual a'; match_type:'normalized_exact'|'normalized_alias' };
export type CanonicalNameAmbiguity = { input_value:string; ambiguous_candidates:string[]; match_type:'ambiguous_normalized_exact'|'ambiguous_normalized_alias' };
export type CanonicalNameResolution = CanonicalNameMatch | CanonicalNameAmbiguity | null;

export function normalizeCanonicalName(value: unknown) {
  return String(value ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' e ')
    .replace(/\b(s)\s*[./]\s*(a)\b/g, 'sa')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeCanonicalCustomerName(value: unknown) {
  const tokens = normalizeCanonicalName(value).split(' ').filter(Boolean);
  while (tokens.length && legalSuffixes.has(tokens[tokens.length - 1])) tokens.pop();
  return tokens.join(' ');
}

export function resolveCanonicalCustomerName(input: unknown, rows: Array<Record<string, unknown>>): CanonicalNameResolution {
  const raw = String(input ?? '').trim();
  if (!raw) return null;
  const normalized = normalizeCanonicalCustomerName(raw);
  const exact = normalizeCanonicalName(raw);
  const names = [...new Set(rows.map(row => String(row.customer_name ?? '').trim()).filter(Boolean))];
  const exactMatches = names.filter(name => normalizeCanonicalName(name) === exact);
  if (exactMatches.length === 1) return { input_value: raw, matched_value: exactMatches[0], operator: 'igual a', match_type: 'normalized_exact' };
  if (exactMatches.length > 1) return { input_value: raw, ambiguous_candidates: exactMatches.slice(0, 10), match_type: 'ambiguous_normalized_exact' };
  const aliasMatches = names.filter(name => {
    const candidate = normalizeCanonicalCustomerName(name);
    return candidate === normalized || candidate.startsWith(`${normalized} `) || normalized.startsWith(`${candidate} `);
  });
  if (aliasMatches.length === 1) return { input_value: raw, matched_value: aliasMatches[0], operator: 'igual a', match_type: 'normalized_alias' };
  if (aliasMatches.length > 1) return { input_value: raw, ambiguous_candidates: aliasMatches.slice(0, 10), match_type: 'ambiguous_normalized_alias' };
  return null;
}

export function isCanonicalNameAmbiguous(value: CanonicalNameResolution): value is CanonicalNameAmbiguity {
  return Boolean(value && 'ambiguous_candidates' in value);
}

export function isCanonicalNameMatch(value: CanonicalNameResolution): value is CanonicalNameMatch {
  return Boolean(value && 'matched_value' in value);
}
