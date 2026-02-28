import { invoke } from "@tauri-apps/api/core";
import { createSignal, onCleanup, onMount } from "solid-js";
import type { ConnectionConfig } from "../lib/types.ts";
import Dropdown from "./Dropdown.tsx";

interface Props {
  onConnect: (config: ConnectionConfig, rememberPassword: boolean) => void;
  onClose: () => void;
  error: string | null;
  connected: boolean;
}

export default function ConnectionForm(props: Props) {
  const [serverName, setServerName] = createSignal("localhost");
  const [authentication, setAuthentication] = createSignal("sql");
  const [userName, setUserName] = createSignal("sa");
  const [password, setPassword] = createSignal("");
  const [rememberPassword, setRememberPassword] = createSignal(true);
  const [databaseName, setDatabaseName] = createSignal("");
  const [encrypt, setEncrypt] = createSignal("mandatory");
  const [trustCert, setTrustCert] = createSignal(true);
  const [connecting, setConnecting] = createSignal(false);

  onMount(async () => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only allow closing via escape if we are already connected
      if (e.key === "Escape" && props.connected) {
        props.onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    try {
      const saved: any = await invoke("load_connection");
      setServerName(saved.server_name ?? "localhost");
      setAuthentication(saved.authentication ?? "sql");
      setUserName(saved.username ?? "sa");
      setPassword(saved.password ?? "");
      setDatabaseName(saved.database ?? "");
      setEncrypt(saved.encrypt ?? "mandatory");
      setTrustCert(saved.trust_cert ?? true);
      setRememberPassword(saved.remember_password ?? true);
    } catch {
      // Use defaults if no saved connection
    }

    onCleanup(() => window.removeEventListener("keydown", handleKeyDown));
  });

  async function handleSubmit(e: Event) {
    e.preventDefault();
    setConnecting(true);
    try {
      await props.onConnect(
        {
          server_name: serverName(),
          authentication: authentication(),
          username: userName(),
          password: password(),
          database: databaseName() || "",
          encrypt: encrypt(),
          trust_cert: trustCert(),
        },
        rememberPassword(),
      );
    } finally {
      setConnecting(false);
    }
  }

  return (
    <div class="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm">
      <form
        onSubmit={handleSubmit}
        class="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-6"
      >
        <div class="flex items-center justify-between mb-6">
          <h2 class="text-lg font-semibold text-slate-100">Connect to SQL Server</h2>
          {props.connected && (
            <button
              type="button"
              onClick={props.onClose}
              class="text-slate-500 hover:text-slate-300 transition-colors"
              title="Close"
            >
              <i class="fa-solid fa-xmark text-xl" />
            </button>
          )}
        </div>

        <div class="space-y-4">
          <div>
            <label class="label-base">Server</label>
            <input
              type="text"
              value={serverName()}
              onInput={(e) => setServerName(e.currentTarget.value)}
              placeholder="server\instance or server,port"
              class="input-base"
            />
          </div>

          <div>
            <label class="label-base">Authentication</label>
            <Dropdown
              value={authentication()}
              options={[
                { value: "sql", label: "SQL Server Authentication" },
                { value: "windows", label: "Windows Authentication" },
              ]}
              onChange={setAuthentication}
            />
          </div>

          {authentication() === "sql" && (
            <>
              <div>
                <label class="label-base">Username</label>
                <input
                  type="text"
                  value={userName()}
                  onInput={(e) => setUserName(e.currentTarget.value)}
                  placeholder="sa"
                  class="input-base"
                />
              </div>

              <div>
                <div class="label-row">
                  <label class="label-base !mb-0">Password</label>
                  <label class="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rememberPassword()}
                      onChange={(e) => setRememberPassword(e.currentTarget.checked)}
                      class="custom-checkbox"
                    />
                    <span class="label-sub">Remember</span>
                  </label>
                </div>
                <input
                  type="password"
                  value={password()}
                  onInput={(e) => setPassword(e.currentTarget.value)}
                  placeholder="Enter password"
                  class="input-base"
                />
              </div>
            </>
          )}

          <div>
            <label class="label-base">Database</label>
            <input
              type="text"
              value={databaseName()}
              onInput={(e) => setDatabaseName(e.currentTarget.value)}
              placeholder="<default>"
              class="input-base"
            />
          </div>

          <div>
            <div class="label-row">
              <label class="label-base !mb-0">Encrypt</label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={trustCert()}
                  onChange={(e) => setTrustCert(e.currentTarget.checked)}
                  class="custom-checkbox"
                />
                <span class="label-sub">Trust Certificate</span>
              </label>
            </div>
            <Dropdown
              value={encrypt()}
              options={[
                { value: "mandatory", label: "Mandatory" },
                { value: "optional", label: "Optional" },
                { value: "strict", label: "Strict" },
              ]}
              onChange={setEncrypt}
            />
          </div>
        </div>

        {props.error && (
          <div class="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded text-sm text-red-400 select-text">
            {props.error}
          </div>
        )}

        <button
          type="submit"
          disabled={connecting()}
          class="mt-6 w-full py-2.5 bg-blue-600 enabled:hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-medium rounded transition-colors shadow-lg shadow-blue-900/20"
        >
          {connecting() ? "Connecting..." : "Connect"}
        </button>
      </form>
    </div>
  );
}
