use knightclub_lib::database::{
    DatabaseRepository, LegacyImport, StoredTacticsAttempt, StoredTacticsProgress,
    TacticsStateSnapshot, CURRENT_SCHEMA_VERSION,
};
use rusqlite::Connection;
use serde_json::{json, Value};

const SEED_ID: &str = "seed-v1:fools-mate";
const CREATED_AT: &str = "2026-07-22T00:00:00.000Z";

fn progress_payload(
    seed_id: &str,
    seed_revision: u32,
    attempt_count: u32,
    solve_count: u32,
    correct_streak: u8,
    due_at: &str,
    status: &str,
    last_attempt_at: Option<&str>,
    last_outcome: Option<&str>,
    best_solve_ms: Option<u32>,
    created_at: &str,
    updated_at: &str,
) -> Value {
    json!({
        "schemaVersion": 1,
        "seedId": seed_id,
        "seedRevision": seed_revision,
        "status": status,
        "attemptCount": attempt_count,
        "solveCount": solve_count,
        "correctStreak": correct_streak,
        "dueAt": due_at,
        "lastAttemptAt": last_attempt_at,
        "lastOutcome": last_outcome,
        "bestSolveMs": best_solve_ms,
        "createdAt": created_at,
        "updatedAt": updated_at
    })
}

fn attempt_payload(
    attempt_id: &str,
    seed_id: &str,
    seed_revision: u32,
    outcome: &str,
    elapsed_ms: u32,
    hint_count: u8,
    attempted_at: &str,
) -> Value {
    json!({
        "schemaVersion": 1,
        "attemptId": attempt_id,
        "seedId": seed_id,
        "seedRevision": seed_revision,
        "outcome": outcome,
        "elapsedMs": elapsed_ms,
        "moveCount": 1,
        "hintCount": hint_count,
        "attemptedAt": attempted_at
    })
}

fn progress(payload: Value) -> StoredTacticsProgress {
    StoredTacticsProgress::from_payload(payload).expect("valid tactics progress")
}

fn attempt(payload: Value) -> StoredTacticsAttempt {
    StoredTacticsAttempt::from_payload(payload).expect("valid tactics attempt")
}

#[test]
fn migrates_v4_database_to_validated_tactics_tables() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("v4.sqlite3");
    let legacy = Connection::open(&path).unwrap();
    legacy
        .execute_batch(
            "CREATE TABLE app_state (key TEXT PRIMARY KEY, payload_json TEXT NOT NULL, updated_at TEXT NOT NULL);\
             CREATE TABLE games (id TEXT PRIMARY KEY, played_at TEXT NOT NULL, mode TEXT NOT NULL, result TEXT NOT NULL, pgn TEXT NOT NULL, final_fen TEXT NOT NULL, move_count INTEGER NOT NULL, reviewed INTEGER NOT NULL DEFAULT 0, payload_json TEXT NOT NULL);\
             CREATE TABLE reviews (review_key TEXT PRIMARY KEY, source_pgn TEXT NOT NULL, start_fen TEXT NOT NULL, move_count INTEGER NOT NULL, reviewed_at TEXT NOT NULL, payload_json TEXT NOT NULL);\
             CREATE TABLE retry_items (retry_key TEXT PRIMARY KEY, review_key TEXT NOT NULL, source_ply INTEGER NOT NULL, due_at TEXT NOT NULL, status TEXT NOT NULL, updated_at TEXT NOT NULL, payload_json TEXT NOT NULL);\
             PRAGMA user_version = 4;",
        )
        .unwrap();
    drop(legacy);

    let opened = DatabaseRepository::open(&path).unwrap();
    assert_eq!(
        opened.repository.schema_version().unwrap(),
        CURRENT_SCHEMA_VERSION
    );

    let migrated = Connection::open(path).unwrap();
    let table_count: i64 = migrated
        .query_row(
            "SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name IN ('tactics_progress', 'tactics_attempts')",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(table_count, 2);
    let progress_columns: i64 = migrated
        .query_row(
            "SELECT count(*) FROM pragma_table_info('tactics_progress') \
             WHERE name IN ('seed_id', 'seed_revision', 'due_at', 'status', 'updated_at', 'payload_json')",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(progress_columns, 6);
    let attempt_columns: i64 = migrated
        .query_row(
            "SELECT count(*) FROM pragma_table_info('tactics_attempts') \
             WHERE name IN ('attempt_id', 'seed_id', 'seed_revision', 'attempted_at', 'outcome', 'elapsed_ms', 'payload_json')",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(attempt_columns, 7);
    let index_count: i64 = migrated
        .query_row(
            "SELECT count(*) FROM sqlite_master WHERE type = 'index' \
             AND name IN ('idx_tactics_progress_due', 'idx_tactics_attempts_seed', 'idx_tactics_attempts_recent')",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(index_count, 3);
}

#[test]
fn records_attempt_and_next_progress_atomically_and_idempotently() {
    let directory = tempfile::tempdir().unwrap();
    let opened = DatabaseRepository::open(&directory.path().join("tactics.sqlite3")).unwrap();
    let mut repository = opened.repository;

    let first_attempt_at = CREATED_AT;
    let first_attempt = attempt(attempt_payload(
        "attempt-001",
        SEED_ID,
        1,
        "solved",
        1_200,
        0,
        first_attempt_at,
    ));
    let first_progress = progress(progress_payload(
        SEED_ID,
        1,
        1,
        1,
        1,
        "2026-07-23T00:00:00.000Z",
        "active",
        Some(first_attempt_at),
        Some("solved"),
        Some(1_200),
        CREATED_AT,
        first_attempt_at,
    ));

    let state = repository
        .record_tactics_attempt(&first_progress, &first_attempt)
        .unwrap();
    assert_eq!(state.progress, vec![first_progress.payload.clone()]);
    assert_eq!(state.attempts, vec![first_attempt.payload.clone()]);

    let replay = repository
        .record_tactics_attempt(&first_progress, &first_attempt)
        .unwrap();
    assert_eq!(replay.progress.len(), 1);
    assert_eq!(replay.attempts.len(), 1);

    let second_attempt_at = "2026-07-23T00:00:00.000Z";
    let second_attempt = attempt(attempt_payload(
        "attempt-002",
        SEED_ID,
        1,
        "solved",
        850,
        0,
        second_attempt_at,
    ));
    let second_progress = progress(progress_payload(
        SEED_ID,
        1,
        2,
        2,
        2,
        "2026-07-26T00:00:00.000Z",
        "active",
        Some(second_attempt_at),
        Some("solved"),
        Some(850),
        CREATED_AT,
        second_attempt_at,
    ));
    let advanced = repository
        .record_tactics_attempt(&second_progress, &second_attempt)
        .unwrap();
    assert_eq!(advanced.progress, vec![second_progress.payload.clone()]);
    assert_eq!(
        advanced.attempts,
        vec![
            second_attempt.payload.clone(),
            first_attempt.payload.clone()
        ]
    );

    let legacy = LegacyImport {
        active_session: None,
        preferences: None,
        games: vec![],
    };
    assert!(!repository.import_legacy(&legacy).unwrap());
}

#[test]
fn rejects_invalid_or_conflicting_tactics_writes_without_partial_state() {
    let directory = tempfile::tempdir().unwrap();
    let opened = DatabaseRepository::open(&directory.path().join("atomic.sqlite3")).unwrap();
    let mut repository = opened.repository;

    let first_attempt = attempt(attempt_payload(
        "attempt-001",
        SEED_ID,
        1,
        "solved",
        1_000,
        0,
        CREATED_AT,
    ));
    let mismatched_progress = progress(progress_payload(
        "different-seed",
        1,
        1,
        1,
        1,
        "2026-07-23T00:00:00.000Z",
        "active",
        Some(CREATED_AT),
        Some("solved"),
        Some(1_000),
        CREATED_AT,
        CREATED_AT,
    ));
    assert!(repository
        .record_tactics_attempt(&mismatched_progress, &first_attempt)
        .is_err());
    let empty = repository.list_tactics_state().unwrap();
    assert!(empty.progress.is_empty());
    assert!(empty.attempts.is_empty());

    let first_progress = progress(progress_payload(
        SEED_ID,
        1,
        1,
        1,
        1,
        "2026-07-23T00:00:00.000Z",
        "active",
        Some(CREATED_AT),
        Some("solved"),
        Some(1_000),
        CREATED_AT,
        CREATED_AT,
    ));
    repository
        .record_tactics_attempt(&first_progress, &first_attempt)
        .unwrap();

    let conflicting_attempt = attempt(attempt_payload(
        "attempt-001",
        SEED_ID,
        1,
        "solved",
        900,
        0,
        CREATED_AT,
    ));
    assert!(repository
        .record_tactics_attempt(&first_progress, &conflicting_attempt)
        .is_err());
    let retained = repository.list_tactics_state().unwrap();
    assert_eq!(retained.progress, vec![first_progress.payload]);
    assert_eq!(retained.attempts, vec![first_attempt.payload]);
}

#[test]
fn merges_browser_state_by_immutable_attempt_id_and_newer_progress() {
    let directory = tempfile::tempdir().unwrap();
    let opened = DatabaseRepository::open(&directory.path().join("merge.sqlite3")).unwrap();
    let mut repository = opened.repository;

    let old_attempt = attempt_payload("attempt-001", SEED_ID, 1, "solved", 1_100, 0, CREATED_AT);
    let old_progress = progress_payload(
        SEED_ID,
        1,
        1,
        1,
        1,
        "2026-07-23T00:00:00.000Z",
        "active",
        Some(CREATED_AT),
        Some("solved"),
        Some(1_100),
        CREATED_AT,
        CREATED_AT,
    );
    repository
        .merge_tactics_state(TacticsStateSnapshot {
            progress: vec![old_progress.clone()],
            attempts: vec![old_attempt.clone()],
        })
        .unwrap();

    let later = "2026-07-23T00:00:00.000Z";
    let newer_attempt = attempt_payload("attempt-002", SEED_ID, 1, "failed", 600, 0, later);
    let newer_progress = progress_payload(
        SEED_ID,
        1,
        2,
        1,
        0,
        later,
        "active",
        Some(later),
        Some("failed"),
        Some(1_100),
        CREATED_AT,
        later,
    );
    let merged = repository
        .merge_tactics_state(TacticsStateSnapshot {
            progress: vec![newer_progress.clone()],
            attempts: vec![old_attempt.clone(), newer_attempt.clone()],
        })
        .unwrap();
    assert_eq!(merged.progress, vec![newer_progress]);
    assert_eq!(merged.attempts, vec![newer_attempt, old_attempt]);

    let conflicting = attempt_payload("attempt-001", SEED_ID, 1, "solved", 42, 0, CREATED_AT);
    assert!(repository
        .merge_tactics_state(TacticsStateSnapshot {
            progress: vec![],
            attempts: vec![conflicting],
        })
        .is_err());
    let retained = repository.list_tactics_state().unwrap();
    assert_eq!(retained.attempts.len(), 2);
}
