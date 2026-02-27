import { For, createEffect, onCleanup } from "solid-js";
import type { QueryEvent } from "../lib/types.ts";

interface Props {
  queries: QueryEvent[];
  selectedId: string | null;
  autoScroll: boolean;
  connected: boolean;
  capturing: boolean;
  onSelect: (id: string) => void;
}

export default function QueryFeed(props: Props) {
  let containerRef: HTMLDivElement | undefined;

  createEffect(() => {
    if (props.autoScroll && containerRef) {
      requestAnimationFrame(() => {
        containerRef!.scrollTop = containerRef!.scrollHeight;
      });
    }
  });

  function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  }

  function formatTime(isoStr: string): string {
    if (!isoStr) return "";
    try {
      const d = new Date(isoStr);
      return d.toLocaleTimeString("en-US", { hour12: false, fractionalSecondDigits: 3 });
    } catch {
      return isoStr;
    }
  }

  function truncateSql(sql: string, maxLen = 120): string {
    const cleaned = sql.replace(/\s+/g, " ").trim();
    if (cleaned.length <= maxLen) return cleaned;
    return cleaned.slice(0, maxLen) + "...";
  }

  return (
    <div
      ref={containerRef}
      class="flex-1 flex flex-col overflow-auto min-h-0"
    >
      {/* Header */}
      <div class="sticky top-0 z-10 grid grid-cols-[60px_80px_70px_100px_1fr_80px_80px_80px] gap-px bg-slate-700 border-b border-slate-700 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
        <div class="px-2 py-1.5 bg-slate-800">#</div>
        <div class="px-2 py-1.5 bg-slate-800">Time</div>
        <div class="px-2 py-1.5 bg-slate-800">Session</div>
        <div class="px-2 py-1.5 bg-slate-800">Database</div>
        <div class="px-2 py-1.5 bg-slate-800">SQL Text</div>
        <div class="px-2 py-1.5 bg-slate-800 text-right">Duration</div>
        <div class="px-2 py-1.5 bg-slate-800 text-right">CPU</div>
        <div class="px-2 py-1.5 bg-slate-800 text-right">Reads</div>
      </div>

      {/* Rows */}
      {props.queries.length === 0 ? (
        <div class="flex-1 flex flex-col items-center justify-center text-slate-600 gap-4">
          <i class="fa-solid fa-database text-4xl opacity-20" />
          <div class="flex flex-col items-center gap-1">
            <span class="text-sm">No queries captured yet.</span>
            <span class="text-[11px] opacity-60">
              {!props.connected
                ? "Connect to a server to begin."
                : !props.capturing
                  ? "Press Start to begin capturing events."
                  : "Waiting for database activity..."}
            </span>
          </div>
        </div>
      ) : (
        <For each={props.queries}>
          {(query, idx) => (
            <div
              class={`grid grid-cols-[60px_80px_70px_100px_1fr_80px_80px_80px] gap-px cursor-pointer border-b border-slate-800/50 text-xs transition-colors ${props.selectedId === query.id
                ? "bg-blue-600/15 text-slate-100"
                : "hover:bg-slate-800/50 text-slate-300"
                }`}
              onClick={() => props.onSelect(query.id)}
            >
              <div class="px-2 py-1.5 text-slate-500 tabular-nums">
                {idx() + 1}
              </div>
              <div class="px-2 py-1.5 tabular-nums text-slate-400">
                {formatTime(query.start_time)}
              </div>
              <div class="px-2 py-1.5 tabular-nums">{query.session_id}</div>
              <div class="px-2 py-1.5 truncate text-slate-400">
                {query.database_name}
              </div>
              <div class="px-2 py-1.5 truncate font-mono text-[11px]">
                <span
                  class={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${query.event_status === "running"
                    ? "bg-emerald-500"
                    : "bg-slate-600"
                    }`}
                />
                {truncateSql(query.current_statement || query.sql_text)}
              </div>
              <div class="px-2 py-1.5 text-right tabular-nums">
                {formatDuration(query.elapsed_time)}
              </div>
              <div class="px-2 py-1.5 text-right tabular-nums">
                {formatDuration(query.cpu_time)}
              </div>
              <div class="px-2 py-1.5 text-right tabular-nums">
                {query.logical_reads.toLocaleString()}
              </div>
            </div>
          )}
        </For>
      )}
    </div>
  );
}
