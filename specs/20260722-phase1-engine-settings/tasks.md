# Phase 1 engine settings tasks

**Status:** Completed  
**Started:** 2026-07-22

## Phase 3.1 — Setup

- [X] T001 Audit repository state, Stockfish boundary, documentation, recent history and baseline gates.
- [X] T002 Add the native Tauri dialog dependency and register only the required permission.

## Phase 3.2 — Tests (TDD red)

- [X] T003 Add failing TypeScript tests for engine-setting normalization and preference migration.
- [X] T004 Add failing client tests for settings payloads and engine probing.
- [X] T005 Add failing Rust tests for validation, UCI options, bounded go commands and probe identity.
- [X] T006 Add a failing accessible component test for the advanced settings workflow.

## Phase 3.3 — Core implementation

- [X] T007 Implement the shared TypeScript engine-settings domain and persistence.
- [X] T008 Implement validated Rust search settings and command construction.
- [X] T009 Implement the probe command and safe engine replacement behavior.

## Phase 3.4 — Integration

- [X] T010 Implement the focused `EngineSettingsPanel` and native executable picker.
- [X] T011 Route persisted settings through `HybridEngineClient` and cancel searches on changes.
- [X] T012 Surface checking, ready, saved, fallback and actionable error states.

## Phase 3.5 — Polish

- [X] T013 Exercise browser and native user journeys, including a custom-settings Stockfish move.
- [X] T014 Run lint, typecheck, frontend tests, Rust tests, production web build and Tauri build.
- [X] T015 Update required product, architecture, integration, testing, roadmap, task and changelog documents.

## Verification evidence

- Oxlint, strict TypeScript and Rust formatting: passed with zero warnings.
- Vitest: 13 files and 47 tests passed.
- Cargo: 8 deterministic contract tests plus 1 real Stockfish smoke passed.
- Browser: desktop-only fallback language, custom controls, 200ms draft/commit, persistence and `1.e4 e5` KnightBot continuation passed.
- Native: automatic probe, explicit file picker, Stockfish 18 identity/path, 200ms custom input and `1.e4 e5` at depth 13 passed.
- Production PWA and Tauri release builds passed; `KnightClub.app` was generated.
