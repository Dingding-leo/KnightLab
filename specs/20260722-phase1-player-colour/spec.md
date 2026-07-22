# Phase 1 player-side selection

**Status:** Implemented — automated verification complete; browser/native manual regression remains listed in the test guide.  
**Date:** 2026-07-22

## Objective

Let a solo player start a bot game as White, Black, or a newly resolved random colour. The choice must affect real game ownership rather than only board orientation.

## Acceptance criteria

1. Bot setup exposes accessible White, Black and Random controls, showing the resolved side without relying on a board flip.
2. Choosing Black makes the bot play the opening White move; the user can make only Black moves. Choosing White retains the normal user opening.
3. A random selection resolves once per fresh bot game, is visible to the user, and remains stable across session recovery.
4. The board starts with the user at the bottom after a fresh side selection, while Flip remains an independent presentation control.
5. Clocks, engine requests, draw offers, resignation and player labels all use the resolved human/bot colours.
6. Whole-turn undo works for either side and does not remove/replay a bot opening before the human has moved.
7. Changing side, mode or time control follows the existing unfinished-game confirmation. Fixed-side re-selection is a no-op; a random fresh game redraws.
8. Active sessions and completed bot games persist the resolved `humanColor` and requested `colorChoice`; older records without those fields remain readable and malformed values are rejected.
9. Library cards and search expose the player side for bot games.
10. Domain, storage and database-contract tests, typecheck, lint, web build, Rust tests and Tauri build pass. Manual browser/native checks are documented separately.

## Out of scope

- Premoves, takebacks negotiated with an online opponent and engine opening books
- Colour-aware statistics and ratings dashboards
- New board/piece themes or online matchmaking
