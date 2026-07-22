# Changelog

## Unreleased

### Added

- Original local Tactics Sprint: a three-position immediate practice path with no initial answer/PV exposure, local legal replay, two-stage hints, explicit reveal, reset and terminal outcome metrics
- Bounded tactics progress plus immutable-attempt persistence in browser storage and SQLite schema v5, with deterministic reconciliation and atomic native attempt/progress recording
- Explicit Review waiting state while a live bot move owns the local engine
- Cancellable full-game Stockfish review with before/after searches, live ply progress and a safe Stop action
- Original nonlinear expected-score accuracy model with overall, White/Black, ACPL and best-move metrics
- Contextual move classifications using legal-move uniqueness, PV identity/gap, missed mate and decisive reversals
- Ranked turning points, per-move badges and concrete selected-move feedback with a stronger SAN continuation
- Exact rules-layer terminal review handling that skips meaningless checkmate/draw engine searches
- Read-only Review board with current-game loading, bounded PGN/FEN import, ply navigation and board flip
- Explicit local Play PGN copy/download with adjacent feedback, current-FEN copy/download in Position tools, and Review import from pasted notation or a keyboard-focusable local-file picker for `.pgn`, `.fen` and `.txt` files
- Dedicated full-strength Stockfish analysis process, separate from bot play, with one-to-five MultiPV candidate lines
- Quick, Balanced and Deep review effort controls plus White/side-to-move score perspectives
- SAN principal variations, centipawn/mate scores, WDL bar, depth, nodes, NPS, time and engine-resource details
- Stockfish 18 Lite WebAssembly for website bot play, MultiPV analysis and full-game review in isolated Workers
- Checksum-verified browser engine preparation with GPLv3, exact corresponding-source metadata and offline PWA caching
- Versioned bundled SQLite persistence for desktop active sessions, preferences and completed games
- Atomic one-time import of bounded legacy localStorage state into an empty desktop database
- Startup integrity checking, timestamped corrupt-database/WAL/SHM preservation and a visible Library recovery status
- Indexed game date, result and mode columns plus forward v1-to-v2 migration coverage
- Native Stockfish executable picker with automatic discovery, explicit verification and real UCI identity/path status
- Persisted preset, Elo and custom engine profiles with bounded skill, move time, depth, nodes, MultiPV, threads and Hash controls
- Independent TypeScript and Rust engine-setting validation plus backward-compatible preference migration
- Draft-first numeric engine inputs that validate once on blur or Enter instead of clamping each typed character
- Confirmed resignation and hot-seat draw offer/accept/decline flows
- Deterministic strength-sensitive bot draw decisions based on real position material and game phase
- Typed resignation, draw-agreement and timeout completion records with backward-compatible restore
- Result and Termination PGN headers for copy, export, review and completed-game storage
- Optional original synthesized move, capture, check and game-end sounds with a persistent local toggle
- Unlimited, Bullet, Blitz, Rapid and Classical presets plus validated custom base/increment/delay controls
- Absolute-timestamp chess clocks for hot-seat and engine games, with low-time tenths and accessible live labels
- Pause/resume, exact flag fall, insufficient-mating-material timeout draws and clock-aware undo
- Backward-compatible active-session and completed-game clock metadata
- macOS-first Tauri 2 desktop shell and application icons
- Native Stockfish UCI process supervisor with discovery, validation, timeout, cancellation and restart
- Easy, balanced and strong multi-dimensional Stockfish presets
- Desktop/browser hybrid Stockfish client with visible KnightBot failure fallback status
- Deterministic UCI contract tests and opt-in real Stockfish smoke test
- Drag-to-move support while retaining click-to-move and promotion
- Keyboard shortcuts for new game, undo, board flip and selection cancellation
- Prominent game-over actions for immediate replay or populated review
- Automatic latest-move following in long notation lists
- Versioned local persistence for completed full-game review reports, with canonical game keys, schema v4 SQLite storage and bounded browser compatibility storage
- Saved-review restoration in Review plus Reviewed markers and direct review entry points in Library
- Coach's evidence cards for selected reviewed errors, with legal-board proof for mating moves, checks, unsupported moved pieces, direct double attacks and absolute king pins
- Board rings for Coach-evidence squares plus Left/Right/Home/End replay navigation scoped to Review
- Private retry-from-mistake prompts from eligible completed-review errors, with focused Review actions and a due-first Train queue that reconstructs the exact pre-move position
- No-spoiler retry presentation, exact recorded-UCI solution matching, explicit promotion choices, non-judgmental legal-alternative feedback and a private 1/3/7/14/30-day schedule
- Saved-review continuation training that replays the bounded Stockfish `solutionLineSan` PV from a completed review—not the original PGN continuation—one player move at a time with recorded opponent auto-replies
- Transient multi-move Train progress with one durable schedule advance only after a full unassisted saved line; alternate, hint-assisted completion, reveal and skip leave the item due for retry
- SQLite schema v4 retry-item storage and bounded browser retry storage, independent from completed-review retention
- Pointer-event drag support for mouse, touch and pen while retaining click/tap and keyboard board play
- Searchable/filterable Library cards with an optional aborted-game reveal and separate board/review actions
- White, Black and resolved-random player-side selection for local Stockfish/KnightBot games
- One visual, cancellable non-persisted premove while a local bot thinks, including promotion choice, Escape support and human-piece drag affordance
- Shared primary-workspace handoff that starts a real tab change at the top and focuses its named workspace heading without disturbing repeated active-tab clicks

### Security

- Parameterized SQLite queries and independent TypeScript/Rust payload, PGN, FEN, move-count and library-size bounds
- Saved review reports now require a complete, contiguous move list and exact source-timeline mapping before restoration can reach the UI
- Retry prompts fail closed unless a normal-confidence adverse review move, canonical replay timeline, pre-move FEN and recorded UCI solution can all be independently validated; a non-empty saved `solutionLineSan` must also replay completely locally, while an explicitly empty legacy field uses only the verified first move
- Stockfish starts through `std::process::Command` without a shell
- FEN and UCI move validation plus request-ID/FEN stale-response rejection
- File-picker paths remain data, and every persisted resource/search limit is revalidated at the Rust command boundary
- Local Review file imports reject declared-oversized picker files before `File.text()`, validate actual UTF-8 bytes, cap all notation at 512 KiB and FEN at 1 KiB, accept valid PGN misnamed `.fen`, retain only the newest pending selection and preserve the active timeline after a read or parse failure

### Changed

- Opening Play no longer probes Stockfish or constructs the KnightBot fallback worker. Both engines initialize only for a real bot move or explicit verification.
- Easy/Balanced/Strong play presets now use 80/160/280 ms, 10k/30k/70k node limits, one thread and 16/16/32 MB hash respectively; a cancellable UI pacing floor preserves a natural reply cadence without extra search CPU.
- The fallback KnightBot is a bounded one-ply recovery path instead of a depth-two full-tree search.
- Normal clocks schedule the next visible second instead of re-rendering the entire app every 100 ms; low-time tenths and exact flag fall remain intact. The Play board, pieces and move list now skip clock-only renders.
- Review opens with Quick one-line analysis and waits for any pending bot turn instead of intentionally competing for local CPU.
- Production browser builds register the service worker; development and Tauri do not, while desktop startup removes stale PWA caches left by earlier Tauri builds
- Fresh timed games are armed until the first legal move instead of charging while the player is choosing an opening
- Replacing an unfinished game through New game, mode, time control, FEN or Library now requires an explicit confirmation and preserves the paused game on cancel
- Board pieces use a larger, higher-contrast treatment and review/library controls use more readable compact text
- PGN timelines retain actual colour and move number, including games whose setup FEN starts with Black
- Exact PV1 matches receive 100% move accuracy and zero ACPL despite harmless independent-search score drift
- Review now opens a functional position-analysis workspace instead of a placeholder
- Exact MultiPV scores take precedence over later upper/lower-bound engine updates for the same line
- Desktop SQLite is authoritative after hydration; browser localStorage remains the compatibility fallback
- Native writes are serialized so older session state cannot overtake a newer move
- Browser users receive real Stockfish play/review controls; native executable controls stay desktop-only and browser Threads/Hash match the lite single-threaded runtime
- Changing an engine setting cancels the active search and applies only to the next current-position request
- Decision dialogs settle and pause the clock, cancel engine work, and resume the same clock on cancel or decline
- Completed games lock Undo and reopen from the Library with their exact non-board ending
- Timed rerenders memoize history and PGN generation instead of rebuilding them every clock tick
- Game completion, engine cancellation and board locking now include timeout results
- The clock display derives elapsed time in memory without writing local storage every tick
- Responsive board sizing again respects viewport height in one-column layouts
- Re-clicking the active game mode no longer discards the current game
- KnightBot is shown only when a Stockfish runtime actually fails, with fallback detail in the subtitle
- Bot ownership is now independent from board orientation: Stockfish can make the opening White move, while clocks, input, undo, draw/resign and saved Library metadata follow the resolved player side
- Premove previews now deliberately allow shapes that a pending bot move can make legal (including en passant); the actual reply position is still validated by `chess.js`, with atomic clock and undo history
- Clipboard transfers now use a local fallback/error path when the platform Clipboard API is unavailable or denied
- Above the 920 px layout breakpoint, the Play board-stage viewport reserve is 180 px rather than 260 px, giving the existing roughly 96.5%-of-square pieces more readable square space; the ≤920 px and ≤700 px sizing rules remain unchanged

### Verification

- Workspace handoff: focused 5-file / 27-test suite and full 35-file / 155-test frontend suite passed, along with lint, typecheck, web build, 23 Rust tests and the macOS Tauri bundle. In-app browser verification observed Play at `scrollY = 550` changing to Review at `scrollY = 0`, with the Review title focused and 37 px from the viewport top; activating Review again at `scrollY = 300` preserved `scrollY = 300`. A dedicated packaged-desktop UX walkthrough remains pending.
- Local PGN/FEN transfer: `npm test` passed (35 files / 155 tests), as did lint, typecheck, web build, 23 Rust tests and the macOS Tauri bundle at `src-tauri/target/release/bundle/macos/KnightClub.app`. Automated coverage includes pre-read declared-size rejection, latest-selection-wins, valid PGN misnamed `.fen`, a focusable picker and toolbar-adjacent feedback. Browser verification covered explicit Play controls, valid Review FEN and invalid-FEN timeline preservation; a dedicated desktop transfer walkthrough remains a documented handoff item.
- Desktop board clarity: a browser/layout audit at 1470 × 801 showed the wide-board target increasing from about 541 px to about 621 px after the 260 px → 180 px desktop reserve change. The current 35-file/155-test frontend suite, typecheck, lint, web build and macOS Tauri bundle passed. This was not a manual packaged-desktop walkthrough, which remains pending.
- Saved-review continuation: 20 focused retry-line/component tests and the 36-file/167-test frontend suite passed, together with lint, typecheck, production web build, 23 Rust tests and the macOS Tauri bundle. A browser walkthrough completed a real 14-ply local review, created a 6-ply Stockfish PV prompt, verified no-spoiler progress, saved opponent replies, alternate reset, completion-time schedule advance and reload persistence.
- Native full-game review: four-ply `e4 e5 Nf3 Nc6` completed eight real Stockfish 18 searches and rendered all per-move results
- Native tactical review: `f3 e5 g4 Qh4#` produced 66 overall, 31/100 colour accuracy, identified `g4` as the primary Blunder and skipped the terminal search
- Native cancellation: Stop during the first review move returned immediately and interactive analysis resumed without a stale result
- Review: browser Stockfish, PGN import/navigation/flip and responsive one/two-column layouts exercised
- Native Review: Stockfish 18 returned three real candidate lines for the current stored position
- Real Stockfish smoke now covers both best-move play and three-line MultiPV analysis
- `npm run lint` and `npm run typecheck`: passed
- `npm test`: 108 tests passed across 27 files
- `npm run test:rust`: 18 tests passed across analysis, database, Stockfish contract and smoke targets
- Browser: timed hot-seat move switching, pause freeze/resume, clock-aware undo, six-second flag fall and timed KnightBot reply passed
- Browser: draw decline/accept, PGN result headers, Escape-safe resignation, persisted completion restore, sound preference reload and bot draw rejection passed
- Browser: Stockfish 18 Lite handshake/search/cancellation, custom engine controls, draft-first multi-digit input, reload persistence and continued play passed
- Real Stockfish 18 smoke: explicit probe and custom UCI/resource search passed through the production adapter
- `npm run build`: passed; main JS 367.84 kB (114.25 kB gzip) plus checksum-verified 7.0 MB Stockfish WASM in the offline precache
- `npm run tauri:build`: passed; macOS `KnightClub.app` generated
- Native UI: automatic probe and explicit picker resolved Stockfish 18; a 200ms custom profile replied `e5` at depth 13 and the legal move was applied
- Native Review: Balanced 800ms analysis returned three complete Stockfish 18 candidate lines with exact scores and metrics
- Native persistence: imported 2 legacy games, continued `1.e4 e5` with `2.Nf3 Nc6`, fully quit/reopened, and recovered all 4 ply, Custom 200 ms settings and library from schema v2 SQLite
- Player-side automated verification: focused UI/session contracts, player-side/storage contracts, TypeScript, lint, production web build, 23 Rust tests and macOS Tauri bundle all passed; browser/native interaction checks are retained in `docs/TESTING.md`
- Premove automated verification: 30 frontend files / 130 tests, TypeScript, lint, production web build, 23 Rust tests and a macOS Tauri bundle passed; browser/native premove interaction checks remain in `docs/TESTING.md`

## 0.2.0 — 2026-07-21

### Added

- Dedicated Web Worker execution for the built-in KnightBot
- Typed worker protocol and reusable bot worker client
- Search cancellation by worker termination and recreation
- Request ID plus FEN matching to reject stale engine results
- Unit tests for successful, cancelled and stale worker responses

### Changed

- Bot turns no longer execute minimax work on the browser UI thread
- README now documents the actual product, architecture and verification workflow

### Verification

- `npm run lint`: passed with zero warnings
- `npm run typecheck`: passed
- `npm test`: 10 tests passed
- `npm run build`: passed; worker bundle and offline service worker generated

## 0.1.0 — 2026-07-21

### Added

- Offline-installable React PWA application shell
- Legal standard-chess board with local hot-seat mode
- Three-level local KnightBot fallback
- Legal move highlighting, promotion, undo, board flip and game-state messages
- FEN import and PGN copy/export
- Automatic active-session recovery and completed-game storage
- Local game library and initial insight cards
- Board-vision trainer and deterministic PGN structure scan
- Unit tests for rules helpers and bot legality
- Product specification, architecture, roadmap, licensing and CI foundation

### Verification

- `npm run lint`: passed with zero warnings
- `npm test`: 7 tests passed
- `npm run build`: passed; offline service worker generated
