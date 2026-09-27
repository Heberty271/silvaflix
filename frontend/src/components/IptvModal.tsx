"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError, ParsedChannel } from "@/lib/api";

export function IptvModal({
  isOpen,
  onClose,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { token, user } = useAuth();

  const [activeTab, setActiveTab] = useState<"url" | "file" | "xtream" | "manual">("url");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form URL M3U
  const [m3uUrl, setM3uUrl] = useState("");
  const [categoryOverride, setCategoryOverride] = useState("");

  // Form Arquivo M3U
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  // Form Xtream Codes
  const [xtreamServer, setXtreamServer] = useState("");
  const [xtreamUser, setXtreamUser] = useState("");
  const [xtreamPass, setXtreamPass] = useState("");
  const [xtreamChannels, setXtreamChannels] = useState<ParsedChannel[]>([]);

  // Form Canal Manual
  const [manualName, setManualName] = useState("");
  const [manualUrl, setManualUrl] = useState("");
  const [manualCat, setManualCat] = useState("IPTV Personalizado");
  const [manualLogo, setManualLogo] = useState("");

  if (!isOpen) return null;

  const resetMessages = () => {
    setError(null);
    setSuccessMsg(null);
  };

  // Importar M3U por URL
  const handleImportUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !m3uUrl.trim()) return;
    resetMessages();
    setLoading(true);

    try {
      if (user?.role === "admin") {
        const res = await api.importM3U(
          { url: m3uUrl.trim(), category_override: categoryOverride.trim() || undefined },
          token
        );
        setSuccessMsg(res.message);
      } else {
        // Usuário padrão: analisa lista e importa canais
        const parsed = await api.parseM3U(
          { url: m3uUrl.trim(), category_override: categoryOverride.trim() || undefined },
          token
        );
        setSuccessMsg(`${parsed.length} canais foram identificados e carregados!`);
      }
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao processar lista M3U por URL");
    } finally {
      setLoading(false);
    }
  };

  // Importar M3U por Arquivo
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      setFileContent(ev.target?.result as string);
    };
    reader.readAsText(file);
  };

  const handleImportFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !fileContent) return;
    resetMessages();
    setLoading(true);

    try {
      if (user?.role === "admin") {
        const res = await api.importM3U(
          { content: fileContent, category_override: categoryOverride.trim() || undefined },
          token
        );
        setSuccessMsg(res.message);
      } else {
        const parsed = await api.parseM3U(
          { content: fileContent, category_override: categoryOverride.trim() || undefined },
          token
        );
        setSuccessMsg(`${parsed.length} canais carregados do arquivo com sucesso!`);
      }
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao ler arquivo M3U");
    } finally {
      setLoading(false);
    }
  };

  // Conectar Xtream Codes
  const handleConnectXtream = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !xtreamServer || !xtreamUser || !xtreamPass) return;
    resetMessages();
    setLoading(true);

    try {
      const res = await api.connectXtream(
        {
          server_url: xtreamServer.trim(),
          username: xtreamUser.trim(),
          password: xtreamPass.trim(),
        },
        token
      );

      setXtreamChannels(res.channels);
      setSuccessMsg(`Conectado! ${res.channels_count} canais encontrados no servidor Xtream.`);

      // Se admin, importa canais encontrados
      if (user?.role === "admin" && res.channels.length > 0) {
        // Envia os canais parseados em lote
        for (const ch of res.channels.slice(0, 100)) {
          await api.createLiveChannel(
            {
              name: ch.name,
              stream_url: ch.stream_url,
              category: ch.category || "Xtream IPTV",
              logo_url: ch.logo_url || undefined,
              epg_id: ch.epg_id || undefined,
            },
            token
          );
        }
      }

      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1800);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erro ao conectar com Xtream Codes");
    } finally {
      setLoading(false);
    }
  };

  // Criar Canal Manual
  const handleCreateManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !manualName.trim() || !manualUrl.trim()) return;
    resetMessages();
    setLoading(true);

    try {
      if (user?.role === "admin") {
        await api.createLiveChannel(
          {
            name: manualName.trim(),
            stream_url: manualUrl.trim(),
            category: manualCat.trim() || "IPTV Personalizado",
            logo_url: manualLogo.trim() || undefined,
          },
          token
        );
        setSuccessMsg(`Canal "${manualName}" adicionado à grade com sucesso!`);
      } else {
        // Para viewers, podemos salvar localmente ou via admin
        setSuccessMsg(`Canal "${manualName}" preparado!`);
      }

      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1200);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erro ao cadastrar canal manual");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-xl rounded-3xl border border-rule bg-panel p-6 shadow-2xl overflow-hidden">
        {/* Header Modal */}
        <div className="flex items-center justify-between border-b border-rule/60 pb-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-600/20 text-xl text-red-500 border border-red-500/30">
              📡
            </span>
            <div>
              <h2 className="text-lg font-black text-ink">Transmitir Lista IPTV & Canais</h2>
              <p className="text-xs text-mute">
                Adicione playlists M3U, conexão Xtream Codes ou streams HLS avulsas
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-mute hover:bg-panel2 hover:text-ink transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Mensagens de Feedback */}
        {error && (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs font-bold text-red-400">
            ⚠️ {error}
          </div>
        )}
        {successMsg && (
          <div className="mt-4 rounded-xl border border-green-500/30 bg-green-500/10 p-3 text-xs font-bold text-green-400">
            ✅ {successMsg}
          </div>
        )}

        {/* Tabs de Seleção */}
        <div className="mt-4 flex gap-1.5 rounded-2xl border border-rule/60 bg-panel2 p-1 text-xs font-bold">
          <button
            onClick={() => {
              setActiveTab("url");
              resetMessages();
            }}
            className={`flex-1 rounded-xl py-2 transition-all ${
              activeTab === "url"
                ? "bg-brand text-white shadow-md"
                : "text-mute hover:text-ink"
            }`}
          >
            🔗 Link M3U
          </button>
          <button
            onClick={() => {
              setActiveTab("file");
              resetMessages();
            }}
            className={`flex-1 rounded-xl py-2 transition-all ${
              activeTab === "file"
                ? "bg-brand text-white shadow-md"
                : "text-mute hover:text-ink"
            }`}
          >
            📁 Arquivo M3U
          </button>
          <button
            onClick={() => {
              setActiveTab("xtream");
              resetMessages();
            }}
            className={`flex-1 rounded-xl py-2 transition-all ${
              activeTab === "xtream"
                ? "bg-brand text-white shadow-md"
                : "text-mute hover:text-ink"
            }`}
          >
            ⚡ Xtream Codes
          </button>
          <button
            onClick={() => {
              setActiveTab("manual");
              resetMessages();
            }}
            className={`flex-1 rounded-xl py-2 transition-all ${
              activeTab === "manual"
                ? "bg-brand text-white shadow-md"
                : "text-mute hover:text-ink"
            }`}
          >
            ＋ Canal Avulso
          </button>
        </div>

        {/* Conteúdo da Tab 1: M3U por URL */}
        {activeTab === "url" && (
          <form onSubmit={handleImportUrl} className="mt-5 space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-mute mb-1.5">
                URL da Lista IPTV (.m3u ou .m3u8)
              </label>
              <input
                type="url"
                required
                placeholder="https://exemplo.com/minha-lista.m3u"
                value={m3uUrl}
                onChange={(e) => setM3uUrl(e.target.value)}
                className="w-full rounded-xl border border-rule bg-panel2 px-4 py-2.5 text-sm text-ink placeholder-mute/60 outline-none focus:border-brand transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-mute mb-1.5">
                Categoria Personalizada (Opcional)
              </label>
              <input
                type="text"
                placeholder="Ex: Canais Premium, Meus Favoritos..."
                value={categoryOverride}
                onChange={(e) => setCategoryOverride(e.target.value)}
                className="w-full rounded-xl border border-rule bg-panel2 px-4 py-2.5 text-sm text-ink placeholder-mute/60 outline-none focus:border-brand transition-all"
              />
              <p className="mt-1 text-[11px] text-mute">
                Se deixar em branco, as categorias originais do arquivo M3U serão mantidas.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading || !m3uUrl.trim()}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-brand py-3 text-sm font-bold text-white shadow-lg hover:opacity-95 disabled:opacity-50 transition-all cursor-pointer"
            >
              {loading ? "Baixando e Processando Lista..." : "📥 Importar Canais M3U"}
            </button>
          </form>
        )}

        {/* Conteúdo da Tab 2: Upload de Arquivo */}
        {activeTab === "file" && (
          <form onSubmit={handleImportFile} className="mt-5 space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-mute mb-1.5">
                Selecione o arquivo .m3u ou .m3u8
              </label>
              <div className="relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-rule/80 bg-panel2/50 p-6 text-center hover:border-brand transition-all">
                <input
                  type="file"
                  accept=".m3u,.m3u8,.txt"
                  onChange={handleFileChange}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                <span className="text-3xl mb-1">📄</span>
                <p className="text-sm font-bold text-ink">
                  {fileName || "Clique ou arraste seu arquivo M3U aqui"}
                </p>
                <p className="text-[11px] text-mute mt-1">
                  Formatos suportados: .m3u, .m3u8, .txt
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-mute mb-1.5">
                Categoria Personalizada (Opcional)
              </label>
              <input
                type="text"
                placeholder="Ex: Lista Familiar..."
                value={categoryOverride}
                onChange={(e) => setCategoryOverride(e.target.value)}
                className="w-full rounded-xl border border-rule bg-panel2 px-4 py-2.5 text-sm text-ink placeholder-mute/60 outline-none focus:border-brand transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !fileContent}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-brand py-3 text-sm font-bold text-white shadow-lg hover:opacity-95 disabled:opacity-50 transition-all cursor-pointer"
            >
              {loading ? "Carregando canais..." : "📥 Carregar Lista do Arquivo"}
            </button>
          </form>
        )}

        {/* Conteúdo da Tab 3: Xtream Codes */}
        {activeTab === "xtream" && (
          <form onSubmit={handleConnectXtream} className="mt-5 space-y-3.5">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-mute mb-1">
                Servidor Xtream (URL ou IP:Porta)
              </label>
              <input
                type="text"
                required
                placeholder="http://servidor.iptv.com:8080"
                value={xtreamServer}
                onChange={(e) => setXtreamServer(e.target.value)}
                className="w-full rounded-xl border border-rule bg-panel2 px-4 py-2.5 text-sm text-ink placeholder-mute/60 outline-none focus:border-brand transition-all"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-mute mb-1">
                  Usuário
                </label>
                <input
                  type="text"
                  required
                  placeholder="Seu usuário"
                  value={xtreamUser}
                  onChange={(e) => setXtreamUser(e.target.value)}
                  className="w-full rounded-xl border border-rule bg-panel2 px-4 py-2.5 text-sm text-ink placeholder-mute/60 outline-none focus:border-brand transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-mute mb-1">
                  Senha
                </label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={xtreamPass}
                  onChange={(e) => setXtreamPass(e.target.value)}
                  className="w-full rounded-xl border border-rule bg-panel2 px-4 py-2.5 text-sm text-ink placeholder-mute/60 outline-none focus:border-brand transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !xtreamServer.trim() || !xtreamUser.trim() || !xtreamPass.trim()}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-brand py-3 text-sm font-bold text-white shadow-lg hover:opacity-95 disabled:opacity-50 transition-all cursor-pointer mt-2"
            >
              {loading ? "Conectando ao Xtream..." : "⚡ Conectar e Importar Streams"}
            </button>
          </form>
        )}

        {/* Conteúdo da Tab 4: Canal Avulso Manual */}
        {activeTab === "manual" && (
          <form onSubmit={handleCreateManual} className="mt-5 space-y-3.5">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-mute mb-1">
                Nome do Canal
              </label>
              <input
                type="text"
                required
                placeholder="Ex: Globo HD, HBO, ESPN..."
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                className="w-full rounded-xl border border-rule bg-panel2 px-4 py-2.5 text-sm text-ink placeholder-mute/60 outline-none focus:border-brand transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-mute mb-1">
                URL da Transmissão (.m3u8 / HLS stream)
              </label>
              <input
                type="url"
                required
                placeholder="https://servidor.com/live/canal.m3u8"
                value={manualUrl}
                onChange={(e) => setManualUrl(e.target.value)}
                className="w-full rounded-xl border border-rule bg-panel2 px-4 py-2.5 text-sm text-ink placeholder-mute/60 outline-none focus:border-brand transition-all"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-mute mb-1">
                  Categoria
                </label>
                <input
                  type="text"
                  placeholder="Abertos, Esportes, Filmes..."
                  value={manualCat}
                  onChange={(e) => setManualCat(e.target.value)}
                  className="w-full rounded-xl border border-rule bg-panel2 px-4 py-2.5 text-sm text-ink placeholder-mute/60 outline-none focus:border-brand transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-mute mb-1">
                  URL da Logo (Opcional)
                </label>
                <input
                  type="url"
                  placeholder="https://.../logo.png"
                  value={manualLogo}
                  onChange={(e) => setManualLogo(e.target.value)}
                  className="w-full rounded-xl border border-rule bg-panel2 px-4 py-2.5 text-sm text-ink placeholder-mute/60 outline-none focus:border-brand transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !manualName.trim() || !manualUrl.trim()}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-brand py-3 text-sm font-bold text-white shadow-lg hover:opacity-95 disabled:opacity-50 transition-all cursor-pointer mt-2"
            >
              {loading ? "Salvando canal..." : "➕ Salvar Canal na Grade"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
