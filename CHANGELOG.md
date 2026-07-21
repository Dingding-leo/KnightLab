# Changelog

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
