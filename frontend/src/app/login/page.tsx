"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { ApiError, getApiUrl, setApiUrl, syncApiUrl } from "@/lib/api";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Servidor & Conexão
  const [showServerConfig, setShowServerConfig] = useState(false);
  const [currentBackendUrl, setCurrentBackendUrl] = useState("");
  const [customUrlInput, setCustomUrlInput] = useState("");
  const [syncingServer, setSyncingServer] = useState(false);
  const [serverMsg, setServerMsg] = useState<string | null>(null);

  useEffect(() => {
    setCurrentBackendUrl(getApiUrl());
    setCustomUrlInput(getApiUrl());
  }, []);

  async function handleSyncServer() {
    setSyncingServer(true);
    setServerMsg(null);
    try {
      const fresh = await syncApiUrl(true);
      setCurrentBackendUrl(fresh);
      setCustomUrlInput(fresh);
      setServerMsg("✅ Servidor sincronizado!");
    } catch {
      setServerMsg("⚠️ Não foi possível sincronizar automaticamente");
    } finally {
      setSyncingServer(false);
    }
  }

  function handleSaveCustomUrl() {
    if (!customUrlInput.trim()) return;
    setApiUrl(customUrlInput.trim());
    setCurrentBackendUrl(customUrlInput.trim());
    setServerMsg("✅ URL salva com sucesso!");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      router.push("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao entrar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-void px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="text-3xl font-black tracking-tight">
            SILVA<span className="text-brand">FLIX</span>
          </span>
          <p className="mt-1 text-xs text-muted">Streaming Familiar</p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-lg border border-rule bg-panel p-6 shadow-xl">
          <label className="block text-sm text-mute" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input mb-4 mt-1"
            placeholder="admin@silvaflix.com"
          />

          <label className="block text-sm text-mute" htmlFor="password">
            Senha
          </label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input mb-4 mt-1"
            placeholder="••••••••"
          />

          {error && (
            <div className="mb-4 rounded bg-red-950/50 p-2.5 text-xs text-brand2 border border-red-800/40" role="alert">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-brand py-2 font-semibold text-ink transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>

        {/* Configuração de Servidor */}
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => setShowServerConfig(!showServerConfig)}
            className="text-xs text-muted hover:text-ink transition flex items-center justify-center gap-1 mx-auto"
          >
            ⚙️ Conexão: <span className="font-mono text-ink/70">{currentBackendUrl ? currentBackendUrl.replace(/^https?:\/\//, "").slice(0, 24) + "..." : "Carregando..."}</span>
          </button>

          {showServerConfig && (
            <div className="mt-3 rounded-lg border border-rule bg-panel/90 p-4 text-left shadow-lg text-xs space-y-2">
              <p className="font-medium text-ink">Endereço do Backend</p>
              <input
                type="text"
                value={customUrlInput}
                onChange={(e) => setCustomUrlInput(e.target.value)}
                placeholder="https://...trycloudflare.com ou http://localhost:8000"
                className="input py-1 text-xs font-mono"
              />
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleSaveCustomUrl}
                  className="flex-1 rounded bg-brand/80 py-1 font-semibold text-ink hover:bg-brand"
                >
                  Salvar URL
                </button>
                <button
                  type="button"
                  disabled={syncingServer}
                  onClick={handleSyncServer}
                  className="flex-1 rounded border border-rule bg-void/50 py-1 font-semibold text-mute hover:text-ink"
                >
                  {syncingServer ? "Sincronizando..." : "🔄 Atualizar"}
                </button>
              </div>
              {serverMsg && (
                <p className="pt-1 text-[11px] text-green-400 font-medium">
                  {serverMsg}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
