import { useEffect, useMemo, useRef, useState } from 'react'
import { Chess, type PieceSymbol, type Square } from 'chess.js'
import './App.css'
import { ChessBoard } from './components/ChessBoard'
import { MoveList } from './components/MoveList'
import { StatCard } from './components/StatCard'
import { VisionTrainer } from './components/VisionTrainer'
import {
  cloneGame,
  evaluateMaterial,
  formatEvaluation,
  gameResult,
  gameStatus,
  legalMovesFrom,
  STANDARD_START_FEN,
  type BotLevel,
  type GameMode,
  type MoveInput,
} from './domain/chess'
import { BotWorkerClient } from './engine/botWorkerClient'
import {
  clearActiveSession,
  clearLibrary,
  loadActiveSession,
  loadLibrary,
  saveActiveSession,
  saveGame,
  type StoredGame,
} from './storage/gameStore'

type Tab = 'play' | 'review' | 'train' | 'library' | 'insights'
type Promotion = { from: Square; to: Square; choices: PieceSymbol[] }
type Review = { moves: number; captures: number; checks: number; castles: number; promotions: number; result: string }

function restore() {
  const session = loadActiveSession()
  if (!session) return { game: new Chess(), startFen: STANDARD_START_FEN, mode: 'bot' as GameMode, botLevel: 'balanced' as BotLevel, orientation: 'white' as const }
  try {
    const game = new Chess(session.startFen)
    if (session.pgn.trim()) game.loadPgn(session.pgn)
    return { game, startFen: session.startFen, mode: session.mode, botLevel: session.botLevel, orientation: session.orientation }
  } catch {
    clearActiveSession()
    return { game: new Chess(), startFen: STANDARD_START_FEN, mode: 'bot' as GameMode, botLevel: 'balanced' as BotLevel, orientation: 'white' as const }
  }
}

function reviewPgn(pgn: string): Review {
  const game = new Chess()
  game.loadPgn(pgn)
  const moves = game.history({ verbose: true })
  const replay = new Chess()
  let captures = 0; let checks = 0; let castles = 0; let promotions = 0
  for (const move of moves) {
    if (move.captured) captures += 1
    if (move.san.includes('O-O')) castles += 1
    if (move.promotion) promotions += 1
    replay.move(move)
    if (replay.inCheck()) checks += 1
  }
  return { moves: moves.length, captures, checks, castles, promotions, result: gameResult(game) }
}

function download(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url)
}

export default function App() {
  const initial = useMemo(restore, [])
  const [tab, setTab] = useState<Tab>('play')
  const [game, setGame] = useState(initial.game)
  const [startFen, setStartFen] = useState(initial.startFen)
  const [mode, setMode] = useState<GameMode>(initial.mode)
  const [botLevel, setBotLevel] = useState<BotLevel>(initial.botLevel)
  const [orientation, setOrientation] = useState<'white' | 'black'>(initial.orientation)
  const [selected, setSelected] = useState<Square | null>(null)
  const [promotion, setPromotion] = useState<Promotion | null>(null)
  const [thinking, setThinking] = useState(false)
  const [notice, setNotice] = useState('')
  const [fen, setFen] = useState('')
  const [library, setLibrary] = useState<StoredGame[]>(loadLibrary)
  const [reviewInput, setReviewInput] = useState('')
  const [review, setReview] = useState<Review | null>(null)
  const botClient = useRef<BotWorkerClient | null>(null)
  const botRequestVersion = useRef(0)
  const savedPosition = useRef<string | null>(null)

  const history = game.history()
  const verbose = game.history({ verbose: true })
  const last = verbose.at(-1)
  const targets = useMemo(() => new Set<Square>(selected ? legalMovesFrom(game, selected).map((move) => move.to) : []), [game, selected])

  const commit = (move: MoveInput) => {
    const next = cloneGame(game, startFen)
    try { next.move(move) } catch { setNotice('Illegal move.'); return }
    setGame(next); setSelected(null); setPromotion(null); setNotice('')
  }

  const chooseSquare = (square: Square) => {
    if (game.isGameOver() || thinking || (mode === 'bot' && game.turn() === 'b')) return
    const piece = game.get(square)
    if (!selected || piece?.color === game.turn()) { setSelected(piece?.color === game.turn() ? square : null); return }
    if (selected === square) { setSelected(null); return }
    const matches = legalMovesFrom(game, selected).filter((move) => move.to === square)
    if (!matches.length) { setSelected(null); return }
    const choices = [...new Set(matches.map((move) => move.promotion).filter(Boolean))] as PieceSymbol[]
    if (choices.length) setPromotion({ from: selected, to: square, choices })
    else commit({ from: selected, to: square })
  }

  const reset = () => {
    setGame(new Chess()); setStartFen(STANDARD_START_FEN); setSelected(null); setPromotion(null)
    savedPosition.current = null; clearActiveSession(); setNotice('New game started.')
  }

  const undo = () => {
    const next = cloneGame(game, startFen)
    if (!next.undo()) return
    if (mode === 'bot' && next.history().length && next.turn() === 'b') next.undo()
    setGame(next); savedPosition.current = null; setNotice('Move undone.')
  }

  const loadFen = () => {
    try {
      const next = new Chess(fen.trim())
      setGame(next); setStartFen(next.fen()); setFen(''); setSelected(null); savedPosition.current = null; setNotice('FEN loaded.')
    } catch { setNotice('Invalid FEN.') }
  }

  const openStored = (item: StoredGame) => {
    try {
      const next = new Chess(); next.loadPgn(item.pgn); setGame(next); setStartFen(STANDARD_START_FEN)
      setMode(item.mode); if (item.botLevel) setBotLevel(item.botLevel); setTab('play'); setNotice('Saved game loaded.')
    } catch { setNotice('Saved PGN is invalid.') }
  }

  useEffect(() => saveActiveSession({ pgn: game.pgn(), startFen, mode, botLevel, orientation }), [game, startFen, mode, botLevel, orientation])

  useEffect(() => {
    if (!game.isGameOver() || savedPosition.current === game.fen()) return
    const item: StoredGame = {
      id: `${Date.now()}-${game.fen()}`, playedAt: new Date().toISOString(), mode,
      botLevel: mode === 'bot' ? botLevel : undefined, result: gameResult(game), pgn: game.pgn(),
      finalFen: game.fen(), moveCount: game.history().length,
    }
    setLibrary(saveGame(item)); savedPosition.current = game.fen()
  }, [game, mode, botLevel])

  useEffect(() => {
    const client = new BotWorkerClient()
    botClient.current = client
    return () => {
      botRequestVersion.current += 1
      client.dispose()
      botClient.current = null
    }
  }, [])

  useEffect(() => {
    const client = botClient.current
    if (!client || mode !== 'bot' || game.turn() !== 'b' || game.isGameOver()) return

    const requestFen = game.fen()
    const version = ++botRequestVersion.current
    setThinking(true)

    void client.search(requestFen, botLevel).then((move) => {
      if (!move || version !== botRequestVersion.current) return
      setGame((current) => {
        if (current.fen() !== requestFen) return current
        const next = cloneGame(current, startFen)
        try {
          next.move(move)
          return next
        } catch {
          setNotice('Bot result was rejected safely.')
          return current
        }
      })
    }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === 'AbortError') return
      if (version === botRequestVersion.current) setNotice('Bot worker stopped safely.')
    }).finally(() => {
      if (version === botRequestVersion.current) setThinking(false)
    })

    return () => {
      if (version !== botRequestVersion.current) return
      botRequestVersion.current += 1
      client.cancel()
    }
  }, [game, mode, botLevel, startFen])

  const insights = useMemo(() => {
    const games = library.filter((item) => item.result !== '*')
    return {
      games: games.length,
      white: games.filter((item) => item.result === '1-0').length,
      draws: games.filter((item) => item.result === '1/2-1/2').length,
      black: games.filter((item) => item.result === '0-1').length,
      average: games.length ? Math.round(games.reduce((sum, item) => sum + item.moveCount, 0) / games.length) : 0,
    }
  }, [library])

  const tabs: Tab[] = ['play', 'review', 'train', 'library', 'insights']

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span>♞</span><div><strong>KnightLab</strong><small>Local chess studio</small></div></div>
        <nav>{tabs.map((item) => <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item}</button>)}</nav>
        <div className="privacy">Offline-first<br /><small>No account · No telemetry</small></div>
      </aside>

      <main>
        <header><div><small>KnightLab Alpha</small><h1>{tab[0].toUpperCase() + tab.slice(1)}</h1></div><span className="pill">{mode === 'bot' ? `KnightBot · ${botLevel}` : 'Hot-seat'}</span></header>

        {tab === 'play' && <section className="play-grid">
          <div className="board-column">
            <div className="status"><div><span>{gameStatus(game)}</span><strong>{thinking ? 'Bot calculating…' : `Material ${formatEvaluation(evaluateMaterial(game, 'w'))}`}</strong></div><button onClick={() => setOrientation(orientation === 'white' ? 'black' : 'white')}>Flip</button></div>
            <ChessBoard game={game} orientation={orientation} selected={selected} legalTargets={targets} lastMove={last ? { from: last.from, to: last.to } : null} disabled={thinking} onSquareClick={chooseSquare} />
            <div className="actions"><button onClick={undo} disabled={!history.length || thinking}>Undo</button><button onClick={reset}>New game</button><button onClick={() => navigator.clipboard.writeText(game.pgn() || game.fen()).then(() => setNotice('Copied.'))}>Copy</button><button onClick={() => download(`knightlab-${new Date().toISOString().slice(0, 10)}.pgn`, game.pgn() || `[SetUp "1"]\n[FEN "${game.fen()}"]\n\n*`)}>Export</button></div>
          </div>
          <aside className="panel">
            <section><h2>Game setup</h2><div className="segmented"><button className={mode === 'bot' ? 'active' : ''} onClick={() => { setMode('bot'); reset() }}>Vs bot</button><button className={mode === 'local' ? 'active' : ''} onClick={() => { setMode('local'); reset() }}>Hot-seat</button></div>{mode === 'bot' && <select value={botLevel} onChange={(event) => setBotLevel(event.target.value as BotLevel)}><option value="easy">Easy</option><option value="balanced">Balanced</option><option value="strong">Strong</option></select>}</section>
            <section className="moves"><h2>Moves</h2><MoveList moves={history} /></section>
            <section><h2>Position tools</h2><textarea value={fen} onChange={(event) => setFen(event.target.value)} placeholder="Paste FEN" rows={3} /><button className="primary" onClick={loadFen} disabled={!fen.trim()}>Load FEN</button></section>
            {notice && <div className="notice">{notice}</div>}
          </aside>
        </section>}

        {tab === 'review' && <section className="two-column"><article className="card"><small>Local review foundation</small><h2>Inspect any PGN</h2><p>Structural review works now. Stockfish evaluations and move classes are the next engine milestone.</p><textarea value={reviewInput} onChange={(event) => setReviewInput(event.target.value)} placeholder="Paste PGN, or leave blank for current game" rows={12} /><button className="primary" onClick={() => { try { setReview(reviewPgn(reviewInput.trim() || game.pgn())); setNotice('') } catch { setReview(null); setNotice('Invalid PGN.') } }}>Run scan</button>{notice && <div className="notice">{notice}</div>}</article><article className="card"><h2>Results</h2>{review ? <div className="review-stats">{Object.entries(review).map(([key, value]) => <StatCard key={key} label={key} value={value} />)}</div> : <p>No review yet.</p>}</article></section>}

        {tab === 'train' && <section className="two-column"><VisionTrainer /><article className="card"><small>Training roadmap</small><h2>Next modules</h2><ul><li>Rated CC0 puzzles and motif filters</li><li>Puzzle Rush modes</li><li>Opening repertoire spaced repetition</li><li>Endgame and custom-position drills</li><li>Original interactive lessons</li></ul></article></section>}

        {tab === 'library' && <section className="card"><div className="card-head"><div><small>On-device library</small><h2>Saved games</h2></div><button className="danger" disabled={!library.length} onClick={() => { clearLibrary(); setLibrary([]) }}>Clear</button></div>{library.length ? <div className="library">{library.map((item) => <button key={item.id} onClick={() => openStored(item)}><strong>{item.result}</strong><span>{item.mode === 'bot' ? `KnightBot · ${item.botLevel}` : 'Hot-seat'}<small>{new Date(item.playedAt).toLocaleString()}</small></span><em>{item.moveCount} ply</em></button>)}</div> : <p>No completed games yet.</p>}</section>}

        {tab === 'insights' && <section><div className="stats"><StatCard label="Games" value={insights.games} /><StatCard label="White wins" value={insights.white} /><StatCard label="Draws" value={insights.draws} /><StatCard label="Black wins" value={insights.black} /><StatCard label="Average" value={`${insights.average} ply`} /></div><article className="card"><h2>Insights without a subscription</h2><p>Future releases add engine accuracy, openings, recurring motifs, time management and evidence-backed training recommendations with sample sizes.</p></article></section>}
      </main>

      {promotion && <div className="modal"><div><h2>Promote pawn</h2>{promotion.choices.map((piece) => <button key={piece} onClick={() => commit({ from: promotion.from, to: promotion.to, promotion: piece })}>{piece.toUpperCase()}</button>)}<button onClick={() => setPromotion(null)}>Cancel</button></div></div>}
    </div>
  )
}
