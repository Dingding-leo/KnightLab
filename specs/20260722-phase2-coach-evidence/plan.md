# Phase 2 coach-evidence plan

## Technical context

- **Stack:** React 19, strict TypeScript, Vite and Vitest; `chess.js` is the rules authority.
- **Existing boundaries:** `reviewModel` owns immutable reviewed move facts; `analysisModel` reconstructs canonical positions; `AnalysisWorkspace` renders restored or fresh reports.
- **Dependencies:** no new runtime packages or engine calls. The feature derives evidence from already-recorded local review data.

## Foundation compliance

| Invariant | Plan |
| --- | --- |
| Rules remain outside UI | A pure coach domain receives FENs and review facts; components only render its result. |
| No UI-thread engine work | No new search is started; the result reuses completed Stockfish review data. |
| Stale work cannot alter state | Guidance is synchronous and derived from the currently selected timeline/review pair. |
| Untrusted input is bounded | FEN and UCI are parsed with `chess.js`; malformed input returns neutral guidance. |
| Original local product | Copy and evidence are authored for KnightClub and contain no third-party instructional material. |

## Implementation phases

1. **Pure coach domain and red tests.** Add a typed, deterministic evidence builder. Cover missed mate, legal check, unsupported moved piece, double attack, absolute king pin, safe fallbacks and non-error suppression.
2. **Review integration.** Derive guidance from the selected report move and exact timeline positions. Render an accessible coach card only for eligible error classes, with concrete board evidence and a next-focus prompt.
3. **Regression and documentation.** Preserve restored-review behavior, update the Phase 2 roadmap/product/testing records, and record the boundary between evidence-backed coaching and future tactical proof/training work.

## Test strategy

- Unit-test evidence extraction from fixed FENs and UCI moves, including illegal input and low-confidence cases.
- Extend static Review workspace contracts to assert that error guidance renders and non-error moves remain quiet.
- Run existing review/persistence tests to prove reports remain backward compatible, then run lint, typecheck, frontend tests, Rust tests and production builds.

## Risks and mitigation

| Risk | Mitigation |
| --- | --- |
| Geometric attacks can overstate a tactic | Use cautious language such as “attacks” or “creates pressure”; only claim check, mate, or an absolute king pin after legal board verification. |
| Stored reports can be incomplete or old | Validate every optional input and produce an honest comparison instead of throwing or inventing a motif. |
| Coach text becomes generic | Require each evidence item to name a legal move, piece, or square and expose the recorded SAN continuation. |
