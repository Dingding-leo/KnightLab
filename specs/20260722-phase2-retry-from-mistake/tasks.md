# Phase 2 retry-from-mistake tasks

**Status:** In Progress  
**Started:** 2026-07-22

- [x] T001 Add red retry-domain tests for legal item construction, exact matching, scheduling and invalid-input rejection. `src/review/retry.test.ts`
- [x] T002 Implement the fail-closed retry adapter, scheduling model and browser persistence. `src/review/retry.ts`, `src/review/retryPersistence.ts`
- [x] T003 Add SQLite v4 retry-item migration, Tauri commands and native migration/CRUD contracts. `src-tauri/`, `src/storage/databaseClient.ts`
- [x] T004 Add red component contracts for a focused, honest Review retry action and a due-first Train queue. `src/components/AnalysisWorkspace.test.tsx`, `src/components/RetryQueue.test.tsx`
- [x] T005 Connect Review queue creation, Train queue interaction, board move/promotion handling, outcome persistence and navigation. `src/App.tsx`, `src/components/AnalysisWorkspace.tsx`, `src/components/RetryQueue.tsx`
- [x] T006 Add original retry presentation and responsive styling. `src/App.css`
- [x] T007a Update product and testing records. `README.md`, `docs/`, `ROADMAP.md`, `TASKS.md`
- [ ] T007b Run full gates plus a local interactive retry regression. `npm`, `cargo`, local app/browser
