# Changelog

## Unreleased

### Added

- Play now defers browser saved-game and tactics-history parsing alongside retry history: Library/Insights and Train adopt one freshness-checked local Worker snapshot only after the relevant workspace opens, with honest preparation states instead of an empty-data flash
- Live Play now independently enforces its low-compute Easy/Balanced/Strong resource ceiling for preset, Elo and Custom profiles in the browser adapter, TypeScript native boundary and Rust UCI command; Custom strength identity remains available while a reply cannot gain extra threads, Hash, depth or unbounded search
- Started timed games now remain visible outside Play through a live clock dock with both times, active/paused turn context and a one-tap return action
- Full-game Review now enforces its shared 1,024-ply persisted-report bound while long imports retain per-position analysis and use a numeric ply jump instead of a giant mobile option list
- Review now offers an explicitly temporary, local **Explore this position** branch: legal click/drag moves, keyboard-safe focused promotion choice, Undo/Reset/Return controls, an explicit non-save notice when main-line navigation leaves the branch, branch-specific Stockfish analysis and standalone FEN/PGN transfer without modifying the original game; long sequential branches reuse verified local replay history and create PGN only when transferred
- Personal **From your games** queues now render a 24-position picker window with an explicit **Show N more positions** action, preserve a current/requested deep item in that window and use 44 px phone targets
- Review now initializes its timeline and selected position from one shared PGN parse, then reuses that timeline for an unchanged live game
- Long initial Review PGNs plus every pasted or selected notation file now prepare in a latest-wins dedicated Worker after a visible local loading shell paints; stale import, handoff and unmount work terminates instead of blocking the interaction thread
- Named local opponents now receive two principal variations from one existing bounded play search and may select only a legal, exact-centipawn, close second line that demonstrably fits their declared forcing, classical or pressure preference
- Play candidate selection is fail-closed: Stockfish’s original `bestmove` is retained for limited-strength PV mismatches, mates, score bounds, excessive score loss, stale/illegal candidates and all KnightBot fallbacks
- Native UCI and browser WebAssembly play contracts now return safely normalized candidate telemetry without adding a second `go`, changing the single-thread setting, or raising the selected move-time/node cap
- Three original named local opponents with accessible monogram cards, target-strength disclosure, local opening-cue feedback and result-aware post-game copy
- Strictly legal, exact-history standard-start opening cues that apply a profile's real authored move without starting Stockfish, plus persistent profile IDs for active sessions, preferences and completed games
- Original local Tactics Sprint: a three-position immediate practice path with no initial answer/PV exposure, local legal replay, two-stage hints, explicit reveal, reset and terminal outcome metrics
- Bounded tactics progress plus immutable-attempt persistence in browser storage and SQLite schema v5, with deterministic reconciliation and atomic native attempt/progress recording
- Explicit Review waiting state while a live bot move owns the local engine
- Lower default bot budgets across browser and desktop again: Easy/Balanced/Strong now cap at 1k/3k/7k nodes and 50/60/90 ms, retain one thread and 16 MB Hash, and preserve named-profile behavior and display pacing
- Play now reuses its existing SAN snapshot for opening-cue matching and the move already applied for sound classification, avoiding repeated full-history reconstruction on long games
- Play notation now uses memoized move rows plus one delegated selection handler, so long histories update only affected rows as moves arrive or players preview a position
- Finished games now write their canonical review key directly from the existing verbose move history, while legacy library records backfill it only when opened; completing a review updates matching metadata without replaying every stored PGN
- Full-game Review now waits for a local saved-report lookup before it enables a costly rerun, and labels an intentional rerun clearly
- Promotion dialogs now block Play shortcuts behind the modal while preserving Escape-to-cancel
- Promotion choices now focus Queen when available and accept Q/R/B/N direct keyboard selection with explicit accessible key hints
- Play now supports safe unmodified Left/Right history stepping outside the board grid, inputs and dialogs
- Cancellable full-game Stockfish review with intermediate-position reuse, live ply progress and a safe Stop action
- Full-game review now avoids duplicate Stockfish work by reusing each intermediate post-move MultiPV result for the next move's baseline while retaining a single-PV final after check and rules-layer terminal handling
- Decision dialogs now block Play shortcuts behind the modal while preserving Escape-to-cancel
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
- Browser retry-cache entries are projected to the validated schema before exposure or reuse, so ignored legacy nested fields and caller mutation cannot contaminate cached persistence state; changed raw storage still receives full fail-closed validation
- Stockfish starts through `std::process::Command` without a shell
- FEN and UCI move validation plus request-ID/FEN stale-response rejection
- File-picker paths remain data, and every persisted resource/search limit is revalidated at the Rust command boundary
- Invalid interactive engine values now receive field-specific feedback and stay out of saved state; persisted, Play, Review and direct browser-worker normalizers return malformed/fractional/out-of-range resource values to safe defaults instead of promoting them to UCI maxima
- Local Review file imports reject declared-oversized picker files before `File.text()`, validate actual UTF-8 bytes, cap all notation at 512 KiB and FEN at 1 KiB, accept valid PGN misnamed `.fen`, retain only the newest pending selection and preserve the active timeline after a read or parse failure

### Changed

- Desktop Play, Verify and full Review now serialize through one native Stockfish supervisor and one Hash allocation, while retaining separate cancellation state for Play and Review requests
- A newly completed review is now detached, strictly validated and frozen once; its immediate browser or SQLite save reuses that private snapshot instead of replaying the complete PGN again, while cloned or tampered records still fail closed before any write
- Live Play PGN export and active-session persistence now serialize the existing verbose move snapshot instead of asking `chess.js` to undo/replay the complete game after every move; standard/setup/promotion/result output remains compatible and annotated imports retain the authoritative fallback
- Desktop **Verify engine** now shares Play's managed Stockfish supervisor, and the interface reserves a bot move or verification as the single local engine task instead of allowing competing work
- Normal native Stockfish cancellation now retains the warm process, acknowledged UCI vector and Hash; the next `isready` fence drains late output safely, while failed and timed-out processes are still recreated
- Review cursor changes now paint board/notation first, defer coach evidence and create strict retry payloads only when the player chooses Practice; ambient candidate analysis waits for a 350 ms idle pause before starting uncached engine work
- Personal retry queues now reconstruct `chess.js` lines only for the active exercise; unopened selector labels derive from persisted FEN fullmove facts instead of replaying every saved PV
- Browser retry save/load-one/delete paths now reuse a private raw-text-versioned canonical queue snapshot after first validation, avoiding repeated replay and sorting of up to 500 unchanged saved positions
- Browser saved-review storage now keeps a private raw-text-versioned envelope index, deeply replaying only a new record or requested same-key candidate while preserving fail-closed validation, corrupt-duplicate fallback and external-storage invalidation
- A completed Review now creates one frozen, fully validated private retry-timeline snapshot; browsing an eligible error or assembling its small practice batch looks up the selected ply instead of replaying the entire PGN again, while the public retry boundary remains fail-closed
- Browser full-game Review releases its idle candidate-line Stockfish Worker before creating the sequential Review Worker, then releases that job worker on completion, Stop or a superseding action without allowing late cleanup to affect a newer run
- An explicit browser full-game Review now also releases the idle Play Stockfish runtime before its sequential Worker is created, avoiding a retained second WebAssembly hash allocation while a bot is known idle
- Play notation now bounds unusually long histories to the newest 40 move rows, expands older rows in explicit 40-row batches and pins an early historical preview without remounting omitted notation
- Review notation now applies the same progressive 40-row window, keeps an early selected row pinned through cursor navigation and maps custom Black-start games by their real source ply
- Review selected-move lookup now uses the contiguous persisted ply index rather than scanning the full report for every board-navigation step
- Native analysis clients now allocate renderer-wide increasing request IDs, consume exact cancellation markers at each cancellation fence and clear them when their blocking task settles
- The KnightClub GitHub repository is now canonically `Dingding-leo/KnightClub`, matching the local package, desktop bundle and published metadata
- The reproducible Sites build now uses a tracked static-worker source rather than a machine-local deployment helper
- Revisiting an exact interactive Review position now returns a clearly labelled bounded local cache result instead of launching another Stockfish search; cache identity includes runtime, configured path, FEN and normalized settings, and full-game review remains uncached
- Play now carries known verbose moves through human, bot and premove commits, uses a verified platform game-state snapshot for full current-position copies and retains start-FEN replay only as the safe fallback; historical previews still rebuild their requested prefix
- Play, player bars, session status and Library now identify the selected named opponent instead of exposing a generic `balanced` technical label; Custom UCI settings explicitly disclose that they override the profile's default strength
- Review, Train and Insights are now independently loaded local workspaces with hover/focus prefetch, stable loading feedback and a scoped reload recovery instead of adding their code to the initial Play bundle
- Browser and desktop Stockfish runtimes now reuse only acknowledged unchanged UCI option blocks while retaining `isready` fences, preventing repeated Hash/option churn during continuous play and full-game review
- Opening Play no longer probes Stockfish or constructs the KnightBot fallback worker. Both engines initialize only for a real bot move or explicit verification.
- Easy/Balanced/Strong play presets now use 50/75/120 ms, 2k/5k/12k node limits, one thread and 16/16/32 MB hash respectively; the same cancellable UI pacing floor preserves a natural reply cadence without extra search CPU.
- The fallback KnightBot is a bounded one-ply recovery path instead of a depth-two full-tree search.
- A shared clock runtime now confines visible-second and low-time-tenth updates to player-clock consumers, preserves exact timeout timestamps and reports one flag while every workspace remains mounted. Memoized board-square wrappers keep selection, drag, premove and keyboard focus from replacing all 64 buttons.
- Full-game review progress now leaves an unchanged 64-square read-only board and long notation list untouched until the selected position, evidence or completed report changes.
- Contiguous queued desktop active-session snapshots now coalesce to the newest payload; ordinary writes and clear-session actions remain FIFO barriers.
- Fresh Play sessions now open configuration first, then collapse it after the first ply to an original opponent/side/time summary; Draw, Resign and notation remain immediately available while inactive setup controls unmount.
- Cancelled native Play requests now stop before UCI setup and are checked again after the shared engine lock, avoiding wasted option, position and search work when players rapidly change course.
- Native Play now retains its highest cancelled request ID, so a delayed older stop cannot revive and consume CPU for a newer cancelled Stockfish search.
- Custom time-control fields now keep uncommitted drafts local to the mounted form, retain restored custom values and avoid re-rendering the Play shell on every keystroke.
- Review opens with Quick one-line analysis and waits for any pending bot turn instead of intentionally competing for local CPU.
- Review's board-adjacent navigator now names the selected SAN move alongside its compact ply count, so a handoff or arrow press has visible context without scrolling to the notation panel.
- A successful real Stockfish Play result now marks the engine ready with its returned identity/path; local opening cues remain unverified, while KnightBot fallback, malformed identity and non-abort failure paths show an honest error rather than a stale ready state.
- Every playable bot turn now says **Your move** with an accessible action cue; after a bot reply it also names the opponent's latest SAN in a polite atomic status, while bot-first, hot-seat, check, decision, promotion, paused and preview states retain their higher-priority status.
- Review now notices only a strict per-ply FEN continuation of the live game and offers an explicit **Update review** action; it never changes the board automatically or lets an old full-game review survive the player-approved update.
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
- A Play position now reuses one verbose history snapshot for notation and legal clone replay, and reuses its memoized current PGN for sharing and session persistence instead of rebuilding both during long moves
- Desktop startup now fetches only session, preferences and a bounded game count; full PGN records are validated and decoded only after Library or Insights opens, with loading/error feedback instead of a misleading empty state
- Delayed desktop library results merge under newer in-memory game/review changes, while Clear invalidates pre-existing list requests so deleted games cannot reappear
- Game completion, engine cancellation and board locking now include timeout results
- The clock display derives elapsed time in memory without writing local storage every tick
- Responsive board sizing again respects viewport height in one-column layouts
- Re-clicking the active game mode no longer discards the current game
- KnightBot is shown only when a Stockfish runtime actually fails, with fallback detail in the subtitle
- Bot ownership is now independent from board orientation: Stockfish can make the opening White move, while clocks, input, undo, draw/resign and saved Library metadata follow the resolved player side
- Premove previews now deliberately allow shapes that a pending bot move can make legal (including en passant); the actual reply position is still validated by `chess.js`, with atomic clock and undo history
- Selecting a piece while the local bot thinks now shows its conditional premove destinations, labels them clearly as previews, and explains that final legality is checked after the bot reply
- Completed full-game reviews now render as soon as Stockfish is finished; the local persistence write continues in the background with visible saving and recoverable failure feedback
- A successfully persisted review now marks its linked Library/Insights game reviewed even if the player navigates away from Review before the background write settles
- Pawn and queen artwork now receives a restrained internal optical-size correction, making their silhouettes read consistently with the other original pieces without changing board-marker geometry
- At phone widths, Play groups the five game actions into readable two-row controls with 44 px touch targets while preserving their action and Tab order
- At phone widths, every white/black SAN button in Play's notation list now retains a 44 px target, making historical-preview entry as easy to tap as its replay controls
- At phone widths, Review now keeps a labelled 44 px **Jump to move** picker directly below board navigation, so players can return to any PGN position without scrolling past analysis output; the full classified notation list remains available in the panel
- At phone widths, all four Review replay arrows now retain 44 px targets instead of shrinking below touch comfort at the narrowest breakpoint
- At phone widths through 700 px, every Play game-toolbar action and every complete Review notation target now keeps a 44 px touch target, not only the narrowest phone layout
- Play notation now supports a non-destructive, read-only historical board preview with clickable SAN moves and an explicit Return to live action; live clocks, the bot, persistence and queued premoves remain authoritative underneath it
- Historical Play previews now include an explicit Previous/Next replay bar beside Return to live; it stays at the user-selected ply while a bot reply arrives and reaches live only after the newest move
- Historical Play previews now offer **Review this position**, carrying a one-shot ply/FEN handoff into Review; a bot-appended matching prefix opens at the intended move, while changed content safely falls back to the normal final position
- FEN copy/download now exports the exact displayed historical position during notation preview, rather than silently exporting a newer live board
- Review-to-Train actions now identify which practice route is preparing, announce the local queue work, and disable both routes until the existing serial save path settles
- Clipboard transfers now use a local fallback/error path when the platform Clipboard API is unavailable or denied
- Above the 920 px layout breakpoint, the Play board-stage now actually uses the documented 180 px viewport reserve, giving the existing roughly 96.5%-of-square pieces more readable square space; the ≤920 px and ≤700 px sizing rules remain unchanged

### Verification

- Low-compute Review and Play snapshot pass: lint, typecheck, the 54-file / 265-test frontend suite, full 36-test Rust suite, production web build, local HTTP check and macOS `KnightClub.app` bundle passed. A deterministic 40/80/120/200-ply local `chess.js` benchmark measured replay at 1.200/1.948/2.962/4.837 ms per copy versus the verified platform snapshot at 0.056/0.096/0.142/0.221 ms; ambient-cache contracts cover normalized exact identity, LRU eviction and response isolation. Manual Play/Review walkthrough remains release handoff work.
- Review context and Play engine truthfulness: lint, typecheck, the 52-file / 255-test frontend suite, full 36-test Rust suite, production web build, local HTTP check and macOS `KnightClub.app` bundle passed. Review contracts retain explicit selected-SAN navigation text and accessible full context; pure Play status contracts prove real Stockfish becomes ready from the returned identity, authored opening cues stay unverified, and fallback/malformed/failure paths cannot retain a false ready badge. Manual Review/engine-status walkthrough remains release handoff work.
- Phone Play notation targets: lint, typecheck, the 51-file / 252-test frontend suite, full 36-test Rust suite, production web build, local HTTP check and macOS `KnightClub.app` bundle passed. Existing MoveList contracts retain labelled white/black SAN controls and the current-position state; narrow CSS raises their targets from 24 px to 44 px without changing move selection, scrolling or live-follow behavior. Manual phone notation replay remains release handoff work.
- Phone Review replay controls: lint, typecheck, the 51-file / 252-test frontend suite, full 36-test Rust suite, production web build, local HTTP check and macOS `KnightClub.app` bundle passed. The Review contract retains labelled first/previous/next/last controls; narrow CSS reserves four 44 px arrow columns without altering the timeline, keyboard navigation, engine or persistence paths. Manual narrow-window replay remains release handoff work.
- Play-to-Review position handoff: lint, typecheck, the 51-file / 252-test frontend suite, full 36-test Rust suite, production web build, local HTTP check and macOS `KnightClub.app` bundle passed. Target contracts require an integer in-range ply and exact canonical FEN, retain a matching pre-reply prefix and reject stale/mismatched positions; Review initializes to a verified target before analysis begins. A manual handoff walkthrough remains release handoff work.
- Play preview navigation: lint, typecheck, the 51-file / 251-test frontend suite and full 36-test Rust suite passed. Pure preview-state contracts cover first/latest bounds, invalid input and a bot-appended history; presentation contracts retain named Previous, Next and Return to live controls. Production web and macOS bundle checks remain recorded below; a manual Play replay walkthrough remains release handoff work.
- Mobile Review navigation: lint, typecheck, the 50-file / 247-test frontend suite and full 36-test Rust suite passed. The Review contract fixes the picker’s labelled Start/SAN options and source order immediately after board navigation while retaining the full labelled notation list. Production web and macOS bundle checks remain recorded below; a manual phone-width browser/desktop walkthrough remains release handoff work.
- Displayed-FEN follow-up: lint, typecheck, the 50-file / 247-test frontend suite, production web build, local HTTP check and macOS `KnightClub.app` bundle passed. Preview status now explicitly discloses that the live clock continues, and Position tools use the displayed board FEN with preview-specific labels. A manual preview-copy browser/desktop check remains release handoff work.
- Notation-preview and practice-handoff pass: lint, typecheck, the 50-file / 246-test frontend suite, full 36-test Rust suite, production web build, local HTTP check and macOS `KnightClub.app` bundle passed. Prefix-replay tests preserve custom FEN histories without mutating the live game; move-list contracts cover button semantics/current selection; retry contracts preserve ordered partial-save behavior while the UI exposes preparation status. Manual browser/packaged-desktop preview and narrow-window checks remain release handoff work.
- Review-metadata and phone-toolbar follow-up: lint, typecheck, the 50-file / 243-test frontend suite, production web build, local HTTP check and macOS `KnightClub.app` bundle passed. A stale or unmounted Review UI now stays silent while a successfully persisted review still notifies durable Library/Insights metadata; the narrow toolbar retains all labelled actions in DOM order. Manual browser/packaged-phone-width checks remain release handoff work.
- Interaction-smoothness pass: lint, typecheck, the 50-file / 243-test frontend suite, full 36-test Rust suite, production web build, local HTTP check and macOS `KnightClub.app` bundle passed. Premove contracts prove conditional, promotion-aware queue targets and their accessibility labels; review contracts prove deferred-save success/failure/stale-unmount behavior; piece contracts retain the fixed accessible SVG frame. Source inspection confirms the wide-board breakpoints preserve 180 px above 920 px, 260 px at or below 920 px and full width at or below 700 px. A manual browser and packaged-desktop interaction walkthrough remains release handoff work.
- Desktop lazy-library pass: lint, typecheck, the 49-file / 236-test frontend suite, full 36-test Rust suite, production web build, local HTTP check and macOS `KnightClub.app` bundle passed. Native contracts prove bootstrap succeeds without decoding a corrupt stored game while the on-demand list fails closed, and that review-only storage blocks legacy import. Client contracts prove malformed lazy responses are rejected and list/read/clear work remains FIFO; a manual packaged-desktop large-library walkthrough remains release handoff work.
- Play long-history cache pass: lint, typecheck, the 49-file / 233-test frontend suite, full 34-test Rust suite, production web build, local HTTP check and macOS `KnightClub.app` bundle passed. The clone equivalence contract proves an injected verbose history snapshot preserves FEN, SAN history and PGN; a manual long-game Play walkthrough remains release handoff work.
- Progressive Play setup pass: lint, typecheck, the 49-file / 231-test frontend suite, full 32-test Rust suite, production web build, local HTTP check and macOS `KnightClub.app` bundle passed. SSR contracts cover fresh/open and restored/in-progress/collapsed setup plus persistent completion actions; first-ply/mobile interaction remains release handoff work.
- Review/persistence performance pass: lint, typecheck, the 49-file / 230-test frontend suite, full 32-test Rust suite, production web build, local HTTP check and macOS `KnightClub.app` bundle passed. Deferred persistence contracts cover latest-snapshot coalescing, no active-write overlap, failure settlement, invalid-payload isolation and clear/FIFO barriers; the manual long-PGN Review responsiveness check remains release handoff work.
- Play performance pass: lint, typecheck, the 47-file / 222-test frontend suite, full 32-test Rust suite, production web build, local HTTP check and macOS `KnightClub.app` bundle passed. Clock contracts cover normal/low-time/exact-flag frames; browser/native UCI fixtures prove the lower mirrored caps and unchanged bounded two-PV route. A manual low-time/drag/premove/keyboard walkthrough remains release handoff work.
- Named-opponent slice: lint, typecheck, the 45-file / 213-test frontend suite, full 30-test Rust suite, production web build and macOS `KnightClub.app` bundle passed. Profile contracts cover exact legal opening routes, malformed-ID rejection, legacy strength mapping and browser/native JSON payload round-trips; the manual browser/desktop profile checklist remains in `docs/TESTING.md`.
- Responsive workspace/engine pass: lint, typecheck, the 43-file / 202-test frontend suite, full 30-test Rust suite, production web build and macOS `KnightClub.app` bundle passed. The local Vite server responded successfully at `http://127.0.0.1:5173/`; the production entry is 348.29 kB / 108.20 kB gzip, with Review/Train/Insights emitted as independent async chunks.
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
