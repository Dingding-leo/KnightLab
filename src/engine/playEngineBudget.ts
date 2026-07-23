import type { BotLevel } from '../domain/chess'
import {
  normalizeEngineSettings,
  type EngineSettings,
} from './engineSettings'

/**
 * Play is intentionally a different workload from interactive analysis.
 * These caps keep a local bot reply short, single-threaded and small enough
 * to leave the board responsive even when a user has configured a stronger
 * Review engine.
 */
export const PLAY_ENGINE_BUDGETS: Readonly<Record<BotLevel, Readonly<{
  moveTimeMs: number
  nodes: number
}>>> = {
  easy: { moveTimeMs: 50, nodes: 1_000 },
  balanced: { moveTimeMs: 60, nodes: 3_000 },
  strong: { moveTimeMs: 90, nodes: 7_000 },
}

/**
 * Produces the bounded settings used by a live bot move. Preserve the
 * normalized strength identity (profile, Elo, skill and limit flag), while
 * constraining only the resources that can make ordinary Play expensive.
 *
 * A player may deliberately choose a smaller valid time or node budget. A
 * missing node limit never means an unlimited Play search: it becomes the
 * selected bot level's finite cap.
 */
export function resolvePlayEngineBudget(
  level: BotLevel,
  settings: EngineSettings,
): EngineSettings {
  const normalized = normalizeEngineSettings(settings)
  const budget = PLAY_ENGINE_BUDGETS[level]

  return {
    ...normalized,
    moveTimeMs: Math.min(normalized.moveTimeMs, budget.moveTimeMs),
    nodes: normalized.nodes === null ? budget.nodes : Math.min(normalized.nodes, budget.nodes),
    depth: null,
    multiPv: 1,
    threads: 1,
    hashMb: 16,
  }
}
