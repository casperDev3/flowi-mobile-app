/** Keep only locally changed text; never retain cached project/finance payloads. */
export function authoredText(local: Record<string, unknown>, base: Record<string, unknown> = {}): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of ['title', 'description', 'body', 'text', 'resultSummary']) {
    if (typeof local[key] === 'string' && local[key] !== base[key]) result[key] = local[key] as string;
  }
  return result;
}
