# Phase 2 persisted review specification

## User outcome

When a user finishes a full desktop review, the result is saved locally. Returning to the same current game or imported PGN restores the completed report instantly, without a second engine run. A reviewed completed game is visibly marked in the local Library. Browser/PWA users receive the same bounded local persistence for reports they can obtain in a future browser engine build; they are never shown invented analysis.

## Functional requirements

1. Derive a stable, deterministic review key from canonical start FEN and main-line UCI moves, independent of PGN headers or whitespace.
2. Store a versioned record containing source PGN/FEN, move count, completed `GameReview`, review key and timestamp.
3. Keep at most 500 reports and bound each report to 2 MiB / 1,024 ply at both TypeScript and Rust boundaries.
4. Add SQLite schema v3 with a dedicated `reviews` table, primary-key upsert and newest-first index. Existing v1/v2 databases migrate forward safely.
5. Expose strict Tauri save/load commands; malformed, oversized or mismatched native payloads never reach React state.
6. Use bounded localStorage compatibility storage when no desktop database exists.
7. On a matching PGN load, restore a saved report asynchronously, discard stale loads after a new import and identify its saved origin in the UI.
8. On completion, save before reporting success; saving failure leaves the result usable but reports that it was not retained.
9. Mark matching completed Library games as reviewed, preserving existing game data and local/database recovery.

## Non-goals

- This slice does not implement background resumable engine searches after app termination. Only fully completed reports are persisted.
- It does not cache individual engine positions or change the review model formula.
- It does not automatically save arbitrary imported PGNs as Library games; it saves their completed report keyed to the source.

## Acceptance evidence

- Same moves with different PGN headers produce one key; changed moves produce another.
- Browser store has bounded update/read behavior and rejects malformed records.
- Rust migrates v1/v2 to v3, upserts a review, reads it back, keeps review data across game clearing, and rejects oversize data atomically.
- Client contract checks command names, camelCase payloads and response validation.
- Native review completes, app relaunches and reopening Review restores the report without a fresh job; the Library marks the game Reviewed.
