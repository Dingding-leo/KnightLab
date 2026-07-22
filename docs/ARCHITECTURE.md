# Architecture

## Current vertical slice

KnightClub 0.2 uses:

- React 19 and strict TypeScript
- Vite and `vite-plugin-pwa`
- `chess.js` as the legal-rules authority
- A pure absolute-timestamp chess-clock state machine
- A pure player-side domain for resolved White/Black/Random bot ownership
- An original named-opponent profile domain with legal local opening cues
- A pure completion domain for resignation, draw agreement and timeout
- Lazy, optional Web Audio synthesis with no external audio assets
- A custom accessible board UI
- A Tauri 2 desktop shell with a Rust UCI process supervisor
- Stockfish for browser and desktop bot moves/MultiPV review, plus a bounded minimax failure fallback
- A normalized engine-settings domain plus native executable picker and UCI probe
- A fail-closed completed-review-to-retry adapter and due-first personal Train queue
- Versioned SQLite as the desktop authority, with bounded browser localStorage compatibility
- Vitest and Oxlint

The application contains no required runtime network requests after its static files are delivered. Website builds package checksum-verified Stockfish 18 Lite JavaScript/WebAssembly assets and cache them with the PWA; the desktop app uses a separately installed local executable.

### Clock execution

`ClockState` stores each side's remaining time at an absolute `turnStartedAtMs` anchor. `ClockRuntime` owns one display-only timer and shares its snapshot only with the two player clocks; it stays mounted outside the Play tab so a real clock can still flag while a player reads Review or Train. The runtime wakes at the next visible whole-second boundary above 20 seconds and at the next tenth below it, records the exact timestamp for terminal persistence, and reports a flag exactly once without mutating clock state or writing storage. This keeps the App shell, board and setup panel out of low-time repaint work. The board then memoizes individual square wrappers with stable callbacks/refs, so selection, drag, premove and keyboard focus reconcile only affected squares instead of replacing all 64 buttons. A newly configured timed game is ready but unarmed, so neither clock charges until its first legal move. Legal human and accepted engine moves settle the mover, apply Fischer increment, reset delay and activate the opponent exactly once. Pause settles first, timeout cancels engine work and locks the board, and undo restores the settled pre-move clock with a fresh anchor.

### Player-side execution

`humanColor` is a resolved game role (`w` or `b`), while `orientation` remains a separate presentation preference. A bot setup request may be White, Black or Random; Random resolves only when a fresh game begins and stores both the request and the resolved side, so session restore cannot silently redraw it. The engine searches whenever the opposite side is to move, allowing Stockfish to make the opening move when the user plays Black. Input, clocks, player bars, draw/resignation attribution and whole-turn undo all use this resolved ownership. Opening a restart or resignation decision immediately invalidates an active bot request; cancelling a decision resumes a fresh search only for the unchanged position.

Native Play validates cancellation both before UCI setup and again after waiting for the single-engine mutex. Its one frontend client produces monotonic request IDs, so native stops retain the highest cancelled ID: a delayed older stop cannot revive a newer cancelled request. Any request at or below that watermark cannot create/reset a supervisor, reapply options, send `position` or issue `go`. Analysis keeps exact-ID cancellation because its independent callers intentionally use non-monotonic ID ranges.

### Named-opponent execution

`BotProfile` is original KnightClub data: name, monogram, bounded Stockfish target, presentation copy, a short opening-cue table and an explicit close-line preference. Choosing another opponent uses the existing restart gate, maps the profile to its established Easy/Balanced/Strong resource ceiling and persists the ID in the active session, completed game and preferences. On a bot turn, `selectProfileOpeningMove` requires the standard start FEN, exact SAN history, correct side to move and a successful `chess.js` application on a clone. A hit applies that legal authored move after the usual display pacing without constructing or searching an engine; every non-match makes one normal bounded Stockfish request with at least two PVs. `selectProfileCandidateMove` may then choose PV2 only when PV1 exactly matches Stockfish’s returned limited-strength `bestmove`, both lines have exact centipawn scores, the same-position loss is within the profile limit, the alternate move is legal on a cloned `chess.js` board and its locally-computable traits improve the declared preference. Mate, bound, stale, malformed and fallback candidates retain `bestmove`; no profile selection mutates the displayed game before final move application. The request retains the same time/node/thread/Hash limits and uses no extra `go`. If Stockfish fails, the UI identifies the generic KnightBot fallback rather than attributing its moves to a profile.

### Premove execution

During a local bot turn, one human premove may be queued without restarting the active Stockfish request. Its preview intentionally checks only source ownership, target ownership and plausible piece geometry: the pending bot move can make an en-passant capture, open a line or remove a check. When the accepted bot result arrives, the application clears the queue and asks a cloned `chess.js` position to apply it as the sole legality authority. A rejected premove leaves the bot position intact and reports the cancellation. A successful premove completes both clock moves at the same timestamp, so it consumes no human time but receives the normal increment; both settled snapshots are retained for undo. Queues are visual-only, never persisted, and clear on any pause, restart, terminal outcome, undo, position load or hydration.

### Play-flow safeguards

New game, time-control, mode, FEN-load and saved-game actions share one restart gate. It asks for confirmation only when replacing an unfinished game, pauses the current clock while the decision is open, and restores that clock on cancel. The board keeps click/tap and keyboard selection while Pointer Events with capture make drag-to-move work for mouse, touch and pen without a separate HTML drag implementation. A promotion dialog is its own keyboard boundary: it initially focuses Queen when available, exposes Q/R/B/N through `aria-keyshortcuts`, accepts only an offered unmodified piece key, and keeps Escape as a cancel action; unrelated Play shortcuts remain blocked behind it.

Play setup uses progressive disclosure rather than permanently placing configuration ahead of the current game. A zero-ply session starts with the native setup disclosure open; the first recorded ply closes it once, leaving an original compact opponent/side/time summary, accessible Draw/Resign actions and notation above the fold. Restarting a fresh game opens it again, while a user who later reopens it keeps it open until another fresh session begins. The disclosure body is unmounted while closed, so inactive opponent, engine and time controls do not participate in ordinary in-game rendering.

The custom-time form keeps its uncommitted minute, increment and delay text in a persistent ref-backed draft. Its native inputs therefore update themselves while typing rather than scheduling a root `App` render; closing and reopening the mounted form restores that draft, and clicking **Use custom time** remains the single validation/restart boundary. A restored custom control seeds the same fields from its persisted milliseconds so players can adjust the actual saved values.

Every immutable Play `Chess` state exposes one verbose history snapshot. The SAN move list derives from that snapshot, and human commits, bot replies and undo extend or trim it from their already known legal move instead of asking `chess.js` to rediscover the whole list. `MoveList` groups the immutable SANs into memoized rows with primitive current/latest flags; one stable delegated click handler reads each button's validated ply, so a live append changes only the old/new latest row and an historical selection changes only its affected row. A current-position copy first uses the platform deep-snapshot primitive and verifies its FEN; the existing start-FEN replay remains the safe fallback when that primitive is unavailable. This preserves full undo/repetition/PGN semantics rather than cloning only the final FEN. Historical previews deliberately use a bounded prefix replay, because they must represent an earlier position rather than the live complete game. The current-game PGN is likewise memoized once per position and shared by transfer/session persistence; terminal export still rebuilds its result-aware headers deliberately.

### Workspace-navigation handoff

A primary-workspace change is a navigation handoff, not a game-state action. After React has rendered a different Play, Review, Train or Library workspace, the shared handoff contract moves the window to the top and places programmatic focus on the current `#workspace-title` with `preventScroll`. The `<main>` landmark is named by that same title through `aria-labelledby="workspace-title"`, while the heading's `tabIndex={-1}` keeps it out of the ordinary tab sequence.

Activating the already selected workspace is deliberately a no-op: it neither scrolls nor moves focus. This preserves a reader's place while a real workspace change gives pointer, keyboard and screen-reader users a stable beginning and landmark name.

Play-critical board, clock and game controls remain in the entry bundle. Review, Train and Insights each live behind an independent React lazy boundary so their review/training/dashboard modules do not delay first board paint. Hovering or focusing one of those navigation buttons starts only that module fetch before activation; a sized loading card preserves the page shape without taking focus from `#workspace-title`. A boundary local to each workspace presents an honest Reload action if a stale or unavailable async PWA asset fails, rather than taking down the Play shell.

### Completion execution

`GameTermination` is the single serializable authority for non-board endings: timeout, resignation and draw agreement. Opening a destructive confirmation or hot-seat draw response settles and pauses the clock, which also cancels active engine work through the existing effect lifecycle. Decline/cancel resumes the same settled clock; confirmation locks the board and saves one result-aware PGN. Bot draw decisions are deterministic from material, game phase and strength until full engine evaluation is available.

### Fallback bot execution

The built-in fallback bot is deliberately separated from React through a typed worker protocol. It is created only when the browser or native Stockfish runtime cannot complete a bot search. `BotWorkerClient` permits only one active search, terminates the worker when a search is superseded, recreates a clean worker, and accepts a result only when both request ID and FEN match. Its one-ply, node-bounded search is an outage safety net, not a second high-CPU engine.

## Runtime architecture

```text
React UI
  ├── chess domain (pure TypeScript)
  ├── clock domain (pure TypeScript)
  ├── completion domain + accessible decision dialog
  ├── optional synthesized game audio
  ├── review/training services
  │     ├── analysis timeline + strict cancellable Stockfish analysis client
  │     ├── sequential game-review runner + pure accuracy/classification model
  │     └── Coach evidence + fail-closed retry construction, local saved-PV replay and scheduling
  ├── DatabaseClient + localStorage compatibility repositories
  └── HybridEngineClient (lazy engines)
        ├── StockfishClient (desktop) ── typed Tauri command ──┐
        ├── BrowserStockfishEngine (website, on demand)       │
        │     └── Web Worker + UCI ── Stockfish.js WASM       │
        └── BotWorkerClient (lazy failure recovery)           │
Tauri command boundary
  ├── DatabaseState
  │     └── SQLite repository + migrations/recovery
  └── StockfishState
        ├── executable discovery + validation
        ├── request cancellation watermark
        └── persistent UCI process supervisor
  └── AnalysisState
        ├── independent request cancellation watermark
        └── dedicated persistent UCI process supervisor
          │ stdin/stdout text protocol
Separately installed Stockfish executable (GPLv3)
```

`chess.js` remains the only legal-rules authority in the UI. The engine proposes a UCI move; the current FEN and request ID must match, UCI syntax is validated, and `chess.js` applies the move. This keeps engine output outside the trusted game-state boundary.

### Review analysis execution

The frontend builds a complete immutable position timeline from bounded PGN/FEN input using `chess.js`. Selecting a ply cancels the old request and submits the exact current FEN to an isolated analysis client. On desktop, Rust configures full-strength native Stockfish and returns typed MultiPV data. In the website, a dedicated Worker runs Stockfish 18 Lite WebAssembly and the TypeScript UCI adapter parses the same score, WDL, PV and search metrics. The UI validates the response and derives SAN without trusting engine text as game state. Exact scores are retained over later bound-only updates.

Interactive Review keeps a session-local 24-entry LRU only for those ambient candidate lines. Its key contains the runtime kind, configured desktop executable path when applicable, exact FEN and normalized time/depth/node/MultiPV/thread/Hash settings. A hit returns an independent copy immediately, labelled as a cached local result, and avoids both the debounce and a new UCI `go`; backend, path, position or setting changes miss. Only a response that has already passed client validation and SAN conversion is inserted. Errors, aborts and every full-game-review search stay outside this cache, so reproducible review jobs retain their own sequential engine contract.

`runGameReview` composes that same strict client into a sequential, abortable job. It searches the start and each intermediate position once with the required MultiPV baseline, then uses the first line of that next-position result as the previous move's after evaluation. The final non-terminal position keeps the cheaper single-line after check; checkmate and draw positions stay in `chess.js`. Scores are normalized to the mover before immutable inputs reach the pure review model. UI progress is monotonic by completed ply; Stop aborts the job and cancels the active native process or browser Worker search. Starting a job pauses interactive analysis, and changing the loaded timeline invalidates the job. A bot turn has product-level priority: Review's ambient search and full-review action wait for it instead of competing for local CPU.

The read-only board receives one shared inert interaction object, and the long notation list is memoized independently. Full-review progress emits before/after updates for every ply, but those updates now repaint only the progress surface unless the selected ply, timeline, evidence or completed review actually changes.

After a completed PGN review, the frontend creates a deterministic review key from canonical start FEN and main-line UCI moves, validates a bounded versioned record and saves it before showing a retained status. `ReviewStorage` uses desktop SQLite after database hydration or bounded browser localStorage otherwise. Hydration is versioned so an asynchronous result for an older import cannot replace the active timeline. While a matching saved-report lookup is pending, the full-review action is disabled so it cannot invalidate the lookup and spend a duplicate engine pass; after a report is present, the explicit action reads **Review again**. A storage failure leaves the completed result visible with an explicit non-retention error. Matching Library records are updated through the normal game upsert and receive a Reviewed marker.

Coach evidence is derived synchronously from an already completed review; it never starts another Coach/review engine request or mutates the saved report. The pure coach domain reconstructs the reviewed move's exact pre- and post-move FENs, validates the recorded best UCI move with `chess.js`, and may expose only directly provable facts: a mating move, a check, an unsupported moved piece, a direct double attack, or an absolute king pin. Limited-confidence, malformed or unprovable cases degrade to a neutral comparison with the recorded SAN line. The React card projects its verified squares into a presentation-only board highlight and the Review workspace owns scoped replay-key navigation; both remain derived state, so restored reports behave identically. Ordinary position analysis may still follow the user-selected replay ply when it is enabled.

### Local PGN/FEN transfer boundary

Play exposes the current game's PGN through explicit copy and plaintext-download actions, and exposes the current FEN through the Position tools. Its success or recoverable-error status is rendered beside the Play toolbar. The transfer adapter attempts the platform Clipboard API first; if a browser or WebView rejects it, it tries a selected temporary textarea copy path and returns a user-facing result rather than letting a rejected promise escape. Downloads are generated from local plaintext `Blob` object URLs and are released after the browser receives the click.

Review continues to accept pasted PGN/FEN and may read a user-selected local `.pgn`, `.fen` or `.txt` file through a visible keyboard-focusable picker button. Selection is not an upload and does not write a Library record. The picker rejects a declared file over 512 KiB before calling `File.text()`, then the file boundary treats both the reported size and actual UTF-8 text as untrusted; a FEN is additionally capped at 1 KiB. Extension/content detection is only a parser hint: a valid PGN misnamed `.fen` may fall through to PGN parsing, while `chess.js` timeline creation remains the notation authority. A request gate permits only the newest pending file selection to apply. No file or pasted value is applied until parsing produces an immutable timeline, so file-read, size, notation or parser failures preserve the prior Review timeline.

### Personal retry execution

The retry adapter consumes only a finished review, its immutable timeline and optional already-derived Coach focus. It replays the canonical timeline with `chess.js`, confirms that the selected normal-confidence adverse move belongs to that source ply and that both the played and recorded solution UCI moves are legal from the exact pre-move FEN. It snapshots a bounded `solutionLineSan` only from the completed review's saved Stockfish principal variation (`bestLineSan`), never from the original PGN continuation after the error. Any source mismatch creates no prompt. Review can save one selected prompt or a small ranked batch; Train reconstructs the stored FEN and orients the board to the colour that made the reviewed move.

Before exposing a Train line, the retry-line adapter reconstructs every saved SAN ply locally with `chess.js`, checks its canonical UCI/SAN representation and confirms that its first ply is the saved solution. An explicitly empty legacy `solutionLineSan` safely uses that independently verified first move; a non-empty stored line that cannot replay in full is unavailable rather than shortened or guessed. No retry action invokes Stockfish or changes the saved report. Until a user asks for a hint/reveal or makes an attempt, Train holds back the recorded answer, future PV plies and Coach evidence. For a valid multi-ply PV, Train accepts only the reviewed player's next exact move, auto-applies the next recorded opponent PV reply, then prompts for the next player move. A legal alternative is only reported as not being on the saved review line; alternatives are not scored.

Only a full unassisted saved-line replay advances the five-step 1/3/7/14/30-day schedule, and it writes that success once at the terminal line state. A non-matching legal attempt, hint-assisted completion, reveal or skip resets the streak and keeps the prompt due immediately. The in-progress board, cursor, selection and hint state are transient React session state; the self-contained retry item retains its durable prompt and schedule independently of completed-review retention. **Back to review** loads the retained source PGN and focuses its recorded ply; if a bounded old report was pruned, the retry remains usable but the source-review return clearly reports that it is unavailable.

Production browser builds register the PWA service worker; Vite development and Tauri deliberately do not. Tauri startup removes any service worker/cache left by older builds so an upgraded desktop package cannot continue serving stale UI from `tauri://localhost`.

### Engine settings execution

`EngineSettings` is normalized before persistence and again before every frontend request. Preset profiles remain adapter-owned; Elo and Custom profiles send bounded skill, move-time, depth, node, MultiPV, thread and Hash values. Rust independently rejects desktop values before emitting any UCI command. The browser adapter enforces its single-threaded build and caps Hash at 128 MB. Each persistent browser Worker or native supervisor keeps its own last option vector only after `readyok`; unchanged settings skip the redundant `setoption` block but each search still sends `isready` before its new position/go pair. Any worker/process drop, timeout or failed setup clears that cache; native cancellation also clears it, while a browser worker keeps it only after a clean stop/drain sequence. A probe completes `uci`/`isready` and returns the real identity plus native path or WebAssembly identity without touching game state. Choosing a new path or changing search settings invalidates the current frontend search through the existing effect cleanup.

## Engine isolation rules

- Keep Stockfish outside KnightClub's original source and communicate only through UCI text streams.
- Run the website engine in a dedicated Worker; run the desktop engine as a separately managed process.
- Pin and verify every distributed engine asset, include GPLv3, and publish the exact corresponding source location beside it.
- Record version, checksum/runtime, source URL and engine settings when analysis caching is introduced.
- Reject stale responses using request identifiers and position hashes.
- Implement stop, timeout, restart, bounded queues and process cleanup.
- Never block the UI thread.

## Failure model

- Discovery or Worker failure: report the error for verification and use the isolated KnightBot fallback for bot play.
- Invalid input/output: reject it without changing the board.
- Cancellation: frontend invalidates the request immediately; Rust observes an atomic marker or the browser adapter sends `stop` and drains the old `bestmove`.
- Timeout, process exit or an unresponsive Worker: discard that engine runtime so the next request starts cleanly.
- Late result: reject unless both request ID and FEN equal the active search.
- Flag fall: settle to zero, invalidate engine work, persist the timeout result and reject all later moves.
- Completion dialog: pause before the decision; on cancel resume from the settled anchor, on confirmation persist and reject later moves.

## Persistence execution

Desktop startup opens `knightclub.sqlite3` in the Tauri application-data directory, runs `quick_check`, applies forward-only `PRAGMA user_version` migrations and then exposes only task-specific commands. Schema v5 stores singleton active-session/preferences JSON, indexed completed-game rows, a separate bounded `reviews` repository, a bounded self-contained `retry_items` repository, and bounded tactics progress/immutable-attempt records. Its startup bootstrap returns only session, preferences, recovery state, a bounded game count and whether all persistence tables are empty; it deliberately does not deserialize game PGNs. A player opening Library or Insights requests the validated, bounded game list then. That delayed response is queued behind earlier writes, merged under current in-memory game updates and invalidated by Clear, so a just-saved/reviewed game cannot disappear and a pre-clear response cannot resurrect deleted rows. If every persistence table is empty, the frontend imports bounded legacy localStorage state in one transaction; an existing database remains authoritative. Writes are serialized in the frontend and again by the Rust mutex so an older state cannot overtake a newer one. Contiguous active-session snapshots that have not begun native execution share one queued write and retain only the newest payload; any ordinary write or clear-session action is a FIFO barrier, so no snapshot can jump across it.

Malformed or oversized payloads are rejected independently in TypeScript and Rust. Review payloads additionally have their PGN-derived identity, canonical FEN and a one-to-one per-ply match between the saved report and its source timeline checked at the frontend boundary; native code independently rejects absent, incomplete or non-contiguous review move lists before a record is saved or restored. Retry records use a separate item schema, bounded metadata and due-first index; TypeScript additionally reconstructs the FEN and validates the played/solution move facts before they enter UI state. A non-empty stored `solutionLineSan` must also reconstruct completely as a canonical local PV; only an explicitly empty legacy field may use the verified first-move fallback. A database that fails integrity checking is renamed to a timestamped `.corrupt-*.bak` file (including WAL/SHM sidecars) before a clean schema is created; the Library reports the recovery path. Browser/PWA builds keep bounded localStorage compatibility repositories for games, completed reviews and retry items. Later phases still need duplicate PGN hashes, manual backup/restore, and indexed position, opening and tag queries.

## Trust boundaries

Untrusted inputs include PGN, FEN, imported datasets, engine output, file paths, persisted engine settings, retry prompts and database backups. Parse them defensively, bound their size, reject malformed records and never interpolate them into shell commands. Engine settings are bounded independently in TypeScript and Rust before they can become UCI commands.
