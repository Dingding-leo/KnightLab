use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::ffi::OsString;
use std::fmt;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::State;

pub const CURRENT_SCHEMA_VERSION: i64 = 5;
const MAX_GAMES: usize = 500;
const MAX_REVIEWS: usize = 500;
const MAX_RETRY_ITEMS: usize = 500;
const MAX_TACTICS_PROGRESS: usize = 128;
const MAX_TACTICS_ATTEMPTS: usize = 500;
const MAX_STATE_BYTES: usize = 1_048_576;
const MAX_GAME_BYTES: usize = 1_048_576;
const MAX_REVIEW_BYTES: usize = 2_097_152;
const MAX_RETRY_BYTES: usize = 32_768;
const MAX_TACTICS_PROGRESS_BYTES: usize = 2_048;
const MAX_TACTICS_ATTEMPT_BYTES: usize = 1_024;
const MAX_PGN_BYTES: usize = 524_288;
const MAX_FEN_BYTES: usize = 1_024;
const MAX_SHORT_FIELD_BYTES: usize = 512;
const MAX_REVIEW_MOVES: u32 = 1_024;
const MAX_RETRY_ATTEMPTS: u32 = 1_000_000;
const MAX_RETRY_CORRECT_STREAK: u8 = 5;
const MAX_RETRY_SOLUTION_LINE_MOVES: usize = 6;
const MAX_RETRY_SAN_BYTES: usize = 64;
const MAX_RETRY_FOCUS_BYTES: usize = 4_096;
const MAX_RETRY_TEXT_BYTES: usize = 64;
const MAX_TACTICS_SEED_ID_BYTES: usize = 96;
const MAX_TACTICS_ATTEMPT_ID_BYTES: usize = 128;
const MAX_TACTICS_SEED_REVISION: u32 = 1_000_000;
const MAX_TACTICS_TOTAL_ATTEMPTS: u32 = 1_000_000;
const MAX_TACTICS_CORRECT_STREAK: u8 = 5;
const MAX_TACTICS_ELAPSED_MS: u32 = 3_600_000;
const MAX_TACTICS_MOVE_COUNT: u32 = 64;
const MAX_TACTICS_HINT_COUNT: u8 = 3;
const MAX_TACTICS_TEXT_BYTES: usize = 64;

#[derive(Debug)]
pub enum DatabaseError {
    Io(std::io::Error),
    Sql(rusqlite::Error),
    Json(serde_json::Error),
    Invalid(String),
}

impl fmt::Display for DatabaseError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(error) => write!(formatter, "database file error: {error}"),
            Self::Sql(error) => write!(formatter, "database error: {error}"),
            Self::Json(error) => write!(formatter, "database JSON error: {error}"),
            Self::Invalid(message) => formatter.write_str(message),
        }
    }
}

impl std::error::Error for DatabaseError {}

impl From<std::io::Error> for DatabaseError {
    fn from(value: std::io::Error) -> Self {
        Self::Io(value)
    }
}

impl From<rusqlite::Error> for DatabaseError {
    fn from(value: rusqlite::Error) -> Self {
        Self::Sql(value)
    }
}

impl From<serde_json::Error> for DatabaseError {
    fn from(value: serde_json::Error) -> Self {
        Self::Json(value)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StoredGameRecord {
    pub id: String,
    pub played_at: String,
    pub mode: String,
    pub result: String,
    pub pgn: String,
    pub final_fen: String,
    pub move_count: u32,
    pub reviewed: bool,
    pub payload: Value,
}

impl StoredGameRecord {
    pub fn from_payload(payload: Value) -> Result<Self, DatabaseError> {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct Fields {
            id: String,
            played_at: String,
            mode: String,
            result: String,
            pgn: String,
            final_fen: String,
            move_count: u32,
            reviewed: Option<bool>,
        }
        let fields: Fields = serde_json::from_value(payload.clone())?;
        let record = Self {
            id: fields.id,
            played_at: fields.played_at,
            mode: fields.mode,
            result: fields.result,
            pgn: fields.pgn,
            final_fen: fields.final_fen,
            move_count: fields.move_count,
            reviewed: fields.reviewed.unwrap_or(false),
            payload,
        };
        record.validate()?;
        Ok(record)
    }

    fn validate(&self) -> Result<(), DatabaseError> {
        validate_text("game id", &self.id, 1, MAX_SHORT_FIELD_BYTES)?;
        validate_text("played date", &self.played_at, 1, MAX_SHORT_FIELD_BYTES)?;
        validate_text("game mode", &self.mode, 1, 32)?;
        validate_text("game result", &self.result, 1, 32)?;
        validate_text("PGN", &self.pgn, 0, MAX_PGN_BYTES)?;
        validate_text("final FEN", &self.final_fen, 1, MAX_FEN_BYTES)?;
        if self.move_count > 100_000 {
            return Err(DatabaseError::Invalid(
                "game move count is out of range".into(),
            ));
        }
        validate_json("game", &self.payload, MAX_GAME_BYTES)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StoredReviewRecord {
    pub review_key: String,
    pub source_pgn: String,
    pub start_fen: String,
    pub move_count: u32,
    pub reviewed_at: String,
    pub payload: Value,
}

impl StoredReviewRecord {
    pub fn from_payload(payload: Value) -> Result<Self, DatabaseError> {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct Fields {
            schema_version: u8,
            review_key: String,
            source_pgn: String,
            start_fen: String,
            move_count: u32,
            reviewed_at: String,
            report: Value,
        }
        let fields: Fields = serde_json::from_value(payload.clone())?;
        if fields.schema_version != 1 || !fields.report.is_object() {
            return Err(DatabaseError::Invalid(
                "saved review has an unsupported schema or invalid report".into(),
            ));
        }
        let record = Self {
            review_key: fields.review_key,
            source_pgn: fields.source_pgn,
            start_fen: fields.start_fen,
            move_count: fields.move_count,
            reviewed_at: fields.reviewed_at,
            payload,
        };
        record.validate()?;
        Ok(record)
    }

    fn validate(&self) -> Result<(), DatabaseError> {
        validate_review_key(&self.review_key)?;
        validate_text("review source PGN", &self.source_pgn, 1, MAX_PGN_BYTES)?;
        validate_text("review start FEN", &self.start_fen, 1, MAX_FEN_BYTES)?;
        validate_text("reviewed date", &self.reviewed_at, 1, MAX_SHORT_FIELD_BYTES)?;
        if self.move_count == 0 || self.move_count > MAX_REVIEW_MOVES {
            return Err(DatabaseError::Invalid(
                "review move count is out of range".into(),
            ));
        }
        validate_json("review", &self.payload, MAX_REVIEW_BYTES)?;
        validate_review_report(&self.payload, self.move_count)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StoredRetryItem {
    pub retry_key: String,
    pub review_key: String,
    pub source_ply: u32,
    pub due_at: String,
    pub status: String,
    pub updated_at: String,
    pub payload: Value,
}

impl StoredRetryItem {
    pub fn from_payload(payload: Value) -> Result<Self, DatabaseError> {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct Fields {
            schema_version: u8,
            retry_key: String,
            review_key: String,
            source_ply: u32,
            pre_fen: String,
            side_to_move: String,
            played_move_uci: String,
            solution_uci: String,
            played_move_san: String,
            solution_san: String,
            solution_line_san: Vec<String>,
            classification: String,
            focus: String,
            status: String,
            attempt_count: u32,
            correct_streak: u8,
            due_at: String,
            last_attempt_at: Value,
            created_at: String,
            updated_at: String,
        }

        let fields: Fields = serde_json::from_value(payload.clone())?;
        if fields.schema_version != 1 {
            return Err(DatabaseError::Invalid(
                "saved retry item has an unsupported schema".into(),
            ));
        }
        validate_retry_key(&fields.retry_key, &fields.review_key, fields.source_ply)?;
        validate_text("retry pre-move FEN", &fields.pre_fen, 1, MAX_FEN_BYTES)?;
        validate_retry_side_to_move(&fields.side_to_move)?;
        validate_uci("retry played move UCI", &fields.played_move_uci)?;
        validate_uci("retry solution UCI", &fields.solution_uci)?;
        validate_text(
            "retry played move SAN",
            &fields.played_move_san,
            1,
            MAX_RETRY_SAN_BYTES,
        )?;
        validate_text(
            "retry solution SAN",
            &fields.solution_san,
            1,
            MAX_RETRY_SAN_BYTES,
        )?;
        validate_solution_line(&fields.solution_line_san)?;
        validate_retry_classification(&fields.classification)?;
        validate_text("retry focus", &fields.focus, 1, MAX_RETRY_FOCUS_BYTES)?;
        validate_retry_status(&fields.status)?;
        if fields.attempt_count > MAX_RETRY_ATTEMPTS {
            return Err(DatabaseError::Invalid(
                "retry attempt count is out of range".into(),
            ));
        }
        if fields.correct_streak > MAX_RETRY_CORRECT_STREAK {
            return Err(DatabaseError::Invalid(
                "retry correct streak is out of range".into(),
            ));
        }
        validate_text("retry due date", &fields.due_at, 1, MAX_RETRY_TEXT_BYTES)?;
        validate_nullable_text("retry last attempt date", &fields.last_attempt_at)?;
        validate_text(
            "retry created date",
            &fields.created_at,
            1,
            MAX_RETRY_TEXT_BYTES,
        )?;
        validate_text(
            "retry updated date",
            &fields.updated_at,
            1,
            MAX_RETRY_TEXT_BYTES,
        )?;
        validate_json("retry item", &payload, MAX_RETRY_BYTES)?;

        Ok(Self {
            retry_key: fields.retry_key,
            review_key: fields.review_key,
            source_ply: fields.source_ply,
            due_at: fields.due_at,
            status: fields.status,
            updated_at: fields.updated_at,
            payload,
        })
    }
}

/// Durable per-seed spaced-repetition state. The actual FEN and solution live
/// in the bundled seed catalogue, so native storage never needs to duplicate
/// answer material or depend on a mutable content table.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StoredTacticsProgress {
    pub seed_id: String,
    pub seed_revision: u32,
    pub due_at: String,
    pub status: String,
    pub updated_at: String,
    pub attempt_count: u32,
    pub solve_count: u32,
    pub correct_streak: u8,
    pub last_attempt_at: Option<String>,
    pub last_outcome: Option<String>,
    pub best_solve_ms: Option<u32>,
    pub created_at: String,
    pub payload: Value,
}

impl StoredTacticsProgress {
    pub fn from_payload(payload: Value) -> Result<Self, DatabaseError> {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct Fields {
            schema_version: u8,
            seed_id: String,
            seed_revision: u32,
            due_at: String,
            status: String,
            attempt_count: u32,
            solve_count: u32,
            correct_streak: u8,
            last_attempt_at: Option<String>,
            last_outcome: Option<String>,
            best_solve_ms: Option<u32>,
            created_at: String,
            updated_at: String,
        }

        let fields: Fields = serde_json::from_value(payload.clone())?;
        if fields.schema_version != 1 {
            return Err(DatabaseError::Invalid(
                "saved tactics progress has an unsupported schema".into(),
            ));
        }
        let progress = Self {
            seed_id: fields.seed_id,
            seed_revision: fields.seed_revision,
            due_at: fields.due_at,
            status: fields.status,
            updated_at: fields.updated_at,
            attempt_count: fields.attempt_count,
            solve_count: fields.solve_count,
            correct_streak: fields.correct_streak,
            last_attempt_at: fields.last_attempt_at,
            last_outcome: fields.last_outcome,
            best_solve_ms: fields.best_solve_ms,
            created_at: fields.created_at,
            payload,
        };
        progress.validate()?;
        Ok(progress)
    }

    fn validate(&self) -> Result<(), DatabaseError> {
        validate_tactics_seed_id(&self.seed_id)?;
        validate_tactics_seed_revision(self.seed_revision)?;
        validate_tactics_status(&self.status)?;
        if self.attempt_count > MAX_TACTICS_TOTAL_ATTEMPTS {
            return Err(DatabaseError::Invalid(
                "tactics progress attempt count is out of range".into(),
            ));
        }
        if self.solve_count > self.attempt_count {
            return Err(DatabaseError::Invalid(
                "tactics progress solve count exceeds attempts".into(),
            ));
        }
        if self.correct_streak > MAX_TACTICS_CORRECT_STREAK {
            return Err(DatabaseError::Invalid(
                "tactics progress correct streak is out of range".into(),
            ));
        }
        if (self.status == "mastered") != (self.correct_streak == MAX_TACTICS_CORRECT_STREAK) {
            return Err(DatabaseError::Invalid(
                "tactics progress mastery state does not match its streak".into(),
            ));
        }
        validate_text("tactics due date", &self.due_at, 1, MAX_TACTICS_TEXT_BYTES)?;
        validate_text(
            "tactics progress creation date",
            &self.created_at,
            1,
            MAX_TACTICS_TEXT_BYTES,
        )?;
        validate_text(
            "tactics progress update date",
            &self.updated_at,
            1,
            MAX_TACTICS_TEXT_BYTES,
        )?;
        match (&self.last_attempt_at, &self.last_outcome) {
            (Some(attempted_at), Some(outcome)) => {
                validate_text(
                    "tactics last attempt date",
                    attempted_at,
                    1,
                    MAX_TACTICS_TEXT_BYTES,
                )?;
                validate_tactics_outcome(outcome)?;
            }
            (None, None) if self.attempt_count == 0 => {}
            _ => {
                return Err(DatabaseError::Invalid(
                    "tactics progress attempt facts are incomplete".into(),
                ));
            }
        }
        if self.attempt_count == 0
            && (self.solve_count != 0
                || self.correct_streak != 0
                || self.best_solve_ms.is_some()
                || self.status != "active")
        {
            return Err(DatabaseError::Invalid(
                "unattempted tactics progress is invalid".into(),
            ));
        }
        if self.solve_count == 0 && self.best_solve_ms.is_some() {
            return Err(DatabaseError::Invalid(
                "tactics progress has a best solve time without a solve".into(),
            ));
        }
        if self.solve_count > 0 && self.best_solve_ms.is_none() {
            return Err(DatabaseError::Invalid(
                "tactics progress is missing its best solve time".into(),
            ));
        }
        if let Some(best_solve_ms) = self.best_solve_ms {
            if best_solve_ms > MAX_TACTICS_ELAPSED_MS {
                return Err(DatabaseError::Invalid(
                    "tactics best solve time is out of range".into(),
                ));
            }
        }
        validate_json(
            "tactics progress",
            &self.payload,
            MAX_TACTICS_PROGRESS_BYTES,
        )
    }
}

/// Immutable result for one terminal Tactics Sprint attempt. A caller records
/// this alongside the resulting progress in one database transaction.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StoredTacticsAttempt {
    pub attempt_id: String,
    pub seed_id: String,
    pub seed_revision: u32,
    pub attempted_at: String,
    pub outcome: String,
    pub elapsed_ms: u32,
    pub move_count: u32,
    pub hint_count: u8,
    pub payload: Value,
}

impl StoredTacticsAttempt {
    pub fn from_payload(payload: Value) -> Result<Self, DatabaseError> {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct Fields {
            schema_version: u8,
            attempt_id: String,
            seed_id: String,
            seed_revision: u32,
            attempted_at: String,
            outcome: String,
            elapsed_ms: u32,
            move_count: u32,
            hint_count: u8,
        }

        let fields: Fields = serde_json::from_value(payload.clone())?;
        if fields.schema_version != 1 {
            return Err(DatabaseError::Invalid(
                "saved tactics attempt has an unsupported schema".into(),
            ));
        }
        let attempt = Self {
            attempt_id: fields.attempt_id,
            seed_id: fields.seed_id,
            seed_revision: fields.seed_revision,
            attempted_at: fields.attempted_at,
            outcome: fields.outcome,
            elapsed_ms: fields.elapsed_ms,
            move_count: fields.move_count,
            hint_count: fields.hint_count,
            payload,
        };
        attempt.validate()?;
        Ok(attempt)
    }

    fn validate(&self) -> Result<(), DatabaseError> {
        validate_tactics_attempt_id(&self.attempt_id)?;
        validate_tactics_seed_id(&self.seed_id)?;
        validate_tactics_seed_revision(self.seed_revision)?;
        validate_text(
            "tactics attempt date",
            &self.attempted_at,
            1,
            MAX_TACTICS_TEXT_BYTES,
        )?;
        validate_tactics_outcome(&self.outcome)?;
        if self.elapsed_ms > MAX_TACTICS_ELAPSED_MS {
            return Err(DatabaseError::Invalid(
                "tactics attempt elapsed time is out of range".into(),
            ));
        }
        if self.move_count > MAX_TACTICS_MOVE_COUNT {
            return Err(DatabaseError::Invalid(
                "tactics attempt move count is out of range".into(),
            ));
        }
        if self.hint_count > MAX_TACTICS_HINT_COUNT {
            return Err(DatabaseError::Invalid(
                "tactics attempt hint count is out of range".into(),
            ));
        }
        if self.outcome == "solved" && self.hint_count != 0 {
            return Err(DatabaseError::Invalid(
                "an assisted tactics attempt cannot be recorded as solved".into(),
            ));
        }
        if self.outcome == "hinted" && self.hint_count == 0 {
            return Err(DatabaseError::Invalid(
                "a hinted tactics attempt must record a hint".into(),
            ));
        }
        validate_json("tactics attempt", &self.payload, MAX_TACTICS_ATTEMPT_BYTES)
    }
}

/// JSON command envelope used by native Tauri commands. `progress` contains
/// current per-seed state and `attempts` contains immutable terminal results.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TacticsStateSnapshot {
    pub progress: Vec<Value>,
    pub attempts: Vec<Value>,
}

#[derive(Debug, Clone)]
struct ValidatedTacticsState {
    progress: Vec<StoredTacticsProgress>,
    attempts: Vec<StoredTacticsAttempt>,
}

impl TacticsStateSnapshot {
    fn into_validated(self) -> Result<ValidatedTacticsState, DatabaseError> {
        if self.progress.len() > MAX_TACTICS_PROGRESS {
            return Err(DatabaseError::Invalid(
                "tactics progress exceeds its safe limit".into(),
            ));
        }
        if self.attempts.len() > MAX_TACTICS_ATTEMPTS {
            return Err(DatabaseError::Invalid(
                "tactics attempts exceed their safe limit".into(),
            ));
        }

        let mut progress = Vec::with_capacity(self.progress.len());
        for payload in self.progress {
            let item = StoredTacticsProgress::from_payload(payload)?;
            if progress
                .iter()
                .any(|saved: &StoredTacticsProgress| saved.seed_id == item.seed_id)
            {
                return Err(DatabaseError::Invalid(
                    "tactics progress contains duplicate seed IDs".into(),
                ));
            }
            progress.push(item);
        }

        let mut attempts = Vec::with_capacity(self.attempts.len());
        for payload in self.attempts {
            let item = StoredTacticsAttempt::from_payload(payload)?;
            if attempts
                .iter()
                .any(|saved: &StoredTacticsAttempt| saved.attempt_id == item.attempt_id)
            {
                return Err(DatabaseError::Invalid(
                    "tactics attempts contain duplicate attempt IDs".into(),
                ));
            }
            attempts.push(item);
        }
        Ok(ValidatedTacticsState { progress, attempts })
    }
}

fn validate_review_report(payload: &Value, expected_move_count: u32) -> Result<(), DatabaseError> {
    let report = payload
        .get("report")
        .and_then(Value::as_object)
        .ok_or_else(|| DatabaseError::Invalid("saved review report is invalid".into()))?;
    let moves = report
        .get("moves")
        .and_then(Value::as_array)
        .ok_or_else(|| DatabaseError::Invalid("saved review report has no move list".into()))?;
    if moves.len() != expected_move_count as usize {
        return Err(DatabaseError::Invalid(
            "saved review report does not cover every source move".into(),
        ));
    }
    for (index, reviewed_move) in moves.iter().enumerate() {
        let expected_ply = index as u64 + 1;
        if reviewed_move.get("ply").and_then(Value::as_u64) != Some(expected_ply) {
            return Err(DatabaseError::Invalid(
                "saved review report has a non-contiguous move list".into(),
            ));
        }
    }
    Ok(())
}

#[derive(Debug, Clone)]
pub struct LegacyImport {
    pub active_session: Option<Value>,
    pub preferences: Option<Value>,
    pub games: Vec<StoredGameRecord>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyImportRequest {
    pub active_session: Option<Value>,
    pub preferences: Option<Value>,
    pub games: Vec<Value>,
}

impl LegacyImportRequest {
    fn into_validated(self) -> Result<LegacyImport, DatabaseError> {
        if self.games.len() > MAX_GAMES {
            return Err(DatabaseError::Invalid(
                "legacy game library exceeds 500 games".into(),
            ));
        }
        let games = self
            .games
            .into_iter()
            .map(StoredGameRecord::from_payload)
            .collect::<Result<Vec<_>, _>>()?;
        Ok(LegacyImport {
            active_session: self.active_session,
            preferences: self.preferences,
            games,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseSnapshot {
    pub schema_version: i64,
    pub active_session: Option<Value>,
    pub preferences: Option<Value>,
    pub games: Vec<Value>,
    pub recovery_backup_path: Option<String>,
}

pub struct OpenDatabase {
    pub repository: DatabaseRepository,
    pub recovery_backup: Option<PathBuf>,
}

pub struct DatabaseRepository {
    connection: Connection,
}

impl DatabaseRepository {
    pub fn open(path: &Path) -> Result<OpenDatabase, DatabaseError> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let existed = path.exists();
        let mut recovery_backup = None;
        let connection = match Connection::open(path) {
            Ok(connection) => match quick_check(&connection) {
                Ok(true) => connection,
                Ok(false) | Err(_) if existed => {
                    drop(connection);
                    let backup = backup_corrupt_database(path)?;
                    recovery_backup = Some(backup);
                    Connection::open(path)?
                }
                Ok(false) => {
                    return Err(DatabaseError::Invalid(
                        "new database failed integrity check".into(),
                    ));
                }
                Err(error) => return Err(error),
            },
            Err(_) if existed => {
                let backup = backup_corrupt_database(path)?;
                recovery_backup = Some(backup);
                Connection::open(path)?
            }
            Err(error) => return Err(error.into()),
        };

        connection.pragma_update(None, "foreign_keys", "ON")?;
        connection.pragma_update(None, "journal_mode", "WAL")?;
        connection.busy_timeout(std::time::Duration::from_secs(2))?;
        let mut repository = Self { connection };
        repository.migrate()?;
        Ok(OpenDatabase {
            repository,
            recovery_backup,
        })
    }

    fn migrate(&mut self) -> Result<(), DatabaseError> {
        let mut version = self.schema_version()?;
        if version > CURRENT_SCHEMA_VERSION {
            return Err(DatabaseError::Invalid(format!(
                "database schema {version} is newer than supported version {CURRENT_SCHEMA_VERSION}"
            )));
        }
        if version == 0 {
            let transaction = self.connection.transaction()?;
            transaction.execute_batch(
                "CREATE TABLE app_state (\
                    key TEXT PRIMARY KEY,\
                    payload_json TEXT NOT NULL,\
                    updated_at TEXT NOT NULL\
                 );\
                 CREATE TABLE games (\
                    id TEXT PRIMARY KEY,\
                    played_at TEXT NOT NULL,\
                    mode TEXT NOT NULL,\
                    result TEXT NOT NULL,\
                    pgn TEXT NOT NULL,\
                    final_fen TEXT NOT NULL,\
                    move_count INTEGER NOT NULL,\
                    payload_json TEXT NOT NULL\
                 );\
                 PRAGMA user_version = 1;",
            )?;
            transaction.commit()?;
            version = 1;
        }
        if version == 1 {
            let transaction = self.connection.transaction()?;
            transaction.execute_batch(
                "ALTER TABLE games ADD COLUMN reviewed INTEGER NOT NULL DEFAULT 0;\
                 CREATE INDEX idx_games_played_at ON games(played_at DESC);\
                 CREATE INDEX idx_games_result ON games(result);\
                 CREATE INDEX idx_games_mode ON games(mode);\
                 PRAGMA user_version = 2;",
            )?;
            transaction.commit()?;
            version = 2;
        }
        if version == 2 {
            let transaction = self.connection.transaction()?;
            transaction.execute_batch(
                "CREATE TABLE reviews (\
                    review_key TEXT PRIMARY KEY,\
                    source_pgn TEXT NOT NULL,\
                    start_fen TEXT NOT NULL,\
                    move_count INTEGER NOT NULL,\
                    reviewed_at TEXT NOT NULL,\
                    payload_json TEXT NOT NULL\
                 );\
                 CREATE INDEX idx_reviews_reviewed_at ON reviews(reviewed_at DESC, review_key DESC);\
                 PRAGMA user_version = 3;",
            )?;
            transaction.commit()?;
            version = 3;
        }
        if version == 3 {
            let transaction = self.connection.transaction()?;
            transaction.execute_batch(
                "CREATE TABLE retry_items (\
                    retry_key TEXT PRIMARY KEY,\
                    review_key TEXT NOT NULL,\
                    source_ply INTEGER NOT NULL CHECK(source_ply BETWEEN 1 AND 1024),\
                    due_at TEXT NOT NULL,\
                    status TEXT NOT NULL CHECK(status IN ('active', 'mastered')),\
                    updated_at TEXT NOT NULL,\
                    payload_json TEXT NOT NULL\
                 );\
                 CREATE INDEX idx_retry_items_due ON retry_items(status, due_at ASC, updated_at DESC, retry_key ASC);\
                 CREATE INDEX idx_retry_items_review ON retry_items(review_key, source_ply);\
                 PRAGMA user_version = 4;",
            )?;
            transaction.commit()?;
            version = 4;
        }
        if version == 4 {
            let transaction = self.connection.transaction()?;
            transaction.execute_batch(
                "CREATE TABLE tactics_progress (\
                    seed_id TEXT PRIMARY KEY,\
                    seed_revision INTEGER NOT NULL CHECK(seed_revision BETWEEN 1 AND 1000000),\
                    due_at TEXT NOT NULL,\
                    status TEXT NOT NULL CHECK(status IN ('active', 'mastered')),\
                    updated_at TEXT NOT NULL,\
                    payload_json TEXT NOT NULL\
                 );\
                 CREATE TABLE tactics_attempts (\
                    attempt_id TEXT PRIMARY KEY,\
                    seed_id TEXT NOT NULL,\
                    seed_revision INTEGER NOT NULL CHECK(seed_revision BETWEEN 1 AND 1000000),\
                    attempted_at TEXT NOT NULL,\
                    outcome TEXT NOT NULL CHECK(outcome IN ('solved', 'failed', 'hinted', 'revealed', 'skipped')),\
                    elapsed_ms INTEGER NOT NULL CHECK(elapsed_ms BETWEEN 0 AND 3600000),\
                    payload_json TEXT NOT NULL\
                 );\
                 CREATE INDEX idx_tactics_progress_due ON tactics_progress(status, due_at ASC, updated_at DESC, seed_id ASC);\
                 CREATE INDEX idx_tactics_attempts_seed ON tactics_attempts(seed_id, attempted_at DESC, attempt_id DESC);\
                 CREATE INDEX idx_tactics_attempts_recent ON tactics_attempts(attempted_at DESC, attempt_id DESC);\
                 PRAGMA user_version = 5;",
            )?;
            transaction.commit()?;
        }
        Ok(())
    }

    pub fn schema_version(&self) -> Result<i64, DatabaseError> {
        Ok(self
            .connection
            .query_row("PRAGMA user_version", [], |row| row.get(0))?)
    }

    pub fn snapshot(&self) -> Result<DatabaseSnapshot, DatabaseError> {
        let active_session = self.state_value("active_session")?;
        let preferences = self.state_value("preferences")?;
        let mut statement = self.connection.prepare(
            "SELECT reviewed, payload_json FROM games ORDER BY played_at DESC, id DESC LIMIT 500",
        )?;
        let games = statement
            .query_map([], |row| {
                Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
            })?
            .map(|item| {
                let (reviewed, json) = item?;
                if json.len() > MAX_GAME_BYTES {
                    return Err(DatabaseError::Invalid(
                        "stored game payload is too large".into(),
                    ));
                }
                let mut record = StoredGameRecord::from_payload(serde_json::from_str(&json)?)?;
                record.reviewed = reviewed != 0;
                if let Value::Object(payload) = &mut record.payload {
                    payload.insert("reviewed".into(), Value::Bool(record.reviewed));
                }
                Ok(record.payload)
            })
            .collect::<Result<Vec<_>, DatabaseError>>()?;
        Ok(DatabaseSnapshot {
            schema_version: self.schema_version()?,
            active_session,
            preferences,
            games,
            recovery_backup_path: None,
        })
    }

    fn state_value(&self, key: &str) -> Result<Option<Value>, DatabaseError> {
        let json = self
            .connection
            .query_row(
                "SELECT payload_json FROM app_state WHERE key = ?1",
                [key],
                |row| row.get::<_, String>(0),
            )
            .optional()?;
        json.map(|value| {
            if value.len() > MAX_STATE_BYTES {
                return Err(DatabaseError::Invalid(
                    "stored application state is too large".into(),
                ));
            }
            serde_json::from_str(&value).map_err(DatabaseError::from)
        })
        .transpose()
    }

    pub fn import_legacy(&mut self, legacy: &LegacyImport) -> Result<bool, DatabaseError> {
        validate_optional_state("active session", legacy.active_session.as_ref())?;
        validate_optional_state("preferences", legacy.preferences.as_ref())?;
        if legacy.games.len() > MAX_GAMES {
            return Err(DatabaseError::Invalid(
                "legacy game library exceeds 500 games".into(),
            ));
        }
        for game in &legacy.games {
            game.validate()?;
        }
        let transaction = self.connection.transaction()?;
        let count: i64 = transaction.query_row(
            "SELECT (SELECT count(*) FROM app_state) + (SELECT count(*) FROM games) + (SELECT count(*) FROM reviews) + (SELECT count(*) FROM retry_items) + (SELECT count(*) FROM tactics_progress) + (SELECT count(*) FROM tactics_attempts)",
            [],
            |row| row.get(0),
        )?;
        if count != 0 {
            return Ok(false);
        }
        if let Some(value) = &legacy.active_session {
            write_state(&transaction, "active_session", value)?;
        }
        if let Some(value) = &legacy.preferences {
            write_state(&transaction, "preferences", value)?;
        }
        for game in &legacy.games {
            insert_game(&transaction, game)?;
        }
        transaction.commit()?;
        Ok(true)
    }

    pub fn save_active_session(&mut self, value: &Value) -> Result<(), DatabaseError> {
        validate_json("active session", value, MAX_STATE_BYTES)?;
        let transaction = self.connection.transaction()?;
        write_state(&transaction, "active_session", value)?;
        transaction.commit()?;
        Ok(())
    }

    pub fn save_preferences(&mut self, value: &Value) -> Result<(), DatabaseError> {
        validate_json("preferences", value, MAX_STATE_BYTES)?;
        let transaction = self.connection.transaction()?;
        write_state(&transaction, "preferences", value)?;
        transaction.commit()?;
        Ok(())
    }

    pub fn save_game(&mut self, game: &StoredGameRecord) -> Result<(), DatabaseError> {
        game.validate()?;
        let transaction = self.connection.transaction()?;
        upsert_game(&transaction, game)?;
        transaction.execute(
            "DELETE FROM games WHERE id NOT IN (SELECT id FROM games ORDER BY played_at DESC, id DESC LIMIT 500)",
            [],
        )?;
        transaction.commit()?;
        Ok(())
    }

    pub fn save_review(&mut self, review: &StoredReviewRecord) -> Result<(), DatabaseError> {
        review.validate()?;
        let transaction = self.connection.transaction()?;
        upsert_review(&transaction, review)?;
        transaction.execute(
            "DELETE FROM reviews WHERE review_key NOT IN (SELECT review_key FROM reviews ORDER BY reviewed_at DESC, review_key DESC LIMIT ?1)",
            [MAX_REVIEWS as i64],
        )?;
        transaction.commit()?;
        Ok(())
    }

    pub fn load_review(&self, review_key: &str) -> Result<Option<Value>, DatabaseError> {
        validate_review_key(review_key)?;
        let json = self
            .connection
            .query_row(
                "SELECT payload_json FROM reviews WHERE review_key = ?1",
                [review_key],
                |row| row.get::<_, String>(0),
            )
            .optional()?;
        json.map(|value| {
            if value.len() > MAX_REVIEW_BYTES {
                return Err(DatabaseError::Invalid(
                    "stored review payload is too large".into(),
                ));
            }
            let record = StoredReviewRecord::from_payload(serde_json::from_str(&value)?)?;
            if record.review_key != review_key {
                return Err(DatabaseError::Invalid(
                    "stored review key does not match its lookup key".into(),
                ));
            }
            Ok(record.payload)
        })
        .transpose()
    }

    pub fn save_retry_item(&mut self, retry_item: &StoredRetryItem) -> Result<(), DatabaseError> {
        // Re-validate at the write boundary so callers cannot persist a record they
        // constructed manually without going through `from_payload`.
        let validated = StoredRetryItem::from_payload(retry_item.payload.clone())?;
        if validated != *retry_item {
            return Err(DatabaseError::Invalid(
                "retry item fields do not match their payload".into(),
            ));
        }
        let transaction = self.connection.transaction()?;
        upsert_retry_item(&transaction, retry_item)?;
        transaction.execute(
            "DELETE FROM retry_items WHERE retry_key NOT IN ( \
                SELECT retry_key FROM retry_items \
                ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, due_at ASC, updated_at DESC, retry_key ASC \
                LIMIT ?1 \
             )",
            [MAX_RETRY_ITEMS as i64],
        )?;
        transaction.commit()?;
        Ok(())
    }

    pub fn load_retry_item(&self, retry_key: &str) -> Result<Option<Value>, DatabaseError> {
        validate_retry_key_shape(retry_key)?;
        let record = self
            .connection
            .query_row(
                "SELECT retry_key, review_key, source_ply, due_at, status, updated_at, payload_json \
                 FROM retry_items WHERE retry_key = ?1",
                [retry_key],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, u32>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, String>(4)?,
                        row.get::<_, String>(5)?,
                        row.get::<_, String>(6)?,
                    ))
                },
            )
            .optional()?;
        record.map(decode_stored_retry_item).transpose()
    }

    pub fn list_retry_items(&self) -> Result<Vec<Value>, DatabaseError> {
        let mut statement = self.connection.prepare(
            "SELECT retry_key, review_key, source_ply, due_at, status, updated_at, payload_json \
             FROM retry_items \
             ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, due_at ASC, updated_at DESC, retry_key ASC \
             LIMIT ?1",
        )?;
        statement
            .query_map([MAX_RETRY_ITEMS as i64], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, u32>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, String>(6)?,
                ))
            })?
            .map(|item| decode_stored_retry_item(item?))
            .collect::<Result<Vec<_>, DatabaseError>>()
    }

    pub fn delete_retry_item(&mut self, retry_key: &str) -> Result<bool, DatabaseError> {
        validate_retry_key_shape(retry_key)?;
        Ok(self
            .connection
            .execute("DELETE FROM retry_items WHERE retry_key = ?1", [retry_key])?
            != 0)
    }

    /// Returns the bounded native tactics envelope. The command deliberately
    /// keeps progress and immutable attempts separate from `database_snapshot`
    /// so ordinary game hydration never needs to deserialize training history.
    pub fn list_tactics_state(&self) -> Result<TacticsStateSnapshot, DatabaseError> {
        let mut progress_statement = self.connection.prepare(
            "SELECT seed_id, seed_revision, due_at, status, updated_at, payload_json \
             FROM tactics_progress \
             ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, due_at ASC, updated_at DESC, seed_id ASC \
             LIMIT ?1",
        )?;
        let progress = progress_statement
            .query_map([MAX_TACTICS_PROGRESS as i64], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, u32>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                ))
            })?
            .map(|item| decode_stored_tactics_progress(item?).map(|record| record.payload))
            .collect::<Result<Vec<_>, DatabaseError>>()?;

        let mut attempt_statement = self.connection.prepare(
            "SELECT attempt_id, seed_id, seed_revision, attempted_at, outcome, elapsed_ms, payload_json \
             FROM tactics_attempts \
             ORDER BY attempted_at DESC, attempt_id DESC \
             LIMIT ?1",
        )?;
        let attempts = attempt_statement
            .query_map([MAX_TACTICS_ATTEMPTS as i64], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, u32>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, u32>(5)?,
                    row.get::<_, String>(6)?,
                ))
            })?
            .map(|item| decode_stored_tactics_attempt(item?).map(|record| record.payload))
            .collect::<Result<Vec<_>, DatabaseError>>()?;

        Ok(TacticsStateSnapshot { progress, attempts })
    }

    /// Merges the browser compatibility envelope during desktop startup. It is
    /// additive for immutable attempt IDs and chooses the newer progress state
    /// for a seed; no history is deleted except by the documented caps.
    pub fn merge_tactics_state(
        &mut self,
        tactics: TacticsStateSnapshot,
    ) -> Result<TacticsStateSnapshot, DatabaseError> {
        let tactics = tactics.into_validated()?;
        let transaction = self.connection.transaction()?;

        for attempt in &tactics.attempts {
            match load_tactics_attempt(&transaction, &attempt.attempt_id)? {
                Some(existing) if existing.payload != attempt.payload => {
                    return Err(DatabaseError::Invalid(
                        "tactics attempt ID conflicts with existing immutable history".into(),
                    ));
                }
                Some(_) => {}
                None => insert_tactics_attempt(&transaction, attempt)?,
            }
        }

        for progress in &tactics.progress {
            let existing = load_tactics_progress(&transaction, &progress.seed_id)?;
            if existing
                .as_ref()
                .is_none_or(|current| should_replace_tactics_progress(current, progress))
            {
                upsert_tactics_progress(&transaction, progress)?;
            }
        }
        trim_tactics_state(&transaction)?;
        transaction.commit()?;
        self.list_tactics_state()
    }

    /// Atomically records one terminal Tactics Sprint attempt and the exact
    /// next spaced-repetition progress. Retrying an already-written identical
    /// attempt ID is safe; a different payload with the same ID fails closed.
    pub fn record_tactics_attempt(
        &mut self,
        progress: &StoredTacticsProgress,
        attempt: &StoredTacticsAttempt,
    ) -> Result<TacticsStateSnapshot, DatabaseError> {
        let validated_progress = StoredTacticsProgress::from_payload(progress.payload.clone())?;
        if validated_progress != *progress {
            return Err(DatabaseError::Invalid(
                "tactics progress fields do not match their payload".into(),
            ));
        }
        let validated_attempt = StoredTacticsAttempt::from_payload(attempt.payload.clone())?;
        if validated_attempt != *attempt {
            return Err(DatabaseError::Invalid(
                "tactics attempt fields do not match their payload".into(),
            ));
        }

        let transaction = self.connection.transaction()?;
        let existing_attempt = load_tactics_attempt(&transaction, &attempt.attempt_id)?;
        if let Some(existing) = existing_attempt {
            if existing.payload != attempt.payload {
                return Err(DatabaseError::Invalid(
                    "tactics attempt ID conflicts with existing immutable history".into(),
                ));
            }
        } else {
            let existing_progress = load_tactics_progress(&transaction, &progress.seed_id)?;
            if let Some(existing) = &existing_progress {
                if existing.seed_revision > progress.seed_revision {
                    return Err(DatabaseError::Invalid(
                        "tactics progress cannot overwrite a newer seed revision".into(),
                    ));
                }
            }
            let prior = existing_progress
                .as_ref()
                .filter(|current| current.seed_revision == progress.seed_revision);
            validate_tactics_attempt_transition(prior, progress, attempt)?;
            insert_tactics_attempt(&transaction, attempt)?;
            upsert_tactics_progress(&transaction, progress)?;
            trim_tactics_state(&transaction)?;
        }
        transaction.commit()?;
        self.list_tactics_state()
    }

    pub fn clear_active_session(&mut self) -> Result<(), DatabaseError> {
        self.connection
            .execute("DELETE FROM app_state WHERE key = 'active_session'", [])?;
        Ok(())
    }

    pub fn clear_games(&mut self) -> Result<(), DatabaseError> {
        self.connection.execute("DELETE FROM games", [])?;
        Ok(())
    }
}

fn quick_check(connection: &Connection) -> Result<bool, DatabaseError> {
    let result: String = connection.query_row("PRAGMA quick_check", [], |row| row.get(0))?;
    Ok(result == "ok")
}

fn backup_corrupt_database(path: &Path) -> Result<PathBuf, DatabaseError> {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    for suffix in 0..1000 {
        let extension = if suffix == 0 {
            format!("corrupt-{timestamp}.bak")
        } else {
            format!("corrupt-{timestamp}-{suffix}.bak")
        };
        let backup = path.with_extension(extension);
        if !backup.exists() {
            fs::rename(path, &backup)?;
            for suffix in ["-wal", "-shm"] {
                let sidecar = append_to_path(path, suffix);
                if sidecar.exists() {
                    fs::rename(&sidecar, append_to_path(&backup, suffix))?;
                }
            }
            return Ok(backup);
        }
    }
    Err(DatabaseError::Invalid(
        "could not allocate a corrupt database backup name".into(),
    ))
}

fn append_to_path(path: &Path, suffix: &str) -> PathBuf {
    let mut value: OsString = path.as_os_str().to_owned();
    value.push(suffix);
    PathBuf::from(value)
}

fn validate_text(label: &str, value: &str, min: usize, max: usize) -> Result<(), DatabaseError> {
    let length = value.len();
    if length < min || length > max || value.contains('\0') {
        return Err(DatabaseError::Invalid(format!(
            "{label} is invalid or too large"
        )));
    }
    Ok(())
}

fn validate_review_key(value: &str) -> Result<(), DatabaseError> {
    if value.len() != 16
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err(DatabaseError::Invalid(
            "review key must be a 16-character lowercase hexadecimal value".into(),
        ));
    }
    Ok(())
}

fn validate_retry_key_shape(value: &str) -> Result<(&str, u32), DatabaseError> {
    let (review_key, source_ply) = value.split_once(':').ok_or_else(|| {
        DatabaseError::Invalid(
            "retry key must be a review key followed by a positive source ply".into(),
        )
    })?;
    validate_review_key(review_key)?;
    let parsed_source_ply = source_ply.parse::<u32>().map_err(|_| {
        DatabaseError::Invalid(
            "retry key must be a review key followed by a positive source ply".into(),
        )
    })?;
    if parsed_source_ply == 0
        || parsed_source_ply > MAX_REVIEW_MOVES
        || source_ply != parsed_source_ply.to_string()
    {
        return Err(DatabaseError::Invalid(
            "retry key must be a review key followed by a positive source ply".into(),
        ));
    }
    Ok((review_key, parsed_source_ply))
}

fn validate_retry_key(
    retry_key: &str,
    review_key: &str,
    source_ply: u32,
) -> Result<(), DatabaseError> {
    let (key_review, key_ply) = validate_retry_key_shape(retry_key)?;
    validate_review_key(review_key)?;
    if key_review != review_key || key_ply != source_ply {
        return Err(DatabaseError::Invalid(
            "retry key does not match its review key and source ply".into(),
        ));
    }
    Ok(())
}

fn validate_retry_side_to_move(value: &str) -> Result<(), DatabaseError> {
    if matches!(value, "w" | "b") {
        Ok(())
    } else {
        Err(DatabaseError::Invalid(
            "retry side to move must be w or b".into(),
        ))
    }
}

fn validate_uci(label: &str, value: &str) -> Result<(), DatabaseError> {
    let bytes = value.as_bytes();
    let valid_square = |offset: usize| {
        matches!(bytes.get(offset), Some(b'a'..=b'h'))
            && matches!(bytes.get(offset + 1), Some(b'1'..=b'8'))
    };
    let valid_promotion = bytes.len() == 4
        || (bytes.len() == 5 && matches!(bytes.get(4), Some(b'q' | b'r' | b'b' | b'n')));
    if !(matches!(bytes.len(), 4 | 5) && valid_square(0) && valid_square(2) && valid_promotion) {
        return Err(DatabaseError::Invalid(format!("{label} is invalid")));
    }
    Ok(())
}

fn validate_solution_line(values: &[String]) -> Result<(), DatabaseError> {
    if values.len() > MAX_RETRY_SOLUTION_LINE_MOVES {
        return Err(DatabaseError::Invalid(
            "retry solution line is too long".into(),
        ));
    }
    for san in values {
        validate_text("retry solution line SAN", san, 1, MAX_RETRY_SAN_BYTES)?;
    }
    Ok(())
}

fn validate_retry_classification(value: &str) -> Result<(), DatabaseError> {
    if matches!(value, "inaccuracy" | "mistake" | "miss" | "blunder") {
        Ok(())
    } else {
        Err(DatabaseError::Invalid(
            "retry classification is invalid".into(),
        ))
    }
}

fn validate_retry_status(value: &str) -> Result<(), DatabaseError> {
    if matches!(value, "active" | "mastered") {
        Ok(())
    } else {
        Err(DatabaseError::Invalid("retry status is invalid".into()))
    }
}

fn validate_tactics_seed_id(value: &str) -> Result<(), DatabaseError> {
    validate_text("tactics seed ID", value, 1, MAX_TACTICS_SEED_ID_BYTES)?;
    if value
        .bytes()
        .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b':'))
    {
        Ok(())
    } else {
        Err(DatabaseError::Invalid(
            "tactics seed ID may contain only ASCII letters, digits, hyphens, underscores, dots and colons".into(),
        ))
    }
}

fn validate_tactics_attempt_id(value: &str) -> Result<(), DatabaseError> {
    validate_text("tactics attempt ID", value, 1, MAX_TACTICS_ATTEMPT_ID_BYTES)?;
    if value
        .bytes()
        .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
    {
        Ok(())
    } else {
        Err(DatabaseError::Invalid(
            "tactics attempt ID may contain only ASCII letters, digits, hyphens, underscores and dots"
                .into(),
        ))
    }
}

fn validate_tactics_seed_revision(value: u32) -> Result<(), DatabaseError> {
    if value == 0 || value > MAX_TACTICS_SEED_REVISION {
        Err(DatabaseError::Invalid(
            "tactics seed revision is out of range".into(),
        ))
    } else {
        Ok(())
    }
}

fn validate_tactics_status(value: &str) -> Result<(), DatabaseError> {
    if matches!(value, "active" | "mastered") {
        Ok(())
    } else {
        Err(DatabaseError::Invalid(
            "tactics progress status is invalid".into(),
        ))
    }
}

fn validate_tactics_outcome(value: &str) -> Result<(), DatabaseError> {
    if matches!(
        value,
        "solved" | "failed" | "hinted" | "revealed" | "skipped"
    ) {
        Ok(())
    } else {
        Err(DatabaseError::Invalid(
            "tactics attempt outcome is invalid".into(),
        ))
    }
}

fn should_replace_tactics_progress(
    current: &StoredTacticsProgress,
    incoming: &StoredTacticsProgress,
) -> bool {
    incoming.seed_revision > current.seed_revision
        || (incoming.seed_revision == current.seed_revision
            && (incoming.updated_at > current.updated_at
                || (incoming.updated_at == current.updated_at
                    && incoming.attempt_count > current.attempt_count)))
}

fn expected_tactics_streak(previous: u8, outcome: &str) -> u8 {
    if outcome == "solved" {
        previous.saturating_add(1).min(MAX_TACTICS_CORRECT_STREAK)
    } else {
        0
    }
}

fn expected_tactics_best_solve_ms(
    previous: Option<u32>,
    outcome: &str,
    elapsed_ms: u32,
) -> Option<u32> {
    if outcome == "solved" {
        Some(previous.map_or(elapsed_ms, |best| best.min(elapsed_ms)))
    } else {
        previous
    }
}

fn validate_tactics_attempt_transition(
    previous: Option<&StoredTacticsProgress>,
    progress: &StoredTacticsProgress,
    attempt: &StoredTacticsAttempt,
) -> Result<(), DatabaseError> {
    if progress.seed_id != attempt.seed_id || progress.seed_revision != attempt.seed_revision {
        return Err(DatabaseError::Invalid(
            "tactics progress and attempt must refer to the same seed revision".into(),
        ));
    }
    if progress.last_attempt_at.as_deref() != Some(attempt.attempted_at.as_str())
        || progress.last_outcome.as_deref() != Some(attempt.outcome.as_str())
        || progress.updated_at != attempt.attempted_at
    {
        return Err(DatabaseError::Invalid(
            "tactics progress must end at the recorded attempt".into(),
        ));
    }

    let (attempt_count, solve_count, correct_streak, best_solve_ms, created_at) = match previous {
        Some(current) => {
            if attempt.attempted_at < current.updated_at {
                return Err(DatabaseError::Invalid(
                    "tactics attempt cannot predate current progress".into(),
                ));
            }
            (
                current.attempt_count.checked_add(1).ok_or_else(|| {
                    DatabaseError::Invalid("tactics attempt count overflow".into())
                })?,
                current
                    .solve_count
                    .checked_add(if attempt.outcome == "solved" { 1 } else { 0 })
                    .ok_or_else(|| DatabaseError::Invalid("tactics solve count overflow".into()))?,
                expected_tactics_streak(current.correct_streak, &attempt.outcome),
                expected_tactics_best_solve_ms(
                    current.best_solve_ms,
                    &attempt.outcome,
                    attempt.elapsed_ms,
                ),
                current.created_at.as_str(),
            )
        }
        None => (
            1,
            if attempt.outcome == "solved" { 1 } else { 0 },
            expected_tactics_streak(0, &attempt.outcome),
            expected_tactics_best_solve_ms(None, &attempt.outcome, attempt.elapsed_ms),
            attempt.attempted_at.as_str(),
        ),
    };

    if progress.attempt_count != attempt_count
        || progress.solve_count != solve_count
        || progress.correct_streak != correct_streak
        || progress.best_solve_ms != best_solve_ms
        || progress.created_at != created_at
    {
        return Err(DatabaseError::Invalid(
            "tactics progress is not the expected successor of its attempt".into(),
        ));
    }
    if attempt.outcome != "solved" && progress.due_at != attempt.attempted_at {
        return Err(DatabaseError::Invalid(
            "unsolved tactics attempts must remain due immediately".into(),
        ));
    }
    Ok(())
}

fn validate_json(label: &str, value: &Value, max: usize) -> Result<(), DatabaseError> {
    if serde_json::to_vec(value)?.len() > max {
        return Err(DatabaseError::Invalid(format!(
            "{label} payload is too large"
        )));
    }
    Ok(())
}

fn validate_nullable_text(label: &str, value: &Value) -> Result<(), DatabaseError> {
    match value {
        Value::Null => Ok(()),
        Value::String(text) => validate_text(label, text, 1, MAX_RETRY_TEXT_BYTES),
        _ => Err(DatabaseError::Invalid(format!(
            "{label} must be a string or null"
        ))),
    }
}

fn validate_optional_state(label: &str, value: Option<&Value>) -> Result<(), DatabaseError> {
    if let Some(value) = value {
        validate_json(label, value, MAX_STATE_BYTES)?;
    }
    Ok(())
}

fn write_state(
    transaction: &Transaction<'_>,
    key: &str,
    value: &Value,
) -> Result<(), DatabaseError> {
    let payload = serde_json::to_string(value)?;
    transaction.execute(
        "INSERT INTO app_state(key, payload_json, updated_at) VALUES(?1, ?2, datetime('now')) \
         ON CONFLICT(key) DO UPDATE SET payload_json = excluded.payload_json, updated_at = excluded.updated_at",
        params![key, payload],
    )?;
    Ok(())
}

fn insert_game(
    transaction: &Transaction<'_>,
    game: &StoredGameRecord,
) -> Result<(), DatabaseError> {
    transaction.execute(
        "INSERT INTO games(id, played_at, mode, result, pgn, final_fen, move_count, reviewed, payload_json) \
         VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9) ON CONFLICT(id) DO NOTHING",
        params![
            game.id,
            game.played_at,
            game.mode,
            game.result,
            game.pgn,
            game.final_fen,
            game.move_count,
            game.reviewed as i64,
            serde_json::to_string(&game.payload)?,
        ],
    )?;
    Ok(())
}

fn upsert_game(
    transaction: &Transaction<'_>,
    game: &StoredGameRecord,
) -> Result<(), DatabaseError> {
    transaction.execute(
        "INSERT INTO games(id, played_at, mode, result, pgn, final_fen, move_count, reviewed, payload_json) \
         VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9) \
         ON CONFLICT(id) DO UPDATE SET \
           played_at = excluded.played_at, mode = excluded.mode, result = excluded.result, \
           pgn = excluded.pgn, final_fen = excluded.final_fen, move_count = excluded.move_count, \
           reviewed = excluded.reviewed, payload_json = excluded.payload_json",
        params![
            game.id,
            game.played_at,
            game.mode,
            game.result,
            game.pgn,
            game.final_fen,
            game.move_count,
            game.reviewed as i64,
            serde_json::to_string(&game.payload)?,
        ],
    )?;
    Ok(())
}

fn upsert_review(
    transaction: &Transaction<'_>,
    review: &StoredReviewRecord,
) -> Result<(), DatabaseError> {
    transaction.execute(
        "INSERT INTO reviews(review_key, source_pgn, start_fen, move_count, reviewed_at, payload_json) \
         VALUES(?1, ?2, ?3, ?4, ?5, ?6) \
         ON CONFLICT(review_key) DO UPDATE SET \
           source_pgn = excluded.source_pgn, start_fen = excluded.start_fen, \
           move_count = excluded.move_count, reviewed_at = excluded.reviewed_at, \
           payload_json = excluded.payload_json",
        params![
            review.review_key,
            review.source_pgn,
            review.start_fen,
            review.move_count,
            review.reviewed_at,
            serde_json::to_string(&review.payload)?,
        ],
    )?;
    Ok(())
}

fn upsert_retry_item(
    transaction: &Transaction<'_>,
    retry_item: &StoredRetryItem,
) -> Result<(), DatabaseError> {
    transaction.execute(
        "INSERT INTO retry_items(retry_key, review_key, source_ply, due_at, status, updated_at, payload_json) \
         VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7) \
         ON CONFLICT(retry_key) DO UPDATE SET \
           review_key = excluded.review_key, source_ply = excluded.source_ply, due_at = excluded.due_at, \
           status = excluded.status, updated_at = excluded.updated_at, payload_json = excluded.payload_json",
        params![
            retry_item.retry_key,
            retry_item.review_key,
            retry_item.source_ply,
            retry_item.due_at,
            retry_item.status,
            retry_item.updated_at,
            serde_json::to_string(&retry_item.payload)?,
        ],
    )?;
    Ok(())
}

fn insert_tactics_attempt(
    transaction: &Transaction<'_>,
    attempt: &StoredTacticsAttempt,
) -> Result<(), DatabaseError> {
    transaction.execute(
        "INSERT INTO tactics_attempts(attempt_id, seed_id, seed_revision, attempted_at, outcome, elapsed_ms, payload_json) \
         VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            attempt.attempt_id,
            attempt.seed_id,
            attempt.seed_revision,
            attempt.attempted_at,
            attempt.outcome,
            attempt.elapsed_ms,
            serde_json::to_string(&attempt.payload)?,
        ],
    )?;
    Ok(())
}

fn upsert_tactics_progress(
    transaction: &Transaction<'_>,
    progress: &StoredTacticsProgress,
) -> Result<(), DatabaseError> {
    transaction.execute(
        "INSERT INTO tactics_progress(seed_id, seed_revision, due_at, status, updated_at, payload_json) \
         VALUES(?1, ?2, ?3, ?4, ?5, ?6) \
         ON CONFLICT(seed_id) DO UPDATE SET \
           seed_revision = excluded.seed_revision, due_at = excluded.due_at, status = excluded.status, \
           updated_at = excluded.updated_at, payload_json = excluded.payload_json",
        params![
            progress.seed_id,
            progress.seed_revision,
            progress.due_at,
            progress.status,
            progress.updated_at,
            serde_json::to_string(&progress.payload)?,
        ],
    )?;
    Ok(())
}

fn trim_tactics_state(transaction: &Transaction<'_>) -> Result<(), DatabaseError> {
    transaction.execute(
        "DELETE FROM tactics_progress WHERE seed_id NOT IN ( \
            SELECT seed_id FROM tactics_progress \
            ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, due_at ASC, updated_at DESC, seed_id ASC \
            LIMIT ?1 \
         )",
        [MAX_TACTICS_PROGRESS as i64],
    )?;
    transaction.execute(
        "DELETE FROM tactics_attempts WHERE attempt_id NOT IN ( \
            SELECT attempt_id FROM tactics_attempts \
            ORDER BY attempted_at DESC, attempt_id DESC \
            LIMIT ?1 \
         )",
        [MAX_TACTICS_ATTEMPTS as i64],
    )?;
    Ok(())
}

fn load_tactics_progress(
    transaction: &Transaction<'_>,
    seed_id: &str,
) -> Result<Option<StoredTacticsProgress>, DatabaseError> {
    let record = transaction
        .query_row(
            "SELECT seed_id, seed_revision, due_at, status, updated_at, payload_json \
             FROM tactics_progress WHERE seed_id = ?1",
            [seed_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, u32>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                ))
            },
        )
        .optional()?;
    record.map(decode_stored_tactics_progress).transpose()
}

fn load_tactics_attempt(
    transaction: &Transaction<'_>,
    attempt_id: &str,
) -> Result<Option<StoredTacticsAttempt>, DatabaseError> {
    let record = transaction
        .query_row(
            "SELECT attempt_id, seed_id, seed_revision, attempted_at, outcome, elapsed_ms, payload_json \
             FROM tactics_attempts WHERE attempt_id = ?1",
            [attempt_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, u32>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, u32>(5)?,
                    row.get::<_, String>(6)?,
                ))
            },
        )
        .optional()?;
    record.map(decode_stored_tactics_attempt).transpose()
}

fn decode_stored_tactics_progress(
    (seed_id, seed_revision, due_at, status, updated_at, json): (
        String,
        u32,
        String,
        String,
        String,
        String,
    ),
) -> Result<StoredTacticsProgress, DatabaseError> {
    if json.len() > MAX_TACTICS_PROGRESS_BYTES {
        return Err(DatabaseError::Invalid(
            "stored tactics progress payload is too large".into(),
        ));
    }
    let progress = StoredTacticsProgress::from_payload(serde_json::from_str(&json)?)?;
    if progress.seed_id != seed_id
        || progress.seed_revision != seed_revision
        || progress.due_at != due_at
        || progress.status != status
        || progress.updated_at != updated_at
    {
        return Err(DatabaseError::Invalid(
            "stored tactics progress fields do not match their payload".into(),
        ));
    }
    Ok(progress)
}

fn decode_stored_tactics_attempt(
    (attempt_id, seed_id, seed_revision, attempted_at, outcome, elapsed_ms, json): (
        String,
        String,
        u32,
        String,
        String,
        u32,
        String,
    ),
) -> Result<StoredTacticsAttempt, DatabaseError> {
    if json.len() > MAX_TACTICS_ATTEMPT_BYTES {
        return Err(DatabaseError::Invalid(
            "stored tactics attempt payload is too large".into(),
        ));
    }
    let attempt = StoredTacticsAttempt::from_payload(serde_json::from_str(&json)?)?;
    if attempt.attempt_id != attempt_id
        || attempt.seed_id != seed_id
        || attempt.seed_revision != seed_revision
        || attempt.attempted_at != attempted_at
        || attempt.outcome != outcome
        || attempt.elapsed_ms != elapsed_ms
    {
        return Err(DatabaseError::Invalid(
            "stored tactics attempt fields do not match their payload".into(),
        ));
    }
    Ok(attempt)
}

fn decode_stored_retry_item(
    (retry_key, review_key, source_ply, due_at, status, updated_at, json): (
        String,
        String,
        u32,
        String,
        String,
        String,
        String,
    ),
) -> Result<Value, DatabaseError> {
    if json.len() > MAX_RETRY_BYTES {
        return Err(DatabaseError::Invalid(
            "stored retry item payload is too large".into(),
        ));
    }
    let retry_item = StoredRetryItem::from_payload(serde_json::from_str(&json)?)?;
    if retry_item.retry_key != retry_key
        || retry_item.review_key != review_key
        || retry_item.source_ply != source_ply
        || retry_item.due_at != due_at
        || retry_item.status != status
        || retry_item.updated_at != updated_at
    {
        return Err(DatabaseError::Invalid(
            "stored retry item fields do not match their payload".into(),
        ));
    }
    Ok(retry_item.payload)
}

pub struct DatabaseState {
    repository: Mutex<DatabaseRepository>,
    recovery_backup_path: Option<String>,
}

impl DatabaseState {
    pub fn from_opened(opened: OpenDatabase) -> Self {
        Self {
            recovery_backup_path: opened
                .recovery_backup
                .as_ref()
                .map(|path| path.display().to_string()),
            repository: Mutex::new(opened.repository),
        }
    }

    fn lock(&self) -> Result<std::sync::MutexGuard<'_, DatabaseRepository>, String> {
        self.repository
            .lock()
            .map_err(|_| "database lock was poisoned".into())
    }
}

#[tauri::command]
pub fn database_snapshot(state: State<'_, DatabaseState>) -> Result<DatabaseSnapshot, String> {
    let mut snapshot = state
        .lock()?
        .snapshot()
        .map_err(|error| error.to_string())?;
    snapshot.recovery_backup_path = state.recovery_backup_path.clone();
    Ok(snapshot)
}

#[tauri::command]
pub fn database_import_legacy(
    state: State<'_, DatabaseState>,
    legacy: LegacyImportRequest,
) -> Result<bool, String> {
    let legacy = legacy.into_validated().map_err(|error| error.to_string())?;
    state
        .lock()?
        .import_legacy(&legacy)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn database_save_active_session(
    state: State<'_, DatabaseState>,
    active_session: Value,
) -> Result<(), String> {
    state
        .lock()?
        .save_active_session(&active_session)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn database_save_preferences(
    state: State<'_, DatabaseState>,
    preferences: Value,
) -> Result<(), String> {
    state
        .lock()?
        .save_preferences(&preferences)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn database_save_game(state: State<'_, DatabaseState>, game: Value) -> Result<(), String> {
    let game = StoredGameRecord::from_payload(game).map_err(|error| error.to_string())?;
    state
        .lock()?
        .save_game(&game)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn database_save_review(state: State<'_, DatabaseState>, review: Value) -> Result<(), String> {
    let review = StoredReviewRecord::from_payload(review).map_err(|error| error.to_string())?;
    state
        .lock()?
        .save_review(&review)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn database_load_review(
    state: State<'_, DatabaseState>,
    review_key: String,
) -> Result<Option<Value>, String> {
    state
        .lock()?
        .load_review(&review_key)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn database_save_retry_item(
    state: State<'_, DatabaseState>,
    retry_item: Value,
) -> Result<(), String> {
    let retry_item =
        StoredRetryItem::from_payload(retry_item).map_err(|error| error.to_string())?;
    state
        .lock()?
        .save_retry_item(&retry_item)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn database_load_retry_item(
    state: State<'_, DatabaseState>,
    retry_key: String,
) -> Result<Option<Value>, String> {
    state
        .lock()?
        .load_retry_item(&retry_key)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn database_list_retry_items(state: State<'_, DatabaseState>) -> Result<Vec<Value>, String> {
    state
        .lock()?
        .list_retry_items()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn database_delete_retry_item(
    state: State<'_, DatabaseState>,
    retry_key: String,
) -> Result<bool, String> {
    state
        .lock()?
        .delete_retry_item(&retry_key)
        .map_err(|error| error.to_string())
}

/// Returns `{ progress, attempts }` for Tactics Sprint. Both arrays are
/// bounded and contain only the validated JSON payloads described by the
/// native persistence contract.
#[tauri::command]
pub fn database_list_tactics_state(
    state: State<'_, DatabaseState>,
) -> Result<TacticsStateSnapshot, String> {
    state
        .lock()?
        .list_tactics_state()
        .map_err(|error| error.to_string())
}

/// Startup-only browser/native reconciliation. Invoke with
/// `{ tactics: { progress: TacticsProgress[], attempts: TacticsAttempt[] } }`.
/// The response is the canonical merged native state.
#[tauri::command]
pub fn database_merge_tactics_state(
    state: State<'_, DatabaseState>,
    tactics: TacticsStateSnapshot,
) -> Result<TacticsStateSnapshot, String> {
    state
        .lock()?
        .merge_tactics_state(tactics)
        .map_err(|error| error.to_string())
}

/// Records one terminal attempt atomically with its next progress state.
/// Invoke with `{ progress: TacticsProgress, attempt: TacticsAttempt }`; the
/// response is the bounded canonical `{ progress, attempts }` state.
#[tauri::command]
pub fn database_record_tactics_attempt(
    state: State<'_, DatabaseState>,
    progress: Value,
    attempt: Value,
) -> Result<TacticsStateSnapshot, String> {
    let progress =
        StoredTacticsProgress::from_payload(progress).map_err(|error| error.to_string())?;
    let attempt = StoredTacticsAttempt::from_payload(attempt).map_err(|error| error.to_string())?;
    state
        .lock()?
        .record_tactics_attempt(&progress, &attempt)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn database_clear_active_session(state: State<'_, DatabaseState>) -> Result<(), String> {
    state
        .lock()?
        .clear_active_session()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn database_clear_games(state: State<'_, DatabaseState>) -> Result<(), String> {
    state
        .lock()?
        .clear_games()
        .map_err(|error| error.to_string())
}
