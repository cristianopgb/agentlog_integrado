export const DATE_FORMATS = [
  'iso_auto',
  'yyyy_mm_dd',
  'yyyy_mm_dd_hh_mm_ss',
  'yyyy_mm_dd_t_hh_mm_ss',
  'dd_mm_yyyy',
  'dd_mm_yyyy_hh_mm_ss',
] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];

const DATE_PATTERNS: Record<Exclude<DateFormat, 'iso_auto'>, string> = {
  yyyy_mm_dd: 'YYYY-MM-DD',
  yyyy_mm_dd_hh_mm_ss: 'YYYY-MM-DD HH:mm:ss',
  yyyy_mm_dd_t_hh_mm_ss: 'YYYY-MM-DDTHH:mm:ss',
  dd_mm_yyyy: 'DD/MM/YYYY',
  dd_mm_yyyy_hh_mm_ss: 'DD/MM/YYYY HH:mm:ss',
};
export type ParseRule = {
  data_type: string;
  date_format: string | null;
  timezone: string | null;
  decimal_separator: string | null;
  thousand_separator: string | null;
  boolean_true_values: string[] | null;
  boolean_false_values: string[] | null;
};
export type ParseResult = { ok: boolean; value: unknown; required?: boolean };

function parts(value: string, format: string) {
  const tokens = format.match(/YYYY|MM|DD|HH|mm|ss|SSS|Z/g) ?? [];
  let pattern = format.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const token of tokens)
    pattern = pattern.replace(
      token,
      token === 'YYYY'
        ? '(\\d{4})'
        : token === 'SSS'
          ? '(\\d{3})'
          : token === 'Z'
            ? '(Z|[+-]\\d{2}:?\\d{2})'
            : '(\\d{2})',
    );
  const match = value.match(new RegExp(`^${pattern}$`));
  if (!match) return null;
  return Object.fromEntries(
    tokens.map((token, index) => [token, match[index + 1]]),
  );
}
function valid(y: number, m: number, d: number, h = 0, min = 0, s = 0, ms = 0) {
  const x = new Date(Date.UTC(y, m - 1, d, h, min, s, ms));
  return (
    x.getUTCFullYear() === y &&
    x.getUTCMonth() === m - 1 &&
    x.getUTCDate() === d &&
    h < 24 &&
    min < 60 &&
    s < 60
  );
}
function zonedIso(
  y: number,
  m: number,
  d: number,
  h: number,
  min: number,
  s: number,
  ms: number,
  timezone: string,
) {
  if (timezone === 'UTC')
    return new Date(Date.UTC(y, m - 1, d, h, min, s, ms)).toISOString();
  try {
    let utc = Date.UTC(y, m - 1, d, h, min, s, ms);
    for (let i = 0; i < 2; i++) {
      const values = Object.fromEntries(
        new Intl.DateTimeFormat('en-CA', {
          timeZone: timezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hourCycle: 'h23',
        })
          .formatToParts(new Date(utc))
          .filter((p) => p.type !== 'literal')
          .map((p) => [p.type, Number(p.value)]),
      );
      const represented = Date.UTC(
        values.year,
        values.month - 1,
        values.day,
        values.hour,
        values.minute,
        values.second,
        ms,
      );
      utc += Date.UTC(y, m - 1, d, h, min, s, ms) - represented;
    }
    return new Date(utc).toISOString();
  } catch {
    return null;
  }
}
function parseDate(
  value: string,
  format: string,
  timezone: string,
  type: string,
): ParseResult {
  const p = parts(value, format);
  if (!p) return { ok: false, value };
  const regional = format.startsWith('DD/') || format.startsWith('MM/');
  const y = Number(p.YYYY),
    m = Number(regional ? (format.startsWith('DD/') ? p.MM : p.MM) : p.MM),
    d = Number(regional ? (format.startsWith('DD/') ? p.DD : p.DD) : p.DD),
    h = Number(p.HH ?? 0),
    min = Number(p.mm ?? 0),
    s = Number(p.ss ?? 0),
    ms = Number(p.SSS ?? 0);
  if (!valid(y, m, d, h, min, s, ms)) return { ok: false, value };
  if (type === 'date')
    return {
      ok: true,
      value: `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
    };
  if (p.Z) {
    const iso = new Date(value).toISOString();
    return { ok: true, value: iso };
  }
  const iso = zonedIso(y, m, d, h, min, s, ms, timezone);
  return { ok: Boolean(iso), value: iso ?? value };
}
function parseIsoAuto(value: string, timezone: string, type: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value))
    return parseDate(value, 'YYYY-MM-DD', timezone, type);
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value))
    return parseDate(value, 'YYYY-MM-DD HH:mm:ss', timezone, type);
  if (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:?\d{2})?$/.test(
      value,
    )
  ) {
    if (/(?:Z|[+-]\d{2}:?\d{2})$/.test(value)) {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime()))
        return {
          ok: true,
          value: type === 'date' ? value.slice(0, 10) : parsed.toISOString(),
        };
    }
    return parseDate(
      value,
      value.includes('.') ? 'YYYY-MM-DDTHH:mm:ss.SSS' : 'YYYY-MM-DDTHH:mm:ss',
      timezone,
      type,
    );
  }
  return { ok: false, value };
}
export function parseFieldValue(value: unknown, rule: ParseRule): ParseResult {
  const type = rule.data_type;
  if (type === 'date' || type === 'datetime') {
    if (typeof value !== 'string') return { ok: false, value };
    if (!rule.date_format) return { ok: false, value, required: true };
    if (rule.date_format === 'iso_auto')
      return parseIsoAuto(value, rule.timezone ?? 'UTC', type);
    const pattern =
      DATE_PATTERNS[rule.date_format as keyof typeof DATE_PATTERNS];
    return pattern
      ? parseDate(value, pattern, rule.timezone ?? 'UTC', type)
      : { ok: false, value };
  }
  if (['decimal', 'number', 'integer'].includes(type)) {
    if (typeof value === 'number')
      return {
        ok:
          Number.isFinite(value) &&
          (type !== 'integer' || Number.isInteger(value)),
        value,
      };
    if (typeof value !== 'string') return { ok: false, value };
    const decimal = rule.decimal_separator;
    const thousand = rule.thousand_separator ?? '';
    if (!decimal && /[.,]/.test(value))
      return { ok: false, value, required: true };
    let normalized = value.trim();
    if (thousand) {
      const escaped = thousand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      normalized = normalized.replace(new RegExp(escaped, 'g'), '');
    }
    if (decimal && decimal !== '.')
      normalized = normalized.replace(decimal, '.');
    const ok =
      /^[-+]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(normalized) &&
      Number.isFinite(Number(normalized)) &&
      (type !== 'integer' || Number.isInteger(Number(normalized)));
    return { ok, value: ok ? Number(normalized) : value };
  }
  if (type === 'boolean' && typeof value === 'string') {
    if (rule.boolean_true_values?.includes(value))
      return { ok: true, value: true };
    if (rule.boolean_false_values?.includes(value))
      return { ok: true, value: false };
  }
  if (type === 'boolean' && typeof value === 'boolean')
    return { ok: true, value };
  return { ok: false, value };
}
