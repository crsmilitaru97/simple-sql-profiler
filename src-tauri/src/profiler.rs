use std::collections::HashMap;

use serde::Serialize;
use tokio::sync::{mpsc, oneshot};

use crate::db::{self, ConnectionConfig, SqlClient};

const POLL_QUERY: &str = "
SELECT
    r.session_id,
    CONVERT(VARCHAR(30), r.start_time, 126) AS start_time,
    r.status,
    r.command,
    DB_NAME(r.database_id) AS database_name,
    r.wait_type,
    r.wait_time,
    r.cpu_time,
    r.total_elapsed_time,
    r.reads,
    r.writes,
    r.logical_reads,
    r.row_count,
    t.text AS sql_text,
    SUBSTRING(
        t.text,
        (r.statement_start_offset / 2) + 1,
        ((CASE r.statement_end_offset
            WHEN -1 THEN DATALENGTH(t.text)
            ELSE r.statement_end_offset
        END - r.statement_start_offset) / 2) + 1
    ) AS current_statement,
    s.login_name,
    s.host_name,
    s.program_name
FROM sys.dm_exec_requests r
INNER JOIN sys.dm_exec_sessions s ON r.session_id = s.session_id
CROSS APPLY sys.dm_exec_sql_text(r.sql_handle) t
WHERE r.session_id != @@SPID
    AND r.session_id > 50
ORDER BY r.start_time DESC
";

#[derive(Debug, Clone, Serialize)]
pub struct QueryEvent {
    pub id: String,
    pub session_id: i16,
    pub start_time: String,
    pub status: String,
    pub command: String,
    pub database_name: String,
    pub wait_type: Option<String>,
    pub wait_time: i32,
    pub cpu_time: i32,
    pub elapsed_time: i32,
    pub reads: i64,
    pub writes: i64,
    pub logical_reads: i64,
    pub row_count: i64,
    pub sql_text: String,
    pub current_statement: String,
    pub login_name: String,
    pub host_name: String,
    pub program_name: String,
    pub captured_at: String,
    pub event_status: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ProfilerStatus {
    pub connected: bool,
    pub capturing: bool,
    pub error: Option<String>,
}

pub enum ProfilerCommand {
    Connect {
        config: ConnectionConfig,
        reply: oneshot::Sender<Result<(), String>>,
    },
    Disconnect {
        reply: oneshot::Sender<Result<(), String>>,
    },
    StartCapture {
        reply: oneshot::Sender<Result<(), String>>,
    },
    StopCapture {
        reply: oneshot::Sender<Result<(), String>>,
    },
}

/// Unique key for tracking a running query across polls.
type QueryKey = (i16, String); // (session_id, start_time)

pub fn spawn_profiler_task(
    app: tauri::AppHandle,
) -> mpsc::Sender<ProfilerCommand> {
    let (tx, rx) = mpsc::channel::<ProfilerCommand>(32);

    tauri::async_runtime::spawn(profiler_loop(rx, app));

    tx
}

async fn profiler_loop(
    mut rx: mpsc::Receiver<ProfilerCommand>,
    app: tauri::AppHandle,
) {
    use tauri::Emitter;

    let mut client: Option<SqlClient> = None;
    let mut capturing = false;
    let mut seen: HashMap<QueryKey, QueryEvent> = HashMap::new();
    let mut interval = tokio::time::interval(std::time::Duration::from_millis(1000));
    interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

    fn emit_status(app: &tauri::AppHandle, connected: bool, capturing: bool, error: Option<String>) {
        let _ = app.emit(
            "profiler-status",
            ProfilerStatus {
                connected,
                capturing,
                error,
            },
        );
    }

    loop {
        tokio::select! {
            cmd = rx.recv() => {
                match cmd {
                    Some(ProfilerCommand::Connect { config, reply }) => {
                        match db::connect(&config).await {
                            Ok(c) => {
                                client = Some(c);
                                emit_status(&app, true, capturing, None);
                                let _ = reply.send(Ok(()));
                            }
                            Err(e) => {
                                emit_status(&app, false, false, Some(e.clone()));
                                let _ = reply.send(Err(e));
                            }
                        }
                    }
                    Some(ProfilerCommand::Disconnect { reply }) => {
                        client = None;
                        capturing = false;
                        seen.clear();
                        emit_status(&app, false, false, None);
                        let _ = reply.send(Ok(()));
                    }
                    Some(ProfilerCommand::StartCapture { reply }) => {
                        if client.is_some() {
                            capturing = true;
                            seen.clear();
                            emit_status(&app, true, true, None);
                            let _ = reply.send(Ok(()));
                        } else {
                            let _ = reply.send(Err("Not connected".into()));
                        }
                    }
                    Some(ProfilerCommand::StopCapture { reply }) => {
                        capturing = false;
                        emit_status(&app, client.is_some(), false, None);
                        let _ = reply.send(Ok(()));
                    }
                    None => break, // Channel closed
                }
            }

            _ = interval.tick(), if capturing && client.is_some() => {
                let c = client.as_mut().unwrap();
                match poll_queries(c).await {
                    Ok(current_queries) => {
                        let now = chrono::Utc::now().to_rfc3339();
                        let mut current_keys: std::collections::HashSet<QueryKey> =
                            std::collections::HashSet::new();

                        for mut q in current_queries {
                            let key = (q.session_id, q.start_time.clone());
                            current_keys.insert(key.clone());

                            if let Some(existing) = seen.get(&key) {
                                // Update existing — re-use same id
                                q.id = existing.id.clone();
                                q.captured_at = now.clone();
                                q.event_status = "running".into();
                                let _ = app.emit("query-event", &q);
                                seen.insert(key, q);
                            } else {
                                // New query
                                q.id = uuid::Uuid::new_v4().to_string();
                                q.captured_at = now.clone();
                                q.event_status = "running".into();
                                let _ = app.emit("query-event", &q);
                                seen.insert(key, q);
                            }
                        }

                        // Detect completed queries (were seen before, not in current poll)
                        let completed_keys: Vec<QueryKey> = seen
                            .keys()
                            .filter(|k| !current_keys.contains(*k))
                            .cloned()
                            .collect();

                        for key in completed_keys {
                            if let Some(mut q) = seen.remove(&key) {
                                q.event_status = "completed".into();
                                q.captured_at = now.clone();
                                let _ = app.emit("query-event", &q);
                            }
                        }
                    }
                    Err(e) => {
                        // Connection may be broken
                        emit_status(&app, false, false, Some(e));
                        client = None;
                        capturing = false;
                    }
                }
            }
        }
    }
}

async fn poll_queries(client: &mut SqlClient) -> Result<Vec<QueryEvent>, String> {
    let stream = client
        .simple_query(POLL_QUERY)
        .await
        .map_err(|e| format!("Query failed: {e}"))?;

    let rows = stream
        .into_results()
        .await
        .map_err(|e| format!("Failed to read results: {e}"))?;

    let mut events = Vec::new();

    if let Some(result_set) = rows.first() {
        for row in result_set {
            let session_id: i16 = row.get::<i16, _>("session_id").unwrap_or(0);
            let start_time: String = row
                .get::<&str, _>("start_time")
                .unwrap_or("")
                .to_string();
            let status: String = row.get::<&str, _>("status").unwrap_or("").to_string();
            let command: String = row.get::<&str, _>("command").unwrap_or("").to_string();
            let database_name: String = row
                .get::<&str, _>("database_name")
                .unwrap_or("")
                .to_string();
            let wait_type: Option<String> =
                row.get::<&str, _>("wait_type").map(|s| s.to_string());
            let wait_time: i32 = row.get::<i32, _>("wait_time").unwrap_or(0);
            let cpu_time: i32 = row.get::<i32, _>("cpu_time").unwrap_or(0);
            let elapsed_time: i32 = row.get::<i32, _>("total_elapsed_time").unwrap_or(0);
            let reads: i64 = row.get::<i64, _>("reads").unwrap_or(0);
            let writes: i64 = row.get::<i64, _>("writes").unwrap_or(0);
            let logical_reads: i64 = row.get::<i64, _>("logical_reads").unwrap_or(0);
            let row_count: i64 = row.get::<i64, _>("row_count").unwrap_or(0);
            let sql_text: String = row
                .get::<&str, _>("sql_text")
                .unwrap_or("")
                .to_string();
            let current_statement: String = row
                .get::<&str, _>("current_statement")
                .unwrap_or("")
                .to_string();
            let login_name: String = row
                .get::<&str, _>("login_name")
                .unwrap_or("")
                .to_string();
            let host_name: String = row
                .get::<&str, _>("host_name")
                .unwrap_or("")
                .to_string();
            let program_name: String = row
                .get::<&str, _>("program_name")
                .unwrap_or("")
                .to_string();

            events.push(QueryEvent {
                id: String::new(), // Assigned by caller
                session_id,
                start_time,
                status,
                command,
                database_name,
                wait_type,
                wait_time,
                cpu_time,
                elapsed_time,
                reads,
                writes,
                logical_reads,
                row_count,
                sql_text,
                current_statement,
                login_name,
                host_name,
                program_name,
                captured_at: String::new(), // Assigned by caller
                event_status: String::new(), // Assigned by caller
            });
        }
    }

    Ok(events)
}
