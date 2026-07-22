export type ResponseStyle = Record<string, unknown>;

/** Reads persisted JSONB safely, including legacy rows serialized as JSON strings. */
export function getResponseStyle(agent: Record<string, unknown> | null | undefined): ResponseStyle {
  const value = agent?.response_style;
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as ResponseStyle;
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as ResponseStyle;
    } catch {
      // A malformed legacy value must not prevent the configured agent from running.
    }
  }
  return {};
}
