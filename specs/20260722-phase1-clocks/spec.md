# Phase 1 clocks and time controls

**Status:** Completed  
**Date:** 2026-07-22

## Objective

Add an accurate, local chess-clock vertical slice that works for hot-seat and engine games, survives session recovery, handles increment and delay, and ends games correctly on time without coupling timing logic to React.

## Acceptance criteria

1. Users can choose Unlimited, Bullet, Blitz, Rapid and Classical presets plus a custom base/increment/delay control.
2. A pure clock state machine uses absolute timestamps, deducts only the active side, resets delay per turn, and applies increment only after a completed legal move.
3. Clocks can be paused and resumed without charging paused time.
4. Human and engine moves switch the active clock exactly once; undo restores the relevant pre-move clock state.
5. Flag fall ends the game, cancels pending engine work, disables further moves and produces the correct local result.
6. Active time control and clock state are autosaved and restored without a periodic storage write loop.
7. Player bars show readable clocks, low-time urgency and paused/active state.
8. Changing time control starts a clean game; reselecting the current control is a no-op.
9. Existing unlimited sessions remain backward compatible.
10. Unit tests, integration tests, lint, typecheck, web build, Tauri build and browser operation pass.

## Out of scope

- Per-move time limits and tournament-specific multi-stage controls
- Engine time-management commands (`wtime`, `btime`, `winc`, `binc`)
- Clock sounds and premoves
- SQLite persistence; the current session remains in local storage
