# Phase 1 local PGN/FEN transfer plan

```text
Current Play game / position
        ↓                         ↓
  Copy PGN / FEN            Download PGN / FEN
        ↓                         ↓
Clipboard API → local fallback     local plaintext Blob
        ↓
visible success or recoverable error

Pasted notation / selected local file
        ↓
size + format hint → authoritative chess.js timeline parse
        ↓
success: replace Review timeline    failure: preserve current timeline
```

## Design decisions

- The main Play toolbar stays focused on game actions; current-position FEN transfer belongs beside FEN loading in Position tools.
- A transfer primitive owns Clipboard API fallback, download cleanup and error conversion so UI handlers do not leak platform-specific rejections.
- Review file selection is explicit and local through a visible keyboard-focusable button. `.pgn`, `.fen` and `.txt` are accepted; content may disambiguate a FEN-shaped text file, while a normal PGN misnamed `.fen` can fall through from the FEN attempt to PGN parsing.
- The picker rejects a declared file over 512 KiB before reading `File.text()`. The import boundary then checks both browser `File.size` and actual UTF-8 text length, protecting direct calls and unusual WebView implementations.
- A per-selection request gate lets only the newest pending file import update Review. Parsing returns an immutable timeline, so stale, failed or malformed inputs cannot blank or corrupt the current analysis/review context.
- Exact source PGN is retained only when the timeline has one; a FEN import should export FEN rather than fabricate a PGN game.

## Test strategy and evidence

- Unit tests cover Clipboard API success, denied-permission fallback, unavailable-copy errors, download cleanup, empty content and unavailable browser APIs.
- File-import tests cover `.pgn`, `.fen`, FEN-shaped `.txt`, incorrect extensions, malformed notation, immutable results, invalid file sizes, the 512 KiB total cap and the 1 KiB FEN cap.
- Static component tests cover explicit action labels, a keyboard-focusable file picker and user-visible feedback beside Play controls.
- File-import tests cover pre-read declared-size rejection, latest-selection-wins behavior and valid PGN mistakenly named `.fen` as well as the bounded parsing cases.
- Browser/desktop checks cover copied text, generated downloads, valid pasted/file imports, permission denial and preservation of an already displayed timeline after every failure route.

The final frontend suite passed with 35 files / 155 tests; lint, typecheck, web build, 23 Rust tests and the macOS Tauri bundle also passed. Targeted browser verification covered explicit Play PGN/FEN controls, valid Review FEN and invalid-FEN timeline preservation. A dedicated desktop transfer walkthrough remains pending and must not be inferred from the bundle build.
