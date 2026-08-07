export function formatCurrencyBRL(value: unknown) {
  const amount = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(amount)) return '—';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(amount);
}

export function formatDateTimeBR(value: unknown) {
  if (typeof value !== 'string' || !value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const hasTime = /T\d{2}:\d{2}/.test(value);
  return new Intl.DateTimeFormat(
    'pt-BR',
    hasTime
      ? { dateStyle: 'short', timeStyle: 'short' }
      : { dateStyle: 'short' },
  ).format(date);
}

export function shortId(id: unknown) {
  const value = typeof id === 'string' ? id.trim() : '';
  return value ? value.slice(0, 8) : '—';
}

export function safeLinkLabel(kind: 'document' | 'evidence') {
  return kind === 'document' ? 'Abrir documento' : 'Abrir evidência';
}
