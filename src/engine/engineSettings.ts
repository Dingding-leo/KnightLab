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
  moveTimeMs: 60,
  depth: null,
  nodes: 3_000,
  multiPv: 1,
  threads: 1,
  hashMb: 16,
}

export const ENGINE_SETTING_LIMITS = {
  elo: { minimum: 1320, maximum: 3190 },
  skillLevel: { minimum: 0, maximum: 20 },
  moveTimeMs: { minimum: 50, maximum: 30_000 },
  depth: { minimum: 1, maximum: 40 },
  nodes: { minimum: 1_000, maximum: 100_000_000 },
  multiPv: { minimum: 1, maximum: 5 },
  threads: { minimum: 1, maximum: 32 },
  hashMb: { minimum: 16, maximum: 4096 },
} as const

export type EngineSettingsField = keyof EngineSettings
export type EngineSettingsPatch = Partial<Record<EngineSettingsField, unknown>>

export type EngineSettingsValidationResult =
  | { valid: true; settings: EngineSettings }
  | { valid: false; field: EngineSettingsField | null; message: string }

export interface EngineSettingsValidationOptions {
  /** The WebAssembly runtime intentionally has a smaller effective Hash cap. */
  maximumHashMb?: number
}

function isEngineProfile(value: unknown): value is EngineProfile {
  return value === 'preset' || value === 'elo' || value === 'custom'
}

/**
 * Settings are UCI integers. Treat a malformed persisted value as absent
 * rather than rounding or clamping it into an expensive valid maximum.
 */
function persistedInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && value >= minimum
    && value <= maximum
    ? value
    : fallback
}

function optionalPersistedInteger(
  value: unknown,
  fallback: number | null,
  minimum: number,
  maximum: number,
): number | null {
  if (value === null) return null
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && value >= minimum
    && value <= maximum
    ? value
    : fallback
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
  const profile = isEngineProfile(candidate.profile) ? candidate.profile : DEFAULT_ENGINE_SETTINGS.profile
  return {
    enginePath: normalizePath(candidate.enginePath),
    profile,
    elo: persistedInteger(candidate.elo, DEFAULT_ENGINE_SETTINGS.elo, ENGINE_SETTING_LIMITS.elo.minimum, ENGINE_SETTING_LIMITS.elo.maximum),
    skillLevel: persistedInteger(candidate.skillLevel, DEFAULT_ENGINE_SETTINGS.skillLevel, ENGINE_SETTING_LIMITS.skillLevel.minimum, ENGINE_SETTING_LIMITS.skillLevel.maximum),
    limitStrength: typeof candidate.limitStrength === 'boolean'
      ? candidate.limitStrength
      : DEFAULT_ENGINE_SETTINGS.limitStrength,
    moveTimeMs: persistedInteger(candidate.moveTimeMs, DEFAULT_ENGINE_SETTINGS.moveTimeMs, ENGINE_SETTING_LIMITS.moveTimeMs.minimum, ENGINE_SETTING_LIMITS.moveTimeMs.maximum),
    depth: optionalPersistedInteger(candidate.depth, DEFAULT_ENGINE_SETTINGS.depth, ENGINE_SETTING_LIMITS.depth.minimum, ENGINE_SETTING_LIMITS.depth.maximum),
    nodes: optionalPersistedInteger(candidate.nodes, DEFAULT_ENGINE_SETTINGS.nodes, ENGINE_SETTING_LIMITS.nodes.minimum, ENGINE_SETTING_LIMITS.nodes.maximum),
    multiPv: persistedInteger(candidate.multiPv, DEFAULT_ENGINE_SETTINGS.multiPv, ENGINE_SETTING_LIMITS.multiPv.minimum, ENGINE_SETTING_LIMITS.multiPv.maximum),
    threads: persistedInteger(candidate.threads, DEFAULT_ENGINE_SETTINGS.threads, ENGINE_SETTING_LIMITS.threads.minimum, ENGINE_SETTING_LIMITS.threads.maximum),
    hashMb: persistedInteger(candidate.hashMb, DEFAULT_ENGINE_SETTINGS.hashMb, ENGINE_SETTING_LIMITS.hashMb.minimum, ENGINE_SETTING_LIMITS.hashMb.maximum),
  }
}

function numericDraft(value: unknown): number | null {
  if (typeof value === 'string') {
    if (!value.trim()) return null
    value = Number(value)
  }
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : null
}

function validDraftInteger(
  value: unknown,
  minimum: number,
  maximum: number,
): number | null {
  const numeric = numericDraft(value)
  return numeric !== null && numeric >= minimum && numeric <= maximum ? numeric : null
}

function numberMessage(label: string, minimum: number, maximum: number, suffix = ''): string {
  return `${label} must be a whole number from ${minimum.toLocaleString()} to ${maximum.toLocaleString()}${suffix}.`
}

function validationError(field: EngineSettingsField | null, message: string): EngineSettingsValidationResult {
  return { valid: false, field, message }
}

/**
 * Validates a user-entered settings patch before React state, storage or an
 * engine request can see it. Unlike persisted normalization, this reports the
 * exact rejected field so the UI can explain why a draft was not saved.
 */
export function validateEngineSettingsPatch(
  current: EngineSettings,
  patch: EngineSettingsPatch,
  options: EngineSettingsValidationOptions = {},
): EngineSettingsValidationResult {
  const next = normalizeEngineSettings(current)
  const browserHashMaximum = options.maximumHashMb === undefined
    ? ENGINE_SETTING_LIMITS.hashMb.maximum
    : Math.min(ENGINE_SETTING_LIMITS.hashMb.maximum, options.maximumHashMb)

  if (!Number.isSafeInteger(browserHashMaximum) || browserHashMaximum < ENGINE_SETTING_LIMITS.hashMb.minimum) {
    return validationError(null, 'The available Hash memory limit is invalid.')
  }

  for (const [rawField, value] of Object.entries(patch)) {
    if (!(rawField in next)) return validationError(null, 'Unknown engine setting.')
    const field = rawField as EngineSettingsField

    switch (field) {
      case 'enginePath': {
        if (value === null) {
          next.enginePath = null
          break
        }
        const path = normalizePath(value)
        if (path === null) return validationError(field, 'Choose a valid Stockfish executable path.')
        next.enginePath = path
        break
      }
      case 'profile':
        if (!isEngineProfile(value)) return validationError(field, 'Choose a supported engine profile.')
        next.profile = value
        break
      case 'limitStrength':
        if (typeof value !== 'boolean') return validationError(field, 'Strength limit must be on or off.')
        next.limitStrength = value
        break
      case 'elo': {
        const parsed = validDraftInteger(value, ENGINE_SETTING_LIMITS.elo.minimum, ENGINE_SETTING_LIMITS.elo.maximum)
        if (parsed === null) return validationError(field, numberMessage('Target Elo', ENGINE_SETTING_LIMITS.elo.minimum, ENGINE_SETTING_LIMITS.elo.maximum))
        next.elo = parsed
        break
      }
      case 'skillLevel': {
        const parsed = validDraftInteger(value, ENGINE_SETTING_LIMITS.skillLevel.minimum, ENGINE_SETTING_LIMITS.skillLevel.maximum)
        if (parsed === null) return validationError(field, numberMessage('Skill level', ENGINE_SETTING_LIMITS.skillLevel.minimum, ENGINE_SETTING_LIMITS.skillLevel.maximum))
        next.skillLevel = parsed
        break
      }
      case 'moveTimeMs': {
        const parsed = validDraftInteger(value, ENGINE_SETTING_LIMITS.moveTimeMs.minimum, ENGINE_SETTING_LIMITS.moveTimeMs.maximum)
        if (parsed === null) return validationError(field, numberMessage('Move time', ENGINE_SETTING_LIMITS.moveTimeMs.minimum, ENGINE_SETTING_LIMITS.moveTimeMs.maximum, ' ms'))
        next.moveTimeMs = parsed
        break
      }
      case 'depth': {
        if (value === null || value === '') {
          next.depth = null
          break
        }
        const parsed = validDraftInteger(value, ENGINE_SETTING_LIMITS.depth.minimum, ENGINE_SETTING_LIMITS.depth.maximum)
        if (parsed === null) return validationError(field, numberMessage('Search depth', ENGINE_SETTING_LIMITS.depth.minimum, ENGINE_SETTING_LIMITS.depth.maximum))
        next.depth = parsed
        break
      }
      case 'nodes': {
        if (value === null || value === '') {
          next.nodes = null
          break
        }
        const parsed = validDraftInteger(value, ENGINE_SETTING_LIMITS.nodes.minimum, ENGINE_SETTING_LIMITS.nodes.maximum)
        if (parsed === null) return validationError(field, numberMessage('Node limit', ENGINE_SETTING_LIMITS.nodes.minimum, ENGINE_SETTING_LIMITS.nodes.maximum))
        next.nodes = parsed
        break
      }
      case 'multiPv': {
        const parsed = validDraftInteger(value, ENGINE_SETTING_LIMITS.multiPv.minimum, ENGINE_SETTING_LIMITS.multiPv.maximum)
        if (parsed === null) return validationError(field, numberMessage('MultiPV lines', ENGINE_SETTING_LIMITS.multiPv.minimum, ENGINE_SETTING_LIMITS.multiPv.maximum))
        next.multiPv = parsed
        break
      }
      case 'threads': {
        const parsed = validDraftInteger(value, ENGINE_SETTING_LIMITS.threads.minimum, ENGINE_SETTING_LIMITS.threads.maximum)
        if (parsed === null) return validationError(field, numberMessage('Threads', ENGINE_SETTING_LIMITS.threads.minimum, ENGINE_SETTING_LIMITS.threads.maximum))
        next.threads = parsed
        break
      }
      case 'hashMb': {
        const parsed = validDraftInteger(value, ENGINE_SETTING_LIMITS.hashMb.minimum, browserHashMaximum)
        if (parsed === null) return validationError(field, numberMessage('Hash memory', ENGINE_SETTING_LIMITS.hashMb.minimum, browserHashMaximum, ' MB'))
        next.hashMb = parsed
        break
      }
    }
  }

  return { valid: true, settings: next }
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
