/** An error's message, or the text of a thrown value that is not an Error. */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** An error as text. `fetch failed` says nothing on its own; the cause (ECONNREFUSED, ENOTFOUND, a certificate error) says why. */
export function describeError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const detail = fetchCause(err);
  return detail && !err.message.includes(detail) ? `${err.message} (${detail})` : err.message;
}

/** The code, else the message, of what a failed fetch was caused by. */
export function fetchCause(err: Error): string | undefined {
  const cause = (err as { cause?: { code?: unknown; message?: unknown } }).cause;
  if (typeof cause?.code === 'string') return cause.code;
  return typeof cause?.message === 'string' ? cause.message : undefined;
}
