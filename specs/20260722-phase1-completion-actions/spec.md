# Phase 1 game-completion actions

**Status:** Completed  
**Date:** 2026-07-22

## Objective

Complete the local-game lifecycle with resignation, draw offers, accurate result/termination persistence and optional original move sounds for hot-seat and engine play.

## Acceptance criteria

1. A player can resign with confirmation; hot-seat resigns the side to move and bot mode resigns the human White side.
2. Opening a confirmation or hot-seat draw response pauses the active clock and cancels pending engine work; cancelling/declining resumes the same settled clock.
3. A hot-seat draw offer lets the opponent accept or decline. Acceptance records `1/2-1/2`; declining leaves the game playable.
4. A bot draw offer is accepted or rejected deterministically from real board material, game length and bot strength, never from a random coin flip.
5. Resignation and agreed-draw completion lock the board, stop the engine, save exactly one library record and display a clear end reason.
6. PGN copy/export and stored PGN include `Result` and `Termination` headers for non-board endings and preserve custom-start FEN headers.
7. The active session restores any valid completion reason and rejects malformed persisted termination data.
8. Users can turn original synthesized move sounds on or off; the preference is local and survives reload.
9. Sounds distinguish a normal move, capture, check and game completion without external audio assets.
10. Unit tests, lint, typecheck, web build, Rust tests, Tauri build and exercised browser flows pass.

## Out of scope

- Optional premoves
- Engine-evaluation-based draw adjudication; bot offers use a documented material/game-phase policy until the analysis API lands
- Claims for threefold/fifty-move draws beyond the automatic rules already enforced by `chess.js`
