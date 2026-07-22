use knightclub_lib::database::{
    CURRENT_SCHEMA_VERSION, DatabaseRepository, LegacyImport, StoredRetryItem,
};
use rusqlite::Connection;
use serde_json::{Value, json};

const REVIEW_KEY: &str = "0123456789abcdef";

fn retry_payload(retry_key: &str, source_ply: u32, due_at: &str, status: &str) -> Value {
    json!({
        "schemaVersion": 1,
        "retryKey": retry_key,
        "reviewKey": REVIEW_KEY,
        "sourcePly": source_ply,
        "preFen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        "sideToMove": "w",
        "playedMoveUci": "e2e4",
        "solutionUci": "d2d4",
        "playedMoveSan": "e4",
        "solutionSan": "d4",
        "solutionLineSan": ["d4", "d5"],
        "classification": "mistake",
        "focus": "Compare forcing moves before committing.",
        "status": status,
        "attemptCount": 0,
        "correctStreak": 0,
        "dueAt": due_at,
        "lastAttemptAt": null,
        "createdAt": "2026-07-22T00:00:00.000Z",
        "updatedAt": "2026-07-22T00:00:00.000Z"
    })
}

fn retry_item(retry_key: &str, source_ply: u32, due_at: &str, status: &str) -> StoredRetryItem {
    StoredRetryItem::from_payload(retry_payload(retry_key, source_ply, due_at, status)).unwrap()
}

#[test]
fn migrates_v3_databases_to_a_bounded_retry_queue() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("v3.sqlite3");
    let legacy = Connection::open(&path).unwrap();
    legacy
        .execute_batch(
            "CREATE TABLE app_state (key TEXT PRIMARY KEY, payload_json TEXT NOT NULL, updated_at TEXT NOT NULL);\
             CREATE TABLE games (id TEXT PRIMARY KEY, played_at TEXT NOT NULL, mode TEXT NOT NULL, result TEXT NOT NULL, pgn TEXT NOT NULL, final_fen TEXT NOT NULL, move_count INTEGER NOT NULL, reviewed INTEGER NOT NULL DEFAULT 0, payload_json TEXT NOT NULL);\
             CREATE TABLE reviews (review_key TEXT PRIMARY KEY, source_pgn TEXT NOT NULL, start_fen TEXT NOT NULL, move_count INTEGER NOT NULL, reviewed_at TEXT NOT NULL, payload_json TEXT NOT NULL);\
             PRAGMA user_version = 3;",
        )
        .unwrap();
    drop(legacy);

    let opened = DatabaseRepository::open(&path).unwrap();
    assert_eq!(
        opened.repository.schema_version().unwrap(),
        CURRENT_SCHEMA_VERSION
    );

    let migrated = Connection::open(path).unwrap();
    let retry_table_count: i64 = migrated
        .query_row(
            "SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = 'retry_items'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(retry_table_count, 1);
    let retry_columns: i64 = migrated
        .query_row(
            "SELECT count(*) FROM pragma_table_info('retry_items') \
             WHERE name IN ('retry_key', 'review_key', 'source_ply', 'due_at', 'status', 'updated_at', 'payload_json')",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(retry_columns, 7);
    let retry_indexes: i64 = migrated
        .query_row(
            "SELECT count(*) FROM sqlite_master WHERE type = 'index' \
             AND name IN ('idx_retry_items_due', 'idx_retry_items_review')",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(retry_indexes, 2);
}

#[test]
fn retry_items_round_trip_upsert_list_delete_and_block_legacy_import() {
    let directory = tempfile::tempdir().unwrap();
    let opened = DatabaseRepository::open(&directory.path().join("retry.sqlite3")).unwrap();
    let mut repository = opened.repository;

    let first = retry_item(
        "0123456789abcdef:1",
        1,
        "2026-07-23T00:00:00.000Z",
        "active",
    );
    let second = retry_item(
        "0123456789abcdef:2",
        2,
        "2026-07-22T00:00:00.000Z",
        "mastered",
    );
    repository.save_retry_item(&first).unwrap();
    repository.save_retry_item(&second).unwrap();
    assert_eq!(
        repository.load_retry_item(&first.retry_key).unwrap(),
        Some(first.payload.clone())
    );

    let mut replacement_payload = first.payload.clone();
    replacement_payload["attemptCount"] = json!(4);
    replacement_payload["correctStreak"] = json!(2);
    replacement_payload["lastAttemptAt"] = json!("2026-07-22T06:00:00.000Z");
    replacement_payload["updatedAt"] = json!("2026-07-22T06:00:00.000Z");
    let replacement = StoredRetryItem::from_payload(replacement_payload).unwrap();
    repository.save_retry_item(&replacement).unwrap();
    assert_eq!(
        repository.load_retry_item(&replacement.retry_key).unwrap(),
        Some(replacement.payload.clone())
    );

    let listed = repository.list_retry_items().unwrap();
    assert_eq!(listed.len(), 2);
    assert_eq!(listed[0]["retryKey"], json!(first.retry_key));
    assert_eq!(listed[1]["retryKey"], json!(second.retry_key));

    let legacy = LegacyImport {
        active_session: None,
        preferences: None,
        games: vec![],
    };
    assert!(!repository.import_legacy(&legacy).unwrap());

    assert!(repository.delete_retry_item(&first.retry_key).unwrap());
    assert!(!repository.delete_retry_item(&first.retry_key).unwrap());
    assert!(
        repository
            .load_retry_item(&first.retry_key)
            .unwrap()
            .is_none()
    );
    assert_eq!(repository.list_retry_items().unwrap().len(), 1);
}

#[test]
fn retry_items_reject_malformed_or_out_of_bounds_payloads() {
    let valid = retry_payload(
        "0123456789abcdef:1",
        1,
        "2026-07-23T00:00:00.000Z",
        "active",
    );
    assert!(StoredRetryItem::from_payload(valid.clone()).is_ok());

    let mut key_mismatch = valid.clone();
    key_mismatch["retryKey"] = json!("0123456789abcdef:2");
    assert!(StoredRetryItem::from_payload(key_mismatch).is_err());

    let mut invalid_side = valid.clone();
    invalid_side["sideToMove"] = json!("white");
    assert!(StoredRetryItem::from_payload(invalid_side).is_err());

    let mut invalid_uci = valid.clone();
    invalid_uci["solutionUci"] = json!("a9a1");
    assert!(StoredRetryItem::from_payload(invalid_uci).is_err());

    let mut oversized_line = valid.clone();
    oversized_line["solutionLineSan"] = json!(["d4", "d5", "c4", "e6", "Nc3", "Nf6", "Bg5"]);
    assert!(StoredRetryItem::from_payload(oversized_line).is_err());

    let mut invalid_classification = valid.clone();
    invalid_classification["classification"] = json!("good");
    assert!(StoredRetryItem::from_payload(invalid_classification).is_err());

    let mut invalid_status = valid.clone();
    invalid_status["status"] = json!("paused");
    assert!(StoredRetryItem::from_payload(invalid_status).is_err());

    let mut invalid_streak = valid.clone();
    invalid_streak["correctStreak"] = json!(6);
    assert!(StoredRetryItem::from_payload(invalid_streak).is_err());

    let mut invalid_attempt_count = valid.clone();
    invalid_attempt_count["attemptCount"] = json!(1_000_001);
    assert!(StoredRetryItem::from_payload(invalid_attempt_count).is_err());

    let mut invalid_last_attempt = valid.clone();
    invalid_last_attempt["lastAttemptAt"] = json!(42);
    assert!(StoredRetryItem::from_payload(invalid_last_attempt).is_err());

    let mut oversized_focus = valid;
    oversized_focus["focus"] = json!("x".repeat(4_097));
    assert!(StoredRetryItem::from_payload(oversized_focus).is_err());
}
