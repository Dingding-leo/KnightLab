# Phase 2 MultiPV analysis board

**Status:** In Progress  
**Date:** 2026-07-22

## Objective

Replace the placeholder Review experience with a usable local analysis board that navigates real PGN/FEN positions and obtains bounded, cancellable MultiPV evaluations from native Stockfish.

## User stories

1. As a player, I can open Review and immediately inspect the current game at any ply.
2. As a player, I can paste PGN or FEN and analyze it without changing my live game.
3. As a desktop player, I can enable Stockfish and see several candidate moves, evaluation, depth, nodes, NPS, hash use, WDL and principal variations.
4. As a player, I can switch between White and side-to-move evaluation perspectives without rerunning the engine.
5. As a fast navigator, I never see an older position's analysis overwrite the current board.
6. As a browser user, I can still navigate and inspect PGN/FEN locally while receiving an honest desktop-only analysis explanation.

## Acceptance criteria

1. A pure TypeScript timeline model parses bounded PGN/FEN, records a stable FEN per ply and converts legal UCI PVs to SAN without mutating the source game.
2. Review renders a read-only board, first/previous/next/last controls, a clickable main-line move list, PGN/FEN import and board flip.
3. A dedicated native analysis command uses a separately supervised Stockfish process, full strength, `UCI_ShowWDL`, bounded time/depth/nodes, 1–5 MultiPV lines, threads and Hash.
4. The UCI parser handles centipawn and mate scores, optional bounds, WDL, depth/seldepth, nodes, NPS, hashfull, tablebase hits, time and legal PV moves.
5. Native responses echo request ID and exact FEN. The frontend cancels on position/settings/unmount changes and rejects stale IDs, FENs, malformed metrics and illegal PVs.
6. Analysis uses an 800 ms default ceiling, three lines, current engine threads/Hash, and exposes bounded line-count and effort controls without weakening analysis through Elo/Skill settings.
7. Evaluation labels clearly distinguish side-to-move versus White perspective; mate and WDL are not collapsed into centipawns.
8. Empty, loading, ready, terminal-position, browser-only, cancelled and actionable error states are accessible and do not block board navigation.
9. Deterministic Rust UCI contracts, TypeScript model/client tests, full regression gates, production builds and a real packaged Stockfish analysis flow pass.

## Out of scope

- Variation editing, annotations, arrows and free piece placement
- Persisted analysis cache and background review jobs
- Move classification, accuracy and coach explanations
- Opening-book classification and Syzygy configuration
