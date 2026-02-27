mod db;
mod profiler;

use db::ConnectionConfig;
use profiler::{ProfilerCommand, spawn_profiler_task};
use tauri::Manager;
use tokio::sync::{mpsc, oneshot};

struct AppState {
    tx: mpsc::Sender<ProfilerCommand>,
}

#[tauri::command]
async fn connect_to_server(
    state: tauri::State<'_, AppState>,
    config: ConnectionConfig,
) -> Result<(), String> {
    let (reply_tx, reply_rx) = oneshot::channel();
    state
        .tx
        .send(ProfilerCommand::Connect {
            config,
            reply: reply_tx,
        })
        .await
        .map_err(|e| format!("Internal error: {e}"))?;

    reply_rx
        .await
        .map_err(|e| format!("Internal error: {e}"))?
}

#[tauri::command]
async fn disconnect_from_server(
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let (reply_tx, reply_rx) = oneshot::channel();
    state
        .tx
        .send(ProfilerCommand::Disconnect { reply: reply_tx })
        .await
        .map_err(|e| format!("Internal error: {e}"))?;

    reply_rx
        .await
        .map_err(|e| format!("Internal error: {e}"))?
}

#[tauri::command]
async fn start_capture(
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let (reply_tx, reply_rx) = oneshot::channel();
    state
        .tx
        .send(ProfilerCommand::StartCapture { reply: reply_tx })
        .await
        .map_err(|e| format!("Internal error: {e}"))?;

    reply_rx
        .await
        .map_err(|e| format!("Internal error: {e}"))?
}

#[tauri::command]
async fn stop_capture(
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let (reply_tx, reply_rx) = oneshot::channel();
    state
        .tx
        .send(ProfilerCommand::StopCapture { reply: reply_tx })
        .await
        .map_err(|e| format!("Internal error: {e}"))?;

    reply_rx
        .await
        .map_err(|e| format!("Internal error: {e}"))?
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let tx = spawn_profiler_task(app.handle().clone());
            app.manage(AppState { tx });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            connect_to_server,
            disconnect_from_server,
            start_capture,
            stop_capture,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
