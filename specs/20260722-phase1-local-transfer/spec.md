# Phase 1 local PGN/FEN transfer

**Status:** Implemented — Play/Review integration and automated release verification are complete; targeted browser verification passed. A dedicated desktop transfer walkthrough remains a handoff checklist item.  
**Date:** 2026-07-22

## Objective

Make it quick and trustworthy for a solo player to move a game or position between KnightClub and another local chess tool, without an account, upload, browser crash or accidental loss of the position they are reviewing.

## Acceptance criteria

1. Play presents unambiguous **Copy PGN** and **Download PGN** actions for the current game, with success or recoverable-error feedback adjacent to the toolbar.
2. Play's Position tools present **Copy current FEN** and **Download FEN** actions for the current board position, without crowding the main action toolbar.
3. Review accepts typed or pasted PGN/FEN and a deliberately selected local `.pgn`, `.fen` or `.txt` file through a visible keyboard-focusable picker button; a FEN-shaped text file may be parsed as FEN regardless of its extension.
4. Clipboard transfer first uses the platform Clipboard API, then a safe local fallback. A denied or unavailable route produces a readable in-product result rather than an unhandled error.
5. Downloads are local plaintext files with a meaningful `.pgn` or `.fen` name. The flow must not upload notation, call a remote service or require an account.
6. Every Review file is treated as untrusted. The overall limit is 512 KiB, a FEN is limited to 1 KiB, and the parser considers both picker-reported and actual UTF-8 byte sizes. A picker-declared oversized file must be rejected before `File.text()` is called.
7. Extension and shape inference can select a parser, but validated PGN/FEN timeline construction remains the source of truth. A valid PGN accidentally named `.fen` must still reach the PGN parser after the FEN attempt. A successful import yields an immutable timeline.
8. Only the newest pending file import may apply to Review. A file-read, size, format or notation error reports why it failed and leaves the previously displayed Review timeline intact.
9. Pure transfer/file-import tests, component accessibility coverage, typecheck, lint, the full frontend suite and release builds pass. Targeted browser verification is recorded below; the broader browser and desktop matrix remains captured in the test guide.

## Verification evidence

- Final frontend suite: `npm test` passed with 35 files / 155 tests; lint, typecheck and the web build passed.
- Rust suite: 23 tests passed. `npm run tauri:build` produced `src-tauri/target/release/bundle/macos/KnightClub.app`.
- Automated hardening covers declared-oversized picker files without a `File.text()` call, newest-pending-file application, valid PGN named `.fen`, the focusable picker and toolbar-adjacent Play feedback.
- Browser manual verification passed for the explicit Play PGN/FEN controls, a valid Review FEN import, and invalid-FEN error clarity with preservation of the current timeline.
- A manual desktop transfer walkthrough was not performed; retain it as a release handoff item rather than inferring it from the successful desktop bundle.

## Out of scope

- Bulk Library import, duplicate detection, tags, collections or automatic game saving
- Cloud sync, uploads, filesystem access beyond a file the user explicitly selects, or sharing to a third-party service
- Editable PGN variations/comments, opening databases or a position editor
