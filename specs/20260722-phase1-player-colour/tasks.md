# Phase 1 player-side selection tasks

**Status:** Implemented; automated release verification complete, with browser/native manual regression still pending.  
**Started:** 2026-07-22

## Specification and tests

- [X] T001 Audit current bot ownership, input locks, clocks, completion actions and storage.
- [X] T002 Define a pure resolved-side model and write deterministic unit tests.
- [X] T003 Add backward-compatible browser/native persistence validation tests.

## Implementation

- [X] T004 Add White / Black / Random setup controls with resolved-side feedback.
- [X] T005 Route bot search, input locking, clocks, draw/resign and labels through the resolved side.
- [X] T006 Make fresh random games redraw only at an explicit new-game boundary.
- [X] T007 Make paired undo work for either side and prevent an empty bot-opening undo loop.
- [X] T008 Persist active-session and completed-game side metadata and expose it in Library.
- [X] T009 Pause/cancel active bot search immediately when a destructive decision opens.

## Verification and hand-off

- [X] T010 Run focused and full Vitest, TypeScript and lint checks.
- [X] T011 Run production web, Rust and Tauri builds.
- [ ] T012 Complete the manual browser/native player-side regression checklist.
- [X] T013 Record automated verification evidence and retain the manual checklist.
