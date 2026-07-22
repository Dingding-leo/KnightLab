# Phase 1 local PGN/FEN transfer tasks

**Status:** Implemented — code integration and automated release verification are complete; targeted browser verification passed. The desktop transfer walkthrough remains pending as a handoff item.  
**Started:** 2026-07-22

## Specification and contracts

- [X] T001 Audit the existing Play export, Position tools and Review input paths.
- [X] T002 Define a pure local text-transfer result contract and write Clipboard/download fallback tests.
- [X] T003 Define a bounded, immutable Review-file import contract and cover PGN/FEN/text inference, declared-size rejection, latest-selection-wins and error paths.
- [X] T004 Record the local-only, size-bound and non-destructive acceptance criteria.

## Implementation

- [X] T005 Route Play **Copy PGN** and **Download PGN** through the shared transfer boundary with user-facing feedback adjacent to the toolbar.
- [X] T006 Add **Copy current FEN** and **Download FEN** to Position tools without expanding the primary Play toolbar.
- [X] T007 Add keyboard-focusable Review `.pgn`, `.fen` and `.txt` selection; read and apply only a successful immutable timeline.
- [X] T008 Reject declared-oversized picker files before `File.text()`, use only the newest pending selection and retain the prior timeline on failure.
- [X] T009 Add component/static coverage for labels, focusable picker control, adjacent feedback and misnamed-PGN handling.

## Verification and hand-off

- [X] T010 Validate transfer/file/component coverage through the final frontend suite; typecheck and lint passed.
- [X] T011 Run the full frontend, Rust and production-build release gates: 35 frontend files / 155 tests, web build, 23 Rust tests and the macOS Tauri bundle passed.
- [X] T012 Complete targeted browser verification for explicit Play PGN/FEN controls, valid Review FEN and invalid-FEN error/timeline preservation.
- [ ] T013 Complete the remaining browser and desktop local-transfer matrix in `docs/TESTING.md`, including the unperformed desktop transfer walkthrough.
