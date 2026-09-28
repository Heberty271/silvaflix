"use client";

import { useState, useEffect } from "react";
import {
  api,
  TMDBSearchResult,
  ParseMovieM3UResponse,
  MovieSource,
  ParsedMovieItem,
} from "@/lib/api";

interface ImportMovieWebModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: string;
  onSuccess: () => void;
}

type TabType = "single" | "batch" | "m3u" | "sources";
type M3uFilterType = "all" | "movies" | "series";

export function ImportMovieWebModal({
  isOpen,
  onClose,
  token,
  onSuccess,
}: ImportMovieWebModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>("m3u");

  // Tab 1: Link Único
  const [singleUrl, setSingleUrl] = useState("");
  const [singleTitle, setSingleTitle] = useState("");
  const [singleSourceName, setSingleSourceName] = useState("Link Web");
  const [isSeries, setIsSeries] = useState(false);
  const [seriesTitle, setSeriesTitle] = useState("");
  const [seasonNum, setSeasonNum] = useState<number | "">("");
  const [episodeNum, setEpisodeNum] = useState<number | "">("");
  const [episodeTitle, setEpisodeTitle] = useState("");
  const [tmdbSearchQuery, setTmdbSearchQuery] = useState("");
  const [tmdbResults, setTmdbResults] = useState<TMDBSearchResult[]>([]);
  const [selectedTmdb, setSelectedTmdb] = useState<TMDBSearchResult | null>(null);
  const [isSearchingTmdb, setIsSearchingTmdb] = useState(false);
  const [isSubmittingSingle, setIsSubmittingSingle] = useState(false);

  // Tab 2: Lote de Links
  const [batchText, setBatchText] = useState("");
  const [batchSourceName, setBatchSourceName] = useState("Importação Web");
  const [batchFetchTmdb, setBatchFetchTmdb] = useState(false);
  const [isSubmittingBatch, setIsSubmittingBatch] = useState(false);

  // Tab 3: M3U VOD
  const [m3uUrl, setM3uUrl] = useState("");
  const [m3uFile, setM3uFile] = useState<File | null>(null);
  const [m3uSourceName, setM3uSourceName] = useState("Lista VOD Web");
  const [isAnalyzingM3u, setIsAnalyzingM3u] = useState(false);
  const [parsedM3u, setParsedM3u] = useState<ParseMovieM3UResponse | null>(null);
  const [selectedCats, setSelectedCats] = useState<Record<string, boolean>>({});
  const [m3uFetchTmdb, setM3uFetchTmdb] = useState(false);
  const [m3uFilter, setM3uFilter] = useState<M3uFilterType>("all");
  const [m3uSearchPreview, setM3uSearchPreview] = useState("");
  const [isImportingM3u, setIsImportingM3u] = useState(false);

  // Barra de progresso para importação em lotes
  const [progress, setProgress] = useState<{ current: number; total: number; percent: number } | null>(null);

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

          // Verifica se parece episódio de série
          const matchSe = cleanName.match(/\bS(\d{1,2})[\s\.\-_]*E(\d{1,3})\b/i) || cleanName.match(/\b(\d{1,2})x(\d{1,3})\b/i);
          if (matchSe) {
            setIsSeries(true);
            setSeasonNum(Number(matchSe[1]));
            setEpisodeNum(Number(matchSe[2]));
            const sTitle = cleanName.slice(0, matchSe.index).trim();
            if (sTitle) {
              setSeriesTitle(sTitle);
              setTmdbSearchQuery(sTitle);
            }
          }
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
          series_title: isSeries ? (seriesTitle.trim() || singleTitle.trim() || undefined) : undefined,
          season_number: isSeries && seasonNum !== "" ? Number(seasonNum) : undefined,
          episode_number: isSeries && episodeNum !== "" ? Number(episodeNum) : undefined,
        },
        token
      );

      setFeedback({ type: "success", message: isSeries ? "Episódio adicionado ao catálogo com sucesso!" : "Filme adicionado ao catálogo com sucesso!" });
      setSingleUrl("");
      setSingleTitle("");
      setSeriesTitle("");
      setSeasonNum("");
      setEpisodeNum("");
      setTmdbResults([]);
      setSelectedTmdb(null);
      onSuccess();
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message || "Erro ao cadastrar filme da Web." });
    } finally {
      setIsSubmittingSingle(false);
    }
  }

  // --- Submissão: Lote de Links (com Chunking e Progresso) ---
  async function handleBatchImport(e: React.FormEvent) {
    e.preventDefault();
    const lines = batchText
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && (l.startsWith("http://") || l.startsWith("https://")));

    if (lines.length === 0) {
      setFeedback({
        type: "error",
        message: "Nenhuma URL válida encontrada. Cole uma URL por linha iniciando com http:// ou https:// (ex: https://... | Nome do Filme)",
      });
      return;
    }

    setIsSubmittingBatch(true);
    setFeedback(null);
    setProgress({ current: 0, total: lines.length, percent: 0 });

    const allItems = lines.map((line) => {
      const parts = line.split("|");
      const video_url = parts[0].trim();
      const title = parts[1] ? parts[1].trim() : undefined;
      return { video_url, title };
    });

    const CHUNK_SIZE = 40;
    let addedCount = 0;
    let errorCount = 0;

    try {
      for (let i = 0; i < allItems.length; i += CHUNK_SIZE) {
        const chunk = allItems.slice(i, i + CHUNK_SIZE);
        const res = await api.batchImportMovies(
          {
            items: chunk,
            source_name: batchSourceName.trim() || "Importação Web",
            fetch_tmdb: batchFetchTmdb,
          },
          token
        );
        addedCount += res.added;
        errorCount += res.errors;
        const currentProcessed = Math.min(i + CHUNK_SIZE, allItems.length);
        setProgress({
          current: currentProcessed,
          total: allItems.length,
          percent: Math.round((currentProcessed / allItems.length) * 100),
        });
      }

      setFeedback({
        type: "success",
        message: `Importação em lote concluída! ${addedCount} itens adicionados com sucesso (${errorCount} erros).`,
      });
      setBatchText("");
      onSuccess();
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message || "Erro durante a importação em lote." });
    } finally {
      setIsSubmittingBatch(false);
      setProgress(null);
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

  // --- M3U Import (com Chunking e Progresso em tempo real) ---
  async function handleImportM3uSelected() {
    if (!parsedM3u) return;

    // Filtra itens com base nas categorias selecionadas
    let selectedItems = parsedM3u.items.filter((it) => selectedCats[it.category]);

    // Aplica filtro de tipo (se aplicável)
    if (m3uFilter === "movies") {
      selectedItems = selectedItems.filter((it) => !it.is_series);
    } else if (m3uFilter === "series") {
      selectedItems = selectedItems.filter((it) => it.is_series);
    }

    if (selectedItems.length === 0) {
      setFeedback({ type: "error", message: "Nenhum item selecionado para importar." });
      return;
    }

    setIsImportingM3u(true);
    setFeedback(null);
    setProgress({ current: 0, total: selectedItems.length, percent: 0 });

    const itemsToImport = selectedItems.map((it) => ({
      video_url: it.video_url,
      title: it.title,
      category: it.category,
      poster_url: it.poster_url || undefined,
      is_series: it.is_series,
      series_title: it.series_title,
      season_number: it.season_number,
      episode_number: it.episode_number,
      episode_title: it.episode_title,
    }));

    const CHUNK_SIZE = 40;
    let addedCount = 0;
    let errorCount = 0;

    try {
      for (let i = 0; i < itemsToImport.length; i += CHUNK_SIZE) {
        const chunk = itemsToImport.slice(i, i + CHUNK_SIZE);
        const res = await api.batchImportMovies(
          {
            items: chunk,
            source_name: m3uSourceName.trim() || "Lista VOD Web",
            fetch_tmdb: m3uFetchTmdb,
          },
          token
        );
        addedCount += res.added;
        errorCount += res.errors;
        const currentProcessed = Math.min(i + CHUNK_SIZE, itemsToImport.length);
        setProgress({
          current: currentProcessed,
          total: itemsToImport.length,
          percent: Math.round((currentProcessed / itemsToImport.length) * 100),
        });
      }

      setFeedback({
        type: "success",
        message: `Lista importada com sucesso! ${addedCount} itens cadastrados (${errorCount} erros).`,
      });
      setParsedM3u(null);
      setM3uUrl("");
      setM3uFile(null);
      onSuccess();
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message || "Erro ao importar filmes da lista M3U." });
    } finally {
      setIsImportingM3u(false);
      setProgress(null);
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

  // Itens filtrados para a prévia M3U
  const previewFilteredItems = parsedM3u
    ? parsedM3u.items
        .filter((it) => selectedCats[it.category])
        .filter((it) => {
          if (m3uFilter === "movies") return !it.is_series;
          if (m3uFilter === "series") return it.is_series;
          return true;
        })
        .filter((it) => {
          if (!m3uSearchPreview.trim()) return true;
          const q = m3uSearchPreview.toLowerCase();
          return it.title.toLowerCase().includes(q) || it.category.toLowerCase().includes(q);
        })
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto">
      <div className="relative w-full max-w-4xl rounded-2xl border border-rule bg-panel shadow-2xl overflow-hidden my-6">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between border-b border-rule px-6 py-4 bg-panel2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/20 text-xl text-brand border border-brand/30">
              🌐
            </div>
            <div>
              <h2 className="text-lg font-bold text-ink">Adicionar Filmes e Séries da Web</h2>
              <p className="text-xs text-mute">
                Importe links diretos (.mp4, .mkv, .m3u8), listas em lote ou listas completas M3U com separação inteligente de séries e filmes
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
            { id: "m3u", label: "📂 Lista M3U / VOD", desc: "Filmes e Séries em Lote" },
            { id: "single", label: "🔗 Link Único", desc: "1 Filme ou Episódio" },
            { id: "batch", label: "📝 Links em Texto", desc: "Múltiplas URLs diretas" },
            { id: "sources", label: "⚙️ Gerenciar Fontes", desc: "Ver e apagar listas" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id as TabType);
                setFeedback(null);
              }}
              className={`flex items-center gap-2 py-3 px-4 border-b-2 text-sm font-semibold transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? "border-brand text-brand bg-brand/5"
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
            className={`mx-6 mt-4 p-3 rounded-lg border text-sm flex items-center justify-between ${
              feedback.type === "success"
                ? "bg-emerald-950/40 border-emerald-800 text-emerald-300"
                : "bg-red-950/40 border-red-800 text-red-300"
            }`}
          >
            <span>{feedback.message}</span>
            <button
              onClick={() => setFeedback(null)}
              className="text-xs opacity-70 hover:opacity-100 ml-3"
            >
              ✕
            </button>
          </div>
        )}

        {/* Barra de Progresso Global */}
        {progress && (
          <div className="mx-6 mt-4 p-4 rounded-xl border border-brand/40 bg-brand/10 space-y-2">
            <div className="flex justify-between items-center text-xs font-semibold text-ink">
              <span>🚀 Processando importação: {progress.current} de {progress.total} itens</span>
              <span className="text-brand">{progress.percent}%</span>
            </div>
            <div className="h-2 w-full bg-void rounded-full overflow-hidden border border-rule">
              <div
                className="h-full bg-brand transition-all duration-300"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
          </div>
        )}

        {/* Conteúdo das Abas */}
        <div className="p-6 max-h-[75vh] overflow-y-auto">
          {/* ============================================================
              ABA 1: LISTA M3U / VOD (FILMES E SÉRIES)
              ============================================================ */}
          {activeTab === "m3u" && (
            <div className="space-y-6">
              {!parsedM3u ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-ink mb-1">
                      URL da Lista M3U / VOD
                    </label>
                    <input
                      type="url"
                      placeholder="http://servidor.com/get.php?username=...&password=...&type=m3u_plus&output=ts"
                      value={m3uUrl}
                      onChange={(e) => setM3uUrl(e.target.value)}
                      className="input font-mono text-xs w-full"
                    />
                    <p className="text-[11px] text-mute mt-1">
                      Aceita listas M3U de VOD, canais, séries ou links diretos da internet.
                    </p>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="flex-1 border-t border-rule" />
                    <span className="text-xs text-mute uppercase font-semibold">OU</span>
                    <div className="flex-1 border-t border-rule" />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-ink mb-1">
                      Arquivo M3U do seu computador
                    </label>
                    <input
                      type="file"
                      accept=".m3u,.m3u8,.txt"
                      onChange={(e) => setM3uFile(e.target.files?.[0] || null)}
                      className="block w-full text-xs text-mute file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-panel2 file:text-ink hover:file:bg-white/10"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                    <div>
                      <label className="block text-sm font-medium text-ink mb-1">
                        Nome da Fonte / Pacote
                      </label>
                      <input
                        type="text"
                        value={m3uSourceName}
                        onChange={(e) => setM3uSourceName(e.target.value)}
                        placeholder="Ex: Filmes Netflix, Séries HBO, Lista Vip"
                        className="input text-xs w-full"
                      />
                      <p className="text-[11px] text-mute mt-1">
                        Usado para filtrar ou apagar esta lista inteira depois com 1 clique.
                      </p>
                    </div>

                    <div className="rounded-xl border border-rule bg-panel2 p-3 flex flex-col justify-center">
                      <span className="text-xs font-semibold text-ink mb-1">💡 Dica de Desempenho</span>
                      <p className="text-[11px] text-mute leading-relaxed">
                        O sistema analisa as categorias e títulos antes de salvar. Você escolhe quais categorias importar e o sistema separa automaticamente séries de filmes!
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={isAnalyzingM3u || (!m3uUrl.trim() && !m3uFile)}
                    onClick={handleAnalyzeM3u}
                    className="w-full rounded-xl bg-brand py-3 font-semibold text-ink transition hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isAnalyzingM3u ? (
                      <>
                        <span className="animate-spin text-lg">⏳</span>
                        <span>Analisando e separando filmes e séries...</span>
                      </>
                    ) : (
                      <>
                        <span>🔍 Analisar Lista M3U</span>
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Resumo da Lista Analisada */}
                  <div className="rounded-xl border border-rule bg-panel2 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <h3 className="font-bold text-ink text-base">Lista Analisada com Sucesso</h3>
                        <div className="flex flex-wrap gap-2 mt-1">
                          <span className="badge bg-white/10 text-ink text-xs">
                            📊 Total: {parsedM3u.total} itens
                          </span>
                          <span className="badge bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs">
                            🎬 {parsedM3u.total_movies ?? parsedM3u.items.filter((x) => !x.is_series).length} Filmes
                          </span>
                          <span className="badge bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 text-xs">
                            📺 {parsedM3u.total_episodes ?? parsedM3u.items.filter((x) => x.is_series).length} Episódios de Séries
                          </span>
                          <span className="badge bg-purple-500/20 text-purple-400 border border-purple-500/30 text-xs">
                            📁 {parsedM3u.categories.length} Categorias
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setParsedM3u(null)}
                        className="rounded-lg border border-rule px-3 py-1.5 text-xs text-mute hover:text-ink hover:bg-white/5"
                      >
                        Carregar Outra Lista
                      </button>
                    </div>
                  </div>

                  {/* Configurações de Importação (Modo Rápido vs TMDB) */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-xl border border-rule bg-void/50 p-4">
                    <div>
                      <label className="block text-xs font-semibold text-ink mb-1">
                        Nome da Fonte Registrada
                      </label>
                      <input
                        type="text"
                        value={m3uSourceName}
                        onChange={(e) => setM3uSourceName(e.target.value)}
                        className="input text-xs w-full font-medium"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-ink mb-1">
                        Modo de Importação
                      </label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setM3uFetchTmdb(false)}
                          className={`flex-1 rounded-lg border py-2 px-3 text-xs font-semibold transition text-left ${
                            !m3uFetchTmdb
                              ? "border-emerald-500/80 bg-emerald-950/40 text-emerald-300"
                              : "border-rule bg-panel text-mute hover:text-ink"
                          }`}
                        >
                          <div className="font-bold">⚡ Modo Rápido (Recomendado)</div>
                          <div className="text-[10px] opacity-80">Importa instantaneamente com títulos e capas da lista</div>
                        </button>

                        <button
                          type="button"
                          onClick={() => setM3uFetchTmdb(true)}
                          className={`flex-1 rounded-lg border py-2 px-3 text-xs font-semibold transition text-left ${
                            m3uFetchTmdb
                              ? "border-brand bg-brand/10 text-brand"
                              : "border-rule bg-panel text-mute hover:text-ink"
                          }`}
                        >
                          <div className="font-bold">✨ TMDB Concorrente</div>
                          <div className="text-[10px] opacity-80">Busca sinopses, posters HD e trailers em paralelo</div>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Seleção de Categorias */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-bold text-ink uppercase tracking-wider">
                        Selecione as Categorias para Importar
                      </label>
                      <div className="flex gap-2 text-xs">
                        <button
                          type="button"
                          onClick={() => {
                            const all: Record<string, boolean> = {};
                            parsedM3u.categories.forEach((c) => (all[c.category] = true));
                            setSelectedCats(all);
                          }}
                          className="text-brand hover:underline"
                        >
                          Marcar Todas
                        </button>
                        <span className="text-mute">•</span>
                        <button
                          type="button"
                          onClick={() => setSelectedCats({})}
                          className="text-mute hover:text-ink hover:underline"
                        >
                          Desmarcar Todas
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-48 overflow-y-auto p-2 rounded-xl border border-rule bg-panel2">
                      {parsedM3u.categories.map((cat) => {
                        const isChecked = !!selectedCats[cat.category];
                        return (
                          <label
                            key={cat.category}
                            className={`flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer transition select-none ${
                              isChecked
                                ? "border-brand/40 bg-brand/10 text-ink"
                                : "border-rule/50 bg-void/30 text-mute hover:bg-white/5"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) =>
                                setSelectedCats((prev) => ({
                                  ...prev,
                                  [cat.category]: e.target.checked,
                                }))
                              }
                              className="accent-brand rounded"
                            />
                            <span className="truncate flex-1 font-medium">{cat.category}</span>
                            <span className="text-[10px] text-mute font-mono">({cat.count})</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Prévia dos Itens Filtrados com Separação Séries / Filmes */}
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <label className="text-xs font-bold text-ink uppercase tracking-wider">
                          Prévia dos Itens Selecionados ({previewFilteredItems.length})
                        </label>
                      </div>

                      {/* Filtros de Tipo */}
                      <div className="flex items-center gap-1.5 text-xs">
                        <button
                          type="button"
                          onClick={() => setM3uFilter("all")}
                          className={`px-2.5 py-1 rounded-md transition font-medium ${
                            m3uFilter === "all"
                              ? "bg-brand text-ink"
                              : "bg-panel2 text-mute hover:text-ink border border-rule"
                          }`}
                        >
                          Todos
                        </button>
                        <button
                          type="button"
                          onClick={() => setM3uFilter("movies")}
                          className={`px-2.5 py-1 rounded-md transition font-medium ${
                            m3uFilter === "movies"
                              ? "bg-emerald-600 text-ink"
                              : "bg-panel2 text-mute hover:text-ink border border-rule"
                          }`}
                        >
                          🎬 Apenas Filmes
                        </button>
                        <button
                          type="button"
                          onClick={() => setM3uFilter("series")}
                          className={`px-2.5 py-1 rounded-md transition font-medium ${
                            m3uFilter === "series"
                              ? "bg-indigo-600 text-ink"
                              : "bg-panel2 text-mute hover:text-ink border border-rule"
                          }`}
                        >
                          📺 Apenas Séries
                        </button>
                      </div>
                    </div>

                    {/* Busca Rápida na Prévia */}
                    <input
                      type="text"
                      placeholder="Filtrar prévia por nome ou categoria..."
                      value={m3uSearchPreview}
                      onChange={(e) => setM3uSearchPreview(e.target.value)}
                      className="input text-xs w-full mb-2 py-1.5"
                    />

                    <div className="max-h-52 overflow-y-auto space-y-1.5 rounded-xl border border-rule bg-void/40 p-2 font-mono text-xs">
                      {previewFilteredItems.length === 0 ? (
                        <p className="text-center text-mute py-4 text-xs">
                          Nenhum item selecionado ou encontrado com os filtros atuais.
                        </p>
                      ) : (
                        previewFilteredItems.slice(0, 100).map((it, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between p-2 rounded-lg bg-panel2/60 border border-rule/50 gap-3"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {it.is_series ? (
                                <span className="badge bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 text-[10px] shrink-0 font-sans">
                                  📺 T{String(it.season_number || 1).padStart(2, "0")}E{String(it.episode_number || 1).padStart(2, "0")}
                                </span>
                              ) : (
                                <span className="badge bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] shrink-0 font-sans">
                                  🎬 Filme
                                </span>
                              )}
                              <span className="truncate font-sans font-medium text-ink">
                                {it.is_series && it.series_title
                                  ? `${it.series_title} - ${it.title}`
                                  : it.title}
                              </span>
                            </div>
                            <span className="text-[10px] text-mute shrink-0 px-2 py-0.5 rounded bg-void border border-rule font-sans">
                              {it.category}
                            </span>
                          </div>
                        ))
                      )}
                      {previewFilteredItems.length > 100 && (
                        <p className="text-center text-[11px] text-mute py-2 font-sans">
                          ... e mais {previewFilteredItems.length - 100} itens selecionados para importar.
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Botão de Importação Final */}
                  <button
                    type="button"
                    disabled={isImportingM3u || previewFilteredItems.length === 0}
                    onClick={handleImportM3uSelected}
                    className="w-full rounded-xl bg-brand py-3.5 font-bold text-ink transition hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-brand/20"
                  >
                    {isImportingM3u ? (
                      <>
                        <span className="animate-spin text-lg">⏳</span>
                        <span>Importando {previewFilteredItems.length} itens...</span>
                      </>
                    ) : (
                      <>
                        <span>📥 Importar {previewFilteredItems.length} Itens Selecionados</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ============================================================
              ABA 2: LINK ÚNICO (FILME OU EPISÓDIO)
              ============================================================ */}
          {activeTab === "single" && (
            <form onSubmit={handleAddSingleMovie} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-ink mb-1">
                  URL Direta do Vídeo / Stream *
                </label>
                <input
                  type="url"
                  required
                  placeholder="https://exemplo.com/filme.mp4 ou https://exemplo.com/stream.m3u8"
                  value={singleUrl}
                  onChange={(e) => handleUrlChange(e.target.value)}
                  className="input font-mono text-xs w-full"
                />
                <p className="text-[11px] text-mute mt-1">
                  Formatos suportados: .mp4, .mkv, .m3u8 (HLS), .webm, .mov, etc.
                </p>
              </div>

              {/* Tipo de Mídia: Filme vs Série */}
              <div className="rounded-xl border border-rule bg-panel2 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-ink">Tipo de Conteúdo:</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setIsSeries(false)}
                      className={`px-3 py-1 rounded-md text-xs font-semibold transition ${
                        !isSeries ? "bg-brand text-ink" : "bg-void text-mute hover:text-ink"
                      }`}
                    >
                      🎬 Filme
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsSeries(true)}
                      className={`px-3 py-1 rounded-md text-xs font-semibold transition ${
                        isSeries ? "bg-indigo-600 text-ink" : "bg-void text-mute hover:text-ink"
                      }`}
                    >
                      📺 Série / Episódio
                    </button>
                  </div>
                </div>

                {isSeries && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3 pt-3 border-t border-rule">
                    <div>
                      <label className="block text-[11px] text-mute mb-1">Nome da Série</label>
                      <input
                        type="text"
                        placeholder="Ex: Stranger Things"
                        value={seriesTitle}
                        onChange={(e) => setSeriesTitle(e.target.value)}
                        className="input text-xs w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-mute mb-1">Temporada (Nº)</label>
                      <input
                        type="number"
                        min="1"
                        placeholder="1"
                        value={seasonNum}
                        onChange={(e) => setSeasonNum(e.target.value ? Number(e.target.value) : "")}
                        className="input text-xs w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-mute mb-1">Episódio (Nº)</label>
                      <input
                        type="number"
                        min="1"
                        placeholder="1"
                        value={episodeNum}
                        onChange={(e) => setEpisodeNum(e.target.value ? Number(e.target.value) : "")}
                        className="input text-xs w-full"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-ink mb-1">
                  Título {isSeries ? "do Episódio ou Série" : "do Filme"}
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Ex: Interestelar ou T01E01 - Piloto"
                    value={singleTitle}
                    onChange={(e) => {
                      setSingleTitle(e.target.value);
                      setTmdbSearchQuery(e.target.value);
                    }}
                    className="input text-xs flex-1"
                  />
                  <button
                    type="button"
                    disabled={isSearchingTmdb || !singleTitle.trim()}
                    onClick={() => handleSearchTmdb()}
                    className="rounded-lg bg-panel2 border border-rule px-4 py-2 text-xs font-semibold text-brand hover:bg-brand/10 transition disabled:opacity-50 shrink-0"
                  >
                    {isSearchingTmdb ? "Buscando..." : "🔍 Buscar no TMDB"}
                  </button>
                </div>
              </div>

              {/* Resultados da busca TMDB */}
              {tmdbResults.length > 0 && (
                <div className="rounded-xl border border-rule bg-panel2 p-3 space-y-2">
                  <span className="text-xs font-semibold text-ink">Resultados do TMDB:</span>
                  <div className="max-h-40 overflow-y-auto space-y-2">
                    {tmdbResults.map((r) => (
                      <div
                        key={r.tmdb_id}
                        onClick={() => setSelectedTmdb(r)}
                        className={`flex items-center gap-3 p-2 rounded-lg border cursor-pointer transition ${
                          selectedTmdb?.tmdb_id === r.tmdb_id
                            ? "border-brand bg-brand/10"
                            : "border-rule/50 bg-void/50 hover:bg-white/5"
                        }`}
                      >
                        {r.poster_url ? (
                          <img
                            src={r.poster_url}
                            alt={r.title}
                            className="h-12 w-8 rounded object-cover"
                          />
                        ) : (
                          <div className="h-12 w-8 rounded bg-void flex items-center justify-center text-xs">
                            🎬
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-xs text-ink truncate">{r.title}</p>
                          <p className="text-[10px] text-mute">{r.year || "Ano desconhecido"}</p>
                        </div>
                        {selectedTmdb?.tmdb_id === r.tmdb_id && (
                          <span className="text-brand text-xs font-bold">✓ Selecionado</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-ink mb-1">
                  Fonte / Categoria
                </label>
                <input
                  type="text"
                  value={singleSourceName}
                  onChange={(e) => setSingleSourceName(e.target.value)}
                  placeholder="Ex: Web, Servidor 1, Drive"
                  className="input text-xs w-full"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmittingSingle || !singleUrl.trim()}
                className="w-full rounded-xl bg-brand py-3 font-semibold text-ink transition hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSubmittingSingle ? (
                  <>
                    <span className="animate-spin">⏳</span>
                    <span>Adicionando...</span>
                  </>
                ) : (
                  <span>➕ Adicionar ao Catálogo</span>
                )}
              </button>
            </form>
          )}

          {/* ============================================================
              ABA 3: LOTE DE LINKS EM TEXTO
              ============================================================ */}
          {activeTab === "batch" && (
            <form onSubmit={handleBatchImport} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-ink mb-1">
                  Cole as URLs dos vídeos (uma por linha)
                </label>
                <textarea
                  rows={7}
                  placeholder={`https://servidor.com/filme1.mp4 | Interestelar\nhttps://servidor.com/filme2.mp4 | Oppenheimer\nhttps://servidor.com/series/stranger_things_s01e01.mp4 | Stranger Things S01E01`}
                  value={batchText}
                  onChange={(e) => setBatchText(e.target.value)}
                  className="input font-mono text-xs w-full resize-y"
                />
                <p className="text-[11px] text-mute mt-1">
                  Dica: Você pode colocar <code className="text-brand">URL | Nome do Filme ou Série</code> para definir o título explicitamente.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-ink mb-1">
                    Nome da Fonte
                  </label>
                  <input
                    type="text"
                    value={batchSourceName}
                    onChange={(e) => setBatchSourceName(e.target.value)}
                    placeholder="Ex: Importação Lote 1"
                    className="input text-xs w-full"
                  />
                </div>

                <div className="flex items-center gap-2 pt-6">
                  <input
                    type="checkbox"
                    id="batchTmdb"
                    checked={batchFetchTmdb}
                    onChange={(e) => setBatchFetchTmdb(e.target.checked)}
                    className="accent-brand rounded"
                  />
                  <label htmlFor="batchTmdb" className="text-xs text-ink cursor-pointer select-none">
                    Buscar dados no TMDB (sinopse, capas e elenco)
                  </label>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmittingBatch || !batchText.trim()}
                className="w-full rounded-xl bg-brand py-3 font-semibold text-ink transition hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSubmittingBatch ? (
                  <>
                    <span className="animate-spin">⏳</span>
                    <span>Importando Lote...</span>
                  </>
                ) : (
                  <span>🚀 Iniciar Importação em Lote</span>
                )}
              </button>
            </form>
          )}

          {/* ============================================================
              ABA 4: GERENCIAR FONTES (EXCLUIR LISTAS)
              ============================================================ */}
          {activeTab === "sources" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-ink">Fontes Cadastradas no Catálogo</h3>
                  <p className="text-xs text-mute">
                    Veja quantas mídias cada lista adicionou e apague lotes inteiros indesejados com 1 clique.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={loadSources}
                  disabled={isLoadingSources}
                  className="rounded-lg border border-rule px-3 py-1.5 text-xs text-mute hover:text-ink hover:bg-white/5"
                >
                  🔄 Atualizar
                </button>
              </div>

              {isLoadingSources ? (
                <p className="text-center text-mute py-8 text-xs">Carregando fontes...</p>
              ) : sources.length === 0 ? (
                <p className="text-center text-mute py-8 text-xs">
                  Nenhuma fonte externa registrada no momento.
                </p>
              ) : (
                <div className="space-y-2">
                  {sources.map((src) => (
                    <div
                      key={src.name}
                      className="flex items-center justify-between p-3 rounded-xl border border-rule bg-panel2/70"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-lg">
                          {src.is_external ? "🌐" : "📁"}
                        </span>
                        <div>
                          <p className="font-semibold text-xs text-ink">{src.name}</p>
                          <p className="text-[11px] text-mute">
                            {src.count} {src.count === 1 ? "mídia cadastrada" : "mídias cadastradas"}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={deletingSource === src.name}
                        onClick={() => handleDeleteSource(src.name)}
                        className="rounded-lg border border-red-800/40 bg-red-950/30 px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-900/50 hover:text-red-200 transition disabled:opacity-50 flex items-center gap-1.5"
                      >
                        {deletingSource === src.name ? "Excluindo..." : "🗑️ Apagar Lista"}
                      </button>
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
