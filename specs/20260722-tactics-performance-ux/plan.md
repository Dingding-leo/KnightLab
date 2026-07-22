# Implementation plan — tactics and responsive-engine UX

1. **Training vertical slice**
   - Author original, local puzzle records with exact FEN/UCI/SAN validation and proof metadata.
   - Render one accessible active trainer at a time; preserve no-spoiler states and record only terminal outcomes.
   - Add bounded browser and SQLite v5 state with deterministic reconciliation.

2. **Idle and bot compute**
   - Make browser Stockfish and KnightBot fallback construction lazy.
   - Align browser/Rust presets to single-threaded time/node/hash budgets.
   - Bound fallback search and keep a short cancellable presentation floor separate from engine work.

3. **Rendering and engine priority**
   - Schedule display ticks at the next visible clock boundary and preserve a deadline tick for flag fall.
   - Memoize the expensive board/piece/notation subtrees with stable live handlers.
   - Pause optional Review analysis while the bot owns the current turn.

4. **Verification and documentation**
   - Run TypeScript, browser-engine, Rust command/persistence, lint and production build gates.
   - Exercise first-play lazy loading, a bot reply, Review priority and first-visit Train in a real browser.
   - Record limits, persistence schema and remaining packaged-desktop check in project docs.
