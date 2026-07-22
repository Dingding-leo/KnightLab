# Phase 3 recorded-review continuation

**Status:** Implemented — release gates and the core interactive Train walkthrough passed; optional hint/reveal/skip manual checks remain listed in `docs/TESTING.md`.  
**Date:** 2026-07-22

## Objective

Turn a saved personal-review prompt into a small, honest continuation exercise when the completed Stockfish review already contains a principal variation. The player should replay only the saved local evidence, one move at a time, without presenting the original game continuation as an engine recommendation or issuing a new search in Train.

## Acceptance criteria

1. When a completed review has a valid recorded best line, creating a retry prompt snapshots its bounded canonical `solutionLineSan` Stockfish principal variation. A non-empty value is **not** the continuation that occurred in the original PGN after the reviewed error.
2. Before Train exposes a line, it reconstructs the stored pre-move FEN and replays every saved SAN ply locally with `chess.js`. The first reconstructed ply must exactly match the already verified saved UCI/SAN solution and every later ply must remain legal in sequence.
3. An explicitly empty legacy `solutionLineSan` safely remains a one-move exercise using the independently verified first UCI solution. A non-empty saved line that cannot be completely reconstructed is unavailable; Train must not shorten, guess or silently fall back from that malformed line.
4. A continuation exercise initially hides future SAN. It shows only current progress, such as “Your move 1 of 2,” and retains keyboard, click, drag and explicit-promotion board interaction.
5. Each player move must exactly match the next locally reconstructed saved move. After a correct player move, Train auto-plays only the next saved opponent PV reply, then prompts the player for the next saved move. No alternative is scored and no move is claimed to be uniquely good.
6. A retry schedule records exactly one successful outcome only after the player completes the whole saved line without assistance. A legal alternate, a hint-assisted completion, reveal or skip resets the streak and leaves the item due immediately; an intermediate correct ply does not alter the schedule.
7. The current board, completed plies, selection and hint state are transient Train-session state. The independently persisted retry item retains only its prompt and schedule metadata, so a reload restarts the line while preserving finalized attempt scheduling.
8. Train never launches Stockfish. It consumes only completed-review data plus local `chess.js` reconstruction; reveal, hint, alternate and auto-reply paths must not start a new engine request or mutate the completed report.
9. Existing bounded browser localStorage and SQLite retry records remain compatible. No database migration is needed solely to use an already stored `solutionLineSan` value.

## Out of scope

- Dynamic evaluation of legal alternatives, generated puzzles, ratings, streak pressure, notifications or online training data
- Resuming a partially replayed line after reload
- Claiming that a saved PV is forced, unique, or the continuation the original game actually followed
- Fresh Stockfish analysis in Train, cloud sync or copied third-party training UI/content

## Verification evidence

- Focused retry-line and component coverage must prove full local replay, opponent auto-replies, progress without future-line leakage, exact promotion handling, legacy-empty fallback and malformed-nonempty fail-closed behavior.
- Scheduling coverage must prove that a multi-move line writes one unassisted success only at completion, while alternate, hint-assisted completion, reveal and skip reset the item.
- Browser/localStorage and SQLite contracts must retain valid durable retry items and reject malformed persisted non-empty PV data.
- Full frontend, native and production gates passed for this vertical. The browser walkthrough created a real 6-ply saved-review PV, verified hidden future moves, saved opponent auto-replies, alternate reset, one completion-time schedule advance and reload persistence; optional hint/reveal/skip checks remain documented for future manual regression.
