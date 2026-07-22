# UX workspace handoff tasks

**Status:** Completed — focused/browser verification and automated release gates passed; desktop manual validation remains pending.  
**Started:** 2026-07-22

## Discovery and contracts

- [X] T001 Identify the reader-disorientation caused by switching to a workspace at a retained scroll position.
- [X] T002 Define and test a pure handoff boundary for a different workspace versus a repeated current workspace.
- [X] T003 Define the accessible focus target and main-landmark naming relationship.

## Implementation

- [X] T004 Run the browser handoff only after the destination workspace is rendered.
- [X] T005 Scroll a real workspace transition to the top and focus `#workspace-title` with scroll prevention.
- [X] T006 Keep active-tab reactivation as a no-op for scroll and focus.
- [X] T007 Label the primary `<main>` with `aria-labelledby="workspace-title"` and make the current heading programmatically focusable.

## Verification and hand-off

- [X] T008 Run focused workspace-navigation/accessibility checks: 5 files / 27 tests passed.
- [X] T009 Run `npm run typecheck` and `npm run lint`.
- [X] T010 Verify in the in-app browser that Play at `scrollY = 550` enters Review at `scrollY = 0`, with the Review title focused and its top at 37 px; verify repeated Review activation at `scrollY = 300` remains at 300.
- [X] T011 Run the full frontend/release gate set: 35 frontend files / 155 tests, lint, typecheck, web build, 23 Rust tests and the macOS Tauri bundle passed.
- [ ] T012 Perform a packaged desktop workspace-navigation walkthrough; do not infer it from browser behavior or builds.
