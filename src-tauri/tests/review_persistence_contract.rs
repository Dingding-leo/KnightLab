use knightclub_lib::database::{CURRENT_SCHEMA_VERSION, DatabaseRepository, StoredReviewRecord};
use serde_json::json;

fn review(key: &str) -> StoredReviewRecord {
    StoredReviewRecord::from_payload(json!({
        "schemaVersion": 1,
        "reviewKey": key,
        "sourcePgn": "1. e4 e5 2. Nf3 Nc6 *",
        "startFen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        "moveCount": 4,
        "reviewedAt": "2026-07-22T00:00:00.000Z",
        "report": {
            "createdAt": "2026-07-22T00:00:00.000Z",
            "moves": [{ "ply": 1 }, { "ply": 2 }, { "ply": 3 }, { "ply": 4 }]
        }
    }))
    .unwrap()
}

#[test]
fn migrates_to_current_schema_and_upserts_bounded_review_reports() {
    let directory = tempfile::tempdir().unwrap();
    let opened = DatabaseRepository::open(&directory.path().join("reviews.sqlite3")).unwrap();
    let mut repository = opened.repository;
    assert_eq!(repository.schema_version().unwrap(), CURRENT_SCHEMA_VERSION);

    let first = review("0123456789abcdef");
    repository.save_review(&first).unwrap();
    assert_eq!(
        repository.load_review(&first.review_key).unwrap(),
        Some(first.payload.clone())
    );

    let mut replacement = review("0123456789abcdef");
    replacement.payload["reviewedAt"] = json!("2026-07-22T01:00:00.000Z");
    replacement.reviewed_at = "2026-07-22T01:00:00.000Z".into();
    repository.save_review(&replacement).unwrap();
    assert_eq!(
        repository.load_review(&replacement.review_key).unwrap(),
        Some(replacement.payload)
    );

    let oversized = StoredReviewRecord::from_payload(json!({
        "schemaVersion": 1,
        "reviewKey": "fedcba9876543210",
        "sourcePgn": "x".repeat(2_200_000),
        "startFen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        "moveCount": 1,
        "reviewedAt": "2026-07-22T00:00:00.000Z",
        "report": {}
    }));
    assert!(oversized.is_err());
}

#[test]
fn rejects_incomplete_or_non_contiguous_review_reports() {
    let mut incomplete = review("0123456789abcdef").payload;
    incomplete["report"]["moves"] = json!([{ "ply": 1 }]);
    assert!(StoredReviewRecord::from_payload(incomplete).is_err());

    let mut non_contiguous = review("0123456789abcdef").payload;
    non_contiguous["report"]["moves"] = json!([
        { "ply": 1 }, { "ply": 2 }, { "ply": 4 }, { "ply": 5 }
    ]);
    assert!(StoredReviewRecord::from_payload(non_contiguous).is_err());
}
