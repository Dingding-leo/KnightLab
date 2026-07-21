# Architecture

## Current alpha

KnightLab 0.2 uses:

- React 19 and strict TypeScript
- Vite and `vite-plugin-pwa`
- `chess.js` as the legal-rules authority
- A custom accessible board UI
- A bounded local minimax fallback bot running in a dedicated Web Worker
- Browser local storage for session recovery and the initial game library
- Vitest and Oxlint

The alpha contains no required network requests. All runtime assets are packaged by the build.

### Alpha bot execution

The built-in fallback bot is deliberately separated from React through a typed worker protocol. `BotWorkerClient` permits only one active search, terminates the worker when a search is superseded, recreates a clean worker, and accepts a result only when both request ID and FEN match. This establishes the cancellation and stale-result invariants required by the later UCI process supervisor.

## Target desktop architecture

```text
React UI
  ├── chess domain (pure TypeScript)
  ├── review/training services
  ├── persistence interfaces
  └── engine interface
          │ typed commands/events
Tauri command boundary
  ├── SQLite repositories + migrations
  ├── import/export and backup
  └── UCI process supervisor
          │ stdin/stdout text protocol
User-selected or separately downloaded Stockfish executable (GPLv3)
```

## Engine isolation rules

- Do not link Stockfish into KnightLab's original source.
- Treat it as a separately managed executable communicating through UCI text streams.
- Record version, binary checksum, platform, source URL and engine settings with cached analysis.
- Reject stale responses using request identifiers and position hashes.
- Implement stop, timeout, restart, bounded queues and process cleanup.
- Never block the UI thread.

## Persistence evolution

The browser alpha uses local storage only for a small, simple data model. Before large PGN or puzzle imports, introduce a repository abstraction and Tauri SQLite implementation with:

- Forward-only schema migrations
- Transactional imports
- Duplicate hashes
- Backup/restore
- Corruption detection
- Indexed position, opening, date and tag queries

## Trust boundaries

Untrusted inputs include PGN, FEN, imported datasets, engine output, file paths and database backups. Parse them defensively, bound their size, reject malformed records and never interpolate them into shell commands.
