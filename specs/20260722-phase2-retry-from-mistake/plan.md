# Phase 2 retry-from-mistake plan

1. Build a pure, fail-closed retry-item/exercise adapter over an `AnalysisTimeline` and `ReviewedMove`; it validates the source ply, turn, legal saved UCI move and exact solution SAN without asking Stockfish.
2. Add bounded browser persistence and a SQLite v4 retry-items migration with the same defensive boundary validation as completed reviews.
3. Add a Review batch/single-position entry point and a board-first Train queue, reusing the existing chess board's click/drag/selection affordances and an explicit promotion choice.
4. Make outcome copy deliberately narrow, schedule private due dates without notifications, add exit/next controls, and suspend replay-key navigation while a Review retry owns the board.
5. Cover domain, persistence, native and component contracts, then run complete frontend/native/production gates and update durable product records.

## Guardrails

- A different legal move is an unscored alternative, not a failed chess move.
- The saved report is immutable evidence. A retry item snapshots only validated prompt/answer data and has its own lifecycle because completed reports are bounded and may be pruned.
- The retry board must reconstruct only data that was structurally tied to the report's canonical PGN timeline when the item was created.
