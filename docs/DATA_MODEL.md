# Data model

## Current persisted records

- Active session: start FEN, result-aware PGN, game mode, bot level, optional named `botProfileId`, orientation, optional resolved human colour (`w`/`b`) and requested colour choice (White/Black/Random), optional time control, current clock, pre-move clock history and optional typed termination.
- Completed game: ID, timestamp, mode, optional bot level and named `botProfileId`, result, result-aware PGN, final FEN, ply count, optional resolved human colour and requested colour choice for bot games, optional time control, final clock values, optional typed termination and optional reviewed/review-key linkage. New terminal records derive the key from their existing verbose move history; legacy rows backfill it only when opened.
- Completed review: schema version, deterministic review key, canonical source PGN/start FEN, main-line ply count, completion timestamp and the finished GameReview report.
- Retry item: schema version, `reviewKey + sourcePly` identity, independently validated pre-move FEN and side to move, reviewed/recorded move facts, a short recorded line, classification/focus, attempt state and next due timestamp. It is a self-contained practice prompt rather than a foreign-key-dependent view of a report.
- Tactics progress: one bounded record per original local puzzle revision, with attempts, streak, last outcome, assistance marker and next-due timestamp. It contains no solution line.
- Tactics attempt: immutable bounded event with an opaque attempt ID, puzzle/revision identity, terminal outcome, elapsed time, move count, hint count and timestamp. It contains no answer data.
- Preferences: original synthesized move sounds enabled/disabled, the default named local `botProfileId`, plus normalized Stockfish executable path, profile, Elo, skill, strength limit, move time, optional depth/nodes, MultiPV, threads and Hash.

Clock, termination, player-side and named-profile fields are optional so older sessions restore as Unlimited, White-player bot games, legacy strength labels and legacy timeout records remain readable. A present player-side/profile field must use a bounded wire value (`w`/`b`, White/Black/Random or one of KnightClub's declared original profile IDs), otherwise the game/session is rejected before it reaches UI state. Preferences are schema-validated; old sound-only records receive default engine settings and a default profile, while every malformed, fractional or out-of-range engine field returns to its own safe default rather than being clipped upward to a costly maximum. Explicit null depth/node limits remain intentional. Desktop SQLite is authoritative and browser localStorage remains a bounded compatibility fallback. A queued premove is deliberately non-persisted: it belongs only to the active bot search and is cleared by pause, restart, completion, undo, load and hydration. Stockfish process state, probe status, interactive search output and unfinished review jobs remain ephemeral.

Completed full-game reports are persisted separately from the bounded active-session blob. Their identity is a 64-bit deterministic key over the canonical start FEN and main-line UCI moves, so harmless PGN header or whitespace changes cannot create a duplicate report. Validation reparses the PGN, recomputes that key and verifies the start FEN/ply count before a record reaches UI state. A saved report contains engine name/path, bounded search settings, completion time, total engine time, per-move scores/classification/feedback and summary metrics.

## SQLite schema v5

- `app_state`: singleton `active_session` and `preferences` JSON with update timestamps.
- `games`: scalar ID/date/mode/result/PGN/FEN/ply columns, complete JSON payload and a scalar `reviewed` flag. The payload can retain the linked review key.
- `reviews`: primary review key, source PGN, canonical start FEN, main-line ply count, reviewed timestamp and complete versioned JSON payload.
- `retry_items`: primary retry key, review key, source ply, due timestamp, active/mastered status, updated timestamp and complete versioned JSON payload. It has no foreign key to `reviews`, so a valid prompt can outlive report pruning.
- `tactics_progress`: primary `puzzle_id + seed_revision` identity, bounded progress JSON and due/update indexes.
- `tactics_attempts`: immutable primary attempt ID, puzzle/revision identity, terminal timestamp and bounded event JSON. Native attempt recording updates its matching progress record atomically.
- Indexes: descending played date, result/mode, newest review timestamp plus key, due-first retry status/date/update ordering, retry review/source-ply lookup, and tactics due/update ordering.

Startup uses `PRAGMA user_version` for forward migrations and `quick_check` for corruption detection. Legacy import is all-or-nothing and duplicate IDs are idempotent. State/game JSON is limited to 1 MiB, PGN to 512 KiB, FEN to 1 KiB and the library to 500 games at both command boundaries. Reviews are independently capped at 500 records, 2 MiB each and 1,024 plies in both TypeScript and Rust; a native upsert trims older reviews without clearing completed games. Retry items are independently capped at 500 records and 32 KiB each in browser and native storage; their payload is revalidated before loading or saving, including legal reconstruction of the saved moves in TypeScript. Tactics state is capped at 128 progress records and 500 immutable attempt events in both repositories; the browser mirror and native database reconcile deterministically by puzzle/revision and attempt ID.

## Future analysis boundaries

- `games`: source, start FEN, PGN, result, dates, clocks, reviewed linkage and tags.
- `completed_reviews`: the implemented complete-report record above; it is not a resumable engine job or individual-position cache.
- `retry_items`: the implemented personal-error queue above; it is independent from both report retention and future shared puzzle content.
- `tactics_progress` and `tactics_attempts`: implemented local original-sprint scheduling and outcome history; they do not claim an external puzzle catalogue or rating system.
- `analysis_jobs`: future game, status, immutable engine/settings fingerprint, progress and error for resumable work.
- `position_analysis`: position hash, evaluation, depth/nodes/time and principal variations.
- `puzzles` and `puzzle_attempts`: source/licence metadata, motif, rating and review schedule.
- `openings` and `repertoire_items`: source/version metadata and spaced-repetition state.

Every imported dataset will retain source, licence, version and checksum. Schema changes continue through forward migrations and transactions. Large datasets will not be placed in localStorage.
