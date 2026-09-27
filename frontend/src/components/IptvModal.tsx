"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError, Playlist, CategoryWithCount } from "@/lib/api";

interface DetectedCategory {
  name: string;
  count: number;
}

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

  const [activeTab, setActiveTab] = useState<"playlists" | "url" | "file" | "xtream" | "categories" | "manual">("playlists");
  const [loading, setLoading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Dados de Playlists e Categorias existentes
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [existingCategories, setExistingCategories] = useState<CategoryWithCount[]>([]);

  // Form URL M3U
  const [playlistName, setPlaylistName] = useState("");
  const [m3uUrl, setM3uUrl] = useState("");
  const [categoryOverride, setCategoryOverride] = useState("");
  const [detectedCategories, setDetectedCategories] = useState<DetectedCategory[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [totalDetected, setTotalDetected] = useState(0);

  // Form Arquivo M3U
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  // Form Xtream Codes
  const [xtreamServer, setXtreamServer] = useState("");
  const [xtreamUser, setXtreamUser] = useState("");
  const [xtreamPass, setXtreamPass] = useState("");
  const [xtreamCategories, setXtreamCategories] = useState<DetectedCategory[]>([]);
  const [selectedXtreamCategories, setSelectedXtreamCategories] = useState<string[]>([]);
  const [xtreamTotal, setXtreamTotal] = useState(0);

  // Form Canal Manual
  const [manualName, setManualName] = useState("");
  const [manualUrl, setManualUrl] = useState("");
  const [manualCat, setManualCat] = useState("Geral");
  const [manualLogo, setManualLogo] = useState("");

  const resetMessages = () => {
    setError(null);
    setSuccessMsg(null);
  };

  const loadData = async () => {
    if (!token) return;
    try {
      const [pls, cats] = await Promise.all([
        api.listPlaylists(token).catch(() => []),
        api.listChannelCategories(token).catch(() => []),
      ]);
      setPlaylists(pls);
      setExistingCategories(cats);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (isOpen && token) {
      loadData();
      resetMessages();
    }
  }, [isOpen, token]);

  if (!isOpen) return null;

  const handleAnalyzeUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !m3uUrl.trim()) return;
    resetMessages();
    setParsing(true);

    try {
      const res = await api.parseM3U(
        { url: m3uUrl.trim(), category_override: categoryOverride.trim() || undefined },
        token
      );
      setTotalDetected(res.total_channels);
      setDetectedCategories(res.categories);
      setSelectedCategories(res.categories.map((c) => c.name));
      setSuccessMsg(`Lista analisada com sucesso! ${res.total_channels.toLocaleString("pt-BR")} canais encontrados em ${res.categories.length} categorias.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao analisar link M3U");
    } finally {
      setParsing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    if (!playlistName) {
      setPlaylistName(file.name.replace(/\.[^/.]+$/, ""));
    }
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const content = ev.target?.result as string;
      setFileContent(content);
      if (token && content) {
        setParsing(true);
        resetMessages();
        try {
          const res = await api.parseM3U(
            { content, category_override: categoryOverride.trim() || undefined },
            token
          );
          setTotalDetected(res.total_channels);
          setDetectedCategories(res.categories);
          setSelectedCategories(res.categories.map((c) => c.name));
          setSuccessMsg(`Arquivo lido! ${res.total_channels.toLocaleString("pt-BR")} canais identificados.`);
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "Falha ao processar arquivo M3U");
        } finally {
          setParsing(false);
        }
      }
    };
    reader.readAsText(file);
  };

  const handleConfirmImport = async () => {
    if (!token) return;
    resetMessages();
    setLoading(true);

    try {
      const res = await api.importM3U(
        {
          name: playlistName.trim() || undefined,
          url: m3uUrl.trim() || undefined,
          content: fileContent || undefined,
          category_override: categoryOverride.trim() || undefined,
          selected_categories: selectedCategories.length > 0 ? selectedCategories : undefined,
        },
        token
      );

      setSuccessMsg(res.message);
      loadData();
      onSuccess();

      setTimeout(() => {
        onClose();
      }, 1800);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erro ao importar canais para a base");
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePlaylist = async (pl: Playlist) => {
    if (!token) return;
    if (!confirm(`Tem certeza que deseja excluir a lista "${pl.name}" e todos os seus ${pl.channel_count.toLocaleString("pt-BR")} canais associados?`)) {
      return;
    }
    resetMessages();
    setLoading(true);
    try {
      const res = await api.deletePlaylist(pl.id, token);
      setSuccessMsg(res.message);
      await loadData();
      onSuccess();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erro ao excluir lista.");
    } finally {
      setLoading(false);
    }
  };

  const handleClearAllCustom = async () => {
    if (!token) return;
    if (!confirm("⚠️ ATENÇÃO: Deseja realmente remover TODAS as listas IPTV e todos os canais importados? Apenas os canais padrão gratuitos serão mantidos.")) {
      return;
    }
    resetMessages();
    setLoading(true);
    try {
      const res = await api.clearAllCustomChannels(token);
      setSuccessMsg(res.message);
      await loadData();
      onSuccess();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erro ao limpar canais.");
    } finally {
      setLoading(false);
    }
  };

  const handleOrganizeCategories = async () => {
    if (!token) return;
    resetMessages();
    setLoading(true);
    try {
      const res = await api.organizeCategories(token);
      setSuccessMsg(res.message);
      await loadData();
      onSuccess();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erro ao organizar categorias.");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCategory = async (cat: string, count: number) => {
    if (!token) return;
    if (!confirm(`Deseja remover todos os ${count.toLocaleString("pt-BR")} canais da categoria "${cat}"?`)) {
      return;
    }
    resetMessages();
    setLoading(true);
    try {
      const res = await api.deleteChannelsByCategory(cat, token);
      setSuccessMsg(res.message);
      await loadData();
      onSuccess();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erro ao excluir categoria.");
    } finally {
      setLoading(false);
    }
  };

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

      const total = res.total_channels || res.channels_count || 0;
      setXtreamTotal(total);
      if (res.categories) {
        setXtreamCategories(res.categories);
        setSelectedXtreamCategories(res.categories.map((c) => c.name));
      }
      setSuccessMsg(`Conectado ao Xtream! ${total.toLocaleString("pt-BR")} canais disponíveis.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erro ao conectar com Xtream Codes");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !manualName.trim() || !manualUrl.trim()) return;
    resetMessages();
    setLoading(true);

    try {
      await api.createLiveChannel(
        {
          name: manualName.trim(),
          stream_url: manualUrl.trim(),
          category: manualCat.trim() || "Geral",
          logo_url: manualLogo.trim() || undefined,
        },
        token
      );
      setSuccessMsg(`Canal "${manualName}" adicionado à grade com sucesso!`);
      setManualName("");
      setManualUrl("");
      onSuccess();
      loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erro ao cadastrar canal manual");
    } finally {
      setLoading(false);
    }
  };

  const toggleCategorySelection = (catName: string) => {
    setSelectedCategories((prev) =>
      prev.includes(catName) ? prev.filter((c) => c !== catName) : [...prev, catName]
    );
  };

  const selectAllCategories = () => {
    setSelectedCategories(detectedCategories.map((c) => c.name));
  };

  const deselectAllCategories = () => {
    setSelectedCategories([]);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 sm:p-4 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-3xl border border-rule bg-panel shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-rule/60 p-5 bg-panel2/50">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-600/20 text-2xl text-red-500 border border-red-500/30">
              📡
            </span>
            <div>
              <h2 className="text-lg font-black text-ink flex items-center gap-2">
                <span>Gerenciador de IPTV & Listas</span>
              </h2>
              <p className="text-xs text-mute">
                Gerencie, organize, importe ou apague listas e categorias com facilidade
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full text-mute hover:bg-panel2 hover:text-ink transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="mx-5 mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs font-bold text-red-400">
            ⚠️ {error}
          </div>
        )}
        {successMsg && (
          <div className="mx-5 mt-4 rounded-xl border border-green-500/30 bg-green-500/10 p-3 text-xs font-bold text-green-400">
            ✅ {successMsg}
          </div>
        )}

        <div className="px-5 pt-4">
          <div className="flex gap-1.5 overflow-x-auto rounded-2xl border border-rule/60 bg-panel2 p-1 text-xs font-bold scrollbar-none">
            <button
              onClick={() => {
                setActiveTab("playlists");
                resetMessages();
              }}
              className={`flex-1 min-w-[120px] rounded-xl py-2 px-3 transition-all ${
                activeTab === "playlists"
                  ? "bg-brand text-white shadow-md font-black"
                  : "text-mute hover:text-ink"
              }`}
            >
              📁 Minhas Listas ({playlists.length})
            </button>
            <button
              onClick={() => {
                setActiveTab("url");
                resetMessages();
              }}
              className={`flex-1 min-w-[110px] rounded-xl py-2 px-3 transition-all ${
                activeTab === "url"
                  ? "bg-brand text-white shadow-md font-black"
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
              className={`flex-1 min-w-[110px] rounded-xl py-2 px-3 transition-all ${
                activeTab === "file"
                  ? "bg-brand text-white shadow-md font-black"
                  : "text-mute hover:text-ink"
              }`}
            >
              📄 Arquivo M3U
            </button>
            <button
              onClick={() => {
                setActiveTab("categories");
                resetMessages();
              }}
              className={`flex-1 min-w-[130px] rounded-xl py-2 px-3 transition-all ${
                activeTab === "categories"
                  ? "bg-brand text-white shadow-md font-black"
                  : "text-mute hover:text-ink"
              }`}
            >
              🗂️ Categorias ({existingCategories.length})
            </button>
            <button
              onClick={() => {
                setActiveTab("manual");
                resetMessages();
              }}
              className={`flex-1 min-w-[110px] rounded-xl py-2 px-3 transition-all ${
                activeTab === "manual"
                  ? "bg-brand text-white shadow-md font-black"
                  : "text-mute hover:text-ink"
              }`}
            >
              ＋ Canal Avulso
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {activeTab === "playlists" && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-rule/50 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-ink">Listas IPTV Instaladas</h3>
                  <p className="text-xs text-mute">
                    Exclua facilmente listas indesejadas ou que adicionaram canais demais
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleOrganizeCategories}
                    disabled={loading}
                    title="Padroniza nomes de categorias caóticas para português"
                    className="flex items-center gap-1.5 rounded-xl border border-rule bg-panel2 px-3 py-1.5 text-xs font-bold text-mute hover:text-ink hover:border-brand transition-all cursor-pointer"
                  >
                    <span>🧹</span>
                    <span>Organizar Categorias</span>
                  </button>

                  <button
                    onClick={handleClearAllCustom}
                    disabled={loading}
                    title="Exclui todas as listas e canais importados"
                    className="flex items-center gap-1.5 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-400 hover:bg-red-500/20 transition-all cursor-pointer"
                  >
                    <span>🗑️</span>
                    <span>Limpar Tudo</span>
                  </button>
                </div>
              </div>

              {playlists.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-rule p-8 text-center bg-panel2/30">
                  <span className="text-3xl mb-2">📁</span>
                  <p className="text-sm font-bold text-ink">Nenhuma lista IPTV personalizada adicionada</p>
                  <p className="text-xs text-mute mt-1">
                    Use a aba &quot;Link M3U&quot; ou &quot;Arquivo M3U&quot; para adicionar novas transmissões.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {playlists.map((pl) => (
                    <div
                      key={pl.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-rule/80 bg-panel2/70 p-4 transition-all hover:border-brand/50"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-600/20 text-red-400 border border-red-500/30 text-lg flex-shrink-0">
                          📺
                        </div>
                        <div>
                          <h4 className="text-sm font-black text-ink">{pl.name}</h4>
                          <div className="flex flex-wrap items-center gap-2 mt-1">
                            <span className="rounded-full bg-panel px-2.5 py-0.5 text-[11px] font-bold text-brand border border-brand/30">
                              {pl.channel_count.toLocaleString("pt-BR")} canais
                            </span>
                            <span className="text-[11px] text-mute uppercase font-mono">
                              Tipo: {pl.type.toUpperCase()}
                            </span>
                            {pl.created_at && (
                              <span className="text-[11px] text-mute">
                                • {new Date(pl.created_at).toLocaleDateString("pt-BR")}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-rule/40">
                        <button
                          onClick={() => handleDeletePlaylist(pl)}
                          disabled={loading}
                          className="flex items-center gap-1.5 rounded-xl bg-red-600/20 px-3.5 py-2 text-xs font-bold text-red-400 border border-red-500/40 hover:bg-red-600 hover:text-white transition-all cursor-pointer"
                        >
                          <span>🗑️</span>
                          <span>Excluir Lista</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "url" && (
            <div className="space-y-4">
              <form onSubmit={handleAnalyzeUrl} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-mute mb-1">
                    Nome da Lista (Ex: Minha TV 2026, Canais Esportivos...)
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Lista Premium de Canais"
                    value={playlistName}
                    onChange={(e) => setPlaylistName(e.target.value)}
                    className="w-full rounded-xl border border-rule bg-panel2 px-4 py-2.5 text-sm text-ink placeholder-mute/60 outline-none focus:border-brand transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-mute mb-1">
                    URL da Lista IPTV (.m3u ou .m3u8) *
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      required
                      placeholder="https://exemplo.com/lista.m3u"
                      value={m3uUrl}
                      onChange={(e) => setM3uUrl(e.target.value)}
                      className="flex-1 rounded-xl border border-rule bg-panel2 px-4 py-2.5 text-sm text-ink placeholder-mute/60 outline-none focus:border-brand transition-all"
                    />
                    <button
                      type="submit"
                      disabled={parsing || !m3uUrl.trim()}
                      className="flex items-center gap-1.5 rounded-xl bg-panel2 border border-brand/50 px-4 py-2.5 text-xs font-bold text-brand hover:bg-brand hover:text-white transition-all disabled:opacity-50 cursor-pointer"
                    >
                      <span>🔍</span>
                      <span>{parsing ? "Analisando..." : "Analisar"}</span>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-mute mb-1">
                    Substituir Categoria para Todos os Canais (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Deixe em branco para organizar automaticamente"
                    value={categoryOverride}
                    onChange={(e) => setCategoryOverride(e.target.value)}
                    className="w-full rounded-xl border border-rule bg-panel2 px-4 py-2 text-xs text-ink placeholder-mute/60 outline-none focus:border-brand transition-all"
                  />
                </div>
              </form>

              {detectedCategories.length > 0 && (
                <div className="rounded-2xl border border-rule bg-panel2/60 p-4 space-y-3 animate-fade-in">
                  <div className="flex items-center justify-between border-b border-rule/50 pb-2">
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-ink">
                        Categorias Encontradas ({totalDetected.toLocaleString("pt-BR")} canais)
                      </h4>
                      <p className="text-[11px] text-mute">
                        Selecione quais categorias deseja salvar na sua grade
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={selectAllCategories}
                        className="text-[11px] font-bold text-brand hover:underline cursor-pointer"
                      >
                        Marcar Todas
                      </button>
                      <span className="text-mute text-xs">•</span>
                      <button
                        onClick={deselectAllCategories}
                        className="text-[11px] font-bold text-mute hover:text-ink cursor-pointer"
                      >
                        Desmarcar
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
                    {detectedCategories.map((cat) => {
                      const isSelected = selectedCategories.includes(cat.name);
                      return (
                        <label
                          key={cat.name}
                          onClick={() => toggleCategorySelection(cat.name)}
                          className={`flex items-center justify-between gap-2 rounded-xl p-2 text-xs border cursor-pointer transition-all ${
                            isSelected
                              ? "border-brand bg-brand/10 text-ink font-bold"
                              : "border-rule bg-panel text-mute hover:border-rule/80"
                          }`}
                        >
                          <span className="truncate">{cat.name}</span>
                          <span className="rounded-full bg-panel2 px-1.5 py-0.2 text-[10px] text-mute font-mono">
                            {cat.count}
                          </span>
                        </label>
                      );
                    })}
                  </div>

                  <button
                    onClick={handleConfirmImport}
                    disabled={loading || selectedCategories.length === 0}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-brand py-3 text-sm font-bold text-white shadow-lg hover:opacity-95 disabled:opacity-50 transition-all cursor-pointer"
                  >
                    {loading ? "Importando Canais..." : `📥 Salvar ${selectedCategories.length} Categorias na Grade`}
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === "file" && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-mute mb-1">
                  Nome da Lista
                </label>
                <input
                  type="text"
                  placeholder="Ex: Minha Lista de Canais"
                  value={playlistName}
                  onChange={(e) => setPlaylistName(e.target.value)}
                  className="w-full rounded-xl border border-rule bg-panel2 px-4 py-2.5 text-sm text-ink placeholder-mute/60 outline-none focus:border-brand transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-mute mb-1.5">
                  Selecione o arquivo .m3u, .m3u8 ou .txt
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
                    {parsing ? "Lendo e organizando arquivo..." : "Formatos suportados: .m3u, .m3u8, .txt"}
                  </p>
                </div>
              </div>

              {detectedCategories.length > 0 && (
                <div className="rounded-2xl border border-rule bg-panel2/60 p-4 space-y-3 animate-fade-in">
                  <div className="flex items-center justify-between border-b border-rule/50 pb-2">
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-ink">
                        Categorias Encontradas ({totalDetected.toLocaleString("pt-BR")} canais)
                      </h4>
                      <p className="text-[11px] text-mute">
                        Selecione as categorias que deseja salvar
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={selectAllCategories}
                        className="text-[11px] font-bold text-brand hover:underline cursor-pointer"
                      >
                        Todas
                      </button>
                      <button
                        onClick={deselectAllCategories}
                        className="text-[11px] font-bold text-mute hover:text-ink cursor-pointer"
                      >
                        Nenhuma
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
                    {detectedCategories.map((cat) => {
                      const isSelected = selectedCategories.includes(cat.name);
                      return (
                        <label
                          key={cat.name}
                          onClick={() => toggleCategorySelection(cat.name)}
                          className={`flex items-center justify-between gap-2 rounded-xl p-2 text-xs border cursor-pointer transition-all ${
                            isSelected
                              ? "border-brand bg-brand/10 text-ink font-bold"
                              : "border-rule bg-panel text-mute hover:border-rule/80"
                          }`}
                        >
                          <span className="truncate">{cat.name}</span>
                          <span className="rounded-full bg-panel2 px-1.5 py-0.2 text-[10px] text-mute font-mono">
                            {cat.count}
                          </span>
                        </label>
                      );
                    })}
                  </div>

                  <button
                    onClick={handleConfirmImport}
                    disabled={loading || selectedCategories.length === 0}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-brand py-3 text-sm font-bold text-white shadow-lg hover:opacity-95 disabled:opacity-50 transition-all cursor-pointer"
                  >
                    {loading ? "Importando canais..." : `📥 Salvar ${selectedCategories.length} Categorias na Grade`}
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === "categories" && (
            <div className="space-y-4">
              <div className="border-b border-rule/50 pb-3">
                <h3 className="text-sm font-bold text-ink">Limpeza & Gestão por Categoria</h3>
                <p className="text-xs text-mute">
                  Exclua categorias indesejadas (ex: categorias vazias ou em outros idiomas) com 1 clique
                </p>
              </div>

              {existingCategories.length === 0 ? (
                <p className="text-xs text-mute text-center py-6">Nenhuma categoria encontrada.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-80 overflow-y-auto pr-1">
                  {existingCategories.map((cat) => (
                    <div
                      key={cat.category}
                      className="flex items-center justify-between gap-2 rounded-xl border border-rule/70 bg-panel2/60 p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-black text-ink truncate">{cat.category}</p>
                        <p className="text-[11px] text-mute">{cat.count.toLocaleString("pt-BR")} canais</p>
                      </div>

                      <button
                        onClick={() => handleDeleteCategory(cat.category, cat.count)}
                        disabled={loading}
                        title={`Remover todos os ${cat.count} canais desta categoria`}
                        className="flex items-center gap-1 rounded-lg bg-red-600/15 border border-red-500/30 px-2.5 py-1 text-[11px] font-bold text-red-400 hover:bg-red-600 hover:text-white transition-all cursor-pointer"
                      >
                        <span>🗑️</span>
                        <span>Excluir</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "manual" && (
            <form onSubmit={handleCreateManual} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-mute mb-1">
                  Nome do Canal *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Globo SP HD, Premiere Clubes..."
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  className="w-full rounded-xl border border-rule bg-panel2 px-4 py-2.5 text-sm text-ink placeholder-mute/60 outline-none focus:border-brand transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-mute mb-1">
                  URL da Transmissão (.m3u8 / HLS stream) *
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
    </div>
  );
}
