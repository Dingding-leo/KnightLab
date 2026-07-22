# UX workspace handoff

**Status:** Completed — focused/browser verification and automated release gates passed; a manual packaged-desktop walkthrough remains pending.  
**Date:** 2026-07-22

## Objective

Make a switch between KnightClub's primary workspaces feel like entering a new, coherent work area: begin at its top, announce its name to assistive technology, and never interrupt a player who simply reactivates the workspace they are already reading.

## Acceptance criteria

1. A change between distinct primary workspaces returns the viewport to the top after the destination has rendered.
2. That change programmatically focuses the current workspace heading, `#workspace-title`, without causing a second scroll.
3. The primary `<main>` landmark is labelled by the same current heading through `aria-labelledby="workspace-title"`; the heading is focusable programmatically but is not added to normal tab order.
4. Re-activating the already selected workspace performs no scroll or focus handoff and preserves the player's reading position.
5. The behavior is isolated from chess state: navigating between workspaces must not reset a game, review timeline, training item or Library query.
6. A pure handoff contract and UI accessibility markup receive focused automated coverage. Typecheck and lint must pass before manual browser verification is recorded.

## Verification evidence

- Focused workspace-navigation coverage passed with 5 files / 27 tests.
- The full frontend suite passed with 35 files / 155 tests; lint, typecheck and the web build passed.
- The Rust suite passed with 23 tests, and the macOS Tauri bundle passed.
- In the in-app browser, Play at `scrollY = 550` changed to Review at `scrollY = 0`; focus was on the `Review` title, whose top was 37 px from the viewport top.
- In the same browser, activating Review again at `scrollY = 300` left `scrollY = 300`.
- A dedicated packaged-desktop workspace-navigation walkthrough has not been performed.

## Out of scope

- URL routing, browser history, per-workspace scroll restoration or animated page transitions
- Changes to chess/game/review/training persistence or data ownership
- Desktop interaction claims before a packaged-app walkthrough is performed
