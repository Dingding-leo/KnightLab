# Analysis and accuracy design

## Available now

The Review workspace can load the current game, PGN or FEN; move through every ply; flip the read-only board; and request one to five candidate lines from a dedicated Stockfish runtime. Desktop uses a native process and the website uses Stockfish 18 Lite WebAssembly in a Worker. Users can choose Quick, Balanced or Deep effort, view scores from White's or the side-to-move perspective, and inspect SAN principal variations, WDL, depth, nodes, NPS, elapsed time and engine identity.

Analysis is isolated from bot play. A newer position or setting invalidates the previous request; Rust advances its cancellation watermark while the browser adapter stops and drains its Worker search. Results are accepted only when request ID and FEN match. Exact scores take precedence over later UCI upper/lower-bound updates for the same line.

Completed PGN reviews are retained locally as versioned records. A stable key is derived from the canonical start FEN and main-line UCI moves rather than PGN headers, so loading the same game restores the report without another engine run. The Review workspace ignores stale asynchronous loads after an import changes, identifies a restored report, and updates a matching completed Library game to Reviewed. Browser storage uses the same bounded record format and can now retain reports produced by local WebAssembly analysis.

For a selected Inaccuracy, Mistake, Miss or Blunder, Coach's evidence derives an additional explanation from the persisted review and the replayed board positions. It names the played move, the legal recommended move and recorded continuation, then surfaces only board facts it can substantiate: a mating move, check, unsupported moved piece, direct double attack or absolute king pin. The exact verified squares receive a non-interactive board highlight, while Left/Right and Home/End move through replay positions without touching the hidden Play board. It is intentionally conservative: a score by itself never becomes a claim of a forced material win, and limited-confidence, malformed or unprovable cases fall back to a neutral move/line comparison. This derivation does not run Stockfish again, so it is available for restored reports too.

## Personal retry queue

Review can turn a structurally matched, normal-confidence Inaccuracy, Mistake, Miss or Blunder into a private practice prompt. The selected action creates one prompt; the key-moments action creates up to three eligible prompts. Each prompt snapshots the verified pre-move FEN, reviewed colour, played move, recorded top UCI move, an optional bounded `solutionLineSan` Stockfish principal variation from the completed review, and a conservative focus hint. A non-empty saved line is not the original PGN continuation after the error. Invalid timeline data, a terminal position, a missing or illegal recorded move, or a mismatch between the report and replay fail closed and simply do not create a prompt.

Train restores that pre-move position with the reviewed colour at the bottom of the board. It first reconstructs the saved line in full with `chess.js`; every SAN ply must remain legal and its first reconstructed move must equal the saved UCI/SAN solution. An explicitly empty legacy line safely becomes the verified one-move exercise. A malformed non-empty saved line is unavailable rather than shortened. Before the player reaches or reveals a move, Train does not show future SAN, the solution or Coach evidence. For a valid multi-move line it accepts each exact recorded player move, auto-plays the immediately following recorded opponent PV reply, then asks for the next player move. A different legal move is not called a mistake or a blunder; it is reported only as not being on the saved review line, because the exercise runs no additional engine comparison.

Only an unassisted replay of the whole saved line advances the private 1/3/7/14/30-day schedule, once at line completion. A non-matching legal attempt, a hint-assisted completion, reveal or skip resets the streak and leaves the item due immediately. The fifth consecutive unassisted completed line marks the item mastered. The live board, line cursor and assistance state are intentionally transient; a restart begins the exercise again from its pre-move FEN while the persisted scheduling result remains. A visible **Back to review** control restores the saved source PGN and selects the original error ply when that retained review is still available.

Retry prompts have their own bounded storage and lifecycle. They are keyed by review key plus source ply, never modify the completed report, and remain usable if the bounded completed-review repository later removes the source report. Browser builds use a bounded localStorage queue; desktop uses SQLite schema v5. No retry or Train flow launches Stockfish.

## Full-game review available now

For every played move, the review runner analyses the position before the move with at least two candidate lines. It analyses the resulting position separately unless `chess.js` already proves checkmate or draw, in which case the rules-layer result is exact and no terminal engine request is made. Scores after a move are negated into the mover's perspective. A move that exactly matches PV1 receives zero loss so independent-search drift cannot penalize an engine-confirmed best move.

Centipawn scores are converted to expected game score with KnightClub's original smooth model:

```text
expected(cp) = 1 / (1 + exp(-cp / 240))
loss = max(0, expected(best) - expected(played))
accuracy = 100 * exp(-3.5 * loss^0.72)
```

Mate scores map directly to expected scores 1, 0 or 0.5. Average centipawn loss is reported separately and mate swings are capped at 1,000 cp for a readable aggregate. Overall and colour accuracy are arithmetic means of per-move accuracy; the phase split uses remaining non-pawn material plus move number.

Classification is deliberately not a fixed centipawn-loss lookup. It first considers legal-move uniqueness, an exact PV1 match, the expected-score gap to PV2, missed forced mate, mate conceded and a win-to-loss reversal. Remaining expected-score loss bands are 0.06 for Inaccuracy, 0.15 for Mistake and 0.30 for Blunder. A PV1 move with at least a 0.12 expected-score lead over PV2 is Great; exact PV1 is Best; tiny non-best loss is Excellent or Good. Bound-only scores or depth below 12 are marked limited confidence. Turning points are ranked by nonlinear expected-score loss.

Feedback names the played move, better move, concrete origin/destination or undefended moved piece when detectable, and a SAN continuation. Coach Evidence v1 additionally proves only direct checks, mating moves, unsupported moved pieces, direct double attacks and absolute king pins. `Brilliant` and `Book` are intentionally not emitted until sacrifice soundness and a licensed opening source can be proved. Detailed tactical proof (including broader fork, deflection and exchange analysis), background-resumable engine jobs and deeper coach prose remain incomplete and must not be presented as available.

## Completed reports and future reproducible jobs

The implemented completed-report record retains the engine name/path, bounded Threads/Hash/MultiPV/search settings, source PGN, canonical start FEN, move count, completion time and the full review result. It is a completed outcome only: it does not claim an executable checksum/platform fingerprint, per-position cache or a resumable search after termination. Scores remain normalized at display time, distinguish mate from centipawn values, preserve score bounds and principal variations, and retain raw side-to-move WDL.

Future reusable analysis jobs must add engine name/version, executable checksum, platform, an immutable settings/model fingerprint, progress and error state. Such a job can then be resumed or retried deterministically for its recorded settings rather than treating a completed report as a cache of engine positions.

Accuracy will be a documented transformation from evaluation change to winning-chance loss, with special handling for forced moves, already-decided positions, mates, tablebase results and opening-book moves. UI labels must communicate uncertainty and avoid presenting engine agreement as objective human quality. Formula changes require a new model version and regression fixtures.
