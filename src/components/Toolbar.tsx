interface Props {
  connected: boolean;
  capturing: boolean;
  queryCount: number;
  filterText: string;
  autoScroll: boolean;
  onStartCapture: () => void;
  onStopCapture: () => void;
  onClear: () => void;
  onDisconnect: () => void;
  onFilterChange: (value: string) => void;
  onToggleConnection: () => void;
  onToggleAutoScroll: () => void;
}

export default function Toolbar(props: Props) {
  const btnBase =
    "px-3 py-1.5 text-xs font-medium rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <div class="flex items-center gap-2 px-3 py-2 bg-slate-900/50 border-b border-slate-800">
      {/* Capture Controls */}
      <div class="flex items-center gap-1.5">
        {!props.capturing ? (
          <button
            class={`${btnBase} bg-emerald-600 hover:bg-emerald-500 text-white`}
            disabled={!props.connected}
            onClick={props.onStartCapture}
          >
            Start
          </button>
        ) : (
          <button
            class={`${btnBase} bg-red-600 hover:bg-red-500 text-white`}
            onClick={props.onStopCapture}
          >
            Stop
          </button>
        )}

        <button
          class={`${btnBase} bg-slate-700 hover:bg-slate-600 text-slate-200`}
          disabled={props.queryCount === 0}
          onClick={props.onClear}
        >
          Clear
        </button>

        <div class="w-px h-5 bg-slate-700 mx-1" />

        <button
          class={`${btnBase} ${
            props.autoScroll
              ? "bg-blue-600/20 text-blue-400 border border-blue-500/40"
              : "bg-slate-700 text-slate-400"
          }`}
          onClick={props.onToggleAutoScroll}
          title="Auto-scroll to latest queries"
        >
          Auto-scroll
        </button>
      </div>

      {/* Filter */}
      <div class="flex-1 mx-2">
        <input
          type="text"
          value={props.filterText}
          onInput={(e) => props.onFilterChange(e.currentTarget.value)}
          placeholder="Filter queries (SQL text, database, login, program...)"
          class="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
        />
      </div>

      {/* Connection */}
      <div class="flex items-center gap-1.5">
        <button
          class={`${btnBase} bg-slate-700 hover:bg-slate-600 text-slate-300`}
          onClick={props.onToggleConnection}
        >
          Connection
        </button>
        {props.connected && (
          <button
            class={`${btnBase} bg-slate-700 hover:bg-red-600/80 text-slate-400 hover:text-white`}
            onClick={props.onDisconnect}
          >
            Disconnect
          </button>
        )}
      </div>
    </div>
  );
}
