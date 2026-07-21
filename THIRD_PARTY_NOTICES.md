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

## Build and test dependencies

Vite, TypeScript, Vitest, Oxlint and vite-plugin-pwa retain their respective upstream licences. The exact dependency graph is recorded in `package-lock.json`.

## Stockfish integration policy

Stockfish is not bundled in KnightLab 0.1.

Stockfish is distributed under GNU GPL version 3. When KnightLab adds engine support, Stockfish will remain a separately managed UCI executable. Any distributed engine binary must include the GPL licence and the full corresponding source code or a precise pointer to the source that generates that exact binary. Modified engine source must remain available under GPLv3.

Official project: https://github.com/official-stockfish/Stockfish

## Planned data sources

- Lichess database exports: CC0 — https://database.lichess.org/
- Lichess opening names: CC0 — https://github.com/lichess-org/chess-openings

Planned sources are not yet bundled. Importers must preserve version, checksum and licence metadata.
