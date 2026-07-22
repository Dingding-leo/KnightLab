# Phase 1 SQLite persistence tasks

**Status:** Completed  
**Started:** 2026-07-22

## Phase 4.1 — Setup

- [X] T001 Audit current localStorage data, React hydration order, Tauri command boundary and baseline gates.
- [X] T002 Add the bundled SQLite dependency and define the versioned repository boundary.

## Phase 4.2 — Tests (TDD red)

- [X] T003 Add failing Rust tests for migrations, round trips, atomic import, bounds and corrupt-file recovery.
- [X] T004 Add failing TypeScript tests for typed command payloads and malformed snapshot rejection.

## Phase 4.3 — Core implementation

- [X] T005 Implement forward-only SQLite migrations, indexed games and singleton application state.
- [X] T006 Implement bounded native read/write/import/clear commands and startup corruption recovery.

## Phase 4.4 — Integration

- [X] T007 Hydrate desktop state from SQLite before writes, then persist active games, preferences and completed games.
- [X] T008 Keep browser localStorage behavior and implement one-time transactional legacy import.
- [X] T009 Surface database ready, migration, recovery and actionable error status in the library.

## Phase 4.5 — Polish

- [X] T010 Exercise browser fallback and packaged native quit/reopen recovery journeys.
- [X] T011 Run formatting, lint, typecheck, frontend/Rust tests and production web/Tauri builds.
- [X] T012 Update product, architecture, testing, roadmap, task and changelog documentation.

## Verification evidence

- Oxlint, strict TypeScript and Rust formatting passed with zero warnings.
- Vitest: 15 files and 52 tests passed.
- Cargo: 4 SQLite contracts, 8 Stockfish contracts and 1 real-engine smoke target passed.
- Production PWA and Tauri release builds passed; the bundled app opened schema v2 successfully.
- Native: imported 2 legacy games, persisted `2.Nf3 Nc6`, fully quit/reopened and restored 4 ply, Custom 200 ms preferences and the indexed library.
