# Desktop board-clarity UX tasks

**Status:** Implemented — browser/layout audit and automated release gates are complete; packaged-desktop manual verification remains a handoff item.  
**Started:** 2026-07-22

## Scope and implementation

- [X] T001 Identify the readability constraint: the pieces already use roughly 96.5% of their squares, while the wide board was constrained by a 260 px viewport-height reserve.
- [X] T002 Change only the wide-desktop board-stage reserve from 260 px to 180 px above the 920 px breakpoint.
- [X] T003 Preserve the existing compact rules: a 260 px reserve at 920 px and below, and `width: 100%` at 700 px and below.
- [X] T004 Keep chess interaction and application state out of the presentation-only change.

## Verification and hand-off

- [X] T005 Complete a 1470 × 801 browser/layout audit; the wide-board target moved from about 541 px to about 621 px.
- [X] T006 Record current release evidence: 35 frontend files / 155 tests, typecheck, lint, web build and macOS Tauri bundle passed.
- [ ] T007 Perform a manual wide-desktop walkthrough in the packaged macOS application, including the responsive boundary checks. Do not mark this done from the successful bundle build alone.
