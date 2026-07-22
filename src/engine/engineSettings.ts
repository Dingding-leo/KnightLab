export type EngineProfile = 'preset' | 'elo' | 'custom'

export interface EngineSettings {
  enginePath: string | null
  profile: EngineProfile
  elo: number
  skillLevel: number
  limitStrength: boolean
  moveTimeMs: number
  depth: number | null
  nodes: number | null
  multiPv: number
  threads: number
  hashMb: number
}

export const DEFAULT_ENGINE_SETTINGS: EngineSettings = {
  enginePath: null,
  profile: 'preset',
  elo: 1700,
  skillLevel: 8,
  limitStrength: true,
  moveTimeMs: 250,
  depth: null,
  nodes: 30_000,
  multiPv: 1,
  threads: 1,
  hashMb: 32,
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function boundedInteger(value: unknown, fallback: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Math.round(finiteNumber(value, fallback))))
}

function optionalBoundedInteger(value: unknown, minimum: number, maximum: number): number | null {
  if (value === null || value === undefined || value === '') return null
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number)) return null
  return Math.min(maximum, Math.max(minimum, Math.round(number)))
}

function normalizePath(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const path = value.trim()
  if (
    !path
    || path.length > 4096
    || path.includes('\n')
    || path.includes('\r')
    || path.includes(String.fromCharCode(0))
  ) return null
  return path
}

export function normalizeEngineSettings(value: unknown): EngineSettings {
  if (!value || typeof value !== 'object') return { ...DEFAULT_ENGINE_SETTINGS }
  const candidate = value as Partial<EngineSettings>
  const profile: EngineProfile = ['preset', 'elo', 'custom'].includes(candidate.profile ?? '')
    ? candidate.profile as EngineProfile
    : DEFAULT_ENGINE_SETTINGS.profile
  return {
    enginePath: normalizePath(candidate.enginePath),
    profile,
    elo: boundedInteger(candidate.elo, DEFAULT_ENGINE_SETTINGS.elo, 1320, 3190),
    skillLevel: boundedInteger(candidate.skillLevel, DEFAULT_ENGINE_SETTINGS.skillLevel, 0, 20),
    limitStrength: typeof candidate.limitStrength === 'boolean'
      ? candidate.limitStrength
      : DEFAULT_ENGINE_SETTINGS.limitStrength,
    moveTimeMs: boundedInteger(candidate.moveTimeMs, DEFAULT_ENGINE_SETTINGS.moveTimeMs, 50, 30_000),
    depth: optionalBoundedInteger(candidate.depth, 1, 40),
    nodes: optionalBoundedInteger(candidate.nodes, 1_000, 100_000_000),
    multiPv: boundedInteger(candidate.multiPv, DEFAULT_ENGINE_SETTINGS.multiPv, 1, 5),
    threads: boundedInteger(candidate.threads, DEFAULT_ENGINE_SETTINGS.threads, 1, 32),
    hashMb: boundedInteger(candidate.hashMb, DEFAULT_ENGINE_SETTINGS.hashMb, 16, 4096),
  }
}

export function engineSettingsLabel(settings: EngineSettings): string {
  if (settings.profile === 'preset') return 'Strength preset'
  if (settings.profile === 'elo') return `${settings.elo} Elo · ${settings.moveTimeMs} ms`
  const limits = [
    `${settings.moveTimeMs} ms`,
    settings.depth ? `depth ${settings.depth}` : null,
    settings.nodes ? `${settings.nodes.toLocaleString()} nodes` : null,
  ].filter(Boolean)
  return `Custom · ${limits.join(' · ')}`
}
