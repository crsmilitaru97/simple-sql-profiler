use serde::Serialize;
use tokio::sync::{mpsc, oneshot};

use crate::db::{self, ConnectionConfig, SqlClient};

const XE_CREATE_SESSION: &str = "
IF EXISTS (SELECT 1 FROM sys.server_event_sessions WHERE name = 'SimpleSQLProfiler')
    DROP EVENT SESSION [SimpleSQLProfiler] ON SERVER;

CREATE EVENT SESSION [SimpleSQLProfiler] ON SERVER
ADD EVENT sqlserver.rpc_completed(
    ACTION(
        sqlserver.database_name,
        sqlserver.username,
        sqlserver.client_hostname,
        sqlserver.client_app_name,
        sqlserver.session_id
    )
    WHERE (sqlserver.client_app_name <> N'SimpleSQLProfiler')
),
ADD EVENT sqlserver.sql_batch_completed(
    ACTION(
        sqlserver.database_name,
        sqlserver.username,
        sqlserver.client_hostname,
        sqlserver.client_app_name,
        sqlserver.session_id
    )
    WHERE (sqlserver.client_app_name <> N'SimpleSQLProfiler')
)
ADD TARGET package0.ring_buffer(SET max_memory = 51200)
WITH (
    MAX_DISPATCH_LATENCY = 1 SECONDS,
    TRACK_CAUSALITY = OFF
);

ALTER EVENT SESSION [SimpleSQLProfiler] ON SERVER STATE = START;
";

const XE_DROP_SESSION: &str = "
IF EXISTS (SELECT 1 FROM sys.server_event_sessions WHERE name = 'SimpleSQLProfiler')
    DROP EVENT SESSION [SimpleSQLProfiler] ON SERVER;
";

const XE_POLL_RING_BUFFER: &str = "
SELECT
    event_data.value('(event/@name)[1]', 'varchar(50)') AS event_name,
    event_data.value('(event/@timestamp)[1]', 'varchar(50)') AS timestamp,
    event_data.value('(event/data[@name=\"duration\"]/value)[1]', 'bigint') AS duration_us,
    event_data.value('(event/data[@name=\"cpu_time\"]/value)[1]', 'bigint') AS cpu_time_us,
    event_data.value('(event/data[@name=\"logical_reads\"]/value)[1]', 'bigint') AS logical_reads,
    event_data.value('(event/data[@name=\"physical_reads\"]/value)[1]', 'bigint') AS physical_reads,
    event_data.value('(event/data[@name=\"writes\"]/value)[1]', 'bigint') AS writes,
    event_data.value('(event/data[@name=\"row_count\"]/value)[1]', 'bigint') AS row_count,
    event_data.value('(event/data[@name=\"statement\"]/value)[1]', 'nvarchar(max)') AS statement_text,
    event_data.value('(event/data[@name=\"batch_text\"]/value)[1]', 'nvarchar(max)') AS batch_text,
    event_data.value('(event/action[@name=\"database_name\"]/value)[1]', 'nvarchar(128)') AS database_name,
    event_data.value('(event/action[@name=\"username\"]/value)[1]', 'nvarchar(128)') AS login_name,
    event_data.value('(event/action[@name=\"client_hostname\"]/value)[1]', 'nvarchar(128)') AS host_name,
    event_data.value('(event/action[@name=\"client_app_name\"]/value)[1]', 'nvarchar(128)') AS program_name,
    event_data.value('(event/action[@name=\"session_id\"]/value)[1]', 'int') AS session_id
FROM (
    SELECT CAST(target_data AS XML) AS target_data
    FROM sys.dm_xe_sessions s
    JOIN sys.dm_xe_session_targets t ON s.address = t.event_session_address
    WHERE s.name = 'SimpleSQLProfiler' AND t.target_name = 'ring_buffer'
) AS data
CROSS APPLY target_data.nodes('//RingBufferTarget/event') AS XEventData(event_data)
WHERE event_data.value('(event/@timestamp)[1]', 'varchar(50)') > @P1
ORDER BY event_data.value('(event/@timestamp)[1]', 'varchar(50)') ASC;
";

#[derive(Debug, Clone, Serialize)]
pub struct QueryEvent {
    pub id: String,
    pub session_id: i32,
    pub start_time: String,
    pub event_name: String,
    pub database_name: String,
    pub cpu_time: i32,
    pub elapsed_time: i32,
    pub physical_reads: i64,
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
    let mut last_timestamp = String::from("1970-01-01T00:00:00.0000000");
    let mut interval = tokio::time::interval(std::time::Duration::from_millis(500));
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
                        if let Some(c) = client.as_mut() {
                            let _ = drop_xe_session(c).await;
                        }
                        client = None;
                        capturing = false;
                        last_timestamp = String::from("1970-01-01T00:00:00.000Z");
                        emit_status(&app, false, false, None);
                        let _ = reply.send(Ok(()));
                    }
                    Some(ProfilerCommand::StartCapture { reply }) => {
                        if let Some(c) = client.as_mut() {
                            match create_xe_session(c).await {
                                Ok(()) => {
                                    last_timestamp = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S.0000000").to_string();
                                    capturing = true;
                                    emit_status(&app, true, true, None);
                                    let _ = reply.send(Ok(()));
                                }
                                Err(e) => {
                                    let _ = reply.send(Err(e));
                                }
                            }
                        } else {
                            let _ = reply.send(Err("Not connected".into()));
                        }
                    }
                    Some(ProfilerCommand::StopCapture { reply }) => {
                        if let Some(c) = client.as_mut() {
                            let _ = drop_xe_session(c).await;
                        }
                        capturing = false;
                        emit_status(&app, client.is_some(), false, None);
                        let _ = reply.send(Ok(()));
                    }
                    None => break,
                }
            }

            _ = interval.tick(), if capturing && client.is_some() => {
                let c = client.as_mut().unwrap();
                match poll_ring_buffer(c, &last_timestamp).await {
                    Ok(events) => {
                        let now = chrono::Utc::now().to_rfc3339();
                        for mut event in events {
                            if event.start_time > last_timestamp {
                                last_timestamp = event.start_time.clone();
                            }
                            event.id = uuid::Uuid::new_v4().to_string();
                            event.captured_at = now.clone();
                            event.event_status = "completed".into();
                            let _ = app.emit("query-event", &event);
                        }
                    }
                    Err(e) => {
                        let _ = if let Some(c) = client.as_mut() {
                            drop_xe_session(c).await
                        } else {
                            Ok(())
                        };
                        emit_status(&app, false, false, Some(e));
                        client = None;
                        capturing = false;
                    }
                }
            }
        }
    }
}

async fn create_xe_session(client: &mut SqlClient) -> Result<(), String> {
    client
        .simple_query(XE_CREATE_SESSION)
        .await
        .map_err(|e| format!("Failed to create XE session: {e}"))?
        .into_results()
        .await
        .map_err(|e| format!("Failed to execute XE session DDL: {e}"))?;
    Ok(())
}

async fn drop_xe_session(client: &mut SqlClient) -> Result<(), String> {
    client
        .simple_query(XE_DROP_SESSION)
        .await
        .map_err(|e| format!("Failed to drop XE session: {e}"))?
        .into_results()
        .await
        .map_err(|e| format!("Failed to confirm XE session drop: {e}"))?;
    Ok(())
}

async fn poll_ring_buffer(
    client: &mut SqlClient,
    last_timestamp: &str,
) -> Result<Vec<QueryEvent>, String> {
    use tiberius::Query;

    let mut query = Query::new(XE_POLL_RING_BUFFER);
    query.bind(last_timestamp);

    let stream = query
        .query(client)
        .await
        .map_err(|e| format!("Ring buffer query failed: {e}"))?;

    let rows = stream
        .into_results()
        .await
        .map_err(|e| format!("Failed to read ring buffer results: {e}"))?;

    let mut events = Vec::new();

    if let Some(result_set) = rows.first() {
        for row in result_set {
            let event_name: String = row.get::<&str, _>("event_name").unwrap_or("").to_string();
            let timestamp: String = row.get::<&str, _>("timestamp").unwrap_or("").to_string();

            let duration_us: i64 = row.get::<i64, _>("duration_us").unwrap_or(0);
            let cpu_time_us: i64 = row.get::<i64, _>("cpu_time_us").unwrap_or(0);
            let elapsed_time = (duration_us / 1000) as i32;
            let cpu_time = (cpu_time_us / 1000) as i32;

            let logical_reads: i64 = row.get::<i64, _>("logical_reads").unwrap_or(0);
            let physical_reads: i64 = row.get::<i64, _>("physical_reads").unwrap_or(0);
            let writes: i64 = row.get::<i64, _>("writes").unwrap_or(0);
            let row_count: i64 = row.get::<i64, _>("row_count").unwrap_or(0);

            let statement_text: Option<String> = row.get::<&str, _>("statement_text").map(|s| s.to_string());
            let batch_text: Option<String> = row.get::<&str, _>("batch_text").map(|s| s.to_string());

            let (sql_text, current_statement) = match event_name.as_str() {
                "rpc_completed" => {
                    let stmt = statement_text.unwrap_or_default();
                    (stmt.clone(), stmt)
                }
                _ => {
                    let batch = batch_text.unwrap_or_default();
                    (batch, String::new())
                }
            };

            let database_name: String = row.get::<&str, _>("database_name").unwrap_or("").to_string();
            let login_name: String = row.get::<&str, _>("login_name").unwrap_or("").to_string();
            let host_name: String = row.get::<&str, _>("host_name").unwrap_or("").to_string();
            let program_name: String = row.get::<&str, _>("program_name").unwrap_or("").to_string();
            let session_id: i32 = row.get::<i32, _>("session_id").unwrap_or(0);

            events.push(QueryEvent {
                id: String::new(),
                session_id,
                start_time: timestamp,
                event_name,
                database_name,
                cpu_time,
                elapsed_time,
                physical_reads,
                writes,
                logical_reads,
                row_count,
                sql_text,
                current_statement,
                login_name,
                host_name,
                program_name,
                captured_at: String::new(),
                event_status: String::new(),
            });
        }
    }

    Ok(events)
}
