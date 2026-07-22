# KnightClub

KnightClub is an original, local-first chess studio for playing, reviewing and improving without a subscription, account, telemetry or online multiplayer.

The current vertical slice provides a legal chess board with click or drag movement, local hot-seat play, real White/Black/Random side selection against a local bot, a single safe premove while the bot thinks, accurate preset or custom chess clocks, resignation and draw agreements, original optional move sounds, three Stockfish strength levels plus Elo/custom resource controls, session recovery, result-aware PGN/FEN import and explicit local transfer, a completed-game library, interactive MultiPV analysis and cancellable full-game review with accuracy, move classes, turning points and evidence-backed coaching. Train includes an original, no-spoiler offline Tactics Sprint, personal saved-line practice and board-vision drills. The website runs Stockfish 18 Lite locally through WebAssembly; the Tauri app uses a separately installed native Stockfish executable. Desktop state is kept in a private versioned SQLite database and the browser uses bounded localStorage. Engine work never runs on the React UI thread, and stale searches are rejected before they can alter a newer position.

The first board paint is deliberately quiet: Stockfish and the KnightBot fallback are created only for a real bot move or an explicit **Verify engine** action. Play presets are single-threaded and node-bounded (Easy 80 ms/10k nodes, Balanced 160 ms/30k, Strong 280 ms/70k); a short cancellable display floor keeps lightweight searches from looking unnaturally instant without consuming extra engine time. Review's ambient candidate line starts as Quick/one-line work, and a live bot move takes priority over optional review analysis.

Play shortcuts: `N` starts a new game, `U` or `⌘/Ctrl+Z` undoes a turn, `F` flips the board and `Escape` cancels a selection, promotion or queued premove.

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

### macOS desktop with Stockfish

Install Rust and a local Stockfish executable, then run:

```bash
brew install stockfish
npm install
npm run tauri:dev
```

Open **Engine settings** in a bot game to verify automatic discovery or select an executable with the native picker. Presets need no UCI knowledge; Elo and Custom profiles expose bounded move time, depth, nodes, MultiPV, threads and Hash controls. KnightClub discovers an explicit configured path, `KNIGHTCLUB_STOCKFISH`, `PATH`, and common Homebrew locations in that order. The native Stockfish binary is not stored in this repository. If either engine runtime cannot start, the game safely falls back to KnightBot and reports that state in the UI.

Open **Review** to paste a PGN/FEN, select a local `.pgn`, `.fen` or `.txt` file, or load the current game. Per-position candidate lines update automatically in both the website and desktop app. **Review full game** runs local Stockfish before and after every non-terminal move, reports progress, can be stopped safely, and produces colour/overall accuracy, contextual classifications, key turning points and a better continuation. Completed reports are retained locally and restored when the same canonical game is reopened. Selecting an inaccuracy, mistake, miss or blunder also shows a Coach's evidence card when the rules layer can prove a missed mate, check, unsupported moved piece, direct double attack or absolute king pin; its named squares light up on the board, and Left/Right (Home/End) navigate the replay. Otherwise it gives an honest comparison with the recorded line.

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
