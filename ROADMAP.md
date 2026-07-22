# KnightClub delivery roadmap

## Phase 0 — Foundation (complete in 0.1)

- [x] Original visual system and responsive application shell
- [x] Legal standard-chess board
- [x] Local hot-seat mode
- [x] Lightweight local bot fallback isolated in a cancellable Web Worker
- [x] Move history, undo, flip, promotion and end-state detection
- [x] Session recovery and completed-game storage
- [x] PGN/FEN import and explicit local copy/download workflows
- [x] Initial library, insights, review scan and vision trainer
- [x] Offline PWA build
- [x] CI, tests, licensing and architecture documentation

## Phase 1 — Engine-grade play and analysis

- [x] Tauri desktop shell for macOS first
- [x] Unlimited, Bullet, Blitz, Rapid, Classical and custom time controls
- [x] Timestamp-based clocks with Fischer increment, Bronstein-style delay, pause, timeout and clock-aware undo
- [x] Resignation, hot-seat/bot draw offers, completion persistence and original optional move sounds
- [x] User-selectable Stockfish executable with automatic/explicit UCI verification
- [x] Pinned Stockfish 18 Lite WebAssembly for offline website play, analysis and full-game review
- [ ] Optional verified Stockfish downloader
- [x] Robust UCI bridge with cancellation, timeouts, restart and stale-result rejection
- [x] Configurable threads, Hash, MultiPV, depth, nodes and move time for bot play
- [x] First three strength presets using UCI Elo, skill, time, threads and hash controls
- [x] White, Black and resolved-random colour selection for local bot games
- [x] Single safe non-persisted premove during a local bot turn, with final legality checked after the bot reply
- [x] Versioned desktop SQLite authority with transactional legacy import and corruption recovery
- [x] First original named local opponent roster with legal zero-engine-cost opening cues and persistent selection
- [ ] Human-like bot profiles using principled candidate move sampling beyond the authored opening route
- [x] Analysis board with PGN/FEN replay, navigation and real MultiPV candidate lines
- [ ] Analysis arrows, annotations, editable variations and position editor
- [ ] Syzygy tablebase integration, local-first where storage permits

## Phase 2 — Full post-game review

- [x] Cancellable in-session per-move Stockfish analysis with reproducible settings
- [x] Local persistence for completed full-game reports, saved-report restoration and Library review linkage
- [ ] Resumable or reusable review jobs with immutable engine fingerprints and position caching
- [x] Nonlinear accuracy and expected-score model with documented formulae
- [x] Contextual Great/Best/Excellent/Good/Inaccuracy/Mistake/Miss/Blunder/Forced classifications
- [ ] Licensed Book classification and sound-sacrifice proof for Brilliant
- [ ] Mate-aware and already-lost-position handling
- [x] Ranked turning points and alternative principal variations
- [x] Board-first Coach-evidence highlighting and keyboard replay navigation
- [x] Retry-from-mistake workflow and legacy first-move fallback
- [x] Conservative evidence-backed explanations for completed-review errors (mate/check/unsupported piece/direct double attack/absolute pin)

## Phase 3 — Training platform

- [x] Original offline Tactics Sprint with no-spoiler staged solutions, saved outcome metrics and browser/SQLite reconciliation
- [x] Personal saved-Stockfish-PV continuation replay from completed reviews, with local validation and engine-free Train sessions
- [ ] CC0 Lichess puzzle importer with local indexing
- [ ] Rated puzzles, custom filters, missed-puzzle review and motif analytics
- [ ] Puzzle Rush: 3-minute, 5-minute and survival
- [ ] Puzzle generation from personal games with ambiguity checks
- [ ] Original interactive lessons and skill path
- [ ] Opening repertoire builder with spaced repetition
- [ ] Opening practice against engine-selected deviations
- [ ] Endgame and thematic position drills
- [ ] Master-game guess-the-move practice using legally sourced PGNs

## Phase 4 — Library and deep insights

- [ ] Manual SQLite backup/restore UI plus duplicate PGN hashes
- [ ] Bulk PGN import, duplicate detection, tags, comments and collections
- [ ] CC0 ECO/opening-name integration
- [ ] Opening explorer from personal and optional public databases
- [ ] Accuracy, time, colour, opening and phase breakdowns
- [ ] Repeated tactical-motif and weakness detection
- [ ] Training recommendations tied to observable evidence and sample size

## Phase 5 — Product polish

- [x] On-demand engine startup, non-Play workspace code splitting/prefetch, single-thread/node-bounded play presets, clock-aware repaint throttling, cached acknowledged UCI options and bot-over-review engine priority
- [ ] Keyboard-complete navigation and screen-reader audit
- [ ] Multiple original board/piece themes and optional sounds
- [ ] Chess960 and selected offline variants
- [ ] Solo Chess-style original capture puzzle mode
- [ ] Achievements, goals and streaks without manipulative dark patterns
- [ ] Signed macOS release, then Windows and Linux packages
- [ ] Performance budgets and large-library stress testing
