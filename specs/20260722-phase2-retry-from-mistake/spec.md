# Phase 2 retry-from-mistake specification

## User outcome

After selecting an adverse move in a completed local review, a player can immediately replay the exact position before that move and try to find the saved engine recommendation. They can also keep those moments in a private, locally persisted practice queue and return from Train after restarting the app. The exercise feels like a small, focused chess decision rather than a detached score explanation: it orients to the player who made the move, supports click, drag and keyboard board interaction, gives an honest result, and returns cleanly to review.

## Functional requirements

1. A reviewed `inaccuracy`, `mistake`, `miss` or `blunder` with normal confidence, a legal recorded top move and a structurally matching timeline entry is eligible for a private retry item. The Review page exposes **Practice this position** for a selected eligible error and a capped **Practice key moments** batch action for eligible moments in the report.
2. Starting a retry reconstructs the exact pre-move FEN, places the player on the colour that made the reviewed move, and labels the exercise with the original move/classification without revealing the solution by default.
3. The player can select, click or drag a legal move on the existing board. Promotion choices must be explicit; an underpromotion must never be silently replaced with a queen.
4. A move succeeds only when it exactly matches the saved UCI top move. A different legal move must not be called a blunder or objectively wrong: KnightClub states only that it is not the recorded move and does not evaluate alternatives in this exercise.
5. A player can retry after a non-matching move, use a non-spoiling focus hint, reveal the recorded solution, return to the exact reviewed error, or advance directly to the next due retry.
6. Retry items are self-contained, keyed by `reviewKey + sourcePly`, scheduled locally without notifications, and survive a restart even if the bounded completed-review table later prunes the original report. Correct, hinted, revealed and skipped outcomes update only retry scheduling state—not the report.
7. The Train page exposes a compact, due-first **From your games** queue. It never claims to know which side was the user in an imported/hot-seat PGN; exercise labels remain colour-neutral.
8. The exercise uses only completed-review data and legal-board reconstruction. It launches no fresh Stockfish request and never mutates the report.
9. Invalid/mismatched timeline data, missing or illegal UCI, a move that is not for the reviewed side, terminal positions, or no qualifying errors fail closed: no retry item is created and normal review remains usable.
10. While a retry is active, replay navigation shortcuts do not move a hidden review position. A visible exit control returns to normal Review state; ordinary board focus and selection remain keyboard accessible.

## Non-goals

- No claim that the recorded first choice is the only good move.
- No new engine query, dynamic scoring of alternatives, cloud data, ratings, notifications, streak pressure, shared content or online leaderboards.
- No copied Chess.com training copy, assets or trade dress.

## Acceptance evidence

- Pure retry-domain tests prove valid reconstruction, exact UCI matching, promotion handling, source-colour orientation, deterministic scheduling and safe rejection of malformed/mismatched data.
- Browser and SQLite persistence tests prove bounded validation, migration and durable retry restoration.
- Static UI tests prove the focused retry action and honest non-matching/solution language are present without exposing a solution before the player asks.
- Full frontend, Rust, web-production and Tauri production gates pass. A local interactive regression covers add, restart, due-queue, start, non-matching move, retry, solution, success, next error and exit when browser access is available.
