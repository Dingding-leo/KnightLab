import { useMemo } from 'react'
import { BarChart3, Search, Target } from 'lucide-react'
import { calculateLocalInsights, formatRecord, type RecordSummary } from '../domain/insights'
import type { StoredGame } from '../storage/gameStore'
import { StatCard } from './StatCard'

interface InsightsDashboardProps {
  games: readonly StoredGame[]
  onPlay: () => void
  onReviewGame: (game: StoredGame) => void
}

function scoreLabel(record: RecordSummary): string {
  return record.scorePercent === null ? '—' : `${record.scorePercent}%`
}

function recordDetail(record: RecordSummary): string {
  return record.played ? `${formatRecord(record)} · ${record.played} game${record.played === 1 ? '' : 's'}` : 'No attributed bot games yet'
}

function segmentRecord(record: RecordSummary): string {
  return record.played ? formatRecord(record) : 'No personal result'
}

export function InsightsDashboard({ games, onPlay, onReviewGame }: InsightsDashboardProps) {
  const summary = useMemo(() => calculateLocalInsights(games), [games])
  const nextReview = useMemo(
    () => summary.latestUnreviewedId ? games.find((game) => game.id === summary.latestUnreviewedId) ?? null : null,
    [games, summary.latestUnreviewedId],
  )

  if (!summary.completedGames) {
    return (
      <section className="insights-dashboard" aria-label="Local performance insights">
        <article className="content-card content-card--wide insights-empty">
          <div className="feature-icon"><BarChart3 size={24} /></div>
          <div>
            <span className="eyebrow">Private performance</span>
            <h2>Your first game starts the picture</h2>
            <p>Finish a local game and KnightClub will build this dashboard from the games stored on this device. Nothing is uploaded or inferred from sample data.</p>
            <button className="primary-button" type="button" onClick={onPlay}><Target size={16} />Play a game</button>
          </div>
        </article>
      </section>
    )
  }

  return (
    <section className="insights-dashboard" aria-label="Local performance insights">
      <div className="stats-grid insights-dashboard__stats">
        <StatCard
          label="Finished games"
          value={summary.completedGames}
          detail={summary.unfinishedGames ? `${summary.unfinishedGames} incomplete save${summary.unfinishedGames === 1 ? '' : 's'} excluded` : `${summary.averagePly} ply average`}
        />
        <StatCard label="Personal record" value={summary.personal.played ? formatRecord(summary.personal) : '—'} detail={recordDetail(summary.personal)} />
        <StatCard label="Score" value={scoreLabel(summary.personal)} detail="Wins count 1 · draws ½" />
        <StatCard label="Review coverage" value={summary.reviewCoverage === null ? '—' : `${summary.reviewCoverage}%`} detail={`${summary.reviewedGames} reviewed · ${summary.pendingReviews} ready`} />
        <StatCard label="Play streak" value={`${summary.currentPlayStreak} day${summary.currentPlayStreak === 1 ? '' : 's'}`} detail="Finished-game activity" />
      </div>

      <div className="insights-dashboard__grid">
        <article className="content-card insights-panel insights-panel--record">
          <div className="insights-panel__heading">
            <div><span className="eyebrow">Your bot games</span><h2>Results by colour</h2></div>
            <BarChart3 size={20} aria-hidden="true" />
          </div>
          <div className="insights-colours">
            <div>
              <span>As White</span>
              <strong>{summary.byColor.white.played ? formatRecord(summary.byColor.white) : '—'}</strong>
              <small>{recordDetail(summary.byColor.white)}</small>
            </div>
            <div>
              <span>As Black</span>
              <strong>{summary.byColor.black.played ? formatRecord(summary.byColor.black) : '—'}</strong>
              <small>{recordDetail(summary.byColor.black)}</small>
            </div>
          </div>
          <p className="insights-note">Only completed bot games with a saved player colour contribute to your record. Hot-seat and older unattributed games remain in activity totals without guessing whose result they were.</p>
        </article>

        <article className="content-card insights-panel insights-panel--next">
          <div className="insights-panel__heading">
            <div><span className="eyebrow">Next useful step</span><h2>{summary.pendingReviews ? 'Turn a game into a lesson' : 'Your reviews are up to date'}</h2></div>
            <Search size={20} aria-hidden="true" />
          </div>
          {summary.pendingReviews ? (
            <>
              <p>{summary.pendingReviews} finished game{summary.pendingReviews === 1 ? ' is' : 's are'} waiting for a local Stockfish review. Start with the most recent one to keep your practice queue current.</p>
              {nextReview && <button className="primary-button" type="button" onClick={() => onReviewGame(nextReview)}><Search size={16} />Review latest game</button>}
            </>
          ) : (
            <>
              <p>Every finished game in this local library has a saved review. Play another game whenever you want a fresh data point.</p>
              <button className="secondary-button" type="button" onClick={onPlay}><Target size={16} />Play a game</button>
            </>
          )}
        </article>

        <article className="content-card insights-panel">
          <div className="insights-panel__heading"><div><span className="eyebrow">Time controls</span><h2>Where you play</h2></div></div>
          <div className="insights-segments" aria-label="Performance by time control">
            {summary.timeControls.slice(0, 5).map((segment) => (
              <div key={segment.key} className="insights-segment">
                <div><strong>{segment.label}</strong><small>{segment.games} completed game{segment.games === 1 ? '' : 's'}</small></div>
                <span>{segmentRecord(segment.record)}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="content-card insights-panel">
          <div className="insights-panel__heading"><div><span className="eyebrow">Bot levels</span><h2>Challenge history</h2></div></div>
          {summary.botLevels.length ? (
            <div className="insights-segments" aria-label="Performance by bot level">
              {summary.botLevels.map((segment) => (
                <div key={segment.key} className="insights-segment">
                  <div><strong>{segment.label}</strong><small>{segment.games} completed game{segment.games === 1 ? '' : 's'}</small></div>
                  <span>{segmentRecord(segment.record)}</span>
                </div>
              ))}
            </div>
          ) : <p className="insights-note">Finish a bot game to see how your results change with the selected local strength.</p>}
        </article>
      </div>
    </section>
  )
}
