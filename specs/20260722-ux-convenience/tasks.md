# Play convenience usability tasks

**Status:** Completed  
**Started:** 2026-07-22

## Phase 3.1 — Setup

- [X] T001 Exercise multiple real play flows and rank user friction.
- [X] T002 Record acceptance criteria and implementation plan.

## Phase 3.2 — Tests (TDD red)

- [X] T003 Add keyboard shortcut intent tests.
- [X] T004 Add board drag-affordance and notation-follow contract tests.

## Phase 3.3 — Core implementation

- [X] T005 Implement safe keyboard shortcuts and concise engine naming.
- [X] T006 Implement drag-to-move without regressing click or promotion.
- [X] T007 Implement latest-move following and active-mode no-op behavior.

## Phase 3.4 — Integration

- [X] T008 Add the game-over Play again and Review game action card.
- [X] T009 Integrate shortcut hints, drag feedback and responsive styling.

## Phase 3.5 — Polish

- [X] T010 Run all automated quality gates and production build.
- [X] T011 Replay the improved flows in the browser and record evidence.
- [X] T012 Update product task status and changelog.

## Verification evidence

- Three play flows exercised: bot opening/undo, complete hot-seat checkmate, and restart during engine search.
- Improved replay verified shortcut undo, active-mode no-op, game-over actions and one-click populated review.
- Responsive browser check confirmed the source and target ranks remain simultaneously visible at a 791px-wide viewport.
- Vitest: 20 tests passed. Rust: 7 tests passed.
- Lint, strict TypeScript, PWA production build and Tauri release `.app` build passed.
- Main web bundle: 263.01 kB, 83.58 kB gzip.
