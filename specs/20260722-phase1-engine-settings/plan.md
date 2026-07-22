# Implementation plan

## Architecture

```text
EngineSettingsPanel
  -> normalized local Preferences
  -> native dialog (desktop only)
  -> StockfishClient.probe(path)
  -> HybridEngineClient.search(fen, level, settings)
       -> typed Tauri request
       -> validated Rust SearchSettings
       -> persistent UCI supervisor
```

The settings model lives outside React so storage, requests and tests share one bounded contract. Presets continue to be resolved by Rust. Elo and custom profiles use explicit validated values. Browser fallback ignores Stockfish-only values and says so in the interface.

## Safety and recovery

- Paths are selected as data and passed directly to `Command::new`; no shell is involved.
- Numeric inputs are normalized in TypeScript and independently rejected at the Rust boundary.
- Probe failure does not replace the last ready engine or interrupt legal game state.
- A changed settings object invalidates the active frontend request; late results remain unable to alter the board.
- Invalid or old preferences migrate to bounded defaults.

## Testing strategy

- TypeScript unit tests: normalization, legacy preference migration and request payloads.
- React component tests: accessible advanced controls and browser/desktop status language.
- Rust contract tests: valid/invalid settings, exact UCI option/search command construction and executable probe.
- Manual operation: browser fallback settings experience plus native automatic probe, explicit picker and a move using custom limits.

