/**
 * Small mutable gate for UI work that starts asynchronously but must never let
 * an older result overwrite a newer player action.
 */
export interface LatestRequestGate {
  begin: () => number
  invalidate: () => void
  isCurrent: (requestId: number) => boolean
}

export function createLatestRequestGate(): LatestRequestGate {
  let version = 0

  return {
    begin: () => {
      version += 1
      return version
    },
    invalidate: () => { version += 1 },
    isCurrent: (requestId) => requestId === version,
  }
}
