# Phase 3 recorded-review continuation tasks

**Status:** Implemented — focused and release verification passed; optional manual hint/reveal/skip regression remains documented.  
**Started:** 2026-07-22

## Discovery and contracts

- [X] T001 Audit the existing one-move retry state, persistence record and completed-review best-line source.
- [X] T002 Define a pure local line model that distinguishes an explicitly empty legacy PV from a malformed non-empty saved PV.
- [X] T003 Keep the source boundary explicit: `solutionLineSan` is the completed review's Stockfish PV, not post-error original-PGN play.

## Implementation

- [X] T004 Reconstruct each saved PV locally with `chess.js`, deriving canonical SAN/UCI and rejecting an incomplete non-empty replay.
- [X] T005 Add player-turn progress, recorded opponent auto-replies and final-line completion to Train without exposing future SAN.
- [X] T006 Retain exact promotion handling and narrow legal-alternative language for every player turn.
- [X] T007 Persist one schedule outcome only after full unassisted completion; reset for alternate, assisted completion, reveal and skip; leave live line cursor state transient.
- [X] T008 Keep Train engine-free and retain existing bounded browser/SQLite retry persistence compatibility.
- [X] T009 Update product, architecture, accuracy and test records for the saved-review continuation contract.

## Verification and hand-off

- [X] T010 Run focused retry-line, retry-domain, persistence and RetryQueue contracts, including legacy/invalid PV, opponent reply, promotion and schedule-once cases.
- [X] T011 Run lint, typecheck, full frontend tests, Rust tests, production web build and Tauri production build.
- [ ] T012 Manual optional-control regression: hint-assisted reset, reveal and skip. The core browser walkthrough already verified a real multi-ply Review → Train route, hidden future line, correct move/reply chain, final scheduling, alternate/reset and reload behavior.
