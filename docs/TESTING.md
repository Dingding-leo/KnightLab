# Testing

## Fast deterministic suite

```bash
npm run lint
npm run typecheck
npm test
npm run test:rust
npm run build
```

Frontend tests cover chess rules, clock presets/formatting plus visible-value tick scheduling, the isolated `ClockRuntime` frame/flag boundary and context snapshot, fresh-clock arming, increment, delay, pause/resume, flag fall, typed termination, deterministic bot draw decisions, named local profile IDs/legacy mapping, exact legal standard-start opening cues, profile-specific close-candidate selection and fail-closed mate/bound/illegal/mismatched PV fallbacks, resolved White/Black/Random player-side ownership, safe bot-turn premove geometry/en-passant/final-legality handling, current-game snapshot/replay equivalence and owned premove application, result-aware PGN, synthesized sound patterns/preferences, accessible dialogs and decision/promotion-dialog shortcut isolation plus direct promotion keys/focus, guarded Play history-arrow navigation, memoized-square board accessibility markup and stable inert Review-board interaction, memoized/delegated Play notation markup, workspace-handoff top-scroll/focus/no-op behavior and labelled primary landmarks, engine-setting normalization/migration, bounded game-library/database contracts including active-session coalescing/FIFO barriers, canonical persisted-review keys and validation, browser review storage, saved-review hydration action gating, review database command contracts, bounded ambient-analysis cache identity/LRU/output isolation, strict FEN-prefix live-game continuation detection, fail-closed retry construction, fully validated saved-Stockfish-PV replay, original local tactics legality/attempt persistence/no-spoiler presentation, legacy-empty fallback, malformed non-empty PV rejection, exact-UCI matching, opponent auto-replies, promotion and schedule-once behavior, bounded browser retry storage, focused retry-queue presentation, lazy fallback search isolation, browser Stockfish handshake/options/UCI parsing/search/cancellation and acknowledged-option reuse, same-search two-PV play candidate normalization, native Stockfish command/result/probe contracts, PGN/FEN analysis timelines, black-to-move PGN numbering, SAN PV conversion, score perspectives, malformed analysis metrics, stale-result rejection, nonlinear review accuracy, contextual classification, summaries, boundary-position reuse, job progress/cancellation, terminal-position handling, rules-proven coach evidence and Review workspace interaction. Rust tests additionally cover SQLite schema/review/retry/tactics contracts plus FEN safety, UCI parsing, discovery precedence, settings validation, exact UCI option/go commands, same-search candidate count and ordered PV collection, repeated acknowledged-option reuse with go-only and option-setting changes, probing, strength mapping, initialization, search metrics, MultiPV ordering, bound handling, dedicated analysis cancellation and timeout using executable fake engines.

**Latest responsive-workspace evidence (2026-07-22):** lint and typecheck passed; `npm test` passed with 43 files / 202 tests; `cargo test --manifest-path src-tauri/Cargo.toml` passed with 30 deterministic tests; production web and macOS Tauri builds passed. The initial production entry measured 348.29 kB / 108.20 kB gzip, with Review, Train and Insights emitted as async chunks. The local Vite endpoint returned HTTP 200. Browser interaction validation for the new prefetch/recovery state remains a manual release check.

**Latest profile-candidate evidence (2026-07-23):** lint and typecheck passed; `npm test` passed with 46 files / 220 tests; `cargo test --manifest-path src-tauri/Cargo.toml` passed with 32 tests; production web and macOS Tauri builds passed; the local Vite endpoint returned HTTP 200. The fake UCI contracts prove that profile candidates use one unchanged `go movetime 120 nodes 18000`, one thread and `MultiPV 2`; malformed telemetry falls back to the valid `bestmove`. A manual in-app/profile walkthrough remains a release check.

**Latest Play performance evidence (2026-07-23):** lint and typecheck passed; `npm test` passed with 47 files / 222 tests; `cargo test --manifest-path src-tauri/Cargo.toml` passed with 32 tests; production web and macOS Tauri builds passed; and the local Vite endpoint returned HTTP 200. The new clock-runtime contract covers visible-second, low-time-tenth and exact-flag boundaries without App state, while board accessibility contracts retain the 64-square grid, one roving Tab stop, drag ownership, premove labels and coach-evidence labels after square memoization. Browser/native UCI contracts assert the lower 60/120/200 ms and 6k/18k/45k preset caps, including the unchanged one-command `MultiPV 2` candidate route. A manual low-time/drag/premove/keyboard Play walkthrough remains release handoff work.

**Latest Review/persistence performance evidence (2026-07-23):** lint and typecheck passed; `npm test` passed with 49 files / 230 tests; `cargo test --manifest-path src-tauri/Cargo.toml` passed with 32 tests; production web and macOS Tauri builds passed; and the local Vite endpoint returned HTTP 200. The Review contract locks the shared inert board callbacks/targets, while deferred database contracts prove queued snapshots retain only the newest payload, a live write never overlaps its successor, failures settle every coalesced caller, invalid data never crosses the boundary, and normal writes/clear-session actions retain FIFO barriers. A manual long-PGN Review responsiveness walkthrough remains release handoff work.

**Latest Play-flow evidence (2026-07-23):** lint and typecheck passed; `npm test` passed with 49 files / 231 tests; `cargo test --manifest-path src-tauri/Cargo.toml` passed with 32 tests; production web and macOS Tauri builds passed; and the local Vite endpoint returned HTTP 200. SSR contracts prove fresh setup starts open with its compact summary, while restored in-progress play hides inactive configuration and retains completion actions. The first-ply/mobile disclosure walkthrough remains release handoff work.

**Latest native Play cancellation evidence (2026-07-23):** lint and typecheck passed; `npm test` passed with 49 files / 231 tests; `cargo test --manifest-path src-tauri/Cargo.toml` passed with 33 tests; production web and macOS Tauri builds passed; and the local Vite endpoint returned HTTP 200. The deterministic fake-UCI contract starts a valid supervisor, pre-cancels the next Play request, then proves its command log contains only the initial `uci`/`isready` handshake—no option, `position` or `go` command. The native path also rechecks cancellation after waiting for the single-engine mutex, before it can create or initialize a supervisor. A manual rapid-reset desktop Play walkthrough remains release handoff work.

**Latest custom-time responsiveness evidence (2026-07-23):** lint and typecheck passed; `npm test` passed with 49 files / 232 tests; `cargo test --manifest-path src-tauri/Cargo.toml` passed with 33 tests; production web and macOS Tauri builds passed; and the local Vite endpoint returned HTTP 200. The Play markup contract restores a saved `7 | 3` with `2`-second delay into the editable custom-time fields. The form’s uncommitted values are ref-backed native-input drafts, so each keystroke avoids a root Play-render update; applying remains covered by the existing validated custom-clock contract. A manual custom-time typing/reopen walkthrough remains release handoff work.

**Latest monotonic Play-cancellation evidence (2026-07-23):** lint and typecheck passed; `npm test` passed with 49 files / 232 tests; `cargo test --manifest-path src-tauri/Cargo.toml` passed with 34 tests; production web and macOS Tauri builds passed; and the local Vite endpoint returned HTTP 200. A native unit contract records stop 42 followed by delayed stop 41 and proves requests through 42 remain cancelled while 43 remains eligible. The fake-UCI contract then treats a request below the cancellation watermark as superseded and confirms no engine setup, `position` or `go` command is sent. This prevents rapid Play actions from accidentally spending a full stale bot search budget; a manual rapid-reset desktop walkthrough remains release handoff work.

**Latest Play long-history evidence (2026-07-23):** lint and typecheck passed; `npm test` passed with 49 files / 233 tests; `cargo test --manifest-path src-tauri/Cargo.toml` passed with 34 tests; production web and macOS Tauri builds passed; and the local Vite endpoint returned HTTP 200. The chess-domain equivalence contract proves that cloning from a cached verbose move snapshot produces the same FEN, SAN history and PGN as the fallback replay. Play derives notation from that same snapshot and reuses one memoized current PGN for sharing and active-session persistence, so a long move no longer pays for several identical history/PGN reconstructions. A manual long-game Play responsiveness walkthrough remains release handoff work.

**Latest desktop lazy-library evidence (2026-07-23):** lint and typecheck passed; `npm test` passed with 49 files / 236 tests; `cargo test --manifest-path src-tauri/Cargo.toml` passed with 36 tests; production web and macOS Tauri builds passed; and the local Vite endpoint returned HTTP 200. Desktop startup now validates only the session/preferences bootstrap and a bounded game count; game PGNs remain in SQLite until Library or Insights is opened. A native contract corrupts an otherwise stored game payload and proves bootstrap still succeeds while the on-demand list rejects it, while a review-only database proves legacy browser data cannot overwrite non-game state. Frontend contracts reject malformed/duplicate lazy lists, preserve FIFO around save → list → clear, and merge delayed native data under newer in-memory saved/reviewed records. A manual packaged-desktop large-library walkthrough remains release handoff work.

**Latest interaction-smoothness evidence (2026-07-23):** lint and typecheck passed; `npm test` passed with 50 files / 247 tests; `cargo test --manifest-path src-tauri/Cargo.toml` passed with 36 tests; production web and macOS Tauri builds passed; and the local Vite endpoint returned HTTP 200. Premove tests prove conditional queueable targets, including promotion shape previews, while the board contract labels those markers as conditional and keeps final legality with `chess.js`. Review persistence tests prove a deferred save reports success or a recoverable failure without changing an already completed report; stale/new-run or unmounted UI completions stay silent while a successful durable write still updates linked Library/Insights metadata. The narrow toolbar retains its labelled DOM/Tab order through explicit game/transfer groups and expands controls to 44 px below 430 px. Prefix replay retains a custom FEN and does not mutate the live game, while clickable notation contracts identify the currently previewed ply and stop auto-following when the player is inspecting history. Position tools derive their copied/downloaded FEN from that displayed board and state when the live clock continues. Review-to-Train contracts retain serial partial-save behavior while exposing a polite preparation notice and action-specific label. The fixed 100 × 100 accessible SVG frame remains covered while pawn/queen art receives only internal optical scaling. A manual browser/packaged-desktop interaction walkthrough remains release handoff work.

**Latest mobile Review-navigation evidence (2026-07-23):** lint and typecheck passed; `npm test` passed with 50 files / 247 tests; `cargo test --manifest-path src-tauri/Cargo.toml` passed with 36 tests. The Review markup contract proves the labelled **Jump to move** control offers Start plus SAN positions and follows board navigation in source order, before transfer controls, while the complete labelled move list remains in the analysis panel. This is deterministic/markup evidence; a manual narrow browser and packaged-desktop walkthrough remains release handoff work.

**Latest Play preview-navigation evidence (2026-07-23):** lint and typecheck passed; `npm test` passed with 51 files / 251 tests; `cargo test --manifest-path src-tauri/Cargo.toml` passed with 36 tests. Pure state contracts prove Previous holds at the earliest historical move, Next reaches live only at the newest move, invalid values fail closed and a bot-appended move keeps the selected preview inspectable. Presentation contracts retain the labelled Historical position navigation group, Previous, Next, current move count and Return to live. This is deterministic/markup evidence; a manual Play and narrow packaged-desktop walkthrough remains release handoff work.

**Latest Play-to-Review handoff evidence (2026-07-23):** lint and typecheck passed; `npm test` passed with 51 files / 252 tests; `cargo test --manifest-path src-tauri/Cargo.toml` passed with 36 tests; production web and macOS Tauri builds passed; and the local Vite endpoint returned HTTP 200. The one-shot preview target requires an integer historical ply and exact expected FEN. Contracts prove a matching prefix remains valid after a bot appends a reply, while a changed FEN, zero ply or out-of-range ply falls back to normal Review. The Review component initializes to the verified target before its ordinary analysis effect runs, and the Play preview group exposes **Review this position**. This is deterministic/markup evidence; a manual Play-to-Review walkthrough remains release handoff work.

**Latest phone Review replay-control evidence (2026-07-23):** lint and typecheck passed; `npm test` passed with 51 files / 252 tests; `cargo test --manifest-path src-tauri/Cargo.toml` passed with 36 tests; production web and macOS Tauri builds passed; and the local Vite endpoint returned HTTP 200. The Review markup contract retains labelled first/previous/next/last controls. At the phone breakpoint, CSS reserves four 44 px arrow columns around the position output instead of reducing them at 430 px. This is deterministic/markup evidence; a manual narrow-window replay walkthrough remains release handoff work.

**Latest phone Play-notation target evidence (2026-07-23):** lint and typecheck passed; `npm test` passed with 51 files / 252 tests; `cargo test --manifest-path src-tauri/Cargo.toml` passed with 36 tests; production web and macOS Tauri builds passed; and the local Vite endpoint returned HTTP 200. MoveList contracts retain separate labelled White/Black SAN buttons and the active displayed position. At the phone breakpoint, CSS raises each button from 24 px to 44 px while preserving the two-move row grid and live-follow behavior. This is deterministic/markup evidence; a manual phone notation walkthrough remains release handoff work.

**Latest Review-context and Play-engine-status evidence (2026-07-23):** lint and typecheck passed; `npm test` passed with 52 files / 255 tests; `cargo test --manifest-path src-tauri/Cargo.toml` passed with 36 tests; production web and macOS Tauri builds passed; and the local Vite endpoint returned HTTP 200. Review markup now exposes the selected SAN with compact ply count plus a full accessible navigation label. Play engine-status contracts prove a real Stockfish identity/path yields Ready, authored opening cues do not claim verification, and KnightBot/malformed/failure paths produce an honest error without another probe or search. This is deterministic/markup evidence; manual Review/engine-status walkthrough remains release handoff work.

**Latest first-action, live-Review and phone-target evidence (2026-07-23):** lint and typecheck passed; `npm test` passed with 53 files / 259 tests; `cargo test --manifest-path src-tauri/Cargo.toml` passed with 36 tests; production web and macOS Tauri builds passed; and the local Vite endpoint returned HTTP 200. SSR contracts prove fresh and subsequent White/Black human bot turns expose an accessible **Your move** cue; a real bot reply names its exact SAN through a polite atomic status, while bot-first, hot-seat and check states keep their more specific feedback. The live-continuation contract accepts only a same-start, strict per-ply FEN extension and otherwise fails closed; its Review presentation stays opt-in and labels the newest SAN. Phone CSS keeps Play game actions, Review updates and full Review notation at 44px targets through 700px. This is deterministic/markup evidence; manual Play/Review and narrow browser or packaged-desktop walkthrough remains release handoff work.

**Latest low-compute Review and Play snapshot evidence (2026-07-23):** lint and typecheck passed; `npm test` passed with 54 files / 265 tests; `cargo test --manifest-path src-tauri/Cargo.toml` passed with 36 tests; production web and macOS Tauri builds passed; and the local Vite endpoint returned HTTP 200. The ambient-cache contracts require exact runtime/path/FEN/normalized-setting identity, retain at most 24 LRU results and return independent copies, while a mismatched response cannot populate the cache. Play contracts prove the supported snapshot route preserves full SAN history and stays independent of the live game, and an owned bot-reply premove appends legally without a second clone. On this machine, deterministic 40/80/120/200-ply `chess.js` microbenchmarks measured replay at 1.200/1.948/2.962/4.837 ms versus platform snapshot at 0.056/0.096/0.142/0.221 ms per copy; this is a local implementation benchmark, not a substitute for a manual long-game UX walkthrough. The production entry measured 368.99 kB / 114.77 kB gzip and the lazy Review chunk 45.60 kB / 14.73 kB gzip. Manual browser and packaged-desktop play/review walkthroughs remain release handoff work.

**Latest Review-boundary reuse and modal-safety evidence (2026-07-23):** lint and typecheck passed; `npm test` passed with 54 files / 268 tests; `cargo test --manifest-path src-tauri/Cargo.toml` passed with 36 tests; production web and macOS Tauri builds passed; and the local Vite endpoint returned HTTP 200. Review-runner contracts prove a normal two-ply game analyzes exactly its three unique FENs with `MultiPV 2`, `MultiPV 2`, then `MultiPV 1`; terminal checkmate skips the terminal FEN; reused successor scores preserve mover perspective; and cancellation never announces a ready next ply. Shortcut contracts block New game, Undo, Flip and `⌘/Ctrl+Z` behind an open decision dialog while App retains Escape-to-cancel. The production entry measured 369.02 kB / 114.78 kB gzip and the lazy Review chunk 45.77 kB / 14.79 kB gzip. Manual browser and packaged-desktop interaction walkthroughs remain release handoff work.

**Latest low-compute bot and review-intent evidence (2026-07-23):** lint and typecheck passed; `npm test` passed with 55 files / 272 tests; `cargo test --manifest-path src-tauri/Cargo.toml` passed with 36 tests; production web and macOS Tauri builds passed; and the local Vite endpoint returned HTTP 200. Browser and native UCI contracts match the one-threaded Easy/Balanced/Strong caps of 50/100/160 ms and 4k/10k/24k nodes, including the unchanged one-command `MultiPV 2` route for named profiles. SSR and pure action contracts keep **Review full game** disabled while the matching saved-report lookup is active, then expose the intentional **Review again** action; shortcut contracts cover dialog gating while the promotion overlay now shares that gate and retains Escape-to-cancel. The production entry measured 369.09 kB / 114.78 kB gzip and the lazy Review chunk 46.01 kB / 14.89 kB gzip. Manual browser and packaged-desktop interaction walkthroughs remain release handoff work.

**Latest long-notation rendering evidence (2026-07-23):** lint and typecheck passed; `npm test` passed with 55 files / 272 tests; `cargo test --manifest-path src-tauri/Cargo.toml` passed with 36 tests; production web and macOS Tauri builds passed; and the local Vite endpoint returned HTTP 200. The MoveList markup contract retains each labelled White/Black SAN button, active-position semantics and a validated per-button `data-ply` target for the one delegated click handler. Source-level memoization uses only primitive row state plus a stable latest-row ref, so unchanged historical rows can bail out while a new move updates only the relevant latest/current rows and a preview updates only the previously/currently selected rows. The production entry measured 369.50 kB / 114.96 kB gzip and the lazy Review chunk 46.01 kB / 14.89 kB gzip. This is automated/build evidence, not a manual long-game browser or packaged-desktop observation.

**Latest promotion-flow evidence (2026-07-23):** lint and typecheck passed; `npm test` passed with 55 files / 274 tests; `cargo test --manifest-path src-tauri/Cargo.toml` passed with 36 tests; production web and macOS Tauri builds passed; and the local Vite endpoint returned HTTP 200. Shortcut contracts accept unmodified Q/R/B/N and reject Meta/Ctrl/Alt variants; the promotion-dialog markup has one Queen-first autofocus target when available, named direct-key hints and an accessible Escape instruction. The existing modal gate continues to block unrelated Play shortcuts. The production entry measured 370.27 kB / 115.25 kB gzip and the lazy Review chunk 46.01 kB / 14.89 kB gzip. This is automated/build evidence, not a manual promotion walkthrough.

**Latest Play history-key evidence (2026-07-23):** lint and typecheck passed; `npm test` passed with 55 files / 276 tests; `cargo test --manifest-path src-tauri/Cargo.toml` passed with 36 tests; production web and macOS Tauri builds passed; and the local Vite endpoint returned HTTP 200. Pure preview contracts enter from live with Left, bound at the first existing historical ply, return to live at the newest ply with Right and fail closed for invalid state. Key contracts reject editable targets, modals, modifiers and board-grid focus; the preview control exposes its Left/Right hint. The production entry measured 370.99 kB / 115.45 kB gzip and the lazy Review chunk 46.01 kB / 14.89 kB gzip. This is automated/build evidence, not a manual keyboard/browser walkthrough.

## Current Play and Review continuity user check

1. Start a fresh White-side bot game. Confirm the compact board status says **Your move** and its tooltip/accessible name says “Your move — choose a piece to begin.” After each normal bot reply, confirm it begins **Your move**, names the opponent's latest SAN and is announced once; confirm the same behavior when playing Black. Start a Black-side game and confirm the bot-thinking/premove state remains more prominent; in hot-seat, confirm the side-neutral turn label remains.
2. In Review, load a current game, then let Play advance by one or more matching moves. Confirm a concise live-update notice names the latest SAN. Do not update: the selected Review board and analysis must remain unchanged. Select **Update review** and confirm Review moves to the new final position, clears the former report/progress and leaves only the new-position analysis current.
3. At 390px, 480px and 700px widths, confirm Undo/New game/Pause/Copy PGN/Download PGN and every full Review notation target remain at least 44px tall, with no reordered toolbar actions or wrapping that hides a label.

## Workspace-navigation user check

1. In **Play**, scroll the page to a measurable non-zero position (for example, 550 px), then select **Review**. Confirm the page starts at the top and the current workspace heading receives focus without being scrolled away.
2. In **Review**, scroll to a measurable non-zero position (for example, 300 px), then activate **Review** again. Confirm the viewport and focus remain where the player left them; an active-tab click must not create a new handoff.
3. Use a keyboard or screen reader to switch to another primary workspace. Confirm the focused heading names the current workspace and the surrounding `<main>` landmark is labelled by that heading.

**Recorded evidence (2026-07-22):** the focused workspace-navigation suite passed with 5 files / 27 tests. The full frontend suite passed with 35 files / 155 tests; lint, typecheck and the web build passed; the Rust suite passed with 23 tests; and the macOS Tauri bundle passed. In the in-app browser, changing from Play at `scrollY = 550` to Review resulted in `scrollY = 0`, focus on the `Review` title and the heading at 37 px from the viewport top. With Review at `scrollY = 300`, activating Review again left `scrollY = 300`.

**Desktop handoff:** a dedicated packaged-desktop workspace-navigation walkthrough was not performed. Do not infer desktop interaction coverage from the successful bundle build.

## Analysis workspace user check

1. Open Review, load the current game and use first/previous/next/last plus a move-row selection; confirm the board and active move stay aligned, while the navigator shows Start position or the selected SAN plus its ply count without needing to scroll to the move list.
2. Import a legal PGN and a legal FEN; confirm the ply count and board position, then verify malformed input produces a useful error without losing the previous timeline.
3. In both the website and desktop app, select Balanced and three lines; confirm Stockfish identity, three SAN candidate lines, score/WDL and effort metrics appear.
4. Change ply, perspective, line count and effort during analysis; confirm only the newest position/settings are displayed.
5. Confirm Flip changes orientation without changing the analyzed FEN.
6. In the browser build, confirm the panel reports Stockfish WebAssembly, uses one Worker thread and keeps the imported game on-device.
7. In both runtimes, start a full-game job, stop during the first move and confirm the interactive panel resumes without stale results.
8. Run `1. f3 e5 2. g4 Qh4#`; confirm the final position says no legal continuation, `g4` is a Blunder/turning point, `Qh4#` is engine-confirmed and clicking the turning point selects its position and explanation.
9. With a longer PGN, start a full-game review and keep the current board position selected. While before/after progress advances, confirm the board and notation remain responsive and visually unchanged until you navigate, a Coach-evidence highlight changes, or the completed report arrives. With a UCI command log, confirm each intermediate position is searched once, the final non-terminal position uses one PV, and a terminal final position is not sent to Stockfish.
10. Complete a review while local persistence is delayed. Confirm the scorecards and **Review full game** action return before the short “Saving review privately…” status clears. If storage fails, confirm the completed report remains visible with a save-specific recoverable error rather than an engine failure.
11. While the same save is still pending, leave Review and open Library or Insights after it settles. Confirm the source game becomes **Reviewed** and its metrics no longer count as pending; no stale saving/saved message should be shown in the newly mounted Review workspace.
12. Select **Practice key moments** or **Practice this position** with a deliberately slow local store. Confirm the chosen control reads **Preparing…**, both practice routes disable, and the polite status names the queue work. On a later-item failure, confirm already saved moments remain available and Train does not open prematurely.

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
2. Quit and relaunch the app, open the same game in Review and confirm **Review full game** is disabled while the saved-report lookup is shown. Confirm the saved report appears without starting a new engine job, then verify the explicit rerun control reads **Review again**.
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
8. After a real Stockfish reply, reopen Engine settings and confirm it says Ready with the returned engine identity/path. An authored opening cue must not claim it verified Stockfish; if KnightBot takes over or the search fails, confirm Ready is replaced by an honest error.

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

## Named-opponent browser/native check

1. In **Play**, verify the three original opponent cards show distinct names, monograms, Stockfish targets and honest opening-cue descriptions. Selecting another card during an unfinished game must show the normal replacement confirmation; cancelling preserves the existing board.
2. Start a standard White-side game against Mira and play `1. e4`; confirm Black's `...e5` follows the visible local cue after the normal display cadence, without a Stockfish loading/probe state. Repeat a matching first move as Black and confirm the bot can make its legal opening White cue.
3. Leave a profile's authored route (or load a custom FEN) and confirm the next bot move uses the normal bounded Stockfish path rather than inventing an opening cue. If Stockfish is unavailable, confirm the UI says KnightBot fallback rather than the selected opponent made the fallback move.
4. Reload after choosing an opponent, finish a bot game, and confirm the session, selected card and Library opponent label retain the named profile. Legacy games with only `botLevel` should map to a named profile; malformed profile IDs must not reach the UI.
5. After leaving an authored route, use a position where the selected profile’s second Stockfish line is visibly close. Confirm the bot card labels its close-line preference; if the bot reports a close forcing/classical/pressure line, it must play that legal second PV after normal pacing. Repeat with a mate, a score-bound line, an illegal/stale line or a limited-strength `bestmove` that differs from PV1: Stockfish’s original move must be played instead. In developer UCI logs, confirm there is one `go` command with the existing time/node limits and `MultiPV 2`, not a second search.

## Premove browser/native check

1. During a local bot search, select one human piece before queuing a plausible premove. Confirm only the human pieces remain draggable, conditional destination markers appear and are labelled as premove previews, source and destination receive distinct purple markers after queueing, and final legality remains checked only after the bot reply.
2. Let the bot reply. Confirm a legal queued move is applied immediately after the bot move, the queue disappears, and Stockfish begins a fresh search only if the premove hands the turn back to the bot. Queue a move made illegal by the reply and confirm only the bot move remains with a clear cancellation notice.
3. In a timed increment game, queue a premove and confirm the human move consumes no elapsed time but earns the configured increment. Undo it and confirm the board and exact pre-premove clock return without replaying a stale engine result.
4. Test both a White-side reply and a Black-side opening premove. Press Escape or use Cancel premove, then pause, restart, open a decision, load a saved game and reload the app; a queued move must never survive any of those boundaries.

## Phone game-toolbar check

1. At 320, 375 and 430 px viewport widths, open Play and confirm **Undo**, **New game** and **Pause/Resume** form the first row; **Copy PGN** and **Download PGN** form the second.
2. Confirm labels stay fully readable, every control is at least 44 px tall, no horizontal page overflow appears, and Tab order remains Undo → New game → Pause/Resume → Copy PGN → Download PGN.
3. Trigger Copy and Download and confirm their existing nearby success/error status remains visible. Repeat in the packaged desktop app narrowed to a phone-sized window before treating this layout as manually verified.

## Phone Review move-navigation check

1. At 320, 375 and 430 px viewport widths, open a Review PGN with several moves. Confirm **Jump to move** is directly below the board’s first/previous/next/last controls and above share/import controls, without horizontal page overflow.
2. Choose **Start position**, a White SAN move and a Black SAN move. Each selection must update the board, move count and selected position immediately, without needing to scroll to the full analysis panel first.
3. Scroll to the panel and confirm the complete classified notation list, current-row treatment, turning-point controls and review feedback are still present and stay synchronized with the picker.
4. Repeat in the packaged desktop app narrowed to a phone-sized window before treating this layout as manually verified.
5. At 320, 375 and 430 px widths, repeatedly use first/previous/next/last beside the board. Confirm all four targets are 44 px, disabled endpoints remain clear, the position counter has room to update and no horizontal overflow appears.

## Play notation-preview check

1. In an in-progress local or bot game, select a white or black SAN move from **Moves**. Confirm the board shows the position immediately after that move, the latest move highlight follows that position, and the status says it is read-only with **Return to live** visible.
2. While previewing, confirm board movement, Undo, Offer draw and Resign are unavailable; the status discloses that the live clock continues. A queued premove is not rendered on the historical board but is still present after returning live. Escape and **Return to live** must restore the exact current board without changing clocks, the bot request or the saved session.
3. Open **Position tools** while previewing and copy/download FEN. Confirm the artifact matches the displayed historical board and the controls say **displayed** position/FEN; return live and confirm they again use the newest live board and current-position labels.
4. Let a bot move arrive while viewing an earlier ply. Confirm the preview stays on the selected move and the move list does not auto-scroll; return live and confirm the newly appended move and current board appear.
5. Repeat from a non-standard FEN start and after opening a saved game. Replacing/restarting/hydrating a game must return the view to live rather than reuse an old preview ply.

## Play historical-preview navigation check

1. In a game with at least four plies, select an earlier SAN move in **Moves**. Confirm the read-only board exposes **Previous**, **Next**, its move count and **Return to live** directly above the board.
2. At the earliest previewable move, **Previous** must be disabled. Use **Next** across the remaining moves: the board and last-move highlight must advance one ply at a time, and only the newest move may return to the live board.
3. While inspecting an earlier ply during a bot turn, let the bot reply. Confirm the displayed historical board does not jump; use **Next** to reach the prior latest move, then the appended reply, and only then live play.
4. At 320, 375 and 430 px widths, confirm all four preview actions remain fully labelled, have 44 px touch targets, do not introduce horizontal overflow and do not enable board movement, Undo, draw or resign while previewing.
5. At the same widths, confirm every white and black SAN entry in **Moves** has a 44 px target, two entries remain aligned in each move row, no rows overlap and choosing either entry starts the same historical preview.
6. Select **Review this position** from an earlier preview. Confirm Review opens at the same position count and board FEN, including when a bot reply arrives while Review loads. Return to Play and confirm its live clock/game state was never changed. If the source game is replaced before Review opens, confirm Review safely uses its normal final position rather than claiming the old target.
7. In a game with at least 100 plies, make several live moves and open a distant historical SAN position. Confirm the notation does not visibly redraw as a whole, the selected and previously selected rows update together, the newest row still follows live play, and Enter/Space on any SAN button opens the same position.
8. With focus outside the board grid and a text field, press Left from a live game with at least two plies. Confirm it opens the immediately preceding historical position; press Right to return live. In a preview, use Left/Right across the history. Focus a board square at both the center and an edge, then confirm its arrow keys only move the board's roving focus and never change the preview.

## Play-flow regression check

1. With a non-empty unfinished game, request New game, another mode, another time control, FEN load and a saved-game open. Each action must first offer Keep playing; cancelling must preserve the board and clock.
2. Drag a legal piece with a mouse, touch device and pen where available. Click/tap selection, keyboard selection and promotion must still work after a drag.
3. In Library, search by game text, switch All/Reviewed/Unreviewed filters, reveal aborted zero-ply records only on request, and use the separate Open board and Review actions.
4. Start a fresh game and confirm Game setup is open with opponent, side and time controls visible. After the first ply, confirm it collapses to its compact summary while Draw, Resign and notation remain visible; start another fresh game to confirm setup reopens. Toggle the native summary with keyboard Enter/Space and confirm selected opponent/time values remain intact.
5. Open a resignation or replacement confirmation, then a promotion chooser. In each overlay, press `N`, `U`, `F`, `⌘/Ctrl+Z` and confirm the paused board does not change; `Escape` must only close that overlay and restore the same game. In the promotion chooser, Queen should receive focus and `Q`, `R`, `B` and `N` must choose only their offered piece without requiring a pointer.

## Desktop board-clarity check

1. At a wide desktop viewport such as 1470 × 801, open Play and confirm the height-aware board target is about 621 px (`801 - 180`) rather than the former roughly 541 px (`801 - 260`). Confirm the existing pieces have more readable square area without clipping, overlap or changed board controls.
2. At 920 px and below, confirm the board retains its `calc(100dvh - 260px)` cap. At 700 px and below, confirm the board stage remains `width: 100%` and does not introduce horizontal overflow.
3. In the packaged macOS application, repeat the wide desktop and responsive-boundary checks before treating this presentation change as manually desktop-verified.

**Implementation evidence (2026-07-23):** source inspection confirms both desktop rules use `calc(100dvh - 180px)`, the ≤920 px rule retains `calc(100dvh - 260px)`, and the ≤700 px rule retains `width: 100%`. Lint, typecheck, the 50-file / 243-test frontend suite, 36-test Rust suite, web build, local HTTP check and macOS Tauri bundle passed. This is automated/build evidence, not a manual browser-layout observation.

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
