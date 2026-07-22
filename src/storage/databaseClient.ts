import { invoke as tauriInvoke } from '@tauri-apps/api/core'
import {
  hasValidBotProfileField,
  hasValidPlayerSideFields,
  normalizeActiveSession,
  type ActiveSession,
  type Preferences,
  type StoredGame,
} from './gameStore'
import { assertPersistedReview, type PersistedReview } from '../review/reviewPersistence'
import {
  MAX_RETRY_ITEMS,
  assertRetryItem,
  compareRetryItems,
  isRetryKey,
  type RetryItem,
} from '../review/retry'
import {
  assertTacticsAttempt,
  assertTacticsProgress,
  assertTacticsState,
  type TacticsAttempt,
  type TacticsProgress,
  type TacticsState,
} from '../tactics/tacticsPersistence'

const CURRENT_SCHEMA_VERSION = 5
const MAX_GAMES = 500
const MAX_STATE_BYTES = 1_048_576
const MAX_GAME_BYTES = 1_048_576

type Invoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>

export interface DatabaseSnapshot {
  schemaVersion: number
  activeSession: ActiveSession | null
  preferences: Preferences | null
  games: StoredGame[]
  recoveryBackupPath: string | null
}

export interface LegacyDatabaseImport {
  activeSession: ActiveSession | null
  preferences: Preferences | null
  games: StoredGame[]
}

const defaultInvoke: Invoke = (command, args) => tauriInvoke(command, args)

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStoredGame(value: unknown): value is StoredGame {
  if (!isObject(value)) return false
  return typeof value.id === 'string'
    && value.id.length > 0
    && typeof value.playedAt === 'string'
    && typeof value.mode === 'string'
    && typeof value.result === 'string'
    && typeof value.pgn === 'string'
    && typeof value.finalFen === 'string'
    && Number.isInteger(value.moveCount)
    && Number(value.moveCount) >= 0
    && Number(value.moveCount) <= 100_000
    && hasValidPlayerSideFields(value)
    && hasValidBotProfileField(value)
}

function isActiveSession(value: unknown): value is ActiveSession {
  return normalizeActiveSession(value) !== null
}

function jsonSize(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength
}

function assertState(label: string, value: unknown): void {
  if (!isObject(value) || jsonSize(value) > MAX_STATE_BYTES) {
    throw new Error(`${label} is invalid or too large.`)
  }
}

function assertActiveSession(value: unknown): asserts value is ActiveSession {
  if (!isActiveSession(value) || jsonSize(value) > MAX_STATE_BYTES) {
    throw new Error('Active session is invalid or too large.')
  }
}

function assertGame(value: unknown): asserts value is StoredGame {
  if (!isStoredGame(value) || jsonSize(value) > MAX_GAME_BYTES) {
    throw new Error('Saved game is invalid or too large.')
  }
}

function parseSnapshot(value: unknown): DatabaseSnapshot {
  if (!isObject(value)
    || value.schemaVersion !== CURRENT_SCHEMA_VERSION
    || !(value.activeSession === null || isActiveSession(value.activeSession))
    || !(value.preferences === null || isObject(value.preferences))
    || !Array.isArray(value.games)
    || value.games.length > MAX_GAMES
    || !value.games.every(isStoredGame)
    || !(value.recoveryBackupPath === null || typeof value.recoveryBackupPath === 'string')) {
    throw new Error('KnightClub received an invalid database snapshot.')
  }
  return value as unknown as DatabaseSnapshot
}

export class DatabaseClient {
  private readonly invoke: Invoke
  private writeQueue: Promise<void> = Promise.resolve()

  constructor(invoke: Invoke = defaultInvoke) {
    this.invoke = invoke
  }

  async snapshot(): Promise<DatabaseSnapshot> {
    return parseSnapshot(await this.invoke('database_snapshot'))
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.writeQueue.then(operation)
    this.writeQueue = result.then(() => undefined, () => undefined)
    return result
  }

  async importLegacy(legacy: LegacyDatabaseImport): Promise<boolean> {
    if (legacy.activeSession !== null) assertActiveSession(legacy.activeSession)
    if (legacy.preferences !== null) assertState('Preferences', legacy.preferences)
    if (legacy.games.length > MAX_GAMES) throw new Error('Game library exceeds 500 games.')
    legacy.games.forEach(assertGame)
    return this.enqueue(async () => Boolean(await this.invoke('database_import_legacy', { legacy })))
  }

  async saveActiveSession(activeSession: ActiveSession): Promise<void> {
    assertActiveSession(activeSession)
    await this.enqueue(() => this.invoke('database_save_active_session', { activeSession }).then(() => undefined))
  }

  async savePreferences(preferences: Preferences): Promise<void> {
    assertState('Preferences', preferences)
    await this.enqueue(() => this.invoke('database_save_preferences', { preferences }).then(() => undefined))
  }

  async saveGame(game: StoredGame): Promise<void> {
    assertGame(game)
    await this.enqueue(() => this.invoke('database_save_game', { game }).then(() => undefined))
  }

  async saveReview(review: PersistedReview): Promise<void> {
    assertPersistedReview(review)
    await this.enqueue(() => this.invoke('database_save_review', { review }).then(() => undefined))
  }

  async loadReview(reviewKey: string): Promise<PersistedReview | null> {
    if (!/^[0-9a-f]{16}$/.test(reviewKey)) throw new Error('Review key is invalid.')
    const value = await this.invoke('database_load_review', { reviewKey })
    if (value === null) return null
    assertPersistedReview(value)
    if (value.reviewKey !== reviewKey) throw new Error('KnightClub received a mismatched saved review.')
    return value
  }

  async saveRetryItem(retryItem: RetryItem): Promise<void> {
    assertRetryItem(retryItem)
    await this.enqueue(() => this.invoke('database_save_retry_item', { retryItem }).then(() => undefined))
  }

  async loadRetryItem(retryKey: string): Promise<RetryItem | null> {
    if (!isRetryKey(retryKey)) throw new Error('Retry key is invalid.')
    const value = await this.invoke('database_load_retry_item', { retryKey })
    if (value === null) return null
    assertRetryItem(value)
    if (value.retryKey !== retryKey) throw new Error('KnightClub received a mismatched saved retry item.')
    return value
  }

  async listRetryItems(): Promise<RetryItem[]> {
    const value = await this.invoke('database_list_retry_items')
    if (!Array.isArray(value) || value.length > MAX_RETRY_ITEMS) {
      throw new Error('KnightClub received an invalid retry queue.')
    }
    value.forEach(assertRetryItem)
    const keys = new Set(value.map((item) => item.retryKey))
    if (keys.size !== value.length) throw new Error('KnightClub received duplicate retry items.')
    return [...value].sort(compareRetryItems)
  }

  async deleteRetryItem(retryKey: string): Promise<boolean> {
    if (!isRetryKey(retryKey)) throw new Error('Retry key is invalid.')
    return this.enqueue(async () => Boolean(await this.invoke('database_delete_retry_item', { retryKey })))
  }

  async listTacticsState(): Promise<TacticsState> {
    const value = await this.invoke('database_list_tactics_state')
    assertTacticsState(value)
    return value
  }

  /** Startup-only browser/native reconciliation; native returns its canonical envelope. */
  async mergeTacticsState(tactics: TacticsState): Promise<TacticsState> {
    assertTacticsState(tactics)
    return this.enqueue(async () => {
      const value = await this.invoke('database_merge_tactics_state', { tactics })
      assertTacticsState(value)
      return value
    })
  }

  /** Keeps immutable history and its successor schedule in one native transaction. */
  async recordTacticsAttempt(progress: TacticsProgress, attempt: TacticsAttempt): Promise<TacticsState> {
    assertTacticsProgress(progress)
    assertTacticsAttempt(attempt)
    return this.enqueue(async () => {
      const value = await this.invoke('database_record_tactics_attempt', { progress, attempt })
      assertTacticsState(value)
      return value
    })
  }

  async clearActiveSession(): Promise<void> {
    await this.enqueue(() => this.invoke('database_clear_active_session').then(() => undefined))
  }

  async clearGames(): Promise<void> {
    await this.enqueue(() => this.invoke('database_clear_games').then(() => undefined))
  }
}
