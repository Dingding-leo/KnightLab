# Phase 1 safe bot-turn premove tasks

**Status:** Implemented; automated release verification complete, with browser/native manual regression still pending.  
**Started:** 2026-07-22

## Specification and tests

- [X] T001 Audit bot callback, clock-history and undo behaviour for a single premove transaction.
- [X] T002 Define permissive preview and final `chess.js` legality domain contracts.
- [X] T003 Add en-passant, cancellation, promotion and side-to-move tests.
- [X] T004 Add board accessibility/drag affordance coverage for premove state.

## Implementation

- [X] T005 Add an ephemeral queued-move/ref model without a bot-search dependency.
- [X] T006 Route click, keyboard selection, drag and promotion through normal or premove paths.
- [X] T007 Apply a queued move atomically after the accepted bot reply and account for both clocks/history entries.
- [X] T008 Clear queues at pause, decision, restart, timeout, undo, load and hydration boundaries.
- [X] T009 Add visible source/destination markers, queue status and Escape/cancel feedback.

## Verification and hand-off

- [X] T010 Run focused domain/UI tests, TypeScript and lint.
- [X] T011 Run full frontend, Rust and production-build release gates.
- [ ] T012 Complete browser/native premove manual checklist.
