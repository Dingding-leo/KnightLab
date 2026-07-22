# Implementation plan

## Architecture

```text
AnalysisWorkspace
  -> analysis timeline (PGN/FEN -> immutable ply positions)
  -> StockfishAnalysisClient (request ID + FEN authority)
       -> stockfish_analyze Tauri command
            -> AnalysisState (one separately supervised process)
                 -> bounded UCI analysis search
                 -> MultiPV info parser
```

The live game remains independent. The review board owns a replay-only `Chess` instance derived from the selected timeline position. The native analysis process is separate from bot play so inspecting a game cannot steal, weaken or deadlock an in-progress opponent search.

## Analysis contract

- Input: exact FEN, executable path, 100–10,000 ms, optional depth/nodes, 1–5 lines, 1–32 threads and 16–4096 MB Hash.
- Engine options: full strength, requested resources/MultiPV and `UCI_ShowWDL=true`.
- Output: engine identity/path, elapsed time, best move and the last complete result for each MultiPV index.
- Each line: score kind/value/bound, WDL permille, depth/seldepth, nodes, NPS, hashfull permille, tablebase hits, engine time and bounded UCI PV.

## Race and failure handling

- A dedicated analysis cancellation watermark cannot interfere with bot-play requests.
- Every position change invalidates the frontend request immediately and sends stop for the prior ID.
- Rust checks cancellation before and during search, sends `stop`, and drops a failed process.
- React applies a result only when both active request ID and FEN match; SAN conversion replays every PV move through `chess.js`.

## Testing strategy

- Rust: info-line parsing, bounds, MultiPV collection, mate/WDL metrics, cancellation, timeout and fake-engine command contract.
- TypeScript: PGN/FEN timeline, black-to-move perspective, legal/illegal PV conversion, request shape and stale/malformed response rejection.
- UI/manual: browser navigation/degraded state and packaged desktop import, rapid ply changes, three candidate lines, perspective switch and terminal position.
