# Implementation plan

## Runtime shape

```text
React game state
  -> EngineClient interface
      -> TauriStockfishClient -> invoke(stockfish_best_move)
      -> BotWorkerClient fallback
  -> request id + FEN validation

Tauri command
  -> EngineManager managed state
      -> validated executable discovery
      -> persistent Stockfish child process
      -> typed UCI initialization/search/stop/quit
```

## Testing strategy

- TypeScript contract tests use a fake Tauri invoke function and verify stale-result rejection and UCI move conversion.
- Rust unit tests cover UCI line parsing, safe FEN validation, strength presets and executable discovery order.
- Rust integration tests use a deterministic fake UCI executable to cover initialization, bestmove, timeout and crash recovery without depending on Homebrew.
- A development smoke command uses the actual local Stockfish 18 installation.

## Security and failure handling

- The engine path is passed directly to `std::process::Command`; no shell is involved.
- FEN length and line breaks are rejected before writing to UCI stdin.
- Searches have bounded timeouts. Timeout sends `stop`; unrecoverable workers are killed and recreated on the next request.
- The frontend associates every result with the request id and original FEN before committing a move.

## Compatibility

- The browser bundle imports the official Tauri API but calls it only after runtime detection.
- Existing local storage data and the browser-only KnightBot workflow remain valid.
- Tauri configuration uses Vite development and production build commands.
