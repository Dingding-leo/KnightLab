/**
 * A terminal position is only persisted once during a restored session.
 *
 * This is deliberately separate from a library row ID: two distinct games may
 * finish in the same position, while reopening one existing row must not write
 * a duplicate just because React remounted its terminal-state effect.
 */
export function terminalSessionFingerprint(
  fen: string,
  result: string,
  finished: boolean,
): string | null {
  return finished ? `${fen}-${result}` : null
}
