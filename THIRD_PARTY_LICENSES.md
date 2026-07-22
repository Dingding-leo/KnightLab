# Third-party licence distribution checklist

This file complements `THIRD_PARTY_NOTICES.md`; upstream licence texts remain authoritative.

| Component | Licence | Bundled now | Distribution action |
|---|---|---|---|
| React / React DOM | MIT | Yes | Retain MIT notice |
| chess.js | BSD-2-Clause | Yes | Retain copyright and licence |
| Lucide | ISC | Yes | Retain ISC notice |
| Tauri | Apache-2.0 OR MIT | Yes | Retain selected upstream notices |
| Tauri dialog plugin / rfd | Apache-2.0 OR MIT | Yes | Retain selected upstream notices |
| Stockfish.js 18.0.8 browser assets | GPL-3.0 | Generated into web builds | Include `COPYING.txt`, `SOURCE.txt`, exact source revision and verified JS/WASM checksums |
| Native Stockfish executable | GPL-3.0 | No | If later bundled, include GPLv3 and exact corresponding source offer/access |

The local Homebrew Stockfish installation used in desktop development is outside the KnightClub repository and package. Do not copy a native engine executable into release artifacts until the exact binary, source revision, build flags, licence text and corresponding-source delivery have been recorded and reviewed. Browser builds may contain only the checksum-verified assets produced by `scripts/sync-stockfish.mjs` from the pinned npm package.
