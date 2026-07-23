#![cfg(unix)]

use knightclub_lib::stockfish::{
    AnalysisSettingsRequest, EngineError, EngineSupervisor, analysis_go_command,
    analysis_option_commands, parse_analysis_info, resolve_analysis_settings,
};
use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

const START_FEN: &str = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

fn fake_engine(script_body: &str) -> tempfile::TempDir {
    let directory = tempfile::tempdir().expect("temporary engine directory");
    let path = directory.path().join("stockfish-analysis-test");
    fs::write(&path, format!("#!/bin/sh\n{script_body}\n")).expect("write fake engine");
    let mut permissions = fs::metadata(&path).unwrap().permissions();
    permissions.set_mode(0o755);
    fs::set_permissions(&path, permissions).unwrap();
    directory
}

fn fake_engine_with_command_log(script_body: &str) -> (tempfile::TempDir, PathBuf) {
    let directory = tempfile::tempdir().expect("temporary engine directory");
    let path = directory.path().join("stockfish-analysis-test");
    let command_log = directory.path().join("commands.log");
    let script = format!(
        "#!/bin/sh\nCOMMAND_LOG=\"{}\"\n{script_body}\n",
        command_log.display()
    );
    fs::write(&path, script).expect("write fake engine");
    let mut permissions = fs::metadata(&path).unwrap().permissions();
    permissions.set_mode(0o755);
    fs::set_permissions(&path, permissions).unwrap();
    (directory, command_log)
}

fn engine_path(directory: &Path) -> PathBuf {
    directory.join("stockfish-analysis-test")
}

fn request() -> AnalysisSettingsRequest {
    AnalysisSettingsRequest {
        move_time_ms: 800,
        depth: Some(18),
        nodes: Some(250_000),
        multi_pv: 3,
        threads: 2,
        hash_mb: 128,
    }
}

#[test]
fn parses_complete_cp_mate_wdl_and_pv_info_lines() {
    let cp = parse_analysis_info("info depth 18 seldepth 27 multipv 2 score cp -34 upperbound wdl 12 860 128 nodes 44000 nps 550000 hashfull 72 tbhits 3 time 80 pv d2d4 d7d5 c2c4").expect("cp info");
    assert_eq!(cp.multi_pv, 2);
    assert_eq!(cp.score.kind, "cp");
    assert_eq!(cp.score.value, -34);
    assert_eq!(cp.score.bound.as_deref(), Some("upper"));
    assert_eq!(cp.wdl, Some([12, 860, 128]));
    assert_eq!(cp.hashfull, Some(72));
    assert_eq!(cp.pv, vec!["d2d4", "d7d5", "c2c4"]);

    let mate = parse_analysis_info(
        "info depth 22 multipv 1 score mate 3 lowerbound nodes 900 pv h5f7 e8f7 f3e5",
    )
    .expect("mate info");
    assert_eq!(mate.score.kind, "mate");
    assert_eq!(mate.score.value, 3);
    assert_eq!(mate.score.bound.as_deref(), Some("lower"));
    assert!(parse_analysis_info("info depth 18 score cp 12 pv e2e9").is_err());
}

#[test]
fn builds_full_strength_bounded_analysis_commands() {
    let settings = resolve_analysis_settings(request()).expect("valid analysis settings");
    assert_eq!(
        analysis_option_commands(&settings),
        vec![
            "setoption name Threads value 2",
            "setoption name Hash value 128",
            "setoption name MultiPV value 3",
            "setoption name Skill Level value 20",
            "setoption name UCI_LimitStrength value false",
            "setoption name UCI_ShowWDL value true",
        ]
    );
    assert_eq!(
        analysis_go_command(&settings),
        "go movetime 800 depth 18 nodes 250000"
    );

    let invalid = AnalysisSettingsRequest {
        multi_pv: 0,
        ..request()
    };
    assert!(resolve_analysis_settings(invalid).is_err());

    let invalid_high = AnalysisSettingsRequest {
        move_time_ms: 10_001,
        depth: Some(41),
        nodes: Some(100_000_001),
        multi_pv: 6,
        threads: 33,
        hash_mb: 4097,
    };
    assert!(resolve_analysis_settings(invalid_high).is_err());
}

#[test]
fn collects_the_latest_line_for_each_multipv_index() {
    let directory = fake_engine(
        r#"
while IFS= read -r line; do
  case "$line" in
    uci) echo "id name Analysis Fixture"; echo "uciok" ;;
    isready) echo "readyok" ;;
    go*)
      echo "info depth 10 seldepth 14 multipv 1 score cp 20 wdl 80 850 70 nodes 1000 nps 100000 hashfull 4 tbhits 0 time 10 pv e2e4 e7e5"
      echo "info depth 10 seldepth 13 multipv 2 score cp 12 wdl 60 870 70 nodes 1100 nps 110000 hashfull 4 tbhits 0 time 10 pv d2d4 d7d5"
      echo "info depth 12 seldepth 18 multipv 1 score cp 31 wdl 100 840 60 nodes 2500 nps 200000 hashfull 9 tbhits 0 time 20 pv g1f3 d7d5"
      echo "info depth 12 seldepth 17 multipv 2 score mate 6 wdl 990 10 0 nodes 2600 nps 205000 hashfull 9 tbhits 0 time 20 pv e2e4 e7e5"
      echo "info depth 14 seldepth 20 multipv 1 score cp 35 upperbound wdl 110 835 55 nodes 3200 nps 210000 hashfull 12 tbhits 0 time 24 pv g1f3 d7d5"
      echo "bestmove g1f3 ponder d7d5"
      ;;
    quit) exit 0 ;;
  esac
done
"#,
    );
    let mut engine = EngineSupervisor::new(engine_path(directory.path()));
    engine.initialize(Duration::from_secs(3)).unwrap();
    let outcome = engine
        .analyze(
            START_FEN,
            &resolve_analysis_settings(AnalysisSettingsRequest {
                multi_pv: 2,
                ..request()
            })
            .unwrap(),
            Duration::from_secs(3),
            || false,
        )
        .expect("analysis result");

    assert_eq!(outcome.best_move.as_deref(), Some("g1f3"));
    assert_eq!(outcome.lines.len(), 2);
    assert_eq!(outcome.lines[0].depth, 12);
    assert_eq!(outcome.lines[0].score.value, 31);
    assert_eq!(outcome.lines[0].score.bound, None);
    assert_eq!(outcome.lines[1].score.kind, "mate");
}

#[test]
fn reuses_acknowledged_options_but_fences_each_analysis_request() {
    let (directory, command_log) = fake_engine_with_command_log(
        r#"
while IFS= read -r line; do
  echo "$line" >> "$COMMAND_LOG"
  case "$line" in
    uci) echo "id name Cached Analysis Fixture"; echo "uciok" ;;
    isready) echo "readyok" ;;
    go*) echo "bestmove e2e4" ;;
    quit) exit 0 ;;
  esac
done
"#,
    );
    let mut engine = EngineSupervisor::new(engine_path(directory.path()));
    let cancelled = AtomicBool::new(false);
    let settings = resolve_analysis_settings(request()).expect("settings");
    let mut go_only_change = settings.clone();
    go_only_change.move_time_ms = 500;
    let mut option_change = go_only_change.clone();
    option_change.multi_pv = 2;

    engine
        .analyze(START_FEN, &settings, Duration::from_secs(3), || {
            cancelled.load(Ordering::Acquire)
        })
        .expect("first analysis");
    engine
        .analyze(START_FEN, &go_only_change, Duration::from_secs(3), || {
            cancelled.load(Ordering::Acquire)
        })
        .expect("go-only change analysis");
    engine
        .analyze(START_FEN, &option_change, Duration::from_secs(3), || {
            cancelled.load(Ordering::Acquire)
        })
        .expect("option change analysis");

    let commands = fs::read_to_string(command_log).expect("read command log");
    let lines: Vec<_> = commands.lines().collect();
    assert_eq!(
        lines
            .iter()
            .filter(|line| line.starts_with("setoption name "))
            .count(),
        12,
        "one six-command option block per effective option vector"
    );
    assert_eq!(
        lines
            .iter()
            .filter(|line| **line == "setoption name MultiPV value 3")
            .count(),
        1
    );
    assert_eq!(
        lines
            .iter()
            .filter(|line| **line == "setoption name MultiPV value 2")
            .count(),
        1
    );
    assert_eq!(lines.iter().filter(|line| **line == "isready").count(), 4);
    assert_eq!(
        lines
            .iter()
            .filter(|line| line.starts_with("go movetime "))
            .copied()
            .collect::<Vec<_>>(),
        vec![
            "go movetime 800 depth 18 nodes 250000",
            "go movetime 500 depth 18 nodes 250000",
            "go movetime 500 depth 18 nodes 250000",
        ]
    );
}

#[test]
fn cancels_an_analysis_request_without_waiting_for_timeout() {
    let (directory, command_log) = fake_engine_with_command_log(
        r#"
while IFS= read -r line; do
  echo "$line" >> "$COMMAND_LOG"
  case "$line" in
    uci) echo "id name Cancellation Fixture"; echo "uciok" ;;
    isready) echo "readyok" ;;
    go*) sleep 5 ;;
    quit) exit 0 ;;
  esac
done
"#,
    );
    let mut engine = EngineSupervisor::new(engine_path(directory.path()));
    engine.initialize(Duration::from_secs(3)).unwrap();
    let cancelled = AtomicBool::new(true);
    let error = engine
        .analyze(
            START_FEN,
            &resolve_analysis_settings(request()).unwrap(),
            Duration::from_secs(3),
            || cancelled.load(Ordering::Acquire),
        )
        .expect_err("cancelled analysis");
    assert!(matches!(error, EngineError::Cancelled));
    let commands = fs::read_to_string(command_log).expect("read command log");
    assert!(
        !commands.lines().any(|line| line.starts_with("go ")),
        "a pre-cancelled analysis must not start a Stockfish search",
    );
}
