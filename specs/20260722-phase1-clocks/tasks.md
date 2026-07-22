# Phase 1 clocks tasks

**Status:** Completed  
**Started:** 2026-07-22

## Phase 3.1 — Setup

- [X] T001 Audit repository, current game orchestration and test baseline.
- [X] T002 Define clock state, persistence boundary and acceptance criteria.

## Phase 3.2 — Tests (TDD red)

- [X] T003 Add failing clock state-machine tests for decrement, increment, delay, pause and timeout.
- [X] T004 Add failing persistence/timeout-result tests.

## Phase 3.3 — Core implementation

- [X] T005 Implement time-control presets, validation and display formatting.
- [X] T006 Implement the pure timestamp-based clock state machine.
- [X] T007 Implement timeout result and mating-material helpers.

## Phase 3.4 — Integration

- [X] T008 Integrate clocks with human moves, engine moves, undo, reset and pause.
- [X] T009 Add clock/time-control session and completed-game persistence.
- [X] T010 Add accessible player clocks, custom controls and timeout completion UI.

## Phase 3.5 — Polish

- [X] T011 Run full frontend/Rust quality gates and release builds.
- [X] T012 Verify timed hot-seat and bot flows in the browser.
- [X] T013 Update architecture, data, testing, roadmap, task board and changelog.
