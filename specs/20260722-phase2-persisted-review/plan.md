# Phase 2 persisted review plan

1. Add canonical timeline identity and typed persisted review record validation in the pure review layer.
2. Introduce browser compatibility storage and extend the shared database client contract.
3. Migrate SQLite from v2 to v3; implement bounded review record repository methods and Tauri commands.
4. Wire report recovery/save into the Analysis workspace and mark linked local Library games.
5. Verify migrations, cancellation/stale hydration, browser fallback, real desktop restart and all quality gates.
