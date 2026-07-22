# Tactics and responsive-engine UX

**Status:** Implemented and verified in browser/automated gates; packaged-desktop performance walkthrough remains a release check.  
**Date:** 2026-07-22

## User problem

KnightClub should feel immediate and calm on a normal laptop. A player must be able to open Play without waking a chess engine, make a move without the board stuttering behind a clock, train immediately without an empty roadmap, and visit Review without competing with the bot for CPU.

## Acceptance criteria

1. A fresh Play screen must not create Stockfish or KnightBot workers. An explicit engine verification or a real bot turn may create Stockfish; KnightBot may start only after Stockfish bot play fails.
2. Default bot presets must remain progressively stronger while using one thread, a finite move-time ceiling and a finite node ceiling in both browser and desktop adapters.
3. Reducing search work must not force the bot to appear unnaturally instant. Any display pacing must be cancellable and must not keep the engine calculating.
4. Above 20 seconds, the visible clock may refresh only at its next whole-second change; below 20 seconds, it must retain tenths and exact timeout handling. Clock-only updates must not rebuild the Play board grid.
5. A bot turn must take priority over optional Review candidate analysis and starting a full review. Once the bot move completes, Review may resume normally.
6. A fresh Train visit must show an immediate original local Tactics Sprint with no initial solution/PV/title spoiler, exact local legal replay, explicit hints/reveal/reset and durable bounded terminal outcomes.
7. Browser and desktop persistence must reconcile tactics progress deterministically and atomically record a native terminal attempt with matching progress.

## Non-goals

- Claiming Chess.com compatibility, copying Chess.com assets/content/trade dress, or importing a third-party puzzle corpus.
- Replacing deliberate user-selected deep analysis settings or custom UCI limits.
- Building a global engine scheduler for every future background job; this slice prevents the currently observable bot/Review collision.
- Treating fallback KnightBot as a strength-equivalent alternative to Stockfish.

## Evidence

- Frontend contracts cover lazy hybrid startup, browser/native preset parity, bounded fallback behavior, clock refresh scheduling, board accessibility, Review bot-priority state, local tactics validity/no-spoiler/persistence and native tactics contracts.
- Browser walkthrough observed no Stockfish asset request on fresh Play; the first bot reply loaded the local Worker/WASM and produced a legal move. It also confirmed immediate Tactics Sprint entry and Quick/one-line Review defaults.
