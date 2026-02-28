use std::collections::HashSet;
use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};

use serde::Serialize;
use tokio::sync::{mpsc, oneshot};

use crate::db::{self, ConnectionConfig, SqlClient};

const MIN_TIMESTAMP: &str = "1900-01-01T00:00:00.000";

const TRACE_CREATE_AND_START: &str = "
DECLARE @trace_id int;
DECLARE @trace_options int = 0;
DECLARE @max_file_mb bigint = 1024;
DECLARE @on bit = 1;

DECLARE @errorlog nvarchar(260) = CONVERT(nvarchar(260), SERVERPROPERTY('ErrorLogFileName'));
DECLARE @directory nvarchar(260) = LEFT(@errorlog, LEN(@errorlog) - CHARINDEX('\\', REVERSE(@errorlog)) + 1);
DECLARE @trace_file nvarchar(260) =
    @directory + N'SimpleSQLProfiler_' + REPLACE(CONVERT(nvarchar(36), NEWID()), N'-', N'') + N'.trc';

EXEC sp_trace_create @trace_id OUTPUT, @trace_options, @trace_file, @max_file_mb, NULL;

DECLARE @events TABLE(id int);
INSERT INTO @events(id)
VALUES
    ((SELECT trace_event_id FROM sys.trace_events WHERE name = N'RPC:Completed')),
    ((SELECT trace_event_id FROM sys.trace_events WHERE name = N'SQL:BatchCompleted'));

IF EXISTS (SELECT 1 FROM @events WHERE id IS NULL)
BEGIN
    RAISERROR('Required SQL Trace events are unavailable on this server.', 16, 1);
    RETURN;
END

DECLARE @columns TABLE(id int);
INSERT INTO @columns(id)
VALUES
    (1),  -- TextData
    (8),  -- HostName
    (10), -- ApplicationName
    (11), -- LoginName
    (12), -- SPID
    (13), -- Duration
    (14), -- StartTime
    (15), -- EndTime
    (16), -- Reads
    (17), -- Writes
    (18), -- CPU
    (35), -- DatabaseName
    (48), -- RowCounts
    (51); -- EventSequence

DECLARE @event_id int;
DECLARE @column_id int;
DECLARE event_col_cursor CURSOR LOCAL FAST_FORWARD FOR
    SELECT e.id, c.id
    FROM @events e
    CROSS JOIN @columns c;

OPEN event_col_cursor;
FETCH NEXT FROM event_col_cursor INTO @event_id, @column_id;
WHILE @@FETCH_STATUS = 0
BEGIN
    EXEC sp_trace_setevent @trace_id, @event_id, @column_id, @on;
    FETCH NEXT FROM event_col_cursor INTO @event_id, @column_id;
END
CLOSE event_col_cursor;
DEALLOCATE event_col_cursor;

-- Exclude this app itself
EXEC sp_trace_setfilter @trace_id, 10, 0, 7, N'%SimpleSQLProfiler%';

EXEC sp_trace_setstatus @trace_id, 1;

SELECT @trace_id AS trace_id, t.path AS trace_file
FROM sys.traces t
WHERE t.id = @trace_id;
";

const TRACE_STOP_AND_CLOSE: &str = "
IF EXISTS (SELECT 1 FROM sys.traces WHERE id = @P1)
BEGIN
    BEGIN TRY
        EXEC sp_trace_setstatus @P1, 0;
    END TRY
    BEGIN CATCH
    END CATCH;

    BEGIN TRY
        EXEC sp_trace_setstatus @P1, 2;
    END TRY
    BEGIN CATCH
    END CATCH;
END
";

const TRACE_POLL_EVENTS: &str = "
SELECT TOP (5000)
    CAST(EventClass AS int) AS event_class,
    CONVERT(varchar(27), StartTime, 126) AS start_time,
    CAST(ISNULL(EventSequence, 0) AS bigint) AS event_sequence,
    CAST(ISNULL(Duration, 0) AS bigint) AS duration_us,
    CAST(ISNULL(CPU, 0) AS bigint) AS cpu_ms,
    CAST(ISNULL(Reads, 0) AS bigint) AS reads,
    CAST(ISNULL(Writes, 0) AS bigint) AS writes,
    CAST(ISNULL(RowCounts, 0) AS bigint) AS row_count,
    CAST(ISNULL(TextData, N'') AS nvarchar(max)) AS text_data,
    CAST(ISNULL(DatabaseName, N'') AS nvarchar(128)) AS database_name,
    CAST(ISNULL(LoginName, N'') AS nvarchar(128)) AS login_name,
    CAST(ISNULL(HostName, N'') AS nvarchar(128)) AS host_name,
    CAST(ISNULL(ApplicationName, N'') AS nvarchar(128)) AS program_name,
    CAST(ISNULL(SPID, 0) AS int) AS session_id
FROM sys.fn_trace_gettable(@P1, 1)
WHERE EventClass IN (10, 12)
  AND ISNULL(ApplicationName, N'') NOT LIKE N'%SimpleSQLProfiler%'
  AND (
      CONVERT(varchar(27), StartTime, 126) > @P2
      OR (
          CONVERT(varchar(27), StartTime, 126) = @P2
          AND CAST(ISNULL(EventSequence, 0) AS bigint) > @P3
      )
  )
ORDER BY
    CONVERT(varchar(27), StartTime, 126) ASC,
    CAST(ISNULL(EventSequence, 0) AS bigint) ASC;
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

#[derive(Debug, Clone)]
struct PolledEvent {
    event: QueryEvent,
    event_sequence: i64,
}

#[derive(Debug, Clone)]
struct ActiveTrace {
    trace_id: i32,
    trace_file: String,
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

    let mut control_client: Option<SqlClient> = None;
    let mut active_config: Option<ConnectionConfig> = None;
    let mut active_trace: Option<ActiveTrace> = None;
    let mut polling_task: Option<tauri::async_runtime::JoinHandle<()>> = None;
    let mut poll_run_flag: Option<Arc<AtomicBool>> = None;

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

    fn abort_polling_task(polling_task: &mut Option<tauri::async_runtime::JoinHandle<()>>) {
        if let Some(task) = polling_task.take() {
            task.abort();
        }
    }

    fn stop_polling_now(
        poll_run_flag: &mut Option<Arc<AtomicBool>>,
        polling_task: &mut Option<tauri::async_runtime::JoinHandle<()>>,
    ) {
        if let Some(flag) = poll_run_flag.take() {
            flag.store(false, Ordering::Release);
        }
        abort_polling_task(polling_task);
    }

    while let Some(cmd) = rx.recv().await {
        match cmd {
            ProfilerCommand::Connect { config, reply } => {
                stop_polling_now(&mut poll_run_flag, &mut polling_task);
                if let (Some(c), Some(trace)) = (control_client.as_mut(), active_trace.as_ref()) {
                    let _ = stop_and_close_trace(c, trace.trace_id).await;
                }
                active_trace = None;

                match db::connect(&config).await {
                    Ok(c) => {
                        control_client = Some(c);
                        active_config = Some(config);
                        emit_status(&app, true, false, None);
                        let _ = reply.send(Ok(()));
                    }
                    Err(e) => {
                        control_client = None;
                        active_config = None;
                        emit_status(&app, false, false, Some(e.clone()));
                        let _ = reply.send(Err(e));
                    }
                }
            }
            ProfilerCommand::Disconnect { reply } => {
                stop_polling_now(&mut poll_run_flag, &mut polling_task);

                if let (Some(c), Some(trace)) = (control_client.as_mut(), active_trace.as_ref()) {
                    let _ = stop_and_close_trace(c, trace.trace_id).await;
                }

                control_client = None;
                active_config = None;
                active_trace = None;
                emit_status(&app, false, false, None);
                let _ = reply.send(Ok(()));
            }
            ProfilerCommand::StartCapture { reply } => {
                if control_client.is_none() {
                    let _ = reply.send(Err("Not connected".into()));
                    continue;
                }

                stop_polling_now(&mut poll_run_flag, &mut polling_task);
                if let (Some(control), Some(trace)) = (control_client.as_mut(), active_trace.as_ref()) {
                    let _ = stop_and_close_trace(control, trace.trace_id).await;
                    active_trace = None;
                }

                let trace = match control_client.as_mut() {
                    Some(control) => match start_trace(control).await {
                        Ok(trace) => trace,
                        Err(e) => {
                            let _ = reply.send(Err(e));
                            continue;
                        }
                    },
                    None => {
                        let _ = reply.send(Err("Not connected".into()));
                        continue;
                    }
                };
                active_trace = Some(trace.clone());

                let Some(cfg) = active_config.clone() else {
                    let _ = reply.send(Err("Missing connection configuration".into()));
                    continue;
                };

                match db::connect(&cfg).await {
                    Ok(poll_client) => {
                        let run_flag = Arc::new(AtomicBool::new(true));
                        poll_run_flag = Some(run_flag.clone());
                        polling_task = Some(spawn_polling_task(
                            app.clone(),
                            poll_client,
                            trace.trace_file.clone(),
                            run_flag,
                        ));
                        emit_status(&app, true, true, None);
                        let _ = reply.send(Ok(()));
                    }
                    Err(e) => {
                        if let (Some(control), Some(t)) = (control_client.as_mut(), active_trace.as_ref()) {
                            let _ = stop_and_close_trace(control, t.trace_id).await;
                        }
                        active_trace = None;
                        let message = format!("Failed to start polling stream: {e}");
                        emit_status(&app, true, false, Some(message.clone()));
                        let _ = reply.send(Err(message));
                    }
                }
            }
            ProfilerCommand::StopCapture { reply } => {
                stop_polling_now(&mut poll_run_flag, &mut polling_task);
                emit_status(&app, control_client.is_some(), false, None);
                let _ = reply.send(Ok(()));

                if let (Some(c), Some(trace)) = (control_client.as_mut(), active_trace.as_ref()) {
                    let _ = stop_and_close_trace(c, trace.trace_id).await;
                }
                active_trace = None;
            }
        }
    }

    stop_polling_now(&mut poll_run_flag, &mut polling_task);
}

fn spawn_polling_task(
    app: tauri::AppHandle,
    mut poll_client: SqlClient,
    trace_file: String,
    run_flag: Arc<AtomicBool>,
) -> tauri::async_runtime::JoinHandle<()> {
    tauri::async_runtime::spawn(async move {
        use tauri::Emitter;

        let mut last_timestamp = String::from(MIN_TIMESTAMP);
        let mut last_event_sequence = -1_i64;
        let mut seen_without_sequence_at_timestamp = HashSet::<String>::new();
        let mut interval = tokio::time::interval(std::time::Duration::from_millis(300));
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

        loop {
            if !run_flag.load(Ordering::Acquire) {
                break;
            }
            interval.tick().await;
            if !run_flag.load(Ordering::Acquire) {
                break;
            }

            let events =
                match poll_trace_events(&mut poll_client, &trace_file, &last_timestamp, last_event_sequence).await {
                    Ok(events) => events,
                    Err(e) => {
                        if is_transient_trace_file_error(&e) {
                            continue;
                        }
                        let _ = app.emit(
                            "profiler-status",
                            ProfilerStatus {
                                connected: true,
                                capturing: false,
                                error: Some(e),
                            },
                        );
                        break;
                    }
                };

            if events.is_empty() {
                continue;
            }

            let now = chrono::Utc::now().to_rfc3339();
            for mut polled in events {
                if !run_flag.load(Ordering::Acquire) {
                    break;
                }
                let ts = polled.event.start_time.clone();
                let seq = polled.event_sequence;
                if ts < last_timestamp {
                    continue;
                }

                if ts > last_timestamp {
                    last_timestamp = ts.clone();
                    last_event_sequence = -1;
                    seen_without_sequence_at_timestamp.clear();
                }

                if seq > 0 {
                    if seq <= last_event_sequence {
                        continue;
                    }
                    last_event_sequence = seq;
                } else {
                    let fallback_key = format!(
                        "{}|{}|{}|{}|{}|{}|{}|{}|{}|{}",
                        polled.event.event_name,
                        polled.event.session_id,
                        polled.event.elapsed_time,
                        polled.event.cpu_time,
                        polled.event.logical_reads,
                        polled.event.physical_reads,
                        polled.event.writes,
                        polled.event.row_count,
                        polled.event.database_name,
                        polled.event.sql_text
                    );
                    if !seen_without_sequence_at_timestamp.insert(fallback_key) {
                        continue;
                    }
                    if last_event_sequence < 0 {
                        // Prevent replaying sequence=0 rows for same timestamp forever.
                        last_event_sequence = 0;
                    }
                }

                polled.event.id = uuid::Uuid::new_v4().to_string();
                polled.event.captured_at = now.clone();
                polled.event.event_status = "completed".into();
                let _ = app.emit("query-event", &polled.event);
            }
        }
    })
}

async fn start_trace(client: &mut SqlClient) -> Result<ActiveTrace, String> {
    let stream = client
        .simple_query(TRACE_CREATE_AND_START)
        .await
        .map_err(|e| format!("Failed to create/start SQL Trace: {e}"))?;

    let rows = stream
        .into_results()
        .await
        .map_err(|e| format!("Failed to read SQL Trace creation result: {e}"))?;

    for result_set in rows {
        for row in result_set {
            let trace_id = row.get::<i32, _>("trace_id");
            let trace_file = row.get::<&str, _>("trace_file");
            if let (Some(id), Some(file)) = (trace_id, trace_file) {
                if id > 0 && !file.is_empty() {
                    return Ok(ActiveTrace {
                        trace_id: id,
                        trace_file: file.to_string(),
                    });
                }
            }
        }
    }

    Err("SQL Trace creation returned invalid trace metadata".into())
}

async fn stop_and_close_trace(client: &mut SqlClient, trace_id: i32) -> Result<(), String> {
    use tiberius::Query;

    let mut query = Query::new(TRACE_STOP_AND_CLOSE);
    query.bind(trace_id);

    query
        .query(client)
        .await
        .map_err(|e| format!("Failed to stop/close SQL Trace: {e}"))?
        .into_results()
        .await
        .map_err(|e| format!("Failed to confirm SQL Trace stop/close: {e}"))?;

    Ok(())
}

async fn poll_trace_events(
    client: &mut SqlClient,
    trace_file: &str,
    last_timestamp: &str,
    last_event_sequence: i64,
) -> Result<Vec<PolledEvent>, String> {
    use tiberius::Query;

    let mut query = Query::new(TRACE_POLL_EVENTS);
    query.bind(trace_file);
    query.bind(last_timestamp);
    query.bind(last_event_sequence);

    let stream = query
        .query(client)
        .await
        .map_err(|e| format!("Trace poll query failed: {e}"))?;

    let rows = stream
        .into_results()
        .await
        .map_err(|e| format!("Failed to read trace poll results: {e}"))?;

    let mut events = Vec::new();

    if let Some(result_set) = rows.first() {
        for row in result_set {
            let event_class: i32 = row.get::<i32, _>("event_class").unwrap_or(0);
            let event_name = match event_class {
                10 => "rpc_completed".to_string(),
                12 => "sql_batch_completed".to_string(),
                _ => continue,
            };

            let start_time: String = row.get::<&str, _>("start_time").unwrap_or("").to_string();
            let event_sequence: i64 = row.get::<i64, _>("event_sequence").unwrap_or(0);

            let duration_us: i64 = row.get::<i64, _>("duration_us").unwrap_or(0);
            let cpu_ms: i64 = row.get::<i64, _>("cpu_ms").unwrap_or(0);
            let elapsed_time = (duration_us / 1000) as i32;
            let cpu_time = cpu_ms as i32;

            let logical_reads: i64 = row.get::<i64, _>("reads").unwrap_or(0);
            let writes: i64 = row.get::<i64, _>("writes").unwrap_or(0);
            let row_count: i64 = row.get::<i64, _>("row_count").unwrap_or(0);

            let text_data: String = row.get::<&str, _>("text_data").unwrap_or("").to_string();
            let database_name: String = row.get::<&str, _>("database_name").unwrap_or("").to_string();
            let login_name: String = row.get::<&str, _>("login_name").unwrap_or("").to_string();
            let host_name: String = row.get::<&str, _>("host_name").unwrap_or("").to_string();
            let program_name: String = row.get::<&str, _>("program_name").unwrap_or("").to_string();
            let session_id: i32 = row.get::<i32, _>("session_id").unwrap_or(0);

            let (sql_text, current_statement) = match event_class {
                10 => (text_data.clone(), text_data),
                _ => (text_data, String::new()),
            };

            events.push(PolledEvent {
                event: QueryEvent {
                    id: String::new(),
                    session_id,
                    start_time,
                    event_name,
                    database_name,
                    cpu_time,
                    elapsed_time,
                    physical_reads: 0,
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
                },
                event_sequence,
            });
        }
    }

    Ok(events)
}

fn is_transient_trace_file_error(message: &str) -> bool {
    let lower = message.to_lowercase();
    lower.contains("code: 19049")
        || (lower.contains("there are no more files") && lower.contains("fn_trace_gettable"))
}
