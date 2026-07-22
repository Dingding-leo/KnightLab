# Implementation plan

## Architecture

```text
React game state
  -> persistence coordinator
       -> browser: bounded localStorage repository
       -> desktop: typed Tauri commands
            -> DatabaseState / SQLite repository
                 -> forward-only migrations
                 -> integrity check and corrupt-file backup
```

SQLite is authoritative on desktop. React starts from the fast local cache, then hydrates from SQLite (or transactionally imports that cache into an empty database) before enabling native writes. Browser builds continue using the existing synchronous local repository.

## Schema

- `app_state`: one JSON payload per bounded singleton key (`active_session`, `preferences`).
- `games`: indexed scalar columns for stable identity and common filters plus the complete bounded JSON payload.
- `PRAGMA user_version`: monotonic migration marker; version 2 adds review readiness and query indexes.

## Safety and recovery

- Use parameterized SQL only and keep the native command surface task-specific.
- Reject oversized JSON, PGN, FEN, IDs, dates and invalid move counts before a transaction starts.
- Apply legacy state and games in one transaction with idempotent game IDs.
- Run `quick_check` before migrations. Rename corrupt data to a timestamped backup and initialize a clean database.
- Refuse unknown future schema versions instead of rewriting them.

## Testing strategy

- Rust repository tests: clean migration, v1-to-v2 migration, round trip, idempotent atomic import, bounds and corrupt-file recovery.
- TypeScript tests: command payloads, snapshot validation and malformed native responses.
- Regression gates: existing localStorage tests, all frontend/Rust tests, lint, type checking and release builds.
- Manual operation: play/save state in the packaged desktop app, quit fully, reopen and confirm the same game/library/settings.
