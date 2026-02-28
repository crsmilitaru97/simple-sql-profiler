import { For, onCleanup, onMount, Show } from "solid-js";
import { createStore } from "solid-js/store";
import {
  ADVANCED_FILTER_COLUMNS,
  AdvancedFilterCondition,
  AdvancedFilterOperator,
  createFilterCondition,
  getColumnDefinition,
  getOperatorOptions,
  normalizeFilters
} from "../lib/advancedFilters";
import { QueryEvent } from "../lib/types";
import Dropdown from "./Dropdown.tsx";

interface Props {
  onClose: () => void;
  filters: AdvancedFilterCondition[];
  onApply: (filters: AdvancedFilterCondition[]) => void;
}

export default function AdvancedFilterDialog(props: Props) {
  const [localFilters, setLocalFilters] = createStore<AdvancedFilterCondition[]>(
    props.filters.length > 0 ? JSON.parse(JSON.stringify(props.filters)) : []
  );

  onMount(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        props.onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    onCleanup(() => window.removeEventListener("keydown", handleKeyDown));
  });

  const addFilter = () => {
    setLocalFilters(localFilters.length, createFilterCondition());
  };

  const removeFilter = (id: string) => {
    setLocalFilters((prev) => prev.filter((f) => f.id !== id));
  };

  const updateFilter = (id: string, updates: Partial<AdvancedFilterCondition>) => {
    setLocalFilters(
      (f) => f.id === id,
      (f) => {
        const next = { ...updates };
        if (updates.column) {
          const newCol = getColumnDefinition(updates.column);
          const options = getOperatorOptions(newCol.type);
          const currentOp = updates.operator ?? f.operator;
          if (!options.find((o) => o.value === currentOp)) {
            next.operator = options[0].value;
          }
        }
        return next;
      }
    );
  };

  const handleApply = () => {
    const rawFilters = localFilters.map((f) => ({ ...f }));
    props.onApply(normalizeFilters(rawFilters));
    props.onClose();
  };

  const clearAll = () => {
    setLocalFilters([]);
  };

  return (
    <div class="absolute inset-0 z-[60] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm">
      <div class="w-full max-w-3xl max-h-[85vh] bg-slate-900 border border-slate-800 rounded-xl shadow-2xl flex flex-col overflow-hidden">
        <div class="p-4 border-b border-slate-800 flex items-center justify-between shrink-0">
          <h2 class="text-xl font-bold text-slate-100 flex items-center gap-2">
            <i class="fa-solid fa-filter text-blue-400" />
            Advanced Filters
          </h2>
          <button
            onClick={props.onClose}
            class="text-slate-500 hover:text-slate-300 transition-colors"
          >
            <i class="fa-solid fa-xmark text-xl" />
          </button>
        </div>

        <div class="flex-1 overflow-y-auto p-5 space-y-4">
          <Show
            when={localFilters.length > 0}
            fallback={
              <div class="flex-1 flex flex-col items-center justify-center text-slate-600 py-10">
                <div class="px-8 py-6 rounded-xl border border-slate-800/70 bg-slate-900/60 shadow-lg shadow-slate-900/40 flex flex-col items-center gap-3 w-full text-center">
                  <i class="fa-solid fa-filter text-4xl opacity-25" />
                  <div class="flex flex-col items-center gap-1">
                    <span class="text-sm text-slate-200">No filters added yet.</span>
                    <span class="text-[11px] opacity-70">
                      Add conditions to refine your query view.
                    </span>
                  </div>
                </div>
              </div>
            }
          >
            <For each={localFilters}>
              {(filter) => {
                const columnDef = getColumnDefinition(filter.column);
                const operatorOptions = getOperatorOptions(columnDef.type);

                return (
                  <div class="flex flex-col gap-3 bg-slate-800/50 p-4 rounded border border-slate-700/50 group anim-fade-in relative">
                    <button
                      onClick={() => removeFilter(filter.id)}
                      class="absolute top-2 right-2 p-1.5 text-slate-500 hover:text-red-400 transition-colors rounded hover:bg-slate-800"
                      title="Remove filter"
                    >
                      <i class="fa-solid fa-trash-can" />
                    </button>

                    <div class="flex gap-3 w-full pr-8">
                      <div class="flex-1">
                        <label class="block text-[10px] text-slate-500 uppercase font-bold mb-1">Column</label>
                        <Dropdown
                          value={filter.column}
                          options={ADVANCED_FILTER_COLUMNS.map(col => ({ value: col.key, label: col.label }))}
                          onChange={(val) => updateFilter(filter.id, { column: val as keyof QueryEvent })}
                        />
                      </div>

                      <div class="w-1/3">
                        <label class="block text-[10px] text-slate-500 uppercase font-bold mb-1">Operator</label>
                        <Dropdown
                          value={filter.operator}
                          options={operatorOptions}
                          onChange={(val) => updateFilter(filter.id, { operator: val as AdvancedFilterOperator })}
                        />
                      </div>

                      <div class="w-2/5">
                        <label class="block text-[10px] text-slate-500 uppercase font-bold mb-1">Value</label>
                        <input
                          type={columnDef.type === "number" ? "number" : columnDef.type === "datetime" ? "datetime-local" : "text"}
                          value={filter.value}
                          onInput={(e) => updateFilter(filter.id, { value: e.currentTarget.value })}
                          placeholder="Filter value..."
                          class="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-blue-500 h-[38px]"
                        />
                      </div>
                    </div>
                  </div>
                );
              }}
            </For>
          </Show>

          <button
            onClick={addFilter}
            class="w-full py-2.5 mt-2 border-2 border-dashed border-slate-700 hover:border-slate-500 hover:bg-slate-800/30 text-slate-400 hover:text-slate-300 rounded transition-all flex items-center justify-center gap-2 text-sm font-medium"
          >
            <i class="fa-solid fa-plus" />
            Add Filter
          </button>
        </div>

        <div class="p-4 border-t border-slate-800 flex items-center justify-between shrink-0 bg-slate-900">
          <button
            onClick={clearAll}
            disabled={localFilters.length === 0}
            class="px-4 py-2 bg-slate-800/50 hover:bg-red-900/20 text-slate-400 hover:text-red-400 border border-slate-700 hover:border-red-900/30 text-sm font-medium rounded transition-all flex items-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-slate-800/50 disabled:hover:text-slate-400 disabled:hover:border-slate-700"
          >
            <i class="fa-solid fa-eraser text-[10px]" />
            Clear All
          </button>

          <div class="flex gap-3">
            <button
              onClick={props.onClose}
              class="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              class="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded shadow-lg shadow-blue-900/20 transition-colors"
            >
              Apply Filters
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
