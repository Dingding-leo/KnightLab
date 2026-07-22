use knightclub_lib::database::{
    CURRENT_SCHEMA_VERSION, DatabaseRepository, LegacyImport, StoredGameRecord,
};
use rusqlite::Connection;
use serde_json::json;
use std::fs;

fn game(id: &str) -> StoredGameRecord {
    StoredGameRecord {
        id: id.into(),
        played_at: "2026-07-22T00:00:00.000Z".into(),
        mode: "bot".into(),
        result: "1-0".into(),
        pgn: "1. e4 e5 2. Nf3 Nc6 1-0".into(),
        final_fen: "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3".into(),
        move_count: 4,
        reviewed: false,
        payload: json!({
            "id": id,
            "playedAt": "2026-07-22T00:00:00.000Z",
            "mode": "bot",
            "botProfileId": "rowan-pike",
            "result": "1-0",
            "pgn": "1. e4 e5 2. Nf3 Nc6 1-0",
            "finalFen": "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3",
            "moveCount": 4
        }),
    }
}

#[test]
fn migrates_clean_v1_and_v2_databases_forward() {
    let directory = tempfile::tempdir().expect("temporary database directory");
    let clean_path = directory.path().join("clean.sqlite3");
    let opened = DatabaseRepository::open(&clean_path).expect("open clean database");
    assert_eq!(
        opened.repository.schema_version().unwrap(),
        CURRENT_SCHEMA_VERSION
    );
    assert!(opened.recovery_backup.is_none());

    let v1_path = directory.path().join("v1.sqlite3");
    let v1 = Connection::open(&v1_path).unwrap();
    v1.execute_batch(
        "CREATE TABLE app_state (key TEXT PRIMARY KEY, payload_json TEXT NOT NULL, updated_at TEXT NOT NULL);\
         CREATE TABLE games (id TEXT PRIMARY KEY, played_at TEXT NOT NULL, mode TEXT NOT NULL, result TEXT NOT NULL, pgn TEXT NOT NULL, final_fen TEXT NOT NULL, move_count INTEGER NOT NULL, payload_json TEXT NOT NULL);\
         PRAGMA user_version = 1;",
    ).unwrap();
    drop(v1);

    let migrated = DatabaseRepository::open(&v1_path).expect("migrate v1 database");
    assert_eq!(
        migrated.repository.schema_version().unwrap(),
        CURRENT_SCHEMA_VERSION
    );
    let connection = Connection::open(v1_path).unwrap();
    let reviewed_exists: i64 = connection
        .query_row(
            "SELECT count(*) FROM pragma_table_info('games') WHERE name = 'reviewed'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(reviewed_exists, 1);
    let index_count: i64 = connection
        .query_row(
            "SELECT count(*) FROM sqlite_master WHERE type = 'index' AND name IN ('idx_games_played_at', 'idx_games_result', 'idx_games_mode')",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(index_count, 3);
    let reviews_exists: i64 = connection
        .query_row(
            "SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = 'reviews'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(reviews_exists, 1);

    let v2_path = directory.path().join("v2.sqlite3");
    let v2 = Connection::open(&v2_path).unwrap();
    v2.execute_batch(
        "CREATE TABLE app_state (key TEXT PRIMARY KEY, payload_json TEXT NOT NULL, updated_at TEXT NOT NULL);\
         CREATE TABLE games (id TEXT PRIMARY KEY, played_at TEXT NOT NULL, mode TEXT NOT NULL, result TEXT NOT NULL, pgn TEXT NOT NULL, final_fen TEXT NOT NULL, move_count INTEGER NOT NULL, reviewed INTEGER NOT NULL DEFAULT 0, payload_json TEXT NOT NULL);\
         CREATE INDEX idx_games_played_at ON games(played_at DESC);\
         CREATE INDEX idx_games_result ON games(result);\
         CREATE INDEX idx_games_mode ON games(mode);\
         PRAGMA user_version = 2;",
    ).unwrap();
    drop(v2);

    let migrated_v2 = DatabaseRepository::open(&v2_path).expect("migrate v2 database");
    assert_eq!(
        migrated_v2.repository.schema_version().unwrap(),
        CURRENT_SCHEMA_VERSION
    );
    let v2_connection = Connection::open(v2_path).unwrap();
    let v2_reviews_exists: i64 = v2_connection
        .query_row(
            "SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = 'reviews'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(v2_reviews_exists, 1);
}

#[test]
fn round_trips_state_and_keeps_legacy_import_atomic_and_idempotent() {
    let directory = tempfile::tempdir().unwrap();
    let opened = DatabaseRepository::open(&directory.path().join("data.sqlite3")).unwrap();
    let mut repository = opened.repository;
    let legacy = LegacyImport {
        active_session: Some(json!({ "pgn": "1. e4", "startFen": "start", "botProfileId": "rowan-pike" })),
        preferences: Some(json!({ "soundsEnabled": false, "botProfileId": "rowan-pike" })),
        games: vec![game("game-1")],
    };

    assert!(repository.import_legacy(&legacy).unwrap());
    assert!(!repository.import_legacy(&legacy).unwrap());
    let snapshot = repository.snapshot().unwrap();
    assert_eq!(snapshot.active_session, legacy.active_session);
    assert_eq!(snapshot.preferences, legacy.preferences);
    assert_eq!(snapshot.games.len(), 1);
    assert_eq!(snapshot.games[0]["botProfileId"], "rowan-pike");

    repository.clear_active_session().unwrap();
    repository.clear_games().unwrap();
    let cleared = repository.snapshot().unwrap();
    assert!(cleared.active_session.is_none());
    assert!(cleared.games.is_empty());
}

#[test]
fn rejects_oversized_payloads_without_partial_import() {
    let directory = tempfile::tempdir().unwrap();
    let opened = DatabaseRepository::open(&directory.path().join("bounded.sqlite3")).unwrap();
    let mut repository = opened.repository;
    let legacy = LegacyImport {
        active_session: Some(json!({ "pgn": "x".repeat(1_100_000) })),
        preferences: Some(json!({ "soundsEnabled": true })),
        games: vec![game("game-1")],
    };

    assert!(repository.import_legacy(&legacy).is_err());
    let snapshot = repository.snapshot().unwrap();
    assert!(snapshot.active_session.is_none());
    assert!(snapshot.preferences.is_none());
    assert!(snapshot.games.is_empty());
}

#[test]
fn preserves_a_corrupt_database_before_recovering() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("corrupt.sqlite3");
    fs::write(&path, b"this is not sqlite").unwrap();

    let opened = DatabaseRepository::open(&path).expect("recover corrupt database");
    let backup = opened.recovery_backup.expect("corrupt backup path");
    assert!(backup.exists());
    assert_eq!(fs::read(backup).unwrap(), b"this is not sqlite");
    assert_eq!(
        opened.repository.schema_version().unwrap(),
        CURRENT_SCHEMA_VERSION
    );
}
