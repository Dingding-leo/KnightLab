/**
 * Local-only statistics derived from completed saved games.
 *
 * A hot-seat game has no durable player identity, and legacy bot records may
 * not know which colour the user played. Those games stay visible in activity
 * totals but are deliberately excluded from personal wins/draws/losses.
 */
export interface InsightGame {
  id: string
  playedAt: string
  mode: 'bot' | 'local'
  result: string
  moveCount: number
  reviewed?: boolean
  humanColor?: 'w' | 'b'
  botLevel?: 'easy' | 'balanced' | 'strong'
  timeControl?: { label?: string | null }
}

export type GameOutcome = 'win' | 'draw' | 'loss'

export interface RecordSummary {
  played: number
  wins: number
  draws: number
  losses: number
  /** Chess-score percentage: wins count as 1 and draws as 0.5. */
  scorePercent: number | null
}

export interface InsightSegment {
  key: string
  label: string
  games: number
  record: RecordSummary
}

export interface LocalInsights {
  savedGames: number
  completedGames: number
  unfinishedGames: number
  averagePly: number
  personal: RecordSummary
  byColor: {
    white: RecordSummary
    black: RecordSummary
  }
  reviewedGames: number
  pendingReviews: number
  reviewCoverage: number | null
  currentPlayStreak: number
  timeControls: InsightSegment[]
  botLevels: InsightSegment[]
  latestUnreviewedId: string | null
}

interface MutableRecord {
  played: number
  wins: number
  draws: number
  losses: number
}

interface MutableSegment {
  key: string
  label: string
  games: number
  record: MutableRecord
}

const FINAL_RESULTS = new Set(['1-0', '0-1', '1/2-1/2'])

function emptyRecord(): MutableRecord {
  return { played: 0, wins: 0, draws: 0, losses: 0 }
}

function summarizeRecord(record: MutableRecord): RecordSummary {
  const score = record.wins + record.draws * 0.5
  return {
    ...record,
    scorePercent: record.played ? Math.round((score / record.played) * 100) : null,
  }
}

function addOutcome(record: MutableRecord, outcome: GameOutcome | null): void {
  if (!outcome) return
  record.played += 1
  if (outcome === 'win') record.wins += 1
  else if (outcome === 'draw') record.draws += 1
  else record.losses += 1
}

function isCompletedGame(game: InsightGame): boolean {
  return game.moveCount > 0 && FINAL_RESULTS.has(game.result)
}

function playerOutcome(game: InsightGame): GameOutcome | null {
  if (game.mode !== 'bot' || (game.humanColor !== 'w' && game.humanColor !== 'b')) return null
  if (game.result === '1/2-1/2') return 'draw'
  if (game.result === '1-0') return game.humanColor === 'w' ? 'win' : 'loss'
  if (game.result === '0-1') return game.humanColor === 'b' ? 'win' : 'loss'
  return null
}

function timeControlLabel(game: InsightGame): string {
  const label = game.timeControl?.label?.trim()
  return label && label.length <= 120 ? label : 'Unlimited / legacy'
}

function timestamp(value: string): number {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY
}

function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

function completedLocalDays(games: readonly InsightGame[]): Set<string> {
  const days = new Set<string>()
  for (const game of games) {
    if (!isCompletedGame(game)) continue
    const ms = timestamp(game.playedAt)
    if (!Number.isFinite(ms)) continue
    days.add(localDayKey(new Date(ms)))
  }
  return days
}

/**
 * Counts a streak ending today, or yesterday when the user has not played yet
 * today. Dates intentionally use the device's local calendar, matching how a
 * player experiences a daily streak.
 */
function playStreak(days: ReadonlySet<string>, asOf: Date): number {
  const today = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate())
  if (!days.has(localDayKey(today))) today.setDate(today.getDate() - 1)

  let streak = 0
  const cursor = new Date(today)
  while (days.has(localDayKey(cursor))) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

function finalizeSegments(segments: Iterable<MutableSegment>): InsightSegment[] {
  return [...segments]
    .map((segment) => ({
      key: segment.key,
      label: segment.label,
      games: segment.games,
      record: summarizeRecord(segment.record),
    }))
    .sort((left, right) => right.games - left.games || left.label.localeCompare(right.label))
}

function addSegment(
  segments: Map<string, MutableSegment>,
  key: string,
  label: string,
  outcome: GameOutcome | null,
): void {
  const segment = segments.get(key) ?? { key, label, games: 0, record: emptyRecord() }
  segment.games += 1
  addOutcome(segment.record, outcome)
  segments.set(key, segment)
}

/** Builds an honest private dashboard from the games already saved on-device. */
export function calculateLocalInsights(games: readonly InsightGame[], asOf = new Date()): LocalInsights {
  const completed = games.filter(isCompletedGame)
  const personal = emptyRecord()
  const white = emptyRecord()
  const black = emptyRecord()
  const timeControls = new Map<string, MutableSegment>()
  const botLevels = new Map<string, MutableSegment>()
  let reviewedGames = 0
  let latestUnreviewedId: string | null = null
  let latestUnreviewedTime = Number.NEGATIVE_INFINITY

  for (const game of completed) {
    const outcome = playerOutcome(game)
    addOutcome(personal, outcome)
    if (game.humanColor === 'w') addOutcome(white, outcome)
    if (game.humanColor === 'b') addOutcome(black, outcome)

    const controlLabel = timeControlLabel(game)
    addSegment(timeControls, controlLabel, controlLabel, outcome)
    if (game.mode === 'bot' && game.botLevel) addSegment(botLevels, game.botLevel, game.botLevel[0].toUpperCase() + game.botLevel.slice(1), outcome)

    if (game.reviewed) {
      reviewedGames += 1
    } else {
      const playedAt = timestamp(game.playedAt)
      if (playedAt > latestUnreviewedTime) {
        latestUnreviewedTime = playedAt
        latestUnreviewedId = game.id
      }
    }
  }

  const pendingReviews = completed.length - reviewedGames
  return {
    savedGames: games.length,
    completedGames: completed.length,
    unfinishedGames: games.length - completed.length,
    averagePly: completed.length
      ? Math.round(completed.reduce((total, game) => total + game.moveCount, 0) / completed.length)
      : 0,
    personal: summarizeRecord(personal),
    byColor: { white: summarizeRecord(white), black: summarizeRecord(black) },
    reviewedGames,
    pendingReviews,
    reviewCoverage: completed.length ? Math.round((reviewedGames / completed.length) * 100) : null,
    currentPlayStreak: playStreak(completedLocalDays(completed), asOf),
    timeControls: finalizeSegments(timeControls.values()),
    botLevels: finalizeSegments(botLevels.values()),
    latestUnreviewedId,
  }
}

export function formatRecord(record: RecordSummary): string {
  return `${record.wins}W · ${record.draws}D · ${record.losses}L`
}
