# Stockfish integration

## Runtime contract

The desktop app calls `stockfish_best_move` with a request ID, FEN, fallback level, optional executable path, normalized settings and, for a named profile, an optional candidate count of one or two. Rust discovers and validates the executable, starts it directly without a shell, completes `uci` and `isready`, configures the selected profile, sends `position fen` and one bounded `go` command, then parses `info` and `bestmove`. The response returns the original request ID and FEN, engine identity/path, move, ponder move, available search metrics and safely parsed PV telemetry from that same search.

The website uses the same frontend request/result contract through `BrowserStockfishEngine`. It creates a dedicated Worker for the pinned Stockfish.js 18 Lite single-threaded build only for an actual bot move or an explicit verification request, completes `uci` and `isready`, sends the same bounded UCI options, validates every move/PV/score/metric and returns `wasm://stockfish-18-lite-single` as its runtime identity. Stockfish never runs on React's UI thread. The built-in KnightBot Worker is also created only after a Stockfish bot-play failure, and is a bounded recoverable fallback rather than an idle second engine.

Before either play adapter is asked to search, Play may apply one of an original named opponent's authored opening cues. The cue is accepted only for the standard start FEN, an exact local SAN history, the correct bot colour and a `chess.js`-validated legal move. It therefore avoids all engine work for that opening reply. If no cue applies and `chess.js` proves there is exactly one legal reply, Play applies that local rules result under the same display cadence without opening Stockfish either. A route mismatch, custom FEN, invalid cue or choice among multiple legal moves uses the existing bounded Stockfish request. Later named-profile searches request at least two PVs in that same command. The profile can select only its close second PV after local legality, exact-score and trait checks; it never replaces a mismatched limited-strength `bestmove`, mate/bound line or KnightBot fallback. Neither local route is represented as a Stockfish result.

The Review workspace uses a separate analysis client. A live bot turn takes priority at the product boundary: optional Review analysis and the full-review start action wait until that move finishes, so the normal player flow never intentionally starts two engine jobs at once. Desktop calls `stockfish_analyze` through an independent `AnalysisState` and persistent UCI supervisor; website analysis uses its own browser Worker. Both return sorted candidate lines with centipawn-or-mate scores, bound flags, WDL, UCI PV moves, depth, selective depth, nodes, NPS and elapsed time. The frontend converts each PV to SAN from the requested FEN.

Each persistent UCI runtime caches only its exact acknowledged `setoption` vector. Repeating a search with the same effective Thread/Hash/MultiPV/strength/WDL options skips those writes and avoids needless Hash/transposition-table churn; changing only `go` limits still reuses the option block. A profile’s initial two-PV request changes that vector once, then remains stable across its later moves; it preserves the current `go movetime`, optional depth/node limits, thread count and Hash. Every request nevertheless completes an `isready`/`readyok` fence before `position` and `go`. Cache state is discarded after a worker/process failure, timeout or incomplete setup; native cancellation also clears it, while the browser preserves it only after safely draining a stopped search. Browser and native contracts cover same-settings reuse, go-only changes and option changes independently.

Interactive Review has one additional, deliberately narrow cache above the engine adapter: a 24-entry in-memory LRU for already successful ambient position analyses. It keys exact FEN, normalized analysis settings, runtime kind and configured executable path, returns a copied result instantly when a player revisits that same position and visibly labels it as cached. It is session-only, never stores an error or cancellation, does not cross a runtime/path/settings change, and never serves `runGameReview`; the latter keeps its independent reproducible sequential-search contract.

Full-game review reuses this command sequentially rather than starting an unbounded engine pool. Its MultiPV result for an intermediate post-move position becomes the next ply's before result, and its PV1 also scores the preceding move, so that position is never searched twice. Only a final non-terminal post position uses the one-line after request. Checkmate and draw positions are resolved by `chess.js` without asking UCI to search a terminal state. The job and interactive panel never search concurrently.

`stockfish_probe` performs native discovery plus the UCI handshake without searching or changing game state. Browser verification performs the same handshake against WebAssembly. The settings UI leaves the engine on demand at startup and probes only after native path changes when the player explicitly selects **Verify engine**; the first real bot move performs its own lazy handshake.

## Browser asset pipeline

`stockfish@18.0.8` is pinned exactly in the lockfile. Before development and production builds, `scripts/sync-stockfish.mjs` verifies the JavaScript and WebAssembly SHA-256 values, copies only the lite single-threaded pair, copies GPLv3 `COPYING.txt`, and writes `SOURCE.txt` with the exact corresponding source revision. Generated assets stay out of Git. Production PWA builds precache all four files, so bot play and Review continue to work offline after installation.

The browser build always uses one engine thread and caps Hash at 128 MB. This avoids cross-origin-isolation requirements and the download/initialization cost of the full build while retaining a much stronger engine than the bundled fallback bot.

## Discovery order

1. Explicit request path (reserved for the settings UI)
2. `KNIGHTCLUB_STOCKFISH`
3. `PATH`
4. `/opt/homebrew/bin/stockfish`, `/usr/local/bin/stockfish`, and the Homebrew opt path

Candidates must be regular executable files. The path is passed directly to `std::process::Command`; it is never interpolated into a command string.

## Strength presets

| Level | Elo | Skill | Move time | Node cap | Threads | Hash |
|---|---:|---:|---:|---:|---:|---:|
| Easy | 1320 | 2 | 50 ms | 4,000 | 1 | 16 MB |
| Balanced | 1700 | 8 | 100 ms | 10,000 | 1 | 16 MB |
| Strong | 2200 | 14 | 160 ms | 24,000 | 1 | 32 MB |

All three enable `UCI_LimitStrength` and stop on whichever time or node limit arrives first. The UI separately uses a short cancellable display floor (260/360/480 ms) so lower compute budgets do not make play look accidentally instantaneous. The 4k/10k/24k caps reduce the prior per-move node ceilings by 33%/44%/47% while preserving the one-thread, three-level difficulty ordering. These are initial product presets, not rating guarantees; future calibration should use a fixed test suite and recorded hardware.

## Elo and custom profiles

- **Target Elo:** applies `UCI_LimitStrength`, `UCI_Elo` and the user's bounded resource/search limits.
- **Custom UCI limits:** additionally exposes Skill Level and the strength-limit switch.
- Bounds: Elo 1320–3190, Skill 0–20, move time 50–30000 ms, depth 1–40, nodes 1,000–100,000,000, MultiPV 1–5, threads 1–32 and Hash 16–4096 MB.
- `go` always has a move-time ceiling and may additionally include depth and nodes; Stockfish stops on the first reached limit.

## Cancellation and recovery

Only one frontend search of each kind is active. Starting a new search cancels the old one. The frontend rejects a response unless its request ID and FEN both match. Native Play request IDs are monotonic, so Rust records the highest cancelled ID rather than accepting a delayed older stop; checks before setup, after the single-engine mutex and while reading output reject every request at or below that watermark. A queued cancelled request therefore sends no new options, `position` or `go`, while an active search receives `stop`. Rust removes a failed or timed-out process so the next request gets a clean engine. Analysis preserves exact-ID cancellation because its independent clients do not share one ordered request stream. The browser adapter sends `stop`, drains the old `bestmove` before beginning another search and terminates/recreates an unresponsive Worker. Bot play may fall back to the isolated KnightBot Web Worker; Review never presents KnightBot output as Stockfish analysis.

## Local verification

```bash
npm run sync:stockfish
npm test
npm run build
npm run test:rust
KNIGHTCLUB_RUN_STOCKFISH_SMOKE=1 cargo test --manifest-path src-tauri/Cargo.toml --test stockfish_smoke
```

The TypeScript suite covers browser handshake, settings, UCI parsing, best-move search, cancellation and checksum-backed asset generation. The production build verifies the WebAssembly assets are present in the offline precache. The Rust smoke target uses an installed native Stockfish for both one-move play and real three-line MultiPV analysis; it remains opt-in so contributors without a native executable can run the deterministic suite.

## Licence boundary

Stockfish and Stockfish.js are GPLv3. The native engine remains a separate executable and is not copied or committed here. Website builds distribute the pinned Stockfish.js JavaScript/WebAssembly pair as separate Worker assets together with GPLv3 and the exact corresponding-source location. See `THIRD_PARTY_NOTICES.md` and `THIRD_PARTY_LICENSES.md` before distributing either runtime.
