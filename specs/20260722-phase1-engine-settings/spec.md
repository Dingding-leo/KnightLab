# Phase 1 engine settings

**Status:** Completed  
**Date:** 2026-07-22

## Objective

Give desktop players a safe, understandable way to choose and verify a local Stockfish executable and control its playing resources and search limits without editing environment variables.

## User stories

1. As a desktop player, I can use automatic discovery or choose a Stockfish executable with the native file picker.
2. As a player, I can verify the configured engine before starting a game and see the resolved name and path.
3. As a casual player, I can keep using the existing Easy, Balanced and Strong presets without understanding UCI.
4. As an advanced player, I can choose an Elo target or custom UCI/search limits for threads, Hash, MultiPV, skill, move time, depth and nodes.
5. As a returning player, my valid engine settings survive restart; malformed stored values recover to safe defaults.
6. As a browser user, I can see that Stockfish settings require the desktop app while continuing to use KnightBot normally.

## Acceptance criteria

1. Preferences store a versioned, normalized `EngineSettings` value with bounded defaults.
2. The React client includes settings in every desktop search and still rejects stale request IDs and FENs.
3. Rust validates every path and numeric setting, starts executables without a shell and applies `Threads`, `Hash`, `MultiPV`, `Skill Level`, `UCI_LimitStrength` and `UCI_Elo` before search.
4. Custom searches can combine bounded `movetime`, `depth` and `nodes`; preset behavior remains backward compatible.
5. A `stockfish_probe` command verifies automatic or explicit discovery and returns the real UCI identity and resolved path without changing the game.
6. A native file picker selects a single executable; cancel is non-destructive and invalid paths produce an actionable inline error.
7. Applying settings cancels the current search and affects the next bot move without freezing the UI.
8. The settings interface is keyboard accessible, labels every control, explains resource impact and clearly distinguishes saved, checking, ready and error states.
9. Frontend unit/component tests, Rust contract tests, lint, type checking, production web build and Tauri release build pass.

## Out of scope

- Downloading or bundling Stockfish
- Engine-vs-engine Elo calibration
- MultiPV analysis lines and the Phase 2 analysis board
- Syzygy configuration
