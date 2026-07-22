#![cfg(unix)]

use knightclub_lib::stockfish::{
    EngineError, EngineSupervisor, SearchSettingsRequest, discover_stockfish, go_command,
    parse_bestmove, probe_stockfish, resolve_search_settings, strength_preset, uci_option_commands,
    validate_fen,
};
use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::AtomicU64;
use std::time::{Duration, Instant};

const START_FEN: &str = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

fn fake_engine(script_body: &str) -> tempfile::TempDir {
    let directory = tempfile::tempdir().expect("temporary engine directory");
    let path = directory.path().join("stockfish-test");
    let script = format!("#!/bin/sh\n{script_body}\n");
    fs::write(&path, script).expect("write fake engine");
    let mut permissions = fs::metadata(&path).expect("engine metadata").permissions();
    permissions.set_mode(0o755);
    fs::set_permissions(path, permissions).expect("mark fake engine executable");
    directory
}

fn engine_path(directory: &Path) -> PathBuf {
    directory.join("stockfish-test")
}

fn process_is_running(pid: &str) -> bool {
    Command::new("kill")
        .args(["-0", pid])
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

fn read_fixture_pid(path: &Path) -> String {
    // Under a parallel cargo test run the shell fixture can be scheduled just
    // after the deliberately short failed-handshake timeout. Poll briefly so
    // this lifecycle assertion tests supervisor cleanup rather than scheduler
    // timing.
    let deadline = Instant::now() + Duration::from_secs(1);
    loop {
        if let Ok(contents) = fs::read_to_string(path) {
            if let Some(pid) = contents.lines().next().filter(|pid| !pid.is_empty()) {
                return pid.to_owned();
            }
        }
        if Instant::now() >= deadline {
            panic!("first fixture pid at {} did not appear", path.display());
        }
        std::thread::sleep(Duration::from_millis(10));
    }
}

#[test]
fn parses_bestmove_and_optional_ponder() {
    let parsed = parse_bestmove("bestmove e7e8q ponder a2a1n").expect("bestmove line");
    assert_eq!(parsed.best_move.as_deref(), Some("e7e8q"));
    assert_eq!(parsed.ponder.as_deref(), Some("a2a1n"));

    let none = parse_bestmove("bestmove (none)").expect("terminal bestmove line");
    assert_eq!(none.best_move, None);
}

#[test]
fn rejects_fen_with_command_injection_or_invalid_shape() {
    assert!(validate_fen(START_FEN).is_ok());
    assert!(validate_fen("8/8/8/8/8/8/8/8 w - - 0 1\nquit").is_err());
    assert!(validate_fen("not a fen").is_err());
}

#[test]
fn maps_levels_to_multi_dimensional_strength_presets() {
    let easy = strength_preset("easy").expect("easy preset");
    let balanced = strength_preset("balanced").expect("balanced preset");
    let strong = strength_preset("strong").expect("strong preset");

    assert!(easy.elo < balanced.elo && balanced.elo < strong.elo);
    assert!(easy.move_time_ms < balanced.move_time_ms);
    assert!(balanced.move_time_ms < strong.move_time_ms);
    assert!(easy.skill_level < strong.skill_level);
    assert!(easy.limit_strength && balanced.limit_strength && strong.limit_strength);
    assert_eq!(easy.threads, 1);
    assert_eq!(balanced.threads, 1);
    assert_eq!(strong.threads, 1);
    assert_eq!(easy.nodes, Some(10_000));
    assert_eq!(balanced.nodes, Some(30_000));
    assert_eq!(strong.nodes, Some(70_000));
}

#[test]
fn validates_advanced_settings_and_builds_bounded_uci_commands() {
    let request = SearchSettingsRequest {
        profile: "custom".into(),
        elo: 2050,
        move_time_ms: 850,
        skill_level: 11,
        limit_strength: false,
        threads: 4,
        hash_mb: 256,
        multi_pv: 3,
        depth: Some(18),
        nodes: Some(250_000),
    };
    let settings = resolve_search_settings("balanced", Some(request)).expect("valid settings");
    assert_eq!(
        uci_option_commands(&settings),
        vec![
            "setoption name Threads value 4",
            "setoption name Hash value 256",
            "setoption name MultiPV value 3",
            "setoption name Skill Level value 11",
            "setoption name UCI_LimitStrength value false",
            "setoption name UCI_Elo value 2050",
        ]
    );
    assert_eq!(
        go_command(&settings),
        "go movetime 850 depth 18 nodes 250000"
    );

    let invalid = SearchSettingsRequest {
        threads: 0,
        ..settings.into()
    };
    assert!(resolve_search_settings("balanced", Some(invalid)).is_err());
}

#[test]
fn explicit_executable_wins_discovery_and_must_be_executable() {
    let directory = fake_engine("exit 0");
    let explicit = engine_path(directory.path());
    let discovered = discover_stockfish(Some(explicit.clone()), None, None, &[])
        .expect("explicit engine should be discovered");
    assert_eq!(discovered, explicit);

    let non_executable = directory.path().join("not-executable");
    fs::write(&non_executable, "not executable").expect("write fixture");
    assert!(discover_stockfish(Some(non_executable), None, None, &[]).is_err());
}

#[test]
fn initializes_uci_and_returns_a_best_move() {
    let directory = fake_engine(
        r#"
while IFS= read -r line; do
  case "$line" in
    uci)
      echo "id name Deterministic Stockfish Fixture"
      echo "id author KnightClub tests"
      echo "uciok"
      ;;
    isready)
      echo "readyok"
      ;;
    go*)
      echo "info depth 8 nodes 1200 nps 24000"
      echo "bestmove e7e5 ponder g1f3"
      ;;
    quit)
      exit 0
      ;;
  esac
done
"#,
    );

    let mut engine = EngineSupervisor::new(engine_path(directory.path()));
    let identity = engine
        .initialize(Duration::from_secs(3))
        .expect("UCI initialization");
    assert_eq!(identity.name, "Deterministic Stockfish Fixture");

    let cancelled_through = AtomicU64::new(0);
    let result = engine
        .best_move(
            START_FEN,
            &strength_preset("balanced").expect("preset"),
            Duration::from_secs(3),
            7,
            &cancelled_through,
        )
        .expect("best move response");

    assert_eq!(result.best_move.as_deref(), Some("e7e5"));
    assert_eq!(result.ponder.as_deref(), Some("g1f3"));
    assert_eq!(result.depth, Some(8));
    assert_eq!(result.nodes, Some(1200));
}

#[test]
fn probes_an_explicit_engine_identity_and_path() {
    let directory = fake_engine(
        r#"
while IFS= read -r line; do
  case "$line" in
    uci) echo "id name Probe Fixture"; echo "uciok" ;;
    isready) echo "readyok" ;;
    quit) exit 0 ;;
  esac
done
"#,
    );
    let path = engine_path(directory.path());
    let result = probe_stockfish(Some(path.clone()), Duration::from_secs(3)).expect("probe");
    assert_eq!(result.engine_name, "Probe Fixture");
    assert_eq!(result.engine_path, path.display().to_string());
}

#[test]
fn reports_timeout_without_hanging_the_test_process() {
    let directory = fake_engine(
        r#"
while IFS= read -r line; do
  case "$line" in
    uci) echo "id name Slow Fixture"; echo "uciok" ;;
    isready) echo "readyok" ;;
    go*) : ;;
    stop) : ;;
    quit) exit 0 ;;
  esac
done
"#,
    );
    let mut engine = EngineSupervisor::new(engine_path(directory.path()));
    engine
        .initialize(Duration::from_secs(3))
        .expect("UCI initialization");
    let cancelled_through = AtomicU64::new(0);
    let error = engine
        .best_move(
            START_FEN,
            &strength_preset("easy").expect("preset"),
            Duration::from_millis(40),
            3,
            &cancelled_through,
        )
        .expect_err("search should time out");
    assert!(matches!(error, EngineError::Timeout(_)));
}

#[test]
fn tears_down_a_stuck_handshake_before_retrying_the_same_engine() {
    let temp_prefix = std::env::temp_dir().join(format!(
        "knightclub-stuck-handshake-{}",
        std::process::id(),
    ));
    let pid_path = temp_prefix.with_extension("pid");
    let state_path = temp_prefix.with_extension("state");
    let _ = fs::remove_file(&pid_path);
    let _ = fs::remove_file(&state_path);
    let script_body = format!(
        r#"
pid_file="{}"
state="{}"
if [ -f "$state" ]; then mode=ready; else : > "$state"; mode=stuck; fi
echo "$$" > "$pid_file"
while IFS= read -r line; do
  case "$line" in
    uci)
      if [ "$mode" = ready ]; then
        echo "id name Recovered Fixture"
        echo "uciok"
      fi
      ;;
    isready) echo "readyok" ;;
    quit) exit 0 ;;
  esac
done
"#,
        pid_path.display(),
        state_path.display(),
    );
    let directory = fake_engine(&script_body);
    let path = engine_path(directory.path());
    let mut engine = EngineSupervisor::new(path.clone());

    let error = engine
        .initialize(Duration::from_secs(1))
        .expect_err("first UCI handshake should time out");
    assert!(matches!(error, EngineError::Timeout(_)));

    let first_pid = read_fixture_pid(&pid_path);
    assert!(
        !process_is_running(&first_pid),
        "a failed UCI handshake must not leave its child process running"
    );

    let identity = engine
        .initialize(Duration::from_secs(1))
        .expect("a clean retry should start a new supervisor process");
    assert_eq!(identity.name, "Recovered Fixture");
    let _ = fs::remove_file(pid_path);
    let _ = fs::remove_file(state_path);
}
