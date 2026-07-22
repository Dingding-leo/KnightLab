# Stockfish Phase 1 tasks

**Status:** Completed  
**Started:** 2026-07-21

## Phase 3.1 — Setup

- [X] T001 Audit the current repository, Git state, build and test baseline.
- [X] T002 Verify local Rust/Cargo support and install Stockfish 18 outside the repository.
- [X] T003 Add official Tauri 2 frontend and CLI dependencies.
- [X] T004 Scaffold and configure the Tauri desktop shell.

## Phase 3.2 — Tests (TDD red)

- [X] T005 Add failing Rust tests for UCI parsing, safe inputs, discovery, timeout and restart.
- [X] T006 Add failing TypeScript tests for desktop runtime detection, result validation and fallback behavior.

## Phase 3.3 — Core implementation

- [X] T007 Implement the Rust Stockfish executable discovery and UCI process supervisor.
- [X] T008 Implement strength presets and best-move command responses.
- [X] T009 Implement the frontend engine abstraction and Tauri Stockfish client.

## Phase 3.4 — Integration

- [X] T010 Route desktop bot turns through Stockfish and browser turns through KnightBot.
- [X] T011 Surface the active engine, version and recoverable errors in the game UI.
- [X] T012 Verify a real Stockfish 18 move and a complete frontend bot-turn flow.

## Phase 3.5 — Polish

- [X] T013 Update required architecture, integration, testing, data and licence documents.
- [X] T014 Run lint, typecheck, frontend tests, Rust tests, web build and Tauri build/check.
- [X] T015 Record verification evidence and set this task set to Completed.

## Verification evidence

- Oxlint and strict TypeScript: passed.
- Vitest: 16 tests passed.
- Cargo: 7 tests passed; deterministic UCI fixtures cover handshake/search/timeout.
- Real Stockfish smoke: Stockfish 18 returned a legal move through the production adapter.
- Web production build: passed, 260.21 kB main JS (82.61 kB gzip).
- Tauri release build: `KnightClub.app` generated successfully.
- Native UI: Stockfish 18 replied `e5` at depth 14 and the move was accepted by the game state.
