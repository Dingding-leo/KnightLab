use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::env;
use std::fmt;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, mpsc};
use std::thread;
use std::time::{Duration, Instant};
use tauri::State;

#[derive(Debug)]
pub enum EngineError {
    NotFound(String),
    InvalidExecutable(String),
    InvalidFen(String),
    InvalidLevel(String),
    InvalidSettings(String),
    Protocol(String),
    Io(String),
    Timeout(String),
    Cancelled,
}

impl fmt::Display for EngineError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NotFound(message)
            | Self::InvalidExecutable(message)
            | Self::InvalidFen(message)
            | Self::InvalidLevel(message)
            | Self::InvalidSettings(message)
            | Self::Protocol(message)
            | Self::Io(message)
            | Self::Timeout(message) => formatter.write_str(message),
            Self::Cancelled => formatter.write_str("Stockfish search was cancelled"),
        }
    }
}

impl From<std::io::Error> for EngineError {
    fn from(error: std::io::Error) -> Self {
        Self::Io(error.to_string())
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ParsedBestMove {
    pub best_move: Option<String>,
    pub ponder: Option<String>,
}

#[derive(Clone, Debug)]
pub struct SearchSettings {
    pub elo: u16,
    pub move_time_ms: u64,
    pub skill_level: u8,
    pub limit_strength: bool,
    pub threads: u16,
    pub hash_mb: u32,
    pub multi_pv: u8,
    pub depth: Option<u8>,
    pub nodes: Option<u64>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchSettingsRequest {
    pub profile: String,
    pub elo: u16,
    pub move_time_ms: u64,
    pub skill_level: u8,
    pub limit_strength: bool,
    pub threads: u16,
    pub hash_mb: u32,
    pub multi_pv: u8,
    pub depth: Option<u8>,
    pub nodes: Option<u64>,
}

impl From<SearchSettings> for SearchSettingsRequest {
    fn from(settings: SearchSettings) -> Self {
        Self {
            profile: "custom".into(),
            elo: settings.elo,
            move_time_ms: settings.move_time_ms,
            skill_level: settings.skill_level,
            limit_strength: settings.limit_strength,
            threads: settings.threads,
            hash_mb: settings.hash_mb,
            multi_pv: settings.multi_pv,
            depth: settings.depth,
            nodes: settings.nodes,
        }
    }
}

#[derive(Clone, Debug)]
pub struct EngineIdentity {
    pub name: String,
}

#[derive(Clone, Debug)]
pub struct SearchOutcome {
    pub best_move: Option<String>,
    pub ponder: Option<String>,
    pub elapsed_ms: u64,
    pub depth: Option<u32>,
    pub nodes: Option<u64>,
    pub nps: Option<u64>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisSettingsRequest {
    pub move_time_ms: u64,
    pub depth: Option<u8>,
    pub nodes: Option<u64>,
    pub multi_pv: u8,
    pub threads: u16,
    pub hash_mb: u32,
}

#[derive(Clone, Debug)]
pub struct AnalysisSettings {
    pub move_time_ms: u64,
    pub depth: Option<u8>,
    pub nodes: Option<u64>,
    pub multi_pv: u8,
    pub threads: u16,
    pub hash_mb: u32,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisScore {
    pub kind: String,
    pub value: i32,
    pub bound: Option<String>,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisInfo {
    pub multi_pv: u8,
    pub depth: u32,
    pub seldepth: Option<u32>,
    pub score: AnalysisScore,
    pub wdl: Option<[u16; 3]>,
    pub nodes: Option<u64>,
    pub nps: Option<u64>,
    pub hashfull: Option<u16>,
    pub tb_hits: Option<u64>,
    pub time_ms: Option<u64>,
    pub pv: Vec<String>,
}

#[derive(Clone, Debug)]
pub struct AnalysisOutcome {
    pub best_move: Option<String>,
    pub elapsed_ms: u64,
    pub lines: Vec<AnalysisInfo>,
}

pub fn parse_bestmove(line: &str) -> Result<ParsedBestMove, EngineError> {
    let mut fields = line.split_whitespace();
    if fields.next() != Some("bestmove") {
        return Err(EngineError::Protocol(format!(
            "Invalid bestmove response: {line}"
        )));
    }
    let raw_move = fields
        .next()
        .ok_or_else(|| EngineError::Protocol("Stockfish omitted its best move".into()))?;
    let best_move = match raw_move {
        "(none)" | "0000" => None,
        value if is_uci_move(value) => Some(value.to_owned()),
        _ => {
            return Err(EngineError::Protocol(format!(
                "Invalid UCI move: {raw_move}"
            )));
        }
    };
    let mut ponder = None;
    while let Some(field) = fields.next() {
        if field == "ponder" {
            let value = fields
                .next()
                .ok_or_else(|| EngineError::Protocol("Stockfish omitted its ponder move".into()))?;
            if !is_uci_move(value) {
                return Err(EngineError::Protocol(format!(
                    "Invalid ponder move: {value}"
                )));
            }
            ponder = Some(value.to_owned());
        }
    }
    Ok(ParsedBestMove { best_move, ponder })
}

fn is_uci_move(value: &str) -> bool {
    let bytes = value.as_bytes();
    matches!(bytes.len(), 4 | 5)
        && matches!(bytes[0], b'a'..=b'h')
        && matches!(bytes[1], b'1'..=b'8')
        && matches!(bytes[2], b'a'..=b'h')
        && matches!(bytes[3], b'1'..=b'8')
        && (bytes.len() == 4 || matches!(bytes[4], b'q' | b'r' | b'b' | b'n'))
}

pub fn validate_fen(fen: &str) -> Result<(), EngineError> {
    if fen.len() > 256 || fen.bytes().any(|byte| matches!(byte, b'\n' | b'\r' | 0)) {
        return Err(EngineError::InvalidFen(
            "FEN contains unsafe characters".into(),
        ));
    }
    let fields: Vec<_> = fen.split_whitespace().collect();
    if fields.len() != 6 || !matches!(fields[1], "w" | "b") {
        return Err(EngineError::InvalidFen(
            "FEN must contain six valid fields".into(),
        ));
    }
    let ranks: Vec<_> = fields[0].split('/').collect();
    if ranks.len() != 8 {
        return Err(EngineError::InvalidFen(
            "FEN board must contain eight ranks".into(),
        ));
    }
    for rank in ranks {
        let mut squares = 0u8;
        for token in rank.bytes() {
            match token {
                b'1'..=b'8' => squares += token - b'0',
                b'p' | b'n' | b'b' | b'r' | b'q' | b'k' | b'P' | b'N' | b'B' | b'R' | b'Q'
                | b'K' => squares += 1,
                _ => {
                    return Err(EngineError::InvalidFen(
                        "FEN board contains an invalid piece".into(),
                    ));
                }
            }
        }
        if squares != 8 {
            return Err(EngineError::InvalidFen(
                "Every FEN rank must contain eight squares".into(),
            ));
        }
    }
    Ok(())
}

pub fn strength_preset(level: &str) -> Result<SearchSettings, EngineError> {
    match level {
        "easy" => Ok(SearchSettings {
            elo: 1320,
            move_time_ms: 80,
            skill_level: 2,
            limit_strength: true,
            threads: 1,
            hash_mb: 16,
            multi_pv: 1,
            depth: None,
            nodes: Some(10_000),
        }),
        "balanced" => Ok(SearchSettings {
            elo: 1700,
            move_time_ms: 160,
            skill_level: 8,
            limit_strength: true,
            threads: 1,
            hash_mb: 16,
            multi_pv: 1,
            depth: None,
            nodes: Some(30_000),
        }),
        "strong" => Ok(SearchSettings {
            elo: 2200,
            move_time_ms: 280,
            skill_level: 14,
            limit_strength: true,
            threads: 1,
            hash_mb: 32,
            multi_pv: 1,
            depth: None,
            nodes: Some(70_000),
        }),
        _ => Err(EngineError::InvalidLevel(format!(
            "Unknown engine level: {level}"
        ))),
    }
}

pub fn resolve_search_settings(
    level: &str,
    requested: Option<SearchSettingsRequest>,
) -> Result<SearchSettings, EngineError> {
    let Some(requested) = requested else {
        return strength_preset(level);
    };
    if requested.profile == "preset" {
        return strength_preset(level);
    }
    if !matches!(requested.profile.as_str(), "elo" | "custom") {
        return Err(EngineError::InvalidSettings(format!(
            "Unknown engine profile: {}",
            requested.profile
        )));
    }
    if !(1320..=3190).contains(&requested.elo) {
        return Err(EngineError::InvalidSettings(
            "Engine Elo must be between 1320 and 3190".into(),
        ));
    }
    if requested.move_time_ms < 50 || requested.move_time_ms > 30_000 {
        return Err(EngineError::InvalidSettings(
            "Move time must be between 50 and 30000 ms".into(),
        ));
    }
    if requested.skill_level > 20 {
        return Err(EngineError::InvalidSettings(
            "Skill level must be between 0 and 20".into(),
        ));
    }
    if !(1..=32).contains(&requested.threads) {
        return Err(EngineError::InvalidSettings(
            "Threads must be between 1 and 32".into(),
        ));
    }
    if !(16..=4096).contains(&requested.hash_mb) {
        return Err(EngineError::InvalidSettings(
            "Hash must be between 16 and 4096 MB".into(),
        ));
    }
    if !(1..=5).contains(&requested.multi_pv) {
        return Err(EngineError::InvalidSettings(
            "MultiPV must be between 1 and 5".into(),
        ));
    }
    if requested
        .depth
        .is_some_and(|depth| !(1..=40).contains(&depth))
    {
        return Err(EngineError::InvalidSettings(
            "Depth must be between 1 and 40".into(),
        ));
    }
    if requested
        .nodes
        .is_some_and(|nodes| !(1_000..=100_000_000).contains(&nodes))
    {
        return Err(EngineError::InvalidSettings(
            "Nodes must be between 1000 and 100000000".into(),
        ));
    }
    Ok(SearchSettings {
        elo: requested.elo,
        move_time_ms: requested.move_time_ms,
        skill_level: requested.skill_level,
        limit_strength: requested.profile == "elo" || requested.limit_strength,
        threads: requested.threads,
        hash_mb: requested.hash_mb,
        multi_pv: requested.multi_pv,
        depth: requested.depth,
        nodes: requested.nodes,
    })
}

pub fn uci_option_commands(settings: &SearchSettings) -> Vec<String> {
    vec![
        format!("setoption name Threads value {}", settings.threads),
        format!("setoption name Hash value {}", settings.hash_mb),
        format!("setoption name MultiPV value {}", settings.multi_pv),
        format!("setoption name Skill Level value {}", settings.skill_level),
        format!(
            "setoption name UCI_LimitStrength value {}",
            settings.limit_strength
        ),
        format!("setoption name UCI_Elo value {}", settings.elo),
    ]
}

pub fn go_command(settings: &SearchSettings) -> String {
    let mut command = format!("go movetime {}", settings.move_time_ms);
    if let Some(depth) = settings.depth {
        command.push_str(&format!(" depth {depth}"));
    }
    if let Some(nodes) = settings.nodes {
        command.push_str(&format!(" nodes {nodes}"));
    }
    command
}

pub fn resolve_analysis_settings(
    requested: AnalysisSettingsRequest,
) -> Result<AnalysisSettings, EngineError> {
    if !(100..=10_000).contains(&requested.move_time_ms) {
        return Err(EngineError::InvalidSettings(
            "Analysis time must be between 100 and 10000 ms".into(),
        ));
    }
    if requested
        .depth
        .is_some_and(|depth| !(1..=40).contains(&depth))
    {
        return Err(EngineError::InvalidSettings(
            "Analysis depth must be between 1 and 40".into(),
        ));
    }
    if requested
        .nodes
        .is_some_and(|nodes| !(1_000..=100_000_000).contains(&nodes))
    {
        return Err(EngineError::InvalidSettings(
            "Analysis nodes must be between 1000 and 100000000".into(),
        ));
    }
    if !(1..=5).contains(&requested.multi_pv) {
        return Err(EngineError::InvalidSettings(
            "Analysis MultiPV must be between 1 and 5".into(),
        ));
    }
    if !(1..=32).contains(&requested.threads) {
        return Err(EngineError::InvalidSettings(
            "Analysis threads must be between 1 and 32".into(),
        ));
    }
    if !(16..=4096).contains(&requested.hash_mb) {
        return Err(EngineError::InvalidSettings(
            "Analysis Hash must be between 16 and 4096 MB".into(),
        ));
    }
    Ok(AnalysisSettings {
        move_time_ms: requested.move_time_ms,
        depth: requested.depth,
        nodes: requested.nodes,
        multi_pv: requested.multi_pv,
        threads: requested.threads,
        hash_mb: requested.hash_mb,
    })
}

pub fn analysis_option_commands(settings: &AnalysisSettings) -> Vec<String> {
    vec![
        format!("setoption name Threads value {}", settings.threads),
        format!("setoption name Hash value {}", settings.hash_mb),
        format!("setoption name MultiPV value {}", settings.multi_pv),
        "setoption name Skill Level value 20".into(),
        "setoption name UCI_LimitStrength value false".into(),
        "setoption name UCI_ShowWDL value true".into(),
    ]
}

pub fn analysis_go_command(settings: &AnalysisSettings) -> String {
    let mut command = format!("go movetime {}", settings.move_time_ms);
    if let Some(depth) = settings.depth {
        command.push_str(&format!(" depth {depth}"));
    }
    if let Some(nodes) = settings.nodes {
        command.push_str(&format!(" nodes {nodes}"));
    }
    command
}

fn parsed_field<T: std::str::FromStr>(
    fields: &[&str],
    name: &str,
) -> Result<Option<T>, EngineError> {
    let Some(index) = fields.iter().position(|field| *field == name) else {
        return Ok(None);
    };
    let value = fields
        .get(index + 1)
        .ok_or_else(|| EngineError::Protocol(format!("Stockfish omitted the {name} info value")))?;
    value.parse::<T>().map(Some).map_err(|_| {
        EngineError::Protocol(format!("Stockfish returned an invalid {name} info value"))
    })
}

pub fn parse_analysis_info(line: &str) -> Result<AnalysisInfo, EngineError> {
    let fields: Vec<_> = line.split_whitespace().collect();
    if fields.first() != Some(&"info") {
        return Err(EngineError::Protocol(
            "Analysis line must start with info".into(),
        ));
    }
    let depth = parsed_field::<u32>(&fields, "depth")?
        .ok_or_else(|| EngineError::Protocol("Analysis line omitted depth".into()))?;
    let multi_pv = parsed_field::<u8>(&fields, "multipv")?.unwrap_or(1);
    if !(1..=5).contains(&multi_pv) {
        return Err(EngineError::Protocol(
            "Analysis MultiPV index is out of range".into(),
        ));
    }
    let score_index = fields
        .iter()
        .position(|field| *field == "score")
        .ok_or_else(|| EngineError::Protocol("Analysis line omitted score".into()))?;
    let score_kind = *fields
        .get(score_index + 1)
        .ok_or_else(|| EngineError::Protocol("Analysis line omitted score kind".into()))?;
    if !matches!(score_kind, "cp" | "mate") {
        return Err(EngineError::Protocol(
            "Analysis score kind is invalid".into(),
        ));
    }
    let score_value = fields
        .get(score_index + 2)
        .ok_or_else(|| EngineError::Protocol("Analysis line omitted score value".into()))?
        .parse::<i32>()
        .map_err(|_| EngineError::Protocol("Analysis score value is invalid".into()))?;
    let bound = match fields.get(score_index + 3).copied() {
        Some("lowerbound") => Some("lower".into()),
        Some("upperbound") => Some("upper".into()),
        _ => None,
    };
    let wdl = if let Some(index) = fields.iter().position(|field| *field == "wdl") {
        let values = (1..=3)
            .map(|offset| {
                fields
                    .get(index + offset)
                    .ok_or_else(|| EngineError::Protocol("Analysis WDL is incomplete".into()))?
                    .parse::<u16>()
                    .map_err(|_| EngineError::Protocol("Analysis WDL is invalid".into()))
            })
            .collect::<Result<Vec<_>, _>>()?;
        if values.iter().any(|value| *value > 1000) || values.iter().copied().sum::<u16>() != 1000 {
            return Err(EngineError::Protocol("Analysis WDL must total 1000".into()));
        }
        Some([values[0], values[1], values[2]])
    } else {
        None
    };
    let hashfull = parsed_field::<u16>(&fields, "hashfull")?;
    if hashfull.is_some_and(|value| value > 1000) {
        return Err(EngineError::Protocol(
            "Analysis hashfull is out of range".into(),
        ));
    }
    let pv_index = fields
        .iter()
        .position(|field| *field == "pv")
        .ok_or_else(|| EngineError::Protocol("Analysis line omitted principal variation".into()))?;
    let pv = fields
        .iter()
        .skip(pv_index + 1)
        .map(|value| (*value).to_owned())
        .collect::<Vec<_>>();
    if pv.is_empty() || pv.len() > 128 || pv.iter().any(|value| !is_uci_move(value)) {
        return Err(EngineError::Protocol(
            "Analysis principal variation is invalid".into(),
        ));
    }
    Ok(AnalysisInfo {
        multi_pv,
        depth,
        seldepth: parsed_field(&fields, "seldepth")?,
        score: AnalysisScore {
            kind: score_kind.into(),
            value: score_value,
            bound,
        },
        wdl,
        nodes: parsed_field(&fields, "nodes")?,
        nps: parsed_field(&fields, "nps")?,
        hashfull,
        tb_hits: parsed_field(&fields, "tbhits")?,
        time_ms: parsed_field(&fields, "time")?,
        pv,
    })
}

#[cfg(unix)]
fn is_executable(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    path.is_file()
        && path
            .metadata()
            .map(|metadata| metadata.permissions().mode() & 0o111 != 0)
            .unwrap_or(false)
}

#[cfg(not(unix))]
fn is_executable(path: &Path) -> bool {
    path.is_file()
}

pub fn discover_stockfish(
    explicit: Option<PathBuf>,
    environment_override: Option<PathBuf>,
    path_environment: Option<&str>,
    known_paths: &[PathBuf],
) -> Result<PathBuf, EngineError> {
    if let Some(path) = explicit.or(environment_override) {
        return validate_executable(path);
    }
    if let Some(paths) = path_environment {
        for directory in env::split_paths(paths) {
            for binary in ["stockfish", "stockfish.exe"] {
                let candidate = directory.join(binary);
                if is_executable(&candidate) {
                    return Ok(candidate);
                }
            }
        }
    }
    for path in known_paths {
        if is_executable(path) {
            return Ok(path.clone());
        }
    }
    Err(EngineError::NotFound(
        "Stockfish was not found. Install it with `brew install stockfish` or set KNIGHTCLUB_STOCKFISH.".into(),
    ))
}

fn validate_executable(path: PathBuf) -> Result<PathBuf, EngineError> {
    if is_executable(&path) {
        Ok(path)
    } else {
        Err(EngineError::InvalidExecutable(format!(
            "Stockfish path is not an executable file: {}",
            path.display()
        )))
    }
}

fn discover_for_app(explicit: Option<PathBuf>) -> Result<PathBuf, EngineError> {
    let environment_override = env::var_os("KNIGHTCLUB_STOCKFISH").map(PathBuf::from);
    let path_environment = env::var("PATH").ok();
    let known_paths = [
        PathBuf::from("/opt/homebrew/bin/stockfish"),
        PathBuf::from("/usr/local/bin/stockfish"),
        PathBuf::from("/opt/homebrew/opt/stockfish/bin/stockfish"),
    ];
    discover_stockfish(
        explicit,
        environment_override,
        path_environment.as_deref(),
        &known_paths,
    )
}

pub struct EngineSupervisor {
    path: PathBuf,
    child: Option<Child>,
    stdin: Option<ChildStdin>,
    output: Option<mpsc::Receiver<String>>,
    identity: Option<EngineIdentity>,
    /// Exact UCI options that reached `readyok` for the current child process.
    configured_options: Option<Vec<String>>,
}

impl EngineSupervisor {
    pub fn new(path: PathBuf) -> Self {
        Self {
            path,
            child: None,
            stdin: None,
            output: None,
            identity: None,
            configured_options: None,
        }
    }

    pub fn initialize(&mut self, timeout: Duration) -> Result<EngineIdentity, EngineError> {
        if let Some(identity) = &self.identity {
            return Ok(identity.clone());
        }
        // A previous failed handshake may have left pipes open without an
        // identity. Tear that process down before retrying so a timed-out UCI
        // child can never be overwritten and orphaned.
        self.shutdown();
        let result = self.initialize_fresh(timeout);
        if result.is_err() {
            self.shutdown();
        }
        result
    }

    fn initialize_fresh(&mut self, timeout: Duration) -> Result<EngineIdentity, EngineError> {
        let mut child = Command::new(&self.path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|error| {
                EngineError::Io(format!("Could not start {}: {error}", self.path.display()))
            })?;
        let stdin = match child.stdin.take() {
            Some(stdin) => stdin,
            None => {
                terminate_child(&mut child);
                return Err(EngineError::Io("Stockfish stdin unavailable".into()));
            }
        };
        let stdout = match child.stdout.take() {
            Some(stdout) => stdout,
            None => {
                terminate_child(&mut child);
                return Err(EngineError::Io("Stockfish stdout unavailable".into()));
            }
        };
        let (sender, receiver) = mpsc::channel();
        thread::spawn(move || {
            for line in BufReader::new(stdout).lines() {
                match line {
                    Ok(line) => {
                        if sender.send(line).is_err() {
                            break;
                        }
                    }
                    Err(_) => break,
                }
            }
        });
        self.child = Some(child);
        self.stdin = Some(stdin);
        self.output = Some(receiver);
        self.send("uci")?;
        let deadline = Instant::now() + timeout;
        let mut name = "Stockfish".to_owned();
        loop {
            let line = self.receive_until(deadline, "UCI handshake")?;
            if let Some(value) = line.strip_prefix("id name ") {
                name = value.to_owned();
            }
            if line == "uciok" {
                break;
            }
        }
        self.send("isready")?;
        self.wait_for("readyok", deadline)?;
        let identity = EngineIdentity { name };
        self.identity = Some(identity.clone());
        Ok(identity)
    }

    fn shutdown(&mut self) {
        let _ = self.send("quit");
        self.stdin.take();
        self.output.take();
        self.identity = None;
        self.configured_options = None;
        if let Some(mut child) = self.child.take() {
            terminate_child(&mut child);
        }
    }

    pub fn best_move(
        &mut self,
        fen: &str,
        settings: &SearchSettings,
        timeout: Duration,
        request_id: u64,
        cancelled_through: &AtomicU64,
    ) -> Result<SearchOutcome, EngineError> {
        validate_fen(fen)?;
        let result =
            self.best_move_after_validation(fen, settings, timeout, request_id, cancelled_through);
        // A timeout, cancellation or protocol failure can leave output in
        // flight. The next request still fences with `isready`, but requiring
        // a fresh option acknowledgement avoids trusting a partial state when
        // this supervisor is reused directly.
        if result.is_err() {
            self.configured_options = None;
        }
        result
    }

    fn best_move_after_validation(
        &mut self,
        fen: &str,
        settings: &SearchSettings,
        timeout: Duration,
        request_id: u64,
        cancelled_through: &AtomicU64,
    ) -> Result<SearchOutcome, EngineError> {
        if self.identity.is_none() {
            self.initialize(timeout)?;
        }
        let deadline = Instant::now() + timeout;
        self.configure_options(uci_option_commands(settings), deadline)?;
        self.send(&format!("position fen {fen}"))?;
        self.send(&go_command(settings))?;
        let started = Instant::now();
        let mut depth = None;
        let mut nodes = None;
        let mut nps = None;
        loop {
            if cancelled_through.load(Ordering::Acquire) == request_id {
                let _ = self.send("stop");
                return Err(EngineError::Cancelled);
            }
            if Instant::now() >= deadline {
                let _ = self.send("stop");
                return Err(EngineError::Timeout(format!(
                    "Stockfish search timed out after {} ms",
                    timeout.as_millis()
                )));
            }
            let remaining = deadline
                .saturating_duration_since(Instant::now())
                .min(Duration::from_millis(15));
            let line = match self
                .output
                .as_ref()
                .expect("initialized output")
                .recv_timeout(remaining)
            {
                Ok(line) => line,
                Err(mpsc::RecvTimeoutError::Timeout) => continue,
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    return Err(EngineError::Io("Stockfish exited during search".into()));
                }
            };
            if line.starts_with("info ") {
                parse_info(&line, &mut depth, &mut nodes, &mut nps);
            } else if line.starts_with("bestmove ") {
                let parsed = parse_bestmove(&line)?;
                return Ok(SearchOutcome {
                    best_move: parsed.best_move,
                    ponder: parsed.ponder,
                    elapsed_ms: started.elapsed().as_millis() as u64,
                    depth,
                    nodes,
                    nps,
                });
            }
        }
    }

    pub fn analyze(
        &mut self,
        fen: &str,
        settings: &AnalysisSettings,
        timeout: Duration,
        request_id: u64,
        cancelled_through: &AtomicU64,
    ) -> Result<AnalysisOutcome, EngineError> {
        validate_fen(fen)?;
        if cancelled_through.load(Ordering::Acquire) == request_id {
            return Err(EngineError::Cancelled);
        }
        let result =
            self.analyze_after_validation(fen, settings, timeout, request_id, cancelled_through);
        if result.is_err() {
            self.configured_options = None;
        }
        result
    }

    fn analyze_after_validation(
        &mut self,
        fen: &str,
        settings: &AnalysisSettings,
        timeout: Duration,
        request_id: u64,
        cancelled_through: &AtomicU64,
    ) -> Result<AnalysisOutcome, EngineError> {
        if self.identity.is_none() {
            self.initialize(timeout)?;
        }
        let deadline = Instant::now() + timeout;
        self.configure_options(analysis_option_commands(settings), deadline)?;
        self.send(&format!("position fen {fen}"))?;
        self.send(&analysis_go_command(settings))?;
        let started = Instant::now();
        let mut lines = BTreeMap::<u8, AnalysisInfo>::new();
        loop {
            if cancelled_through.load(Ordering::Acquire) == request_id {
                let _ = self.send("stop");
                return Err(EngineError::Cancelled);
            }
            if Instant::now() >= deadline {
                let _ = self.send("stop");
                return Err(EngineError::Timeout(format!(
                    "Stockfish analysis timed out after {} ms",
                    timeout.as_millis()
                )));
            }
            let remaining = deadline
                .saturating_duration_since(Instant::now())
                .min(Duration::from_millis(15));
            let line = match self
                .output
                .as_ref()
                .expect("initialized output")
                .recv_timeout(remaining)
            {
                Ok(line) => line,
                Err(mpsc::RecvTimeoutError::Timeout) => continue,
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    return Err(EngineError::Io("Stockfish exited during analysis".into()));
                }
            };
            if line.starts_with("info ") && line.split_whitespace().any(|field| field == "score") {
                let info = parse_analysis_info(&line)?;
                if info.multi_pv <= settings.multi_pv {
                    let should_replace =
                        info.score.bound.is_none() || !lines.contains_key(&info.multi_pv);
                    if should_replace {
                        lines.insert(info.multi_pv, info);
                    }
                }
            } else if line.starts_with("bestmove ") {
                let parsed = parse_bestmove(&line)?;
                return Ok(AnalysisOutcome {
                    best_move: parsed.best_move,
                    elapsed_ms: started.elapsed().as_millis() as u64,
                    lines: lines.into_values().collect(),
                });
            }
        }
    }

    fn configure_options(
        &mut self,
        commands: Vec<String>,
        deadline: Instant,
    ) -> Result<(), EngineError> {
        let unchanged = self
            .configured_options
            .as_ref()
            .is_some_and(|configured| configured == &commands);

        let result = (|| {
            if !unchanged {
                // Never cache a partly-written option vector. Reapplying Hash
                // can clear the transposition table, so a hit also avoids
                // needless memory/cache churn during long reviews.
                self.configured_options = None;
                for command in &commands {
                    self.send(command)?;
                }
            }
            // Preserve a UCI ready barrier for every request. This drains any
            // late output before a new position/go pair, including when the
            // preceding request was cancelled by a caller outside Tauri.
            self.send("isready")?;
            self.wait_for("readyok", deadline)?;
            if !unchanged {
                self.configured_options = Some(commands);
            }
            Ok(())
        })();

        if result.is_err() {
            self.configured_options = None;
        }
        result
    }

    fn send(&mut self, line: &str) -> Result<(), EngineError> {
        let stdin = self
            .stdin
            .as_mut()
            .ok_or_else(|| EngineError::Io("Stockfish is not running".into()))?;
        writeln!(stdin, "{line}")?;
        stdin.flush()?;
        Ok(())
    }

    fn wait_for(&self, expected: &str, deadline: Instant) -> Result<(), EngineError> {
        loop {
            if self.receive_until(deadline, expected)? == expected {
                return Ok(());
            }
        }
    }

    fn receive_until(&self, deadline: Instant, phase: &str) -> Result<String, EngineError> {
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            return Err(EngineError::Timeout(format!(
                "Stockfish timed out during {phase}"
            )));
        }
        self.output
            .as_ref()
            .ok_or_else(|| EngineError::Io("Stockfish output unavailable".into()))?
            .recv_timeout(remaining)
            .map_err(|error| match error {
                mpsc::RecvTimeoutError::Timeout => {
                    EngineError::Timeout(format!("Stockfish timed out during {phase}"))
                }
                mpsc::RecvTimeoutError::Disconnected => {
                    EngineError::Io("Stockfish exited unexpectedly".into())
                }
            })
    }
}

impl Drop for EngineSupervisor {
    fn drop(&mut self) {
        self.shutdown();
    }
}

fn terminate_child(child: &mut Child) {
    let _ = child.kill();
    let _ = child.wait();
}

fn parse_info(line: &str, depth: &mut Option<u32>, nodes: &mut Option<u64>, nps: &mut Option<u64>) {
    let fields: Vec<_> = line.split_whitespace().collect();
    for window in fields.windows(2) {
        match window[0] {
            "depth" => *depth = window[1].parse().ok().or(*depth),
            "nodes" => *nodes = window[1].parse().ok().or(*nodes),
            "nps" => *nps = window[1].parse().ok().or(*nps),
            _ => {}
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BestMoveRequest {
    pub request_id: u64,
    pub fen: String,
    pub level: String,
    pub engine_path: Option<PathBuf>,
    pub settings: Option<SearchSettingsRequest>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeResponse {
    pub engine_name: String,
    pub engine_path: String,
}

pub fn probe_stockfish(
    explicit: Option<PathBuf>,
    timeout: Duration,
) -> Result<ProbeResponse, EngineError> {
    let path = discover_for_app(explicit)?;
    let mut supervisor = EngineSupervisor::new(path.clone());
    let identity = supervisor.initialize(timeout)?;
    Ok(ProbeResponse {
        engine_name: identity.name,
        engine_path: path.display().to_string(),
    })
}

#[tauri::command]
pub async fn stockfish_probe(engine_path: Option<PathBuf>) -> Result<ProbeResponse, String> {
    tauri::async_runtime::spawn_blocking(move || {
        probe_stockfish(engine_path, Duration::from_secs(3)).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| format!("Stockfish probe task failed: {error}"))?
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BestMoveResponse {
    pub request_id: u64,
    pub fen: String,
    pub best_move: Option<String>,
    pub ponder: Option<String>,
    pub engine_name: String,
    pub engine_path: String,
    pub elapsed_ms: u64,
    pub depth: Option<u32>,
    pub nodes: Option<u64>,
    pub nps: Option<u64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisRequest {
    pub request_id: u64,
    pub fen: String,
    pub engine_path: Option<PathBuf>,
    pub settings: AnalysisSettingsRequest,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisResponse {
    pub request_id: u64,
    pub fen: String,
    pub engine_name: String,
    pub engine_path: String,
    pub elapsed_ms: u64,
    pub best_move: Option<String>,
    pub lines: Vec<AnalysisInfo>,
}

struct ManagedEngine {
    path: PathBuf,
    supervisor: EngineSupervisor,
}

#[derive(Clone)]
pub struct StockfishState {
    engine: Arc<Mutex<Option<ManagedEngine>>>,
    cancelled_through: Arc<AtomicU64>,
}

impl Default for StockfishState {
    fn default() -> Self {
        Self {
            engine: Arc::new(Mutex::new(None)),
            cancelled_through: Arc::new(AtomicU64::new(0)),
        }
    }
}

#[derive(Clone)]
pub struct AnalysisState {
    engine: Arc<Mutex<Option<ManagedEngine>>>,
    cancelled_through: Arc<AtomicU64>,
}

impl Default for AnalysisState {
    fn default() -> Self {
        Self {
            engine: Arc::new(Mutex::new(None)),
            cancelled_through: Arc::new(AtomicU64::new(0)),
        }
    }
}

#[tauri::command]
pub async fn stockfish_best_move(
    state: State<'_, StockfishState>,
    request: BestMoveRequest,
) -> Result<BestMoveResponse, String> {
    let owned_state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        stockfish_best_move_blocking(&owned_state, request)
    })
    .await
    .map_err(|error| format!("Stockfish worker task failed: {error}"))?
}

fn stockfish_best_move_blocking(
    state: &StockfishState,
    request: BestMoveRequest,
) -> Result<BestMoveResponse, String> {
    if request.request_id == state.cancelled_through.load(Ordering::Acquire) {
        return Err(EngineError::Cancelled.to_string());
    }
    let path = discover_for_app(request.engine_path).map_err(|error| error.to_string())?;
    let settings = resolve_search_settings(&request.level, request.settings)
        .map_err(|error| error.to_string())?;
    let mut guard = state
        .engine
        .lock()
        .map_err(|_| "Stockfish state lock was poisoned".to_owned())?;
    if guard.as_ref().map(|engine| engine.path.as_path()) != Some(path.as_path()) {
        *guard = Some(ManagedEngine {
            path: path.clone(),
            supervisor: EngineSupervisor::new(path.clone()),
        });
    }
    let identity = match guard
        .as_mut()
        .expect("managed engine initialized")
        .supervisor
        .initialize(Duration::from_secs(3))
    {
        Ok(identity) => identity,
        Err(error) => {
            *guard = None;
            return Err(error.to_string());
        }
    };
    let managed = guard.as_mut().expect("managed engine initialized");
    let outcome = match managed.supervisor.best_move(
        &request.fen,
        &settings,
        Duration::from_millis(settings.move_time_ms.saturating_add(3_000)),
        request.request_id,
        &state.cancelled_through,
    ) {
        Ok(outcome) => outcome,
        Err(error) => {
            *guard = None;
            return Err(error.to_string());
        }
    };
    Ok(BestMoveResponse {
        request_id: request.request_id,
        fen: request.fen,
        best_move: outcome.best_move,
        ponder: outcome.ponder,
        engine_name: identity.name,
        engine_path: path.display().to_string(),
        elapsed_ms: outcome.elapsed_ms,
        depth: outcome.depth,
        nodes: outcome.nodes,
        nps: outcome.nps,
    })
}

#[tauri::command]
pub fn stockfish_stop(state: State<'_, StockfishState>, request_id: u64) {
    state.cancelled_through.store(request_id, Ordering::Release);
}

#[tauri::command]
pub async fn stockfish_analyze(
    state: State<'_, AnalysisState>,
    request: AnalysisRequest,
) -> Result<AnalysisResponse, String> {
    let owned_state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || stockfish_analyze_blocking(&owned_state, request))
        .await
        .map_err(|error| format!("Stockfish analysis task failed: {error}"))?
}

fn stockfish_analyze_blocking(
    state: &AnalysisState,
    request: AnalysisRequest,
) -> Result<AnalysisResponse, String> {
    if request.request_id == state.cancelled_through.load(Ordering::Acquire) {
        return Err(EngineError::Cancelled.to_string());
    }
    let path = discover_for_app(request.engine_path).map_err(|error| error.to_string())?;
    let settings =
        resolve_analysis_settings(request.settings).map_err(|error| error.to_string())?;
    let mut guard = state
        .engine
        .lock()
        .map_err(|_| "Stockfish analysis lock was poisoned".to_owned())?;
    if request.request_id == state.cancelled_through.load(Ordering::Acquire) {
        return Err(EngineError::Cancelled.to_string());
    }
    if guard.as_ref().map(|engine| engine.path.as_path()) != Some(path.as_path()) {
        *guard = Some(ManagedEngine {
            path: path.clone(),
            supervisor: EngineSupervisor::new(path.clone()),
        });
    }
    let identity = match guard
        .as_mut()
        .expect("managed analysis engine initialized")
        .supervisor
        .initialize(Duration::from_secs(3))
    {
        Ok(identity) => identity,
        Err(error) => {
            *guard = None;
            return Err(error.to_string());
        }
    };
    let managed = guard.as_mut().expect("managed analysis engine initialized");
    let timeout = Duration::from_millis(settings.move_time_ms.saturating_add(3_000));
    let outcome = match managed.supervisor.analyze(
        &request.fen,
        &settings,
        timeout,
        request.request_id,
        &state.cancelled_through,
    ) {
        Ok(outcome) => outcome,
        Err(error) => {
            *guard = None;
            return Err(error.to_string());
        }
    };
    Ok(AnalysisResponse {
        request_id: request.request_id,
        fen: request.fen,
        engine_name: identity.name,
        engine_path: path.display().to_string(),
        elapsed_ms: outcome.elapsed_ms,
        best_move: outcome.best_move,
        lines: outcome.lines,
    })
}

#[tauri::command]
pub fn stockfish_analysis_stop(state: State<'_, AnalysisState>, request_id: u64) {
    state.cancelled_through.store(request_id, Ordering::Release);
}
