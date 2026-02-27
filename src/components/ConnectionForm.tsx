import { createSignal } from "solid-js";
import type { ConnectionConfig } from "../lib/types.ts";

interface Props {
  onConnect: (config: ConnectionConfig) => void;
  onClose: () => void;
  error: string | null;
  connected: boolean;
}

export default function ConnectionForm(props: Props) {
  const [host, setHost] = createSignal("localhost");
  const [port, setPort] = createSignal(1433);
  const [username, setUsername] = createSignal("sa");
  const [password, setPassword] = createSignal("");
  const [database, setDatabase] = createSignal("master");
  const [trustCert, setTrustCert] = createSignal(true);
  const [connecting, setConnecting] = createSignal(false);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    setConnecting(true);
    try {
      await props.onConnect({
        host: host(),
        port: port(),
        username: username(),
        password: password(),
        database: database(),
        trust_cert: trustCert(),
      });
    } finally {
      setConnecting(false);
    }
  }

  const inputClass =
    "w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors";
  const labelClass = "block text-xs font-medium text-slate-400 mb-1";

  return (
    <div class="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
      <form
        onSubmit={handleSubmit}
        class="w-full max-w-md bg-slate-900 border border-slate-800 rounded-lg shadow-2xl p-6"
      >
        <div class="flex items-center justify-between mb-6">
          <h2 class="text-lg font-semibold text-slate-100">
            Connect to SQL Server
          </h2>
          {props.connected && (
            <button
              type="button"
              onClick={props.onClose}
              class="text-slate-500 hover:text-slate-300 text-lg leading-none"
            >
              &times;
            </button>
          )}
        </div>

        <div class="space-y-4">
          <div class="flex gap-3">
            <div class="flex-1">
              <label class={labelClass}>Host</label>
              <input
                type="text"
                value={host()}
                onInput={(e) => setHost(e.currentTarget.value)}
                placeholder="localhost"
                class={inputClass}
              />
            </div>
            <div class="w-24">
              <label class={labelClass}>Port</label>
              <input
                type="number"
                value={port()}
                onInput={(e) => setPort(parseInt(e.currentTarget.value) || 1433)}
                class={inputClass}
              />
            </div>
          </div>

          <div>
            <label class={labelClass}>Username</label>
            <input
              type="text"
              value={username()}
              onInput={(e) => setUsername(e.currentTarget.value)}
              placeholder="sa"
              class={inputClass}
            />
          </div>

          <div>
            <label class={labelClass}>Password</label>
            <input
              type="password"
              value={password()}
              onInput={(e) => setPassword(e.currentTarget.value)}
              placeholder="Enter password"
              class={inputClass}
            />
          </div>

          <div>
            <label class={labelClass}>Database</label>
            <input
              type="text"
              value={database()}
              onInput={(e) => setDatabase(e.currentTarget.value)}
              placeholder="master"
              class={inputClass}
            />
          </div>

          <label class="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={trustCert()}
              onChange={(e) => setTrustCert(e.currentTarget.checked)}
              class="rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500"
            />
            <span class="text-xs text-slate-400">
              Trust server certificate (for development)
            </span>
          </label>
        </div>

        {props.error && (
          <div class="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded text-sm text-red-400">
            {props.error}
          </div>
        )}

        <button
          type="submit"
          disabled={connecting()}
          class="mt-6 w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-medium rounded transition-colors"
        >
          {connecting() ? "Connecting..." : "Connect"}
        </button>
      </form>
    </div>
  );
}
