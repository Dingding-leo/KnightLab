import { createContext, useContext } from 'react'
import type { ClockSnapshot } from '../domain/clock'

export const ClockSnapshotContext = createContext<ClockSnapshot | null>(null)

export function useClockSnapshot(): ClockSnapshot {
  const snapshot = useContext(ClockSnapshotContext)
  if (!snapshot) throw new Error('Player clocks must be rendered inside ClockRuntime.')
  return snapshot
}
