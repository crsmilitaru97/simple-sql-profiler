export interface ConnectionConfig {
  server_name: string;
  authentication: string;
  username: string;
  password: string;
  database: string;
  encrypt: string;
  trust_cert: boolean;
}

export interface QueryEvent {
  id: string;
  session_id: number;
  start_time: string;
  event_name: string;
  database_name: string;
  cpu_time: number;
  elapsed_time: number;
  physical_reads: number;
  writes: number;
  logical_reads: number;
  row_count: number;
  sql_text: string;
  current_statement: string;
  login_name: string;
  host_name: string;
  program_name: string;
  captured_at: string;
  event_status: "completed";
}

export interface QueryResultData {
  columns: string[];
  rows: (string | number | boolean | null)[][];
}

export interface ProfilerStatus {
  connected: boolean;
  capturing: boolean;
  error: string | null;
}
