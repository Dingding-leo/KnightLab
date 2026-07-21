<div align="center">
  <img src="public/favicon.svg" width="96" alt="KnightLab icon" />
  <h1>KnightLab</h1>
  <p><strong>A local-first chess studio for playing, reviewing, training and improving without a subscription.</strong></p>
</div>

## Current alpha

KnightLab 0.1 is already usable as an installable offline web app. It includes:

- Fully legal standard-chess moves through `chess.js`
- Local hot-seat play
- Three local KnightBot strength profiles
- Move history, legal-move hints, check/checkmate/draw detection
- Promotion choice, undo, board flip and new game
- FEN loading, PGN copy/export and automatic session recovery
- Automatic on-device storage for completed games
- A local game library and initial personal statistics
- A functional board-vision trainer
- A deterministic PGN structure scan
- PWA installation and offline caching
- No account, telemetry, advertising or required network calls

The current bot is intentionally a lightweight built-in fallback. Local Stockfish through a separately managed UCI process is the next engine milestone.

## Run locally

Requirements: Node.js 22 or newer.

```bash
npm install
npm run dev
```

Open the URL printed by Vite. To test the production build:

```bash
npm run lint
npm test
npm run build
npm run preview
```

## Product direction

KnightLab aims to reproduce the useful *categories* of a premium chess-training platform—without copying Chess.com branding, proprietary content, text, datasets or interface designs. Multiplayer, social and community systems are deliberately out of scope.

The complete feature inventory and delivery phases are in [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md) and [ROADMAP.md](ROADMAP.md).

## Architecture

The alpha is a React + TypeScript + Vite PWA. The product remains offline-first and installable today. The desktop phase will add a Tauri shell, SQLite persistence and a local UCI engine process while preserving the same domain modules. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Licensing

KnightLab's original source is source-available under the **PolyForm Noncommercial License 1.0.0**. Commercial use requires a separate written licence from Austin Liu.

Stockfish is not bundled in this alpha. When integrated, it will remain a separately distributed GPLv3 UCI component with its licence and exact corresponding source information preserved. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Status

This repository is under active automated development. Every material change must pass linting, type checking, tests and a production build before it is treated as complete.
