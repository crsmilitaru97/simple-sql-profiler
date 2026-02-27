import type { QueryEvent } from "../lib/types.ts";

interface Props {
  query: QueryEvent;
  onClose: () => void;
}

export default function QueryDetail(props: Props) {
  function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  }

  const statClass = "flex flex-col items-center px-3 py-1.5";
  const statValue = "text-sm font-semibold text-slate-100 tabular-nums";
  const statLabel = "text-[10px] text-slate-500 uppercase tracking-wider";

  return (
    <div class="border-t border-slate-700 bg-slate-900 max-h-[40vh] flex flex-col">
      {/* Detail Header */}
      <div class="flex items-center justify-between px-4 py-2 border-b border-slate-800">
        <div class="flex items-center gap-3 text-xs">
          <span
            class={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${
              props.query.event_status === "running"
                ? "bg-emerald-500/20 text-emerald-400"
                : "bg-slate-700 text-slate-400"
            }`}
          >
            {props.query.event_status}
          </span>
          <span class="text-slate-400">
            Session {props.query.session_id}
          </span>
          <span class="text-slate-500">{props.query.command}</span>
          <span class="text-slate-500">{props.query.database_name}</span>
        </div>
        <button
          onClick={props.onClose}
          class="text-slate-500 hover:text-slate-300 text-sm px-1"
        >
          &times;
        </button>
      </div>

      {/* Stats Row */}
      <div class="flex items-center border-b border-slate-800 divide-x divide-slate-800">
        <div class={statClass}>
          <span class={statValue}>
            {formatDuration(props.query.elapsed_time)}
          </span>
          <span class={statLabel}>Duration</span>
        </div>
        <div class={statClass}>
          <span class={statValue}>
            {formatDuration(props.query.cpu_time)}
          </span>
          <span class={statLabel}>CPU Time</span>
        </div>
        <div class={statClass}>
          <span class={statValue}>
            {props.query.logical_reads.toLocaleString()}
          </span>
          <span class={statLabel}>Logical Reads</span>
        </div>
        <div class={statClass}>
          <span class={statValue}>
            {props.query.reads.toLocaleString()}
          </span>
          <span class={statLabel}>Physical Reads</span>
        </div>
        <div class={statClass}>
          <span class={statValue}>
            {props.query.writes.toLocaleString()}
          </span>
          <span class={statLabel}>Writes</span>
        </div>
        <div class={statClass}>
          <span class={statValue}>
            {props.query.row_count.toLocaleString()}
          </span>
          <span class={statLabel}>Rows</span>
        </div>
        {props.query.wait_type && (
          <div class={statClass}>
            <span class={`${statValue} text-amber-400`}>
              {props.query.wait_type}
            </span>
            <span class={statLabel}>
              Wait ({formatDuration(props.query.wait_time)})
            </span>
          </div>
        )}
      </div>

      {/* Connection Info */}
      <div class="flex items-center gap-4 px-4 py-1.5 border-b border-slate-800 text-[11px] text-slate-500">
        <span>
          Login: <span class="text-slate-400">{props.query.login_name}</span>
        </span>
        <span>
          Host: <span class="text-slate-400">{props.query.host_name}</span>
        </span>
        <span>
          App: <span class="text-slate-400">{props.query.program_name}</span>
        </span>
        <span>
          Started: <span class="text-slate-400">{props.query.start_time}</span>
        </span>
      </div>

      {/* SQL Text */}
      <div class="flex-1 overflow-auto p-4">
        <pre class="text-xs font-mono text-slate-200 whitespace-pre-wrap break-words leading-relaxed">
          {props.query.current_statement || props.query.sql_text}
        </pre>
        {props.query.current_statement &&
          props.query.sql_text !== props.query.current_statement && (
            <details class="mt-3">
              <summary class="text-[11px] text-slate-500 cursor-pointer hover:text-slate-400">
                Full batch text
              </summary>
              <pre class="mt-2 text-xs font-mono text-slate-400 whitespace-pre-wrap break-words leading-relaxed">
                {props.query.sql_text}
              </pre>
            </details>
          )}
      </div>
    </div>
  );
}
