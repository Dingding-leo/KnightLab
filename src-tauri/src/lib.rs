pub mod database;
pub mod stockfish;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .on_page_load(|webview, payload| {
            if payload.event() != tauri::webview::PageLoadEvent::Finished {
                return;
            }
            // Older builds registered the PWA worker on tauri://localhost. Remove that
            // browser-only cache once so an upgraded desktop app cannot serve stale UI.
            let _ = webview.eval(
                r#"(async () => {
                    if (!('serviceWorker' in navigator) || sessionStorage.getItem('knightclub-native-cache-cleaned')) return;
                    const registrations = await navigator.serviceWorker.getRegistrations();
                    const cacheKeys = 'caches' in window ? await caches.keys() : [];
                    if (!registrations.length && !cacheKeys.length) {
                        sessionStorage.setItem('knightclub-native-cache-cleaned', '1');
                        return;
                    }
                    sessionStorage.setItem('knightclub-native-cache-cleaned', '1');
                    await Promise.all(registrations.map((registration) => registration.unregister()));
                    await Promise.all(cacheKeys.map((key) => caches.delete(key)));
                    location.replace(`${location.pathname}?native-cache=${Date.now()}`);
                })().catch(() => undefined);"#,
            );
        })
        .plugin(tauri_plugin_dialog::init())
        .manage(stockfish::StockfishState::default())
        .manage(stockfish::AnalysisState::default())
        .invoke_handler(tauri::generate_handler![
            database::database_snapshot,
            database::database_import_legacy,
            database::database_save_active_session,
            database::database_save_preferences,
            database::database_save_game,
            database::database_save_review,
            database::database_load_review,
            database::database_save_retry_item,
            database::database_load_retry_item,
            database::database_list_retry_items,
            database::database_delete_retry_item,
            database::database_list_tactics_state,
            database::database_merge_tactics_state,
            database::database_record_tactics_attempt,
            database::database_clear_active_session,
            database::database_clear_games,
            stockfish::stockfish_analyze,
            stockfish::stockfish_analysis_stop,
            stockfish::stockfish_best_move,
            stockfish::stockfish_probe,
            stockfish::stockfish_stop
        ])
        .setup(|app| {
            let database_path = app.path().app_data_dir()?.join("knightclub.sqlite3");
            let database = database::DatabaseRepository::open(&database_path)?;
            app.manage(database::DatabaseState::from_opened(database));
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
