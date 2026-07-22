import { useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Color } from 'chess.js'
import type { ClockState } from '../domain/clock'
import { ClockSnapshotContext } from './clockRuntimeContext'
import { clockRuntimeFrame } from './clockRuntimeModel'

interface ClockRuntimeProps {
  state: ClockState
  gameFinished: boolean
  onTick: (nowMs: number) => void
  onFlag: (color: Color) => void
  children: ReactNode
}

/**
 * A single display-only timer shared by both player clocks. It is mounted
 * outside the Play tab so a real clock still flags while a player is reading
 * Review or Train, but its local state never re-renders App's board/workspace.
 */
export function ClockRuntime({ state, gameFinished, onTick, onFlag, children }: ClockRuntimeProps) {
  const [nowMs, setNowMs] = useState(() => Date.now())
  const reportedFlag = useRef<Color | null>(null)
  const reportTick = useEffectEvent(onTick)
  const reportFlag = useEffectEvent(onFlag)
  const frame = useMemo(() => clockRuntimeFrame(state, nowMs), [state, nowMs])

  useEffect(() => {
    let timer: ReturnType<typeof window.setTimeout> | null = null
    let disposed = false

    const tick = () => {
      if (disposed) return
      const tickNow = Date.now()
      const nextFrame = clockRuntimeFrame(state, tickNow)
      // The parent keeps this timestamp only for exact terminal persistence;
      // updating a ref here must not rebuild the board or write storage.
      reportTick(tickNow)
      setNowMs(tickNow)

      if (disposed || gameFinished || nextFrame.delayMs === null) return
      timer = window.setTimeout(tick, nextFrame.delayMs)
    }

    tick()
    return () => {
      disposed = true
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [gameFinished, state])

  useEffect(() => {
    const flagged = frame.snapshot.flaggedColor
    if (!flagged) {
      reportedFlag.current = null
      return
    }
    if (reportedFlag.current === flagged) return
    reportedFlag.current = flagged
    reportFlag(flagged)
  }, [frame.snapshot.flaggedColor])

  return <ClockSnapshotContext.Provider value={frame.snapshot}>{children}</ClockSnapshotContext.Provider>
}
