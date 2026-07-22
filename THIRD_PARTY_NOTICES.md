# Third-party notices

## Runtime dependencies

### chess.js

- Purpose: legal chess move generation, validation and game-state handling
- Project: https://github.com/jhlywa/chess.js
- Licence: BSD-2-Clause

### React and React DOM

- Purpose: user interface
- Project: https://github.com/facebook/react
- Licence: MIT

### Lucide React

- Purpose: interface icons
- Project: https://github.com/lucide-icons/lucide
- Licence: ISC

### Tauri

- Purpose: native desktop window and safe frontend-to-Rust command boundary
- Project: https://github.com/tauri-apps/tauri
- Licence: Apache-2.0 OR MIT

### Tauri dialog plugin and rfd

- Purpose: native, user-initiated Stockfish executable selection
- Projects: https://github.com/tauri-apps/plugins-workspace and https://github.com/PolyMeilex/rfd
- Licence: Apache-2.0 OR MIT

### rusqlite and SQLite

- Purpose: private, versioned desktop persistence
- Projects: https://github.com/rusqlite/rusqlite and https://sqlite.org/
- Licence: rusqlite is MIT; bundled SQLite is in the public domain

## Build and test dependencies

Vite, TypeScript, Vitest, Oxlint and vite-plugin-pwa retain their respective upstream licences. Exact JavaScript and Rust dependency resolutions are committed in `package-lock.json` and `src-tauri/Cargo.lock` for reproducible builds.

## Stockfish integration

### Browser engine

- Component: Stockfish.js 18.0.8 / Stockfish 18 Lite single-threaded WebAssembly
- Purpose: local browser bot play, MultiPV position analysis and full-game review
- Package: `stockfish@18.0.8`
- Licence: GNU GPL version 3
- Exact corresponding source: https://github.com/nmrugg/stockfish.js/tree/93c994592dcf3b4b21052ab925e9b534df9c0918
- JavaScript SHA-256: `5243fd9b276cab7dfe3ad1d43ab9ead73568fac76468c614242977a210c4a391`
- WebAssembly SHA-256: `a8fbc05ec6920b56d7485826dcb02c5ffd2826bcbf751cf973046f237a9096f1`

The build copies only the pinned lite single-threaded JavaScript/WebAssembly pair. It verifies both checksums, includes `COPYING.txt`, publishes `SOURCE.txt` beside the engine assets and caches all four files for offline use. The generated files are not committed to the KnightClub repository; `npm run dev` and `npm run build` reproduce them from the locked package.

### Desktop engine

The desktop application starts a separately installed Stockfish executable as an independent process and communicates over UCI. Native engine binaries are not stored in this repository or copied into release artifacts. Any future desktop package that distributes one must record its exact version, source, build flags and checksum and must include the GPLv3 licence and corresponding source access.

Stockfish and Stockfish.js are distributed under GNU GPL version 3. Modified engine source must remain available under GPLv3. KnightClub's original application code retains its own licence; the engine components retain theirs.

Official project: https://github.com/official-stockfish/Stockfish
Browser port: https://github.com/nmrugg/stockfish.js

## Planned data sources

- Lichess database exports: CC0 — https://database.lichess.org/
- Lichess opening names: CC0 — https://github.com/lichess-org/chess-openings

Planned sources are not yet bundled. Importers must preserve version, checksum and licence metadata.
