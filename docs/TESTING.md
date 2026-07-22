# Testing

## Fast deterministic suite

```bash
npm run lint
npm run typecheck
npm test
npm run test:rust
npm run build
```

Frontend tests cover chess rules, clock presets/formatting plus visible-value tick scheduling, fresh-clock arming, increment, delay, pause/resume, flag fall, typed termination, deterministic bot draw decisions, resolved White/Black/Random player-side ownership, safe bot-turn premove geometry/en-passant/final-legality handling, result-aware PGN, synthesized sound patterns/preferences, accessible dialogs, workspace-handoff top-scroll/focus/no-op behavior and labelled primary landmarks, engine-setting normalization/migration, bounded game-library/database contracts, canonical persisted-review keys and validation, browser review storage, review database command contracts, fail-closed retry construction, fully validated saved-Stockfish-PV replay, original local tactics legality/attempt persistence/no-spoiler presentation, legacy-empty fallback, malformed non-empty PV rejection, exact-UCI matching, opponent auto-replies, promotion and schedule-once behavior, bounded browser retry storage, focused retry-queue presentation, lazy fallback search isolation, browser Stockfish handshake/options/UCI parsing/search/cancellation, native Stockfish command/result/probe contracts, PGN/FEN analysis timelines, black-to-move PGN numbering, SAN PV conversion, score perspectives, malformed analysis metrics, stale-result rejection, nonlinear review accuracy, contextual classification, summaries, job progress/cancellation, terminal-position handling, rules-proven coach evidence and Review workspace interaction. Rust tests additionally cover SQLite schema/review/retry/tactics contracts plus FEN safety, UCI parsing, discovery precedence, settings validation, exact UCI option/go commands, probing, strength mapping, initialization, search metrics, MultiPV ordering, bound handling, dedicated analysis cancellation and timeout using executable fake engines.

## Workspace-navigation user check

1. In **Play**, scroll the page to a measurable non-zero position (for example, 550 px), then select **Review**. Confirm the page starts at the top and the current workspace heading receives focus without being scrolled away.
2. In **Review**, scroll to a measurable non-zero position (for example, 300 px), then activate **Review** again. Confirm the viewport and focus remain where the player left them; an active-tab click must not create a new handoff.
3. Use a keyboard or screen reader to switch to another primary workspace. Confirm the focused heading names the current workspace and the surrounding `<main>` landmark is labelled by that heading.

**Recorded evidence (2026-07-22):** the focused workspace-navigation suite passed with 5 files / 27 tests. The full frontend suite passed with 35 files / 155 tests; lint, typecheck and the web build passed; the Rust suite passed with 23 tests; and the macOS Tauri bundle passed. In the in-app browser, changing from Play at `scrollY = 550` to Review resulted in `scrollY = 0`, focus on the `Review` title and the heading at 37 px from the viewport top. With Review at `scrollY = 300`, activating Review again left `scrollY = 300`.

**Desktop handoff:** a dedicated packaged-desktop workspace-navigation walkthrough was not performed. Do not infer desktop interaction coverage from the successful bundle build.

## Analysis workspace user check

1. Open Review, load the current game and use first/previous/next/last plus a move-row selection; confirm the board and active move stay aligned.
2. Import a legal PGN and a legal FEN; confirm the ply count and board position, then verify malformed input produces a useful error without losing the previous timeline.
3. In both the website and desktop app, select Balanced and three lines; confirm Stockfish identity, three SAN candidate lines, score/WDL and effort metrics appear.
4. Change ply, perspective, line count and effort during analysis; confirm only the newest position/settings are displayed.
5. Confirm Flip changes orientation without changing the analyzed FEN.
6. In the browser build, confirm the panel reports Stockfish WebAssembly, uses one Worker thread and keeps the imported game on-device.
7. In both runtimes, start a full-game job, stop during the first move and confirm the interactive panel resumes without stale results.
8. Run `1. f3 e5 2. g4 Qh4#`; confirm the final position says no legal continuation, `g4` is a Blunder/turning point, `Qh4#` is engine-confirmed and clicking the turning point selects its position and explanation.

## Local PGN/FEN transfer check

1. In Play, use **Copy PGN** and **Download PGN** for a non-empty game. Confirm the nearby toolbar status reports success or a recoverable error. Use **Copy current FEN** and **Download FEN** from Position tools. Confirm each action names the requested notation, the downloads contain plaintext notation and no network request is needed.
2. Where permissions can be controlled, deny Clipboard API access. Confirm the selected-text fallback succeeds when available; otherwise confirm the UI presents a clear recoverable status instead of an uncaught error.
3. In Review, Tab to the visible local-file picker and activate it by keyboard. Paste a legal PGN and FEN, then select valid local `.pgn`, `.fen` and `.txt` fixtures. Confirm a text file containing FEN is treated as FEN, a text file containing PGN is treated as PGN, and a valid PGN misnamed `.fen` still loads as PGN; check that the resulting board, ply count and navigation agree with the imported notation.
4. Run the file-import contracts to confirm a picker-declared file over 512 KiB is rejected before `File.text()` is called, and that a slow older selection cannot overwrite a newer selection.
5. With a known-good Review timeline already visible, try malformed notation, a file over 512 KiB and a FEN over 1 KiB. Each must report a useful error and leave the displayed timeline unchanged.
6. Run the text-transfer and analysis-file-import contracts with the Review component tests before release, then complete this browser and desktop checklist.

**Recorded evidence (2026-07-22):** `npm test` passed with 35 files / 155 tests; lint, typecheck, web build and the 23-test Rust suite passed; `npm run tauri:build` produced `src-tauri/target/release/bundle/macos/KnightClub.app`. Automated coverage includes pre-read declared-size rejection, latest-selection-wins, valid PGN misnamed `.fen`, the focusable picker and toolbar-adjacent feedback. Browser verification passed for the explicit Play PGN/FEN controls, valid Review FEN and invalid-FEN error clarity with prior-timeline preservation.

**Desktop handoff:** a dedicated manual desktop transfer walkthrough was not performed. Keep the remaining browser/desktop scenarios above as release checklist items; do not infer desktop interaction coverage from the successful bundle build.

## Coach-evidence user check

1. Complete or reopen a desktop full-game report with an Inaccuracy, Mistake, Miss or Blunder, then select that move in the review move list.
2. Confirm the Coach's evidence card names the played move, a legal recommended move and the recorded SAN continuation without starting another analysis request.
3. For a verified motif, check every named square on the board. The card may state only a mating move, check, unsupported moved piece, direct double attack or absolute king pin; it must not claim a forced material win from evaluation alone.
4. Confirm the same evidence squares receive a blue board ring without obscuring pieces, coordinates, last-move feedback or focus indication. Select a Best/Good/Forced move and confirm no error-coach card or evidence ring appears.
5. Use Left/Right and Home/End outside an editable control to move through replay positions; confirm typing in PGN/FEN fields is unaffected. In Review, `N`, `U` and `F` must not change the hidden Play game. Reopen the same saved report and confirm the guidance is identical.

## Personal retry queue user check

1. Complete or reopen a report with a normal-confidence Inaccuracy, Mistake, Miss or Blunder that has a legal recorded best move and a multi-ply saved best line. Select it and confirm **Practice this position** is available; use **Practice key moments** and confirm it adds no more than three eligible prompts. Verify from the completed report/fixture that the stored `solutionLineSan` is its Stockfish PV, not the continuation that actually followed the error in the original PGN. A Best move, limited-confidence move, malformed/mismatched report or terminal source position must not create a prompt.
2. Enter Train from either action. Confirm the board reconstructs the exact position before the reviewed move and is oriented to the reviewed colour. Initially it must not expose the solution, future PV SAN or Coach evidence; a multi-ply item may show only progress such as **Your move 1 of 2**.
3. Make the exact saved first player move. Confirm only the immediately following saved opponent PV reply is auto-played, the board then prompts for the next player move, and future SAN remains hidden until reached or deliberately revealed. Complete the final player move and confirm the saved line is shown only then. An even-length saved line must also finish after its final auto-reply.
4. Make a legal but different move at either player turn. Confirm the board returns to the pre-move prompt, says only that it is not on the saved review line and that no additional engine comparison ran, and never labels the alternative a blunder, mistake or objectively bad move. Confirm this finalizes one due-now reset rather than advancing a partial line.
5. Use both hint levels and Reveal line. Confirm the first hint is the saved focus, the stronger hint identifies only the current starting square, Reveal is explicit, and no fresh analysis request starts. A line completed after a hint, a reveal and a skip must reset the streak; only a complete unassisted line advances it once. Use a promotion fixture to confirm the user must choose the recorded promotion piece rather than receiving an implicit queen; Escape must cancel that picker and `R` must reset a solved/revealed position.
6. Use **Back to review** and confirm the retained source PGN opens at the exact error ply. Reload the browser build or quit/reopen the desktop app during an incomplete line: the transient board/cursor restarts from the stored pre-move FEN, while a finalized retry schedule and due order persist independently of the source report. With a controlled test clock or persistence fixture, confirm unassisted complete lines schedule 1, then 3, 7, 14 and 30 days.
7. Run retry-line, retry-domain, browser-storage, database-client, component and Rust migration/CRUD contracts. They must cover an explicitly empty legacy `solutionLineSan` first-move fallback and reject a malformed non-empty saved PV instead of shortening it. Before treating this flow as release-verified, complete the full frontend/native/build gates and confirm Train starts no Stockfish request.

## Persisted review user check

1. In the desktop app, finish a non-empty PGN game and complete its full-game review. Confirm the result says it was saved privately rather than merely completed.
2. Quit and relaunch the app, open the same game in Review and confirm the saved report appears without starting a new engine job.
3. Open Library and confirm the matching completed game shows Reviewed; use the direct Review action to reach the report.
4. Import a different PGN while the first saved-report load is pending; only the second timeline and its matching report may remain visible.
5. Run the browser storage and native command-contract tests. They must reject malformed, oversized, incomplete, non-contiguous or key/source-mismatched records and retain no more than 500 reports.

## SQLite persistence user check

1. Start the packaged desktop app with existing localStorage state and an empty database; confirm the active game, preferences and completed games appear.
2. Open Library and confirm it reports private KnightClub device storage rather than browser-only storage.
3. Make a legal move, wait for the Stockfish reply, fully quit the app and reopen it.
4. Confirm the exact move list, side to move, engine settings and library survive the restart.
5. Run the Rust database contract target to verify forward v1/v2/v3/v4-to-v5 migration, query indexes, idempotent transactional import, review/retry/tactics upsert/load/limits, and corrupt-file backup.

## Engine-settings user check

1. In the browser, expand Engine settings and verify it initially says it loads on demand; select **Verify engine** and confirm Stockfish 18 Lite reports Ready. Executable controls remain hidden, Threads is fixed at one and Hash is capped at 128 MB.
2. Select Custom, enter move time/depth/nodes/threads/Hash, press Enter or leave each field, reload and verify the normalized values survive.
3. Confirm editing a multi-digit number stays as a draft and commits once instead of clamping each typed character.
4. In the macOS app, verify automatic discovery reports the real Stockfish identity and resolved path.
5. Open the native picker, choose Stockfish, confirm Checking becomes Ready and the selected path persists.
6. Select Custom, make a legal White move and confirm Stockfish replies under the chosen limits.
7. During a bot search, change a setting or start a new game; confirm the stale result never appears.

## Completion-action browser check

1. In hot-seat mode offer a draw; confirm the board locks while the response dialog is open.
2. Decline and confirm the board resumes. Offer again, accept and verify `1/2-1/2` plus `Draw by agreement`.
3. Open Review and verify its PGN contains `Result` and `Termination` headers.
4. Start a new game, open Resign, cancel with Escape, then reopen and confirm; verify the correct colour loses and the board locks.
5. Reload or reopen the newest Library entry and verify its non-board termination survives.
6. Offer an opening draw to a bot and confirm it deterministically declines.
7. Toggle move sounds, reload and confirm the preference survives.

## Timed-game browser check

1. Select a timed control, wait before moving, and confirm both clocks keep their configured values until the first legal move.
2. Start a hot-seat game with a custom short base, increment and delay; confirm only the active clock decreases and a legal move switches it once.
3. Pause the active clock, wait, and confirm its displayed value is unchanged; resume and make the reply.
4. Undo and confirm both the move and its settled pre-move clock return.
5. Let a six-second game flag; confirm the board locks, the result is recorded and the flagged player is labelled.
6. Start a timed bot game, make a legal White move, and confirm one engine reply returns the active clock to White.
7. Reload a paused session and confirm the paused side and time survive without charging the reload interval.

## Player-side browser/native check

1. In a bot game choose **White** and confirm the user opens, then Stockfish owns Black; choose **Black** and confirm the engine makes one legal opening White move before user input becomes available.
2. With a timed Black-side game, confirm the opening bot move starts Black's clock, a Black user move starts White's clock, and undo restores the exact previous clock/turn without replaying an opening bot move.
3. Choose **Random**, record the displayed resolved colour, reload, and confirm it remains unchanged. Start a new game and confirm a fresh random draw is permitted.
4. During a bot search open Resign or a restart request; confirm no hidden bot move appears while the decision is open. Cancel and confirm the exact position resumes; confirm and verify the selected human colour receives the termination.
5. Finish a bot game, confirm its Library card says `You: White` or `You: Black`, reopen it, and confirm the player bar/orientation match the saved side.

## Premove browser/native check

1. During a local bot search, click or drag one human piece to queue a plausible premove. Confirm only the human pieces remain draggable, source and destination receive distinct purple markers, the queued move is announced with a Cancel premove control, and no stale legal-target dots imply guaranteed legality.
2. Let the bot reply. Confirm a legal queued move is applied immediately after the bot move, the queue disappears, and Stockfish begins a fresh search only if the premove hands the turn back to the bot. Queue a move made illegal by the reply and confirm only the bot move remains with a clear cancellation notice.
3. In a timed increment game, queue a premove and confirm the human move consumes no elapsed time but earns the configured increment. Undo it and confirm the board and exact pre-premove clock return without replaying a stale engine result.
4. Test both a White-side reply and a Black-side opening premove. Press Escape or use Cancel premove, then pause, restart, open a decision, load a saved game and reload the app; a queued move must never survive any of those boundaries.

## Play-flow regression check

1. With a non-empty unfinished game, request New game, another mode, another time control, FEN load and a saved-game open. Each action must first offer Keep playing; cancelling must preserve the board and clock.
2. Drag a legal piece with a mouse, touch device and pen where available. Click/tap selection, keyboard selection and promotion must still work after a drag.
3. In Library, search by game text, switch All/Reviewed/Unreviewed filters, reveal aborted zero-ply records only on request, and use the separate Open board and Review actions.

## Desktop board-clarity check

1. At a wide desktop viewport such as 1470 × 801, open Play and confirm the height-aware board target is about 621 px (`801 - 180`) rather than the former roughly 541 px (`801 - 260`). Confirm the existing pieces have more readable square area without clipping, overlap or changed board controls.
2. At 920 px and below, confirm the board retains its `calc(100dvh - 260px)` cap. At 700 px and below, confirm the board stage remains `width: 100%` and does not introduce horizontal overflow.
3. In the packaged macOS application, repeat the wide desktop and responsive-boundary checks before treating this presentation change as manually desktop-verified.

**Recorded evidence (2026-07-22):** a browser/layout audit at 1470 × 801 observed the target increase from about 541 px to about 621 px. The full frontend suite passed with 35 files / 155 tests; typecheck, lint, the web build and the macOS Tauri bundle also passed.

**Desktop handoff:** a manual wide-desktop packaged-app walkthrough was not performed. Do not infer it from the successful bundle build.

## Native smoke test

```bash
brew install stockfish
KNIGHTCLUB_RUN_STOCKFISH_SMOKE=1 cargo test --manifest-path src-tauri/Cargo.toml --test stockfish_smoke
npm run tauri:dev
```

The smoke test probes the real executable, searches with custom UCI/resource limits and requests three real MultiPV lines. In the native window, make a legal White move and confirm the Black player bar changes from “Calculating…” to “Stockfish 18”, a legal reply appears, Undo cancels safely, and a new game remains playable. Then open Review, navigate/import a position and confirm real candidate lines update. Also run `npm run tauri:build` before a release.

## Failure checks

Temporarily set `KNIGHTCLUB_STOCKFISH` to a non-executable path. The desktop UI must report the problem, use KnightBot, and remain playable. For the website, block the generated Stockfish Worker asset and confirm bot play reports the fallback while Review reports an engine error rather than fabricated analysis. Rapidly reset or undo during engine thinking; no move from the older FEN may appear.
