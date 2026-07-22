# Phase 2 coach-evidence tasks

**Status:** In Progress  
**Started:** 2026-07-22

## Setup and design

- [X] T001 Confirm the reviewed-move/timeline mapping and record the conservative evidence vocabulary. `src/review/reviewModel.ts`, `src/analysis/analysisModel.ts`, `specs/20260722-phase2-coach-evidence/`

## TDD red phase

- [X] T002 [P] Add deterministic coach-domain fixtures for mate, check, unsupported material, double attack, absolute pin, invalid input and neutral fallback. `src/review/coach.test.ts`
- [X] T003 [P] Extend Review workspace contracts for eligible error guidance and quiet non-error moves. `src/components/AnalysisWorkspace.test.tsx`

## Core implementation

- [X] T004 Implement a pure, fail-closed coach evidence builder with legal FEN/UCI validation and concrete focus prompts. `src/review/coach.ts`
- [X] T005 Connect the selected reviewed move and exact timeline positions to the evidence builder; render the accessible coach card. `src/components/AnalysisWorkspace.tsx`, `src/App.css`

## Integration and polish

- [X] T006 Verify fresh and restored reports share the same coach guidance and do not trigger an engine request. `src/components/AnalysisWorkspace.test.tsx`, `src/review/reviewPersistence.test.ts`
- [X] T007 Update README, architecture, analysis, roadmap, tasks, changelog and manual test documentation. `README.md`, `docs/ARCHITECTURE.md`, `docs/ANALYSIS_AND_ACCURACY.md`, `docs/TESTING.md`, `ROADMAP.md`, `TASKS.md`, `CHANGELOG.md`
- [ ] T008 Run frontend/Rust tests, lint, typecheck, web/Tauri builds and a browser review regression. `package.json`, `src-tauri/`

## Dependencies

```text
T001 → T002, T003
T002 → T004
T003, T004 → T005
T005 → T006, T007
T006, T007 → T008
```

## Validation checklist

- [ ] Each tactic assertion is backed by a legal board fact, not only an engine score.
- [ ] Fallback language is honest when a motif cannot be proven.
- [ ] Coach UI is keyboard/screen-reader reachable and does not alter saved reports.
- [ ] Existing review persistence remains backward compatible.
