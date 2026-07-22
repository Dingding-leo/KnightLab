# Stockfish Phase 1 vertical slice

**Status:** Completed  
**Date:** 2026-07-21

## Objective

Add a macOS-first Tauri desktop runtime that uses a locally installed Stockfish executable over UCI for bot moves while preserving the existing browser PWA and its KnightBot fallback.

## Acceptance criteria

1. `npm run tauri:dev` opens the existing KnightClub UI in a native desktop window.
2. The Rust backend discovers Stockfish from an explicit validated path, `KNIGHTCLUB_STOCKFISH`, `PATH`, or known Homebrew locations.
3. The backend starts Stockfish without a shell, completes `uci` and `isready`, configures strength, sends `position fen` and `go`, and parses a legal `bestmove`.
4. Easy, balanced and strong presets use calibrated `UCI_LimitStrength`, `UCI_Elo`, `Skill Level`, threads, hash and move time rather than search depth alone.
5. A user can make a legal move and receive a Stockfish reply through the current game UI until the game reaches a standard terminal state.
6. Browser use continues to work offline through KnightBot when the Tauri command boundary is unavailable.
7. Rapid position changes cannot apply stale engine results. Cancellation, timeout and process failure are recoverable.
8. No Stockfish binary is committed to this repository. Version and licence obligations are documented.
9. Frontend tests, Rust tests, lint, type checking and production builds pass.

## Out of scope for this slice

- Clocks and time-control presets
- Full engine analysis/MultiPV UI
- Verified binary downloader
- SQLite migration and large game library
- Human-style bot profiles beyond the three first strength presets

These remain Phase 1 follow-up work and are tracked in `TASKS.md`.
