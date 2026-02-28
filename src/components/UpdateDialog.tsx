import { onCleanup, onMount } from "solid-js";

interface Props {
  version: string;
  currentVersion: string;
  onInstall: () => void;
  onCancel: () => void;
}

export default function UpdateDialog(props: Props) {
  onMount(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        props.onCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    onCleanup(() => window.removeEventListener("keydown", handleKeyDown));
  });

  return (
    <div class="absolute inset-0 z-[70] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm">
      <div class="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-6">
        <div class="flex gap-4 items-start mb-6">
          <div class="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-full bg-blue-500/10 text-blue-400 mt-1">
            <i class="fa-solid fa-circle-arrow-up text-xl" />
          </div>
          <div>
            <h2 class="text-xl font-bold text-slate-100 mb-1">Update Available</h2>
            <p class="text-slate-400 text-sm">
              Version {props.version} is available. You are currently on {props.currentVersion}. Do you want to download and install it now?
            </p>
          </div>
        </div>

        <div class="flex gap-3 justify-end mt-2">
          <button
            onClick={props.onCancel}
            class="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={props.onInstall}
            class="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded shadow-lg shadow-blue-900/20 transition-colors"
          >
            Install Update
          </button>
        </div>
      </div>
    </div>
  );
}
