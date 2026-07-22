# KnightClub

KnightClub is an original, local-first chess studio for playing, reviewing and improving without a subscription, account, telemetry or online multiplayer.

The current vertical slice provides a legal chess board with click or drag movement, local hot-seat play, real White/Black/Random side selection against named local opponents, a single safe premove while the bot thinks, accurate preset or custom chess clocks, resignation and draw agreements, original optional move sounds, three bounded Stockfish targets plus Elo/custom resource controls, session recovery, result-aware PGN/FEN import and explicit local transfer, a completed-game library, interactive MultiPV analysis and cancellable full-game review with accuracy, move classes, turning points and evidence-backed coaching. Each original opponent owns a strictly legal local opening cue; a matching standard-start route applies that authored move without starting an engine. When chess rules leave the bot exactly one legal reply, that move is also applied locally without launching Stockfish. Later, a profile may choose only a legal, close second principal variation that comes from the same bounded Stockfish search; a limited-strength `bestmove`, mate, bound, stale or malformed candidate always keeps Stockfish’s original move. Train includes an original, no-spoiler offline Tactics Sprint, personal saved-line practice and board-vision drills. The website runs Stockfish 18 Lite locally through WebAssembly; the Tauri app uses a separately installed native Stockfish executable. Desktop state is kept in a private versioned SQLite database and the browser uses bounded localStorage. Engine work never runs on the React UI thread, and stale searches are rejected before they can alter a newer position.

The first board paint is deliberately quiet: Stockfish and the KnightBot fallback are created only for a real bot move or an explicit **Verify engine** action. A matching opening cue or rules-proven only legal reply needs neither engine. Named-profile midgames request two PVs through one existing single-threaded, node-bounded search—not a second `go` command—and keep the same low-compute Easy 50 ms/4k nodes, Balanced 100 ms/10k and Strong 160 ms/24k caps. A short cancellable display floor keeps lightweight searches from looking unnaturally instant without consuming extra engine time. Fresh games show their full configuration, then collapse it to a compact opponent/side/time summary after the first ply so draw, resign and notation stay within reach. Custom-time fields retain their draft locally until **Use custom time**, so normal typing does not re-render the whole game shell and restored custom values remain editable. Live clock repainting is isolated from the Play shell, and memoized square wrappers keep selection, drag, premove and keyboard-focus changes from rebuilding every board button. Each immutable Play position shares one verbose `chess.js` history snapshot; current-position copies use a platform deep snapshot with a rules-safe replay fallback, while a new move extends the known notation incrementally. A read-only historical preview directly constructs the selected move’s stored exact `after` FEN instead of replaying its prefix; malformed external FEN safely falls back to the established replay path. The Play notation groups those moves into memoized rows and uses one delegated selection handler, so appending a move or opening a historical position updates only the affected rows rather than rebuilding every old SAN button. Review's read-only board, per-row notation and mobile move-picker options are likewise isolated from progress-only full-review updates. Its ambient candidate line starts as Quick/one-line work and reuses a bounded, session-only exact-position cache keyed by runtime, configured engine path and effective settings, so revisiting a position does not launch another search; full-game review instead reuses an intermediate post-move analysis as the next move's baseline, with no cache shared across jobs. Review, Train and Insights load only when opened, with hover/focus prefetch and a clear local reload recovery if an async workspace asset is unavailable. On desktop, startup restores only the active session, preferences and a bounded game count; complete PGNs are decoded on demand when Library or Insights is actually opened, never by merely hovering the navigation. A live bot move takes priority over optional review analysis. On desktop, contiguous not-yet-started active-session snapshots coalesce to the latest state without crossing ordinary persistence or clear-session boundaries. Persistent browser and desktop engines reuse only acknowledged unchanged UCI option blocks while retaining a readiness fence for every search, avoiding needless Hash resets during play and review; native Play keeps a monotonic cancellation watermark while native analysis uses renderer-wide increasing IDs and consumes its exact cancellation marker as its request observes or completes it.

**Large private libraries:** Library searches and filters always consider the full local result set, then display the first 24 matching games with an explicit **Show more** control. This keeps opening and refining a 500-game history responsive without hiding older matching games; repeated text searches reuse each game's local search text.

**Fast review completion:** A newly finished game receives its deterministic review link directly from the verbose move history already in memory. Older library games receive the same link only while their PGN is already being opened. Saving a completed review therefore updates matching lightweight library metadata without replaying every stored PGN on the UI thread.

**Responsive Review and personal training:** Opening Review parses the current PGN once for both its timeline and initial selected move, then reuses that immutable timeline until the live game actually changes. When a completed report offers practice prompts, Review strictly validates that bounded timeline once into a detached local snapshot; cursor movement and the selected/batch prompt controls then look up the chosen ply rather than replaying the entire game again. The standalone retry boundary still performs its full fail-closed replay. A personal queue reconstructs only the selected saved line, shows 24 practice positions at first and adds 24 on request; a linked or current position remains visible even when it is deeper in the queue. Browser retry persistence keeps a private, raw-storage-versioned canonical snapshot after its first fail-closed validation, so completing, skipping or deleting a prompt validates only the changed item rather than replaying hundreds of retained positions; any external storage change is fully revalidated. This avoids a burst of hundreds of `chess.js` replays and keeps long private training queues easier to scan.

**Long-game notation and Review resources:** Normal Play games retain their complete notation. For unusually long games, both Play and Review initially mount the newest 40 move rows and offer **Show earlier moves** in 40-row steps; an older selected Review position stays pinned and accessible without remounting the omitted history, while the complete mobile **Jump to move** control remains available. In the browser, starting a full-game Review disposes the idle candidate-line Worker before creating its sequential Review Worker, and the latter is released after completion, stop or a superseding task. This keeps a review from retaining two Stockfish WebAssembly runtimes at once.

Play shortcuts: `N` starts a new game, `U` or `⌘/Ctrl+Z` undoes a turn, `F` flips the board and `Escape` cancels a selection, promotion or queued premove. Away from the board grid and text fields, `←` / `→` step through Play history, with the newest position returning to live play. A promotion chooser focuses Queen when it is offered and accepts `Q`, `R`, `B` or `N` for an immediate legal choice. When a confirmation or promotion dialog is open, only its own controls reach the paused game, so an unrelated shortcut cannot alter the position behind it.

**Local PGN/FEN transfer:** Play offers **Copy PGN** and **Download PGN** for the current game, with immediate feedback beside its toolbar. Its **Position tools** offer **Copy current FEN** and **Download FEN**. Review accepts pasted notation or a deliberately selected local `.pgn`, `.fen` or `.txt` file through a keyboard-focusable picker. Transfer remains on-device; an unavailable Clipboard API safely falls back or reports a clear status, and a rejected or stale file import cannot replace the active Review timeline.

## Principles

- **Offline-first:** all runtime assets are bundled and cached by the PWA build.
- **Private by default:** games and preferences remain on the device.
- **Correctness before spectacle:** `chess.js` is the legal-rules authority and edge cases are tested.
- **Original product:** KnightClub implements general chess concepts without copying Chess.com code, content, branding or trade dress.
- **Engine isolation and restraint:** browser Stockfish runs in a dedicated on-demand Web Worker and desktop Stockfish remains a separate UCI process; play defaults are single-threaded, node-bounded and cancellable. Both are GPLv3 components kept outside KnightClub's original source.

## Quick start

Requires Node.js 22 or later. Browser/PWA development needs no chess engine.

```bash
npm install
npm run dev
```

Open the local address printed by Vite. The pinned Stockfish 18 Lite WebAssembly assets are prepared automatically and cached by production PWA builds for offline use.

### Website publishing

The public project page remains [https://dingding-leo.github.io/KnightLab/](https://dingding-leo.github.io/KnightLab/), hosted from `Dingding-leo/Dingding-leo.github.io` under `public/KnightLab`. Its publisher builds the canonical `Dingding-leo/KnightClub` source with `KNIGHTCLUB_BASE=/KnightLab/` and copies `dist/client`; this preserves the existing public path even though the source repository is named KnightClub.

### macOS desktop with Stockfish

Install Rust and a local Stockfish executable, then run:

```bash
brew install stockfish
npm install
npm run tauri:dev
```

Open **Engine settings** in a bot game to verify automatic discovery or select an executable with the native picker. Presets need no UCI knowledge; Elo and Custom profiles expose bounded move time, depth, nodes, MultiPV, threads and Hash controls. KnightClub discovers an explicit configured path, `KNIGHTCLUB_STOCKFISH`, `PATH`, and common Homebrew locations in that order. The native Stockfish binary is not stored in this repository. If either engine runtime cannot start, the game safely falls back to KnightBot and reports that state in the UI.

Open **Review** to paste a PGN/FEN, select a local `.pgn`, `.fen` or `.txt` file, or load the current game. Per-position candidate lines update automatically in both the website and desktop app. **Review full game** runs local Stockfish sequentially, reusing every intermediate post-move MultiPV result as the next move's baseline instead of searching that position twice; only the final non-terminal position needs a one-line after check, and terminal positions stay in the rules layer. It reports progress, can be stopped safely, and produces colour/overall accuracy, contextual classifications, key turning points and a better continuation. When the same canonical game is reopened, KnightClub first checks its saved local report and keeps the costly review action disabled until that lookup settles; a restored report makes the deliberate rerun action read **Review again**. Selecting an inaccuracy, mistake, miss or blunder also shows a Coach's evidence card when the rules layer can prove a missed mate, check, unsupported moved piece, direct double attack or absolute king pin; its named squares light up on the board, and Left/Right (Home/End) navigate the replay. Otherwise it gives an honest comparison with the recorded line.

Eligible, normal-confidence review errors can be added to a private **From your games** practice queue from Review. A new prompt may snapshot the bounded `solutionLineSan` Stockfish principal variation saved by that completed review—not the moves that actually followed the error in the original PGN. Train reconstructs that exact pre-error position locally, fully validates the saved line with `chess.js`, and withholds future moves until they are reached or deliberately revealed. It asks for each recorded player move and auto-plays only the saved opponent PV reply; a legacy empty saved PV remains a first-move exercise, while a malformed non-empty PV is unavailable rather than silently shortened. Only an unassisted replay of the whole saved line advances the item once; an alternate, hint-assisted completion, reveal or skip keeps it due without a fresh engine comparison. The in-progress line is session-only, while the durable retry schedule remains in browser localStorage or desktop SQLite even if an older completed report is later pruned. **Back to review** returns to the exact reviewed ply whenever its saved source review remains available. Resumable jobs and deeper tactical proof remain later Phase 2 work.

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:rust
npm run tauri:build
```

## Current architecture

- React 19 + strict TypeScript
- Vite + offline PWA service worker
- `chess.js` for rules and PGN/FEN handling
- A pure timestamp-based TypeScript clock state machine with increment, delay, pause and timeout results
- A pure player-side domain that resolves White/Black/Random bot games and keeps game ownership separate from board orientation
- A unified completion domain for timeout, resignation and draw agreement plus standards-compatible PGN results
- Lazy Web Audio synthesis for original move/capture/check/end cues; no third-party sound assets
- Stockfish 18 Lite WebAssembly in a dedicated browser Worker, with pinned checksums and offline PWA caching
- Tauri 2 Rust command boundary and supervised native Stockfish UCI process
- Persisted, independently validated Stockfish path, profile and resource/search settings
- Lazily created Dedicated Web Worker for the built-in bounded failure fallback bot
- Versioned bundled SQLite persistence on desktop with transactional legacy import and corrupt-file backup
- Bounded browser localStorage compatibility fallback
- Vitest + Oxlint + GitHub Actions CI

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/STOCKFISH_INTEGRATION.md`](docs/STOCKFISH_INTEGRATION.md), [`docs/PRODUCT_SPEC.md`](docs/PRODUCT_SPEC.md) and [`ROADMAP.md`](ROADMAP.md) for the implementation and product plan.

## Licensing

KnightClub's original source is source-available for non-commercial use under the PolyForm Noncommercial License 1.0.0. Commercial use requires a separate written licence. Stockfish.js and Stockfish remain GPLv3 and are distributed under their own terms, with the exact browser source revision, checksums and licence recorded in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
