# Phase 2 persisted review tasks

**Status:** In Progress  
**Started:** 2026-07-22

## Setup and contract

- [X] T001 Audit current review records, SQLite schema v2, browser fallback and Library linkage.
- [X] T002 Define stable review identity, bounds, migration and stale-load invariants.

## TDD red phase

- [X] T003 Add failing TypeScript tests for canonical review keys and persisted-record validation/browser storage.
- [ ] T004 Add failing TypeScript tests for database review command contracts and stale recovery behavior. (The command contract is covered; an asynchronous stale-recovery fixture is still required.)
- [X] T005 Add failing Rust tests for v1/v2-to-v3 migration, review upsert/load and bounds.

## Core implementation

- [X] T006 Implement canonical review keys and strict versioned persisted-review validation.
- [X] T007 Implement bounded browser review storage and typed database client operations.
- [X] T008 Implement SQLite v3 reviews repository, commands and command registration.

## Integration and polish

- [X] T009 Restore/save completed reports in Review and mark matching Library games as reviewed.
- [ ] T010 Exercise browser fallback, native review/restart/reload and stale import behavior.
- [X] T011 Run lint, types, frontend/Rust tests, web/Tauri release builds and real Stockfish smoke.
- [X] T012 Update architecture, data model, analysis, testing, roadmap, task and changelog records.
