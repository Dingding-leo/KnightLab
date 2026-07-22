# Phase 1 safe bot-turn premove

**Status:** Implemented — automated verification complete; browser/native manual regression remains listed in the test guide.  
**Date:** 2026-07-22

## Objective

Reduce waiting friction in local bot games by allowing the player to queue exactly one move while Stockfish is thinking, without weakening chess-rule correctness, clock accounting or cancellation safety.

## Acceptance criteria

1. A bot game exposes one queueable premove only while the bot owns the active, unpaused turn; local hot-seat games and completed/paused/decision states do not.
2. The board keeps the player's own pieces clickable and draggable in that window, presents distinct source/destination markers, announces the queue and offers an explicit Cancel premove control plus Escape.
3. Queue preview rejects impossible ownership/geometry/promotion shapes but does not require the move to be legal before the bot reply.
4. After the accepted bot move, only `chess.js` decides whether the queued move is legal in the actual resulting position. A failed queue leaves the bot move in place and explains the cancellation.
5. A successful premove is applied in the same bot-result transaction: both clock moves settle at one timestamp, the human spends no elapsed time and normal increment/delay semantics still apply.
6. Undo restores the correct settled clock and board state; stale engine results cannot reapply after undo, pause, restart, decision, timeout, load or hydration.
7. The queue is ephemeral and never reaches browser or SQLite session persistence.
8. Domain, static accessibility, typecheck, lint, full frontend tests and production builds pass; manual browser/native checks remain documented separately.

## Out of scope

- Multiple queued moves, premoves in hot-seat games, online premove timing rules or server reconciliation
- Persisting a queue across reloads or changing Stockfish search parameters
- Copying visual assets, text or interaction code from any third-party chess product
