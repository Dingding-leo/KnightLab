# Phase 2 full-game review specification

## User outcome

A desktop user can load a PGN, start one cancellable review job, follow progress and receive a useful per-move report based entirely on real local Stockfish searches. The report shows overall/colour accuracy, average centipawn loss, best-move hit rate, classifications, turning points, the better line and a concrete local explanation. Browser users retain replay but are not shown fabricated scores.

## Functional requirements

1. Analyse the position before each played move with at least two candidate lines and each non-terminal position after it with one line. Checkmate/draw outcomes come directly from the rules layer.
2. Convert side-to-move scores into the mover's perspective before comparison.
3. Use a documented nonlinear expected-score model; classification must additionally consider forced moves, best-move identity, candidate gap, missed mate, decisive state transitions and game phase.
4. Produce White, Black and overall accuracy, average centipawn loss, best-hit rate and ranked turning points.
5. Give explanations that name the played move, better move and concrete squares/PV where available.
6. Report live progress and allow immediate cancellation. Imported positions or a new review invalidate older work.
7. Keep the existing interactive single-position analysis available after the job finishes.

## Boundaries

- This slice does not claim opening-book classification, tactical motif proof or persisted/resumable review jobs.
- `Brilliant` is not emitted until sacrifice soundness can be established reliably.
- Scores with only UCI upper/lower bounds are accepted but carry reduced confidence in the report.

## Verification

- Pure classification/accuracy fixtures cover best, forced, missed mate and decisive blunder cases.
- Review orchestration tests cover ordering, progress and cancellation.
- Browser UI exposes no fake engine action; desktop UI exposes start/stop and results.
- A real Stockfish smoke game produces complete per-move output.
