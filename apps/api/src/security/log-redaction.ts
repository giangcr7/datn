const secretField =
  /password|passphrase|secret|private.?key|authorization|cookie|credentials|protectedData|token|api.?key|access.?key|email.?pass/i;

export function redactLogText(value: string): string {
  return value
    .replace(
      /-----BEGIN (?:[A-Z ]*PRIVATE KEY)-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g,
      '[REDACTED PRIVATE KEY]',
    )
    .replace(/\b(Bearer\s+)[^\s,;]+/gi, '$1[REDACTED]')
    .replace(
      /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
      '[REDACTED JWT]',
    )
    .replace(/\bsk-[A-Za-z0-9_-]{10,}/g, '[REDACTED API KEY]')
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[REDACTED]@')
    .replace(
      /((?:password|passphrase|secret|private[_-]?key|api[_-]?key|access[_-]?token|refresh[_-]?token|EMAIL_PASS)[\w-]*["']?\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;}]+)/gi,
      '$1[REDACTED]',
    );
}

export function redactLogValue(
  value: unknown,
  seen = new WeakSet<object>(),
  depth = 0,
): unknown {
  if (typeof value === 'string') return redactLogText(value);
  if (value === null || typeof value !== 'object') return value;
  if (Buffer.isBuffer(value)) return '[REDACTED BUFFER]';
  if (depth > 12 || seen.has(value)) return '[TRUNCATED]';
  seen.add(value);
  if (Array.isArray(value))
    return value.map((entry) => redactLogValue(entry, seen, depth + 1));
  const result: Record<string | symbol, unknown> = {};
  const source = value as Record<string | symbol, unknown>;
  const keys = new Set([
    ...Reflect.ownKeys(value),
    ...(value instanceof Error ? ['message', 'stack', 'name'] : []),
  ]);
  for (const key of keys) {
    result[key] =
      typeof key === 'string' && secretField.test(key)
        ? '[REDACTED]'
        : redactLogValue(source[key], seen, depth + 1);
  }
  return result;
}
