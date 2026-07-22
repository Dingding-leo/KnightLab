# Implementation plan

## UI changes

- Extract keyboard intent mapping into a pure tested helper.
- Add an explicit `onMoveAttempt(from, to)` board contract and HTML drag/drop support.
- Give the latest notation row a ref and scroll it into view on each added ply.
- Add a compact game-over action card in the current-game panel.
- Centralize safe mode switching and concise engine presentation in `App`.

## Verification

- TDD unit/SSR contract tests for keyboard mapping, board drag affordances and move-list semantics.
- Existing frontend and Rust suites.
- Production web build.
- Browser replay of bot play, hot-seat checkmate, drag move, shortcut undo, game-over actions and responsive screenshot.
