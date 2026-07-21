# KnightLab

KnightLab is an original, local-first chess studio for playing, reviewing and improving without a subscription, account, telemetry or online multiplayer.

The current alpha already provides a legal chess board, local hot-seat play, three levels of a lightweight built-in opponent, session recovery, FEN import, PGN export, a completed-game library, basic insights, structural PGN review and a board-vision trainer. The built-in opponent now runs in an isolated Web Worker so search cannot freeze the interface, and stale searches are cancelled before they can alter a newer position.

## Principles

- **Offline-first:** all runtime assets are bundled and cached by the PWA build.
- **Private by default:** games and preferences remain on the device.
- **Correctness before spectacle:** `chess.js` is the legal-rules authority and edge cases are tested.
- **Original product:** KnightLab implements general chess concepts without copying Chess.com code, content, branding or trade dress.
- **Engine isolation:** future Stockfish support will use a separately managed GPLv3 executable over UCI.

## Quick start

Requires Node.js 22 or later.

```bash
npm install
npm run dev
```

Open the local address printed by Vite.

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Current architecture

- React 19 + strict TypeScript
- Vite + offline PWA service worker
- `chess.js` for rules and PGN/FEN handling
- Dedicated Web Worker for the built-in fallback bot
- Browser local storage for the alpha session and game library
- Vitest + Oxlint + GitHub Actions CI

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/PRODUCT_SPEC.md`](docs/PRODUCT_SPEC.md) and [`ROADMAP.md`](ROADMAP.md) for the full desktop, Stockfish, review, puzzle, opening and SQLite plan.

## Licensing

KnightLab's original source is source-available for non-commercial use under the PolyForm Noncommercial License 1.0.0. Commercial use requires a separate written licence. Third-party components retain their own licences; see [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
