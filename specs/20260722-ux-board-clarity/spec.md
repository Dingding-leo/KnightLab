# Desktop board-clarity UX fix

**Status:** Implemented — automated release gates and a browser/layout visual audit passed; a packaged-desktop manual walkthrough remains pending.  
**Date:** 2026-07-22

## Objective

Make the Play board easier to read on a wide desktop by giving its squares—and therefore the existing large pieces—more of the available viewport height, without changing the board's rules, assets, controls or compact-layout behaviour.

## Acceptance criteria

1. Above the 920 px responsive breakpoint, the Play board stage reserves 180 px of viewport height rather than 260 px, so its height-aware cap is `calc(100dvh - 180px)`.
2. The existing pieces continue to occupy roughly 96.5% of each square; the clarity gain comes from larger squares, not a new piece set or a visual-scale change that could clip pieces.
3. At widths of 920 px and below, the board retains its existing `calc(100dvh - 260px)` cap; at 700 px and below, it remains `width: 100%`.
4. The sizing-only change must not alter legal input, board orientation, coordinates, move feedback, controls or game state.
5. The full frontend suite, typecheck, lint, web build and macOS Tauri bundle pass. A wide-desktop packaged-app walkthrough is recorded separately and must not be inferred from those gates.

## Evidence

- A browser/layout visual audit at 1470 × 801 observed the wide-board target increasing from about 541 px under the former 260 px reserve to about 621 px with the 180 px reserve.
- The current full frontend suite passed with 35 files / 155 tests; typecheck, lint, the web build and the macOS Tauri bundle also passed.
- This evidence is not a manual packaged-desktop walkthrough. That interaction check remains pending.

## Out of scope

- New chess-piece artwork, board themes, animations or a Chess.com asset imitation
- Changes to board rules, Stockfish, clocking, persistence or responsive breakpoints outside the stated desktop reserve
