# Changelog

## 0.2.0 — 2026-07-21

### Added

- Dedicated Web Worker execution for the built-in KnightBot
- Typed worker protocol and reusable bot worker client
- Search cancellation by worker termination and recreation
- Request ID plus FEN matching to reject stale engine results
- Unit tests for successful, cancelled and stale worker responses

### Changed

- Bot turns no longer execute minimax work on the browser UI thread
- README now documents the actual product, architecture and verification workflow

### Verification

- `npm run lint`: passed with zero warnings
- `npm run typecheck`: passed
- `npm test`: 10 tests passed
- `npm run build`: passed; worker bundle and offline service worker generated

## 0.1.0 — 2026-07-21

### Added

- Offline-installable React PWA application shell
- Legal standard-chess board with local hot-seat mode
- Three-level local KnightBot fallback
- Legal move highlighting, promotion, undo, board flip and game-state messages
- FEN import and PGN copy/export
- Automatic active-session recovery and completed-game storage
- Local game library and initial insight cards
- Board-vision trainer and deterministic PGN structure scan
- Unit tests for rules helpers and bot legality
- Product specification, architecture, roadmap, licensing and CI foundation

### Verification

- `npm run lint`: passed with zero warnings
- `npm test`: 7 tests passed
- `npm run build`: passed; offline service worker generated
