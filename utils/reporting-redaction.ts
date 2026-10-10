/** Allowlist projection: task text, tokens, users, URLs, locals and breadcrumbs never leave the client. */
export function redactEvent<T extends object>(input: T): T {
  const event = input as Record<string, unknown>;
  const clean: Record<string, unknown> = {};
  for (const key of ['event_id', 'timestamp', 'platform', 'level', 'release', 'environment']) {
    if (event[key] !== undefined) clean[key] = event[key];
  }
  const exception = event.exception as { values?: { type?: string; stacktrace?: { frames?: Record<string, unknown>[] } }[] } | undefined;
  if (exception?.values) {
    clean.exception = { values: exception.values.map((value) => ({
      type: /^[\w.]{1,80}$/.test(value.type ?? '') ? value.type : 'Error',
      value: '[redacted]',
      stacktrace: { frames: (value.stacktrace?.frames ?? []).map((frame) => {
        const safe: Record<string, unknown> = {};
        for (const key of ['lineno', 'colno', 'in_app']) if (frame[key] !== undefined) safe[key] = frame[key];
        const filename = String(frame.filename ?? '').split('?')[0].split('/').pop() ?? '';
        if (/^[\w.-]{1,100}$/.test(filename)) safe.filename = filename;
        return safe;
      }) },
    })) };
  } else clean.message = 'Flowi operational event';
  return clean as T;
}
