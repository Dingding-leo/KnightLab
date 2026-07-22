# Play convenience usability pass

**Status:** Completed  
**Date:** 2026-07-22

## Evidence from user simulation

- A 67-ply completed bot game, a short bot opening, a complete hot-seat Fool's Mate, undo, mode switching and restart-during-search were exercised in the local app.
- Safe restart and whole-turn undo worked correctly.
- The highest-friction gaps were missing drag-to-move, no automatic move-list follow, no keyboard accelerators, weak game-over actions, accidental reset when re-clicking the active mode and verbose fallback naming.

## Acceptance criteria

1. Desktop users can drag a movable piece to a legal destination; click-to-move and promotion remain available.
2. The move list follows the latest move without stealing focus.
3. `⌘/Ctrl+Z` or `U` undoes, `N` starts a new game, `F` flips and `Escape` cancels selection/promotion, except while typing in a form field.
4. A completed game presents obvious Play again and Review game actions next to the notation.
5. Clicking the already-active game mode does not reset the position.
6. Engine labels stay concise while still exposing native/fallback detail.
7. Existing cancellation, game legality, responsive UI, tests and builds remain intact.
