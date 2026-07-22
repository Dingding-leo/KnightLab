# Phase 2 review-flow polish specification

## User outcome

When a reviewed mistake has concrete Coach evidence, the same squares are visibly marked on the replay board. A player can move through the game with Left/Right (and Home/End) without leaving the Review workspace, so a turning point can be inspected as a continuous board-first flow rather than a collection of disconnected text panels.

## Functional requirements

1. The read-only Review board marks every square named by the currently selected Coach evidence; marks update immediately when the selected ply changes and disappear for a neutral/non-error move.
2. The mark must not obscure pieces, legal move state, last-move state, coordinates or keyboard focus. It must expose an accessible label indicating Coach evidence.
3. Review accepts Left/Right for previous/next position and Home/End for first/last position when focus is not in an editable control. It must not intercept modified browser shortcuts.
4. Existing click navigation, board flip, PGN/FEN loading and play shortcuts remain unchanged.
5. The feature remains entirely local, starts no additional Coach/review engine search, and never changes a saved report. Normal live position analysis may still follow the selected replay ply when it is enabled.

## Non-goals

- No Chess.com assets, copied board graphics, proprietary arrows or interactive variations.
- No claim that highlighted squares prove a forced material win; Coach evidence remains conservative.
- No retry queue in this slice.

## Acceptance evidence

- Static board markup distinguishes evidence squares with a stable class, data attribute and accessible name.
- A selected adverse reviewed move derives highlights only from legal Coach evidence; a quiet/neutral move has none.
- Keyboard-navigation tests prove editable inputs are ignored and bounded ply navigation is maintained.
