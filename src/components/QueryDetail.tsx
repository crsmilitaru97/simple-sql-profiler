import { createSignal, createEffect, onCleanup } from "solid-js";
import type { QueryEvent } from "../lib/types.ts";

interface Props {
  query: QueryEvent;
  onClose: () => void;
}

function SqlBlock(props: { text: string; label?: string; class?: string }) {
  const [copied, setCopied] = createSignal(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(props.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div class={`relative group ${props.class || ""}`}>
      {props.label && (
        <div class="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5 font-medium">
          {props.label}
        </div>
      )}
      <div class="relative bg-slate-900/50 rounded-lg p-4 border border-slate-700/50">
        <button
          onClick={handleCopy}
          class="absolute top-2 right-2 px-2 py-1 rounded bg-slate-800 border border-slate-700 text-[10px] text-slate-400 opacity-0 group-hover:opacity-100 transition-all hover:text-slate-200 hover:border-slate-600 active:scale-95 z-10"
        >
          {copied() ? (
            <span class="flex items-center gap-1 text-emerald-400">
              <i class="fa-solid fa-check" /> Copied
            </span>
          ) : (
            <span class="flex items-center gap-1">
              <i class="fa-solid fa-copy" /> Copy
            </span>
          )}
        </button>
        <pre class="text-xs font-mono text-slate-200 whitespace-pre-wrap break-words leading-relaxed selection:bg-blue-500/30">
          {props.text}
        </pre>
      </div>
    </div>
  );
}

export default function QueryDetail(props: Props) {
  const savedHeight = parseInt(localStorage.getItem("detail-panel-height") || "300", 10);
  const [height, setHeight] = createSignal(savedHeight);
  const [mounted, setMounted] = createSignal(false);
  
  let dragging = false;
  let startY = 0;
  let startH = 0;

  function onPointerDown(e: PointerEvent) {
    dragging = true;
    startY = e.clientY;
    startH = height();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragging) return;
    const delta = startY - e.clientY;
    const next = Math.max(120, Math.min(startH + delta, window.innerHeight * 0.8));
    setHeight(next);
  }

  function onPointerUp() {
    dragging = false;
    localStorage.setItem("detail-panel-height", String(height()));
  }

  function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  }

  createEffect(() => {
    // Entrance animation
    setMounted(false);
    const raf = requestAnimationFrame(() => {
      setMounted(true);
    });
    onCleanup(() => cancelAnimationFrame(raf));
  });

  return (
    <div
      class={`relative border-t border-slate-700 bg-slate-800 flex flex-col shrink-0 select-text transition-all duration-200 ease-out ${
        !mounted() ? "translate-y-8 opacity-0" : "translate-y-0 opacity-100"
      }`}
      style={{ 
        height: `${height()}px`
      }}
    >
      <div
        class="absolute -top-1 left-0 right-0 h-2 cursor-ns-resize z-50 hover:bg-blue-500/30 transition-colors"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />

      {/* Header */}
      <div class="flex items-stretch border-b border-slate-700 bg-slate-800/50 shrink-0 h-[42px]">
        {/* Status & Session */}
        <div class="flex items-center gap-3 px-4 border-r border-slate-700/50">
          <span
            class={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
              props.query.event_status === "running"
                ? "bg-emerald-500/20 text-emerald-400"
                : "bg-slate-700 text-slate-400"
            }`}
          >
            {props.query.event_status}
          </span>
          <div class="flex flex-col justify-center">
            <span class="text-[11px] font-semibold text-slate-100 tabular-nums">#{props.query.session_id}</span>
            <span class="text-[9px] text-slate-500 uppercase tracking-tighter">Session</span>
          </div>
        </div>

        {/* Command & DB */}
        <div class="flex flex-col justify-center px-4 border-r border-slate-700/50 min-w-max">
          <div class="flex items-center gap-1.5">
            <span class="text-[11px] font-semibold text-slate-100">{props.query.command}</span>
            <span class="text-[11px] text-slate-400">{props.query.database_name}</span>
          </div>
          <span class="text-[9px] text-slate-500 uppercase tracking-tighter">Target</span>
        </div>

        {/* Environment */}
        <div class="flex flex-col justify-center px-4 border-r border-slate-700/50 min-w-max">
          <span class="text-[11px] font-medium text-slate-300 leading-tight">
            {props.query.login_name}<span class="text-slate-500">@</span>{props.query.host_name}
          </span>
          <span class="text-[9px] text-slate-500 truncate max-w-[120px]" title={props.query.program_name}>
            {props.query.program_name}
          </span>
        </div>

        {/* Timestamp */}
        <div class="flex flex-col justify-center px-4 border-r border-slate-700/50 min-w-max">
          <span class="text-[11px] font-medium text-slate-400 tabular-nums leading-tight">
            {props.query.start_time.split(' ')[1] || props.query.start_time}
          </span>
          <span class="text-[9px] text-slate-500 uppercase tracking-tighter">Started</span>
        </div>

        {/* Stats */}
        <div class="flex items-stretch ml-auto divide-x divide-slate-700/50 border-l border-slate-700/50">
          <div class="flex flex-col items-center justify-center px-4 min-w-[70px]">
            <span class="text-[11px] font-bold text-slate-100 tabular-nums">{formatDuration(props.query.elapsed_time)}</span>
            <span class="text-[9px] text-slate-500 uppercase tracking-wider">Duration</span>
          </div>
          <div class="flex flex-col items-center justify-center px-4 min-w-[60px]">
            <span class="text-[11px] font-bold text-slate-100 tabular-nums">{formatDuration(props.query.cpu_time)}</span>
            <span class="text-[9px] text-slate-500 uppercase tracking-wider">CPU</span>
          </div>
          <div class="flex flex-col items-center justify-center px-4 min-w-[70px]">
            <span class="text-[11px] font-bold text-slate-100 tabular-nums">{props.query.logical_reads.toLocaleString()}</span>
            <span class="text-[9px] text-slate-500 uppercase tracking-wider">Reads</span>
          </div>
          <div class="flex flex-col items-center justify-center px-4 min-w-[70px]">
            <span class="text-[11px] font-bold text-slate-100 tabular-nums">{props.query.reads.toLocaleString()}</span>
            <span class="text-[9px] text-slate-500 uppercase tracking-wider">Physical</span>
          </div>
          <div class="flex flex-col items-center justify-center px-4 min-w-[60px]">
            <span class="text-[11px] font-bold text-slate-100 tabular-nums">{props.query.writes.toLocaleString()}</span>
            <span class="text-[9px] text-slate-500 uppercase tracking-wider">Writes</span>
          </div>
          <div class="flex flex-col items-center justify-center px-4 min-w-[60px]">
            <span class="text-[11px] font-bold text-slate-100 tabular-nums">{props.query.row_count.toLocaleString()}</span>
            <span class="text-[9px] text-slate-500 uppercase tracking-wider">Rows</span>
          </div>
          {props.query.wait_type && (
            <div class="flex flex-col items-center justify-center px-4 min-w-[80px] bg-amber-500/5">
              <span class="text-[11px] font-bold text-amber-400 tabular-nums">{props.query.wait_type}</span>
              <span class="text-[9px] text-amber-500 uppercase tracking-wider truncate max-w-[70px]">
                Wait {formatDuration(props.query.wait_time)}
              </span>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => props.onClose()}
          class="text-slate-500 hover:text-slate-200 w-12 h-full flex items-center justify-center hover:bg-slate-700/50 transition-all border-l border-slate-700/50 shrink-0"
          title="Close details"
        >
          <i class="fa-solid fa-chevron-down text-xs" />
        </button>
      </div>

      {/* SQL Text */}
      <div class="flex-1 overflow-auto p-4 flex flex-col gap-6">
        <SqlBlock 
          text={props.query.current_statement || props.query.sql_text} 
          label="Statement"
        />
        
        {props.query.current_statement &&
          props.query.sql_text !== props.query.current_statement && (
            <SqlBlock 
              text={props.query.sql_text} 
              label="Full Batch"
            />
          )}
      </div>
    </div>
  );
}
