# KnightLab delivery roadmap

## Phase 0 — Foundation (complete in 0.1)

- [x] Original visual system and responsive application shell
- [x] Legal standard-chess board
- [x] Local hot-seat mode
- [x] Lightweight local bot fallback
- [x] Move history, undo, flip, promotion and end-state detection
- [x] Session recovery and completed-game storage
- [x] FEN import and PGN export
- [x] Initial library, insights, review scan and vision trainer
- [x] Offline PWA build
- [x] CI, tests, licensing and architecture documentation

## Phase 1 — Engine-grade play and analysis

- [ ] Tauri desktop shell for macOS first
- [ ] User-selectable Stockfish executable and optional verified downloader
- [ ] Robust asynchronous UCI bridge with cancellation and stale-result rejection
- [ ] Configurable threads, hash, MultiPV, depth and analysis time
- [ ] Human-like bot profiles using UCI strength controls and principled move sampling
- [ ] Analysis board, arrows, annotations, variations and position editor
- [ ] Syzygy tablebase integration, local-first where storage permits

## Phase 2 — Full post-game review

- [ ] Per-move engine analysis with reproducible settings
- [ ] Accuracy and winning-chance model with documented formulae
- [ ] Best/excellent/good/inaccuracy/mistake/blunder/forced/book classifications
- [ ] Mate-aware and already-lost-position handling
- [ ] Turning points, retry mistakes and alternative lines
- [ ] Evidence-backed natural-language explanations
- [ ] Review caching and resumable analysis jobs

## Phase 3 — Training platform

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

- [ ] SQLite game library with migrations, backup and restore
- [ ] Bulk PGN import, duplicate detection, tags, comments and collections
- [ ] CC0 ECO/opening-name integration
- [ ] Opening explorer from personal and optional public databases
- [ ] Accuracy, time, colour, opening and phase breakdowns
- [ ] Repeated tactical-motif and weakness detection
- [ ] Training recommendations tied to observable evidence and sample size

## Phase 5 — Product polish

- [ ] Keyboard-complete navigation and screen-reader audit
- [ ] Multiple original board/piece themes and optional sounds
- [ ] Chess960 and selected offline variants
- [ ] Solo Chess-style original capture puzzle mode
- [ ] Achievements, goals and streaks without manipulative dark patterns
- [ ] Signed macOS release, then Windows and Linux packages
- [ ] Performance budgets and large-library stress testing
