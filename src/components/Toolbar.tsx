interface Props {
  connected: boolean;
  capturing: boolean;
  queryCount: number;
  filterText: string;
  autoScroll: boolean;
  onStartCapture: () => void;
  onStopCapture: () => void;
  onClear: () => void;
  onFilterChange: (value: string) => void;
  onToggleAutoScroll: () => void;
}

export default function Toolbar(props: Props) {
  const btnBase =
    "flex items-center justify-center gap-1.5 w-24 py-1.5 text-xs font-medium rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <div class="flex items-center gap-2 px-3 py-2 bg-slate-800/60 border-b border-slate-700">
      <div class="flex items-center gap-1.5">
        {!props.capturing ? (
          <button
            class={`${btnBase} bg-emerald-600 enabled:hover:bg-emerald-500 text-white`}
            disabled={!props.connected}
            onClick={props.onStartCapture}
          >
            <i class="fa-solid fa-play text-[10px]" />
            Start
          </button>
        ) : (
          <button
            class={`${btnBase} bg-red-600 enabled:hover:bg-red-500 text-white`}
            onClick={props.onStopCapture}
          >
            <i class="fa-solid fa-stop text-[10px]" />
            Stop
          </button>
        )}

        <button
          class={`${btnBase} bg-slate-700 enabled:hover:bg-slate-600 text-slate-200`}
          disabled={props.queryCount === 0}
          onClick={props.onClear}
        >
          <i class="fa-solid fa-trash-can text-[10px]" />
          Clear
        </button>
      </div>

      <div class="flex-1 mx-2 relative">
        <i class="fa-solid fa-magnifying-glass absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-500" />
        <input
          type="text"
          value={props.filterText}
          onInput={(e) => props.onFilterChange(e.currentTarget.value)}
          placeholder="Filter queries..."
          class="w-full pl-7 pr-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
        />
      </div>

      <button
        class={`${btnBase} ${
          props.autoScroll
            ? "bg-blue-600/20 text-blue-400 border-blue-500/40"
            : "bg-slate-700 text-slate-400"
        }`}
        onClick={props.onToggleAutoScroll}
        title="Auto-scroll to latest queries"
      >
        <i class="fa-solid fa-arrow-down text-[10px]" />
        Auto-scroll
      </button>
    </div>
  );
}
