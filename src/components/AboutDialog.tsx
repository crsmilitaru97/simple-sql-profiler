import { open } from "@tauri-apps/plugin-shell";
import { onCleanup, onMount } from "solid-js";
import appIcon from "../../icon.png";

type UpdateMessageTone = "info" | "success" | "error";

interface Props {
  onClose: () => void;
  version: string | null;
  onCheckForUpdates: () => void | Promise<void>;
  checkingForUpdates: boolean;
  updateMessage: string | null;
  updateMessageTone: UpdateMessageTone;
}

export default function AboutDialog(props: Props) {
  onMount(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        props.onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    onCleanup(() => window.removeEventListener("keydown", handleKeyDown));
  });

  const handleOpenRepo = async (e: MouseEvent) => {
    e.preventDefault();
    await open("https://github.com/crsmilitaru97/simple-sql-profiler");
  };

  const updateMessageClass = () => {
    if (props.updateMessageTone === "error") return "text-red-400";
    if (props.updateMessageTone === "success") return "text-emerald-400";
    return "text-slate-400";
  };

  return (
    <div class="absolute inset-0 z-[60] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm">
      <div class="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-8 text-center">
        <div class="flex items-center justify-center mx-auto mb-5">
          <img src={appIcon} alt="Simple SQL Profiler icon" class="w-14 h-14 object-contain" />
        </div>

        <h2 class="text-2xl font-bold text-slate-100 mb-2">Simple SQL Profiler</h2>
        <p class="text-slate-400 text-sm mb-5">
          A lightweight, modern SQL Server Profiler alternative.
        </p>
        <p class="text-slate-500 text-xs mb-5">Version {props.version ?? "unknown"}</p>

        <div
          class="space-y-3"
          classList={{ "mb-4": !props.updateMessage, "mb-6": !!props.updateMessage }}
        >
          <a
            href="https://github.com/crsmilitaru97/simple-sql-profiler"
            onClick={handleOpenRepo}
            class="flex items-center justify-center gap-2 mt-2 mb-6 py-1 text-blue-400 hover:text-blue-300 transition-colors text-sm font-medium"
          >
            <i class="fa-brands fa-github text-lg" />
            GitHub Repository
          </a>

          <button
            onClick={() => void props.onCheckForUpdates()}
            disabled={props.checkingForUpdates}
            class="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white text-sm font-medium rounded transition-colors"
          >
            {props.checkingForUpdates ? "Checking..." : "Check for updates"}
          </button>

          {props.updateMessage && (
            <p class={`text-xs ${updateMessageClass()}`}>{props.updateMessage}</p>
          )}
        </div>

        <button
          onClick={props.onClose}
          class="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
}
