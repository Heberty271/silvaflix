"use client";

import { useState, useEffect } from "react";
import {
  api,
  TMDBSearchResult,
  ParseMovieM3UResponse,
  MovieSource,
} from "@/lib/api";

interface ImportMovieWebModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: string;
  onSuccess: () => void;
}

type TabType = "single" | "batch" | "m3u" | "sources";

export function ImportMovieWebModal({
  isOpen,
  onClose,
  token,
  onSuccess,
}: ImportMovieWebModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>("single");

  // Tab 1: Link Único
  const [singleUrl, setSingleUrl] = useState("");
  const [singleTitle, setSingleTitle] = useState("");
  const [singleSourceName, setSingleSourceName] = useState("Link Web");
  const [isSeries, setIsSeries] = useState(false);
  const [seriesTitle, setSeriesTitle] = useState("");
  const [seasonNum, setSeasonNum] = useState<number | "">("");
  const [episodeNum, setEpisodeNum] = useState<number | "">("");
  const [tmdbSearchQuery, setTmdbSearchQuery] = useState("");
  const [tmdbResults, setTmdbResults] = useState<TMDBSearchResult[]>([]);
  const [selectedTmdb, setSelectedTmdb] = useState<TMDBSearchResult | null>(null);
  const [isSearchingTmdb, setIsSearchingTmdb] = useState(false);
  const [isSubmittingSingle, setIsSubmittingSingle] = useState(false);

  // Tab 2: Lote de Links
  const [batchText, setBatchText] = useState("");
  const [batchSourceName, setBatchSourceName] = useState("Importação Web");
  const [batchFetchTmdb, setBatchFetchTmdb] = useState(true);
  const [isSubmittingBatch, setIsSubmittingBatch] = useState(false);
  const [batchStatusMsg, setBatchStatusMsg] = useState<string | null>(null);

  // Tab 3: M3U VOD
  const [m3uUrl, setM3uUrl] = useState("");
  const [m3uFile, setM3uFile] = useState<File | null>(null);
  const [m3uSourceName, setM3uSourceName] = useState("Lista VOD Web");
  const [isAnalyzingM3u, setIsAnalyzingM3u] = useState(false);
  const [parsedM3u, setParsedM3u] = useState<ParseMovieM3UResponse | null>(null);
  const [selectedCats, setSelectedCats] = useState<Record<string, boolean>>({});
  const [m3uFetchTmdb, setM3uFetchTmdb] = useState(true);
  const [isImportingM3u, setIsImportingM3u] = useState(false);

  // Tab 4: Gerenciar Fontes
  const [sources, setSources] = useState<MovieSource[]>([]);
  const [isLoadingSources, setIsLoadingSources] = useState(false);
  const [deletingSource, setDeletingSource] = useState<string | null>(null);

  // Mensagens
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    if (isOpen && activeTab === "sources") {
      loadSources();
    }
  }, [isOpen, activeTab]);

  async function loadSources() {
    setIsLoadingSources(true);
    try {
      const data = await api.listMovieSources(token);
      setSources(data);
    } catch {
      // ignore
    } finally {
      setIsLoadingSources(false);
    }
  }

  // --- TMDB Search ---
  async function handleSearchTmdb(queryToSearch?: string) {
    const q = queryToSearch || tmdbSearchQuery || singleTitle;
    if (!q.trim()) return;
    setIsSearchingTmdb(true);
    try {
      const results = await api.searchTmdb(q.trim(), token);
      setTmdbResults(results);
      if (results.length > 0) {
        setSelectedTmdb(results[0]);
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message || "Erro ao consultar TMDB." });
    } finally {
      setIsSearchingTmdb(false);
    }
  }

  // Auto extrai título quando usuário cola a URL
  function handleUrlChange(url: string) {
    setSingleUrl(url);
    if (!singleTitle) {
      try {
        const cleanPart = url.split("?")[0].split("#")[0];
        const filename = cleanPart.split("/").pop() || "";
        const cleanName = filename
          .replace(/\.(mp4|mkv|avi|mov|webm|m3u8|ts|m4v)$/i, "")
          .replace(/[\._\-]/g, " ")
          .replace(/\b(1080p|720p|480p|4k|2160p|web-dl|bluray|dual|dublado)\b/gi, "")
          .trim();
        if (cleanName) {
          setSingleTitle(cleanName);
          setTmdbSearchQuery(cleanName);
        }
      } catch {
        // ignore
      }
    }
  }

  // --- Submissão: Link Único ---
  async function handleAddSingleMovie(e: React.FormEvent) {
    e.preventDefault();
    if (!singleUrl.trim()) {
      setFeedback({ type: "error", message: "Informe a URL do vídeo." });
      return;
    }

    setIsSubmittingSingle(true);
    setFeedback(null);

    try {
      await api.createMovieFromUrl(
        {
          video_url: singleUrl.trim(),
          title: selectedTmdb?.title || singleTitle.trim() || undefined,
          tmdb_id: selectedTmdb?.tmdb_id || undefined,
          source_name: singleSourceName.trim() || "Link Web",
          is_series: isSeries,
          series_title: isSeries ? seriesTitle.trim() || undefined : undefined,
          season_number: isSeries && seasonNum !== "" ? Number(seasonNum) : undefined,
          episode_number: isSeries && episodeNum !== "" ? Number(episodeNum) : undefined,
        },
        token
      );

      setFeedback({ type: "success", message: "Filme adicionado ao catálogo com sucesso!" });
      setSingleUrl("");
      setSingleTitle("");
      setTmdbResults([]);
      setSelectedTmdb(null);
      onSuccess();
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message || "Erro ao cadastrar filme da Web." });
    } finally {
      setIsSubmittingSingle(false);
    }
  }

  // --- Submissão: Lote de Links ---
  async function handleBatchImport(e: React.FormEvent) {
    e.preventDefault();
    const lines = batchText
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && (l.startsWith("http://") || l.startsWith("https://")));

    if (lines.length === 0) {
      setFeedback({
        type: "error",
        message: "Nenhuma URL válida encontrada. Cole uma URL por linha iniciando com http:// ou https://",
      });
      return;
    }

    setIsSubmittingBatch(true);
    setFeedback(null);
    setBatchStatusMsg(`Importando ${lines.length} filmes e buscando dados no TMDB...`);

    const items = lines.map((line) => {
      const parts = line.split("|");
      const video_url = parts[0].trim();
      const title = parts[1] ? parts[1].trim() : undefined;
      return { video_url, title };
    });

    try {
      const res = await api.batchImportMovies(
        {
          items,
          source_name: batchSourceName.trim() || "Importação Web",
          fetch_tmdb: batchFetchTmdb,
        },
        token
      );

      setFeedback({
        type: "success",
        message: `Importação finalizada! ${res.added} adicionados com sucesso (${res.errors} erros).`,
      });
      setBatchText("");
      onSuccess();
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message || "Erro durante a importação em lote." });
    } finally {
      setIsSubmittingBatch(false);
      setBatchStatusMsg(null);
    }
  }

  // --- M3U Analysis ---
  async function handleAnalyzeM3u() {
    if (!m3uUrl.trim() && !m3uFile) {
      setFeedback({ type: "error", message: "Informe a URL da lista M3U ou selecione um arquivo .m3u" });
      return;
    }

    setIsAnalyzingM3u(true);
    setFeedback(null);
    setParsedM3u(null);

    try {
      let content: string | undefined = undefined;
      if (m3uFile) {
        content = await m3uFile.text();
      }

      const res = await api.parseMovieM3U(
        {
          url: m3uUrl.trim() || undefined,
          content,
        },
        token
      );

      setParsedM3u(res);
      // Marca todas as categorias como selecionadas por padrão
      const initCats: Record<string, boolean> = {};
      res.categories.forEach((c) => {
        initCats[c.category] = true;
      });
      setSelectedCats(initCats);
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message || "Erro ao analisar lista M3U." });
    } finally {
      setIsAnalyzingM3u(false);
    }
  }

  // --- M3U Import ---
  async function handleImportM3uSelected() {
    if (!parsedM3u) return;

    // Filtra itens com base nas categorias selecionadas
    const selectedItems = parsedM3u.items.filter((it) => selectedCats[it.category]);
    if (selectedItems.length === 0) {
      setFeedback({ type: "error", message: "Selecione ao menos uma categoria para importar." });
      return;
    }

    setIsImportingM3u(true);
    setFeedback(null);

    const itemsToImport = selectedItems.map((it) => ({
      video_url: it.video_url,
      title: it.clean_title || it.title,
      category: it.category,
      poster_url: it.poster_url || undefined,
    }));

    try {
      const res = await api.batchImportMovies(
        {
          items: itemsToImport,
          source_name: m3uSourceName.trim() || "Lista VOD Web",
          fetch_tmdb: m3uFetchTmdb,
        },
        token
      );

      setFeedback({
        type: "success",
        message: `Lista importada com sucesso! ${res.added} filmes adicionados ao catálogo.`,
      });
      setParsedM3u(null);
      setM3uUrl("");
      setM3uFile(null);
      onSuccess();
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message || "Erro ao importar filmes da lista M3U." });
    } finally {
      setIsImportingM3u(false);
    }
  }

  // --- Deletar Fonte ---
  async function handleDeleteSource(sourceName: string) {
    if (!confirm(`Tem certeza que deseja apagar TODOS os filmes da fonte "${sourceName}"? Esta ação não pode ser desfeita.`)) {
      return;
    }
    setDeletingSource(sourceName);
    try {
      const res = await api.deleteMoviesBySource(sourceName, token);
      setFeedback({ type: "success", message: `${res.deleted} filmes da fonte "${sourceName}" foram excluídos com sucesso!` });
      loadSources();
      onSuccess();
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message || "Erro ao excluir fonte." });
    } finally {
      setDeletingSource(null);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto">
      <div className="relative w-full max-w-3xl rounded-2xl border border-rule bg-panel shadow-2xl overflow-hidden my-8">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between border-b border-rule px-6 py-4 bg-panel2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/20 text-xl text-brand border border-brand/30">
              🌐
            </div>
            <div>
              <h2 className="text-lg font-bold text-ink">Adicionar Filmes da Web / Links</h2>
              <p className="text-xs text-mute">
                Importe filmes individuais, listas em lote ou listas completas M3U da internet
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-mute hover:bg-white/10 hover:text-ink transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Abas */}
        <div className="flex border-b border-rule bg-panel/50 px-6 gap-2 overflow-x-auto">
          {[
            { id: "single", label: "🔗 Link Único", desc: "1 Filme com TMDB" },
            { id: "batch", label: "📝 Links em Lote", desc: "Várias URLs de uma vez" },
            { id: "m3u", label: "📂 Lista M3U / VOD", desc: "Importar lista completa" },
            { id: "sources", label: "⚙️ Gerenciar Fontes", desc: "Ver e apagar listas" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id as TabType);
                setFeedback(null);
              }}
              className={`flex items-center gap-2 border-b-2 py-3 px-3 text-xs font-bold transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? "border-brand text-brand"
                  : "border-transparent text-mute hover:text-ink"
              }`}
            >
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`mx-6 mt-4 flex items-center justify-between rounded-xl p-3 text-xs font-medium border ${
              feedback.type === "success"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                : "border-rose-500/30 bg-rose-500/10 text-rose-400"
            }`}
          >
            <span>{feedback.message}</span>
            <button onClick={() => setFeedback(null)} className="ml-2 font-bold opacity-70 hover:opacity-100">
              ✕
            </button>
          </div>
        )}

        <div className="p-6 max-h-[70vh] overflow-y-auto">
          {/* TAB 1: Link Único */}
          {activeTab === "single" && (
            <form onSubmit={handleAddSingleMovie} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-ink mb-1">
                  URL Direta do Vídeo (.mp4, .mkv, .m3u8, etc.) *
                </label>
                <input
                  type="url"
                  required
                  placeholder="https://exemplo.com/videos/filme_incrivel_1080p.mp4"
                  value={singleUrl}
                  onChange={(e) => handleUrlChange(e.target.value)}
                  className="w-full rounded-xl border border-rule bg-panel2 px-4 py-2.5 text-xs text-ink placeholder-mute focus:border-brand focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-ink mb-1">
                    Título / Pesquisa TMDB
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Ex: Interestelar"
                      value={singleTitle}
                      onChange={(e) => {
                        setSingleTitle(e.target.value);
                        setTmdbSearchQuery(e.target.value);
                      }}
                      className="flex-1 rounded-xl border border-rule bg-panel2 px-4 py-2 text-xs text-ink placeholder-mute focus:border-brand focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleSearchTmdb()}
                      disabled={isSearchingTmdb || !singleTitle.trim()}
                      className="rounded-xl bg-brand/20 border border-brand/40 px-3 py-2 text-xs font-bold text-brand2 hover:bg-brand hover:text-white transition-all disabled:opacity-50"
                    >
                      {isSearchingTmdb ? "..." : "Buscar TMDB"}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-ink mb-1">
                    Nome da Fonte / Coleção
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Web Stream, Mega Filmes..."
                    value={singleSourceName}
                    onChange={(e) => setSingleSourceName(e.target.value)}
                    className="w-full rounded-xl border border-rule bg-panel2 px-4 py-2 text-xs text-ink placeholder-mute focus:border-brand focus:outline-none"
                  />
                </div>
              </div>

              {/* Resultados do TMDB para escolha */}
              {tmdbResults.length > 0 && (
                <div className="rounded-xl border border-rule bg-panel2 p-3 space-y-2">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-mute">
                    Selecione o Filme Correspondente no TMDB:
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                    {tmdbResults.map((t) => (
                      <button
                        key={t.tmdb_id}
                        type="button"
                        onClick={() => setSelectedTmdb(t)}
                        className={`flex items-center gap-3 rounded-lg border p-2 text-left transition-all ${
                          selectedTmdb?.tmdb_id === t.tmdb_id
                            ? "border-brand bg-brand/10 text-brand2"
                            : "border-rule/50 bg-panel hover:border-brand/40 text-ink"
                        }`}
                      >
                        {t.poster_url ? (
                          <img
                            src={t.poster_url}
                            alt={t.title}
                            className="h-14 w-10 rounded object-cover flex-shrink-0"
                          />
                        ) : (
                          <div className="h-14 w-10 rounded bg-white/5 flex items-center justify-center text-xs text-mute flex-shrink-0">
                            🎬
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-bold">{t.title}</p>
                          <p className="text-[10px] text-mute">{t.year || "Ano desc."}</p>
                          {t.overview && (
                            <p className="line-clamp-1 text-[10px] text-mute/80">{t.overview}</p>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Opções de Série */}
              <div className="rounded-xl border border-rule/60 bg-panel2/50 p-3 space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isSeries}
                    onChange={(e) => setIsSeries(e.target.checked)}
                    className="h-4 w-4 rounded border-rule text-brand focus:ring-brand"
                  />
                  <span className="text-xs font-bold text-ink">Este vídeo é um episódio de série</span>
                </label>

                {isSeries && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                    <div>
                      <label className="block text-[11px] font-medium text-mute mb-1">Título da Série</label>
                      <input
                        type="text"
                        placeholder="Ex: Breaking Bad"
                        value={seriesTitle}
                        onChange={(e) => setSeriesTitle(e.target.value)}
                        className="w-full rounded-lg border border-rule bg-panel px-3 py-1.5 text-xs text-ink placeholder-mute focus:border-brand focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-mute mb-1">Temporada (Nº)</label>
                      <input
                        type="number"
                        min="1"
                        placeholder="1"
                        value={seasonNum}
                        onChange={(e) => setSeasonNum(e.target.value === "" ? "" : Number(e.target.value))}
                        className="w-full rounded-lg border border-rule bg-panel px-3 py-1.5 text-xs text-ink placeholder-mute focus:border-brand focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-mute mb-1">Episódio (Nº)</label>
                      <input
                        type="number"
                        min="1"
                        placeholder="1"
                        value={episodeNum}
                        onChange={(e) => setEpisodeNum(e.target.value === "" ? "" : Number(e.target.value))}
                        className="w-full rounded-lg border border-rule bg-panel px-3 py-1.5 text-xs text-ink placeholder-mute focus:border-brand focus:outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl border border-rule px-4 py-2 text-xs font-bold text-mute hover:bg-white/5 hover:text-ink transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingSingle || !singleUrl.trim()}
                  className="rounded-xl bg-brand px-6 py-2 text-xs font-black text-white hover:brightness-110 transition-all disabled:opacity-50 shadow-lg shadow-brand/20"
                >
                  {isSubmittingSingle ? "Cadastrando..." : "Adicionar ao Catálogo"}
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: Lote de Links */}
          {activeTab === "batch" && (
            <form onSubmit={handleBatchImport} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-ink mb-1">
                  Cole as URLs dos Filmes (Uma por linha) *
                </label>
                <p className="text-[11px] text-mute mb-2">
                  Dica: Você pode colocar apenas a URL ou no formato <code className="text-brand">URL | Título</code>
                </p>
                <textarea
                  rows={8}
                  required
                  placeholder={`https://site.com/filmes/Avatar.2009.1080p.mp4\nhttps://site.com/filmes/Interestelar.2014.mkv\nhttps://site.com/stream/matrix.m3u8 | Matrix`}
                  value={batchText}
                  onChange={(e) => setBatchText(e.target.value)}
                  className="w-full rounded-xl border border-rule bg-panel2 p-3 font-mono text-xs text-ink placeholder-mute focus:border-brand focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-ink mb-1">
                    Nome da Fonte / Lista
                  </label>
                  <input
                    type="text"
                    value={batchSourceName}
                    onChange={(e) => setBatchSourceName(e.target.value)}
                    className="w-full rounded-xl border border-rule bg-panel2 px-4 py-2 text-xs text-ink placeholder-mute focus:border-brand focus:outline-none"
                  />
                </div>

                <div className="flex items-center pt-5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={batchFetchTmdb}
                      onChange={(e) => setBatchFetchTmdb(e.target.checked)}
                      className="h-4 w-4 rounded border-rule text-brand focus:ring-brand"
                    />
                    <span className="text-xs font-bold text-ink">
                      Buscar Sinopses e Capas no TMDB Automaticamente
                    </span>
                  </label>
                </div>
              </div>

              {batchStatusMsg && (
                <div className="rounded-xl border border-brand/30 bg-brand/10 p-3 text-xs font-bold text-brand2 animate-pulse">
                  ⏳ {batchStatusMsg}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl border border-rule px-4 py-2 text-xs font-bold text-mute hover:bg-white/5 hover:text-ink transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingBatch || !batchText.trim()}
                  className="rounded-xl bg-brand px-6 py-2 text-xs font-black text-white hover:brightness-110 transition-all disabled:opacity-50 shadow-lg shadow-brand/20"
                >
                  {isSubmittingBatch ? "Processando Lote..." : "Importar Todos os Links"}
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: M3U VOD */}
          {activeTab === "m3u" && (
            <div className="space-y-4">
              {!parsedM3u ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-ink mb-1">
                      Link da Lista M3U (VOD / Filmes)
                    </label>
                    <input
                      type="url"
                      placeholder="https://servidor-iptv.com/get.php?username=...&type=m3u_plus"
                      value={m3uUrl}
                      onChange={(e) => setM3uUrl(e.target.value)}
                      className="w-full rounded-xl border border-rule bg-panel2 px-4 py-2.5 text-xs text-ink placeholder-mute focus:border-brand focus:outline-none"
                    />
                  </div>

                  <div className="flex items-center gap-4 text-xs text-mute">
                    <div className="flex-1 border-t border-rule" />
                    <span>OU</span>
                    <div className="flex-1 border-t border-rule" />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-ink mb-1">
                      Enviar Arquivo de Lista (.m3u)
                    </label>
                    <input
                      type="file"
                      accept=".m3u,.m3u8,.txt"
                      onChange={(e) => setM3uFile(e.target.files?.[0] || null)}
                      className="w-full rounded-xl border border-rule bg-panel2 px-4 py-2 text-xs text-ink file:mr-4 file:rounded-lg file:border-0 file:bg-brand/20 file:px-3 file:py-1 file:text-xs file:font-bold file:text-brand hover:file:bg-brand/30"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-ink mb-1">
                      Nome desta Fonte / Pacote
                    </label>
                    <input
                      type="text"
                      value={m3uSourceName}
                      onChange={(e) => setM3uSourceName(e.target.value)}
                      className="w-full rounded-xl border border-rule bg-panel2 px-4 py-2 text-xs text-ink placeholder-mute focus:border-brand focus:outline-none"
                    />
                  </div>

                  <div className="flex justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="rounded-xl border border-rule px-4 py-2 text-xs font-bold text-mute hover:bg-white/5 hover:text-ink transition-all"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleAnalyzeM3u}
                      disabled={isAnalyzingM3u || (!m3uUrl.trim() && !m3uFile)}
                      className="rounded-xl bg-brand px-6 py-2 text-xs font-black text-white hover:brightness-110 transition-all disabled:opacity-50 shadow-lg shadow-brand/20"
                    >
                      {isAnalyzingM3u ? "Analisando Conteúdo..." : "Analisar Lista M3U"}
                    </button>
                  </div>
                </div>
              ) : (
                /* Prévia e Seleção das Categorias */
                <div className="space-y-4">
                  <div className="flex items-center justify-between rounded-xl bg-brand/10 border border-brand/30 p-3">
                    <div>
                      <h3 className="text-xs font-bold text-brand2">
                        ✨ Análise Concluída: {parsedM3u.total} filmes encontrados
                      </h3>
                      <p className="text-[11px] text-mute">
                        Selecione as categorias que você deseja adicionar ao seu SilvaFlix:
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setParsedM3u(null)}
                      className="rounded-lg border border-rule bg-panel px-3 py-1 text-xs font-bold text-mute hover:text-ink"
                    >
                      Trocar Lista
                    </button>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const all: Record<string, boolean> = {};
                          parsedM3u.categories.forEach((c) => (all[c.category] = true));
                          setSelectedCats(all);
                        }}
                        className="text-[11px] font-bold text-brand hover:underline"
                      >
                        Marcar Todas
                      </button>
                      <span className="text-mute">|</span>
                      <button
                        type="button"
                        onClick={() => setSelectedCats({})}
                        className="text-[11px] font-bold text-mute hover:text-ink"
                      >
                        Desmarcar Todas
                      </button>
                    </div>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={m3uFetchTmdb}
                        onChange={(e) => setM3uFetchTmdb(e.target.checked)}
                        className="h-4 w-4 rounded border-rule text-brand focus:ring-brand"
                      />
                      <span className="text-[11px] font-bold text-ink">Buscar Metadados TMDB</span>
                    </label>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-60 overflow-y-auto p-1">
                    {parsedM3u.categories.map((cat) => {
                      const isChecked = !!selectedCats[cat.category];
                      return (
                        <label
                          key={cat.category}
                          className={`flex items-center justify-between rounded-xl border p-2.5 cursor-pointer transition-all ${
                            isChecked
                              ? "border-brand/50 bg-brand/10 text-brand2 font-bold"
                              : "border-rule/50 bg-panel2/50 text-mute hover:border-brand/30"
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) =>
                                setSelectedCats((prev) => ({
                                  ...prev,
                                  [cat.category]: e.target.checked,
                                }))
                              }
                              className="h-4 w-4 rounded border-rule text-brand focus:ring-brand"
                            />
                            <span className="truncate text-xs">{cat.category}</span>
                          </div>
                          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold">
                            {cat.count}
                          </span>
                        </label>
                      );
                    })}
                  </div>

                  <div className="flex justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setParsedM3u(null)}
                      className="rounded-xl border border-rule px-4 py-2 text-xs font-bold text-mute hover:bg-white/5 hover:text-ink transition-all"
                    >
                      Voltar
                    </button>
                    <button
                      type="button"
                      onClick={handleImportM3uSelected}
                      disabled={isImportingM3u}
                      className="rounded-xl bg-brand px-6 py-2 text-xs font-black text-white hover:brightness-110 transition-all disabled:opacity-50 shadow-lg shadow-brand/20"
                    >
                      {isImportingM3u ? "Importando Filmes..." : "Importar Categorias Selecionadas"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: Gerenciar Fontes Web */}
          {activeTab === "sources" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-mute">
                  Listas e origens de filmes registradas no seu catálogo. Você pode apagar uma lista inteira com 1 clique:
                </p>
                <button
                  onClick={loadSources}
                  disabled={isLoadingSources}
                  className="rounded-lg border border-rule px-2.5 py-1 text-xs font-bold text-mute hover:text-ink"
                >
                  🔄 Atualizar
                </button>
              </div>

              {isLoadingSources ? (
                <div className="py-8 text-center text-xs text-mute">Carregando fontes...</div>
              ) : sources.length === 0 ? (
                <div className="rounded-xl border border-dashed border-rule py-8 text-center text-xs text-mute">
                  Nenhuma fonte de filme encontrada.
                </div>
              ) : (
                <div className="space-y-2">
                  {sources.map((src) => (
                    <div
                      key={src.name}
                      className="flex items-center justify-between rounded-xl border border-rule bg-panel2 p-3.5 hover:border-rule/80 transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <div className="text-xl">
                          {src.is_external ? "🌐" : "📁"}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-ink">{src.name}</p>
                          <p className="text-[10px] text-mute">
                            {src.is_external ? "Conteúdo Web / Online" : "Armazenamento Local do Servidor"}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="rounded-full bg-brand/15 border border-brand/30 px-3 py-1 text-xs font-bold text-brand2">
                          {src.count} filmes
                        </span>

                        {src.is_external && (
                          <button
                            type="button"
                            onClick={() => handleDeleteSource(src.name)}
                            disabled={deletingSource === src.name}
                            className="rounded-lg bg-rose-500/15 border border-rose-500/30 px-3 py-1.5 text-xs font-bold text-rose-400 hover:bg-rose-500 hover:text-white transition-all disabled:opacity-50"
                          >
                            {deletingSource === src.name ? "Excluindo..." : "Excluir Lista"}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
