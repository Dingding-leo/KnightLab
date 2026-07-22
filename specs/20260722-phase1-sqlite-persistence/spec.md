# Phase 1 SQLite persistence

**Status:** Completed  
**Date:** 2026-07-22

## Objective

Make desktop game state dependable across restarts by using a private, versioned SQLite database as the authoritative store while preserving localStorage as the browser fallback.

## User stories

1. As a desktop player, my active game, completed games and preferences survive a full app restart.
2. As an existing player, my browser-era local data is imported once without duplicates or partial state.
3. As a player with a damaged database, KnightClub preserves the damaged file, starts safely and tells me recovery occurred.
4. As a browser player, the existing offline localStorage behavior continues to work.
5. As a maintainer, I can evolve the schema forward and verify migrations, bounds, indexes and recovery automatically.

## Acceptance criteria

1. Desktop builds create a SQLite database in the Tauri application data directory and expose no arbitrary SQL to the frontend.
2. Forward-only migrations create versioned state and game tables plus indexes for date, result and mode queries.
3. Active session, normalized preferences and at most 500 completed games round-trip through typed Tauri commands.
4. Legacy localStorage import is atomic, runs only when SQLite is empty and keeps duplicate game IDs idempotent.
5. JSON payloads and game fields have explicit size and numeric bounds at both persistence boundaries.
6. Startup runs SQLite integrity checking. A corrupt database is renamed to a timestamped backup before a fresh database is created.
7. React hydrates from SQLite before desktop writes are enabled, mirrors state to localStorage for compatibility and surfaces ready, migrating, recovered and error states.
8. Clearing a session or game library updates the authoritative store as well as the current UI.
9. Rust repository tests, TypeScript client tests, lint, type checking, production web build and native restart checks pass.

## Out of scope

- PGN file import/export workflows beyond the existing download action
- Database backup chooser and manual restore UI
- Position/opening/tag search tables required by later analysis phases
- Cloud synchronization or accounts
