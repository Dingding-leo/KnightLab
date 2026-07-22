# Phase 2 review-flow polish plan

1. Extend the reusable board contract with an optional, read-only Coach-evidence square set and preserve all existing play interactions.
2. Derive the set from the selected Coach guidance in `AnalysisWorkspace`, then add a scoped keyboard effect for replay navigation.
3. Add deterministic component/domain tests, run the complete frontend/Rust/build gates, and manually validate the Review flow when local-browser navigation is available.

## Guardrails

- `ChessBoard` stays presentation/rules-neutral; it receives square state but does not infer tactics.
- The `coach` domain stays the only source of evidence squares.
- Keyboard handling ignores inputs, textareas, selects and modified combinations.
