#![cfg(unix)]

use knightclub_lib::stockfish::{
    AnalysisSettingsRequest, EngineSupervisor, SearchSettingsRequest, discover_stockfish,
    probe_stockfish, resolve_analysis_settings, resolve_search_settings,
};
use std::env;
use std::path::PathBuf;
use std::sync::atomic::AtomicU64;
use std::time::Duration;

const START_FEN: &str = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

#[test]
fn real_stockfish_answers_through_the_production_uci_adapter() {
    if env::var("KNIGHTCLUB_RUN_STOCKFISH_SMOKE").as_deref() != Ok("1") {
        return;
    }
    let path_environment = env::var("PATH").ok();
    let known_paths = [
        PathBuf::from("/opt/homebrew/bin/stockfish"),
        PathBuf::from("/usr/local/bin/stockfish"),
    ];
    let path = discover_stockfish(
        None,
        env::var_os("KNIGHTCLUB_STOCKFISH").map(PathBuf::from),
        path_environment.as_deref(),
        &known_paths,
    )
    .expect("a local Stockfish executable");
    let probe =
        probe_stockfish(Some(path.clone()), Duration::from_secs(3)).expect("real Stockfish probe");
    let mut engine = EngineSupervisor::new(path.clone());
    let identity = engine
        .initialize(Duration::from_secs(3))
        .expect("real Stockfish UCI handshake");
    let settings = resolve_search_settings(
        "balanced",
        Some(SearchSettingsRequest {
            profile: "custom".into(),
            elo: 1900,
            move_time_ms: 200,
            skill_level: 9,
            limit_strength: true,
            threads: 2,
            hash_mb: 64,
            multi_pv: 2,
            depth: Some(14),
            nodes: Some(100_000),
        }),
    )
    .expect("custom settings");
    let outcome = engine
        .best_move(
            START_FEN,
            &settings,
            Duration::from_secs(5),
            1,
            &AtomicU64::new(0),
        )
        .expect("real Stockfish bestmove");

    assert!(identity.name.starts_with("Stockfish"));
    assert_eq!(probe.engine_name, identity.name);
    assert_eq!(probe.engine_path, path.display().to_string());
    assert!(outcome.best_move.is_some());
    assert!(outcome.depth.is_some());
}

#[test]
fn real_stockfish_returns_three_complete_analysis_lines() {
    if env::var("KNIGHTCLUB_RUN_STOCKFISH_SMOKE").as_deref() != Ok("1") {
        return;
    }
    let path = discover_stockfish(
        None,
        env::var_os("KNIGHTCLUB_STOCKFISH").map(PathBuf::from),
        env::var("PATH").ok().as_deref(),
        &[
            PathBuf::from("/opt/homebrew/bin/stockfish"),
            PathBuf::from("/usr/local/bin/stockfish"),
        ],
    )
    .expect("a local Stockfish executable");
    let settings = resolve_analysis_settings(AnalysisSettingsRequest {
        move_time_ms: 300,
        depth: Some(18),
        nodes: None,
        multi_pv: 3,
        threads: 1,
        hash_mb: 64,
    })
    .expect("analysis settings");
    let mut engine = EngineSupervisor::new(path);
    let outcome = engine
        .analyze(
            START_FEN,
            &settings,
            Duration::from_secs(5),
            41,
            &AtomicU64::new(0),
        )
        .expect("real Stockfish MultiPV analysis");

    assert_eq!(outcome.lines.len(), 3);
    assert_eq!(
        outcome
            .lines
            .iter()
            .map(|line| line.multi_pv)
            .collect::<Vec<_>>(),
        vec![1, 2, 3]
    );
    assert!(outcome.best_move.is_some());
    assert!(outcome.lines.iter().all(|line| {
        line.depth > 0
            && !line.pv.is_empty()
            && line.nodes.is_some()
            && line.nps.is_some()
            && line.wdl.is_some()
    }));
}
