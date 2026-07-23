# KnightClub delivery roadmap

## Phase 0 — Foundation (complete in 0.2.0)

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
- [x] Cross-workspace live timed-game dock with real clocks and a one-tap return to Play
- [x] Resignation, hot-seat/bot draw offers, completion persistence and original optional move sounds
- [x] User-selectable Stockfish executable with automatic/explicit UCI verification
- [x] One managed desktop Stockfish supervisor for Play and Verify, with visible single-engine-task priority
- [x] Pinned Stockfish 18 Lite WebAssembly for offline website play, analysis and full-game review
- [ ] Optional verified Stockfish downloader
- [x] Robust UCI bridge with cancellation, monotonic native Play stop watermark, timeouts, restart, stale-result rejection and pre-setup queued-request cancellation
- [x] Progressive, responsive Play setup with draft-local custom time controls
- [x] Configurable threads, Hash, MultiPV, depth, nodes and move time as persisted engine preferences; live Play keeps a separately enforced low-resource ceiling
- [x] First three strength presets using UCI Elo, skill, time, threads and hash controls
- [x] White, Black and resolved-random colour selection for local bot games
- [x] Single safe non-persisted premove during a local bot turn, with final legality checked after the bot reply
- [x] Versioned desktop SQLite authority with transactional legacy import and corruption recovery
- [x] First original named local opponent roster with legal zero-engine-cost opening cues and persistent selection
- [x] Human-like bot profiles using principled candidate move sampling beyond the authored opening route
- [x] Analysis board with PGN/FEN replay, navigation and real MultiPV candidate lines
- [x] Ephemeral local Review variations with legal board input, promotion, branch FEN/PGN transfer and exact main-line return
- [ ] Persistent editable variation trees, arrows/annotations and a position editor
- [ ] Syzygy tablebase integration, local-first where storage permits

## Phase 2 — Full post-game review

- [x] Cancellable in-session per-move Stockfish analysis with reproducible settings
- [x] 1,024-ply full-review resource cap with long-PGN numeric position jump
- [x] Latest-wins Worker timeline preparation for long initial, pasted and file PGNs
- [x] Local persistence for completed full-game reports, saved-report restoration and Library review linkage
- [ ] Progressive, resumable review checkpoints with immutable engine fingerprints, position caching and provisional player feedback
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

- [x] On-demand engine startup and post-first-use PWA engine caching, non-Play workspace code splitting/prefetch, progressive in-game setup disclosure, single-thread/node-bounded play presets (50/50/60 ms and 1k/1.5k/3k nodes), release of a settled desktop Review's unowned native process, isolated live-clock repainting, memoized board-square and review-progress interaction, shared Play history/PGN snapshots, summary-only lazy Library/Insights hydration with on-demand selected-game detail, non-destructive Worker-backed saved-game Review, idle-batched active-session persistence with page-exit/terminal flushes, cached acknowledged UCI options and bot-over-review engine priority
- [x] Paint-first active-session recovery: long browser PGNs plus each non-null desktop bootstrap session restore through a latest-wins one-shot Worker with a verified chess-state snapshot, bounded raw freshness fencing, input/autosave/bot lockout and an explicit safe-reset recovery state; a desktop fresh-start fences late bootstrap/migration responses and finishes with a native clear so rejected games cannot return
- [x] Live Play PGN serialization from cached verbose moves, preserving immediate autosave/export, setup/result metadata and a conservative annotated-game fallback; known-empty chess.js comment state avoids the otherwise history-rewinding comment scan on normal moves
- [ ] Keyboard-complete navigation and screen-reader audit
- [ ] Multiple original board/piece themes and optional sounds
- [ ] Chess960 and selected offline variants
- [ ] Solo Chess-style original capture puzzle mode
- [ ] Achievements, goals and streaks without manipulative dark patterns
- [ ] Signed macOS release, then Windows and Linux packages
- [ ] Performance budgets and large-library stress testing
