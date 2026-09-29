"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  api,
  AISearchResultResponse,
  AIStreamOption,
  AIMetadata,
  Movie,
  TorrentSearchResponse,
  TorrentStreamOption,
  DownloadTaskOut,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

interface AiMovieFinderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMovieAdded?: () => void;
}

const QUICK_SUGGESTIONS = [
  "Harry Potter 1",
  "Vingadores Ultimato",
  "Interestelar",
  "Matrix",
  "O Senhor dos Anéis 1",
  "Avatar 2",
  "Stranger Things S01E01",
  "Homem-Aranha Através do Aranhaverso",
];

export function AiMovieFinderModal({
  isOpen,
  onClose,
  onMovieAdded,
}: AiMovieFinderModalProps) {
  const router = useRouter();
  const { token, user } = useAuth();

  const [activeTab, setActiveTab] = useState<"torrents" | "downloader" | "web_streams" | "smart_vod">("torrents");

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchStage, setSearchStage] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  // Resultados dos Provedores
  const [aiResult, setAiResult] = useState<AISearchResultResponse | null>(null);
  const [torrentResult, setTorrentResult] = useState<TorrentSearchResponse | null>(null);
  const [activePlayer, setActivePlayer] = useState<AIStreamOption | null>(null);
  const [savingToCatalog, setSavingToCatalog] = useState(false);
  const [savedMovie, setSavedMovie] = useState<Movie | null>(null);
  const [savedSuccess, setSavedSuccess] = useState<string | null>(null);
  const [trailerOpen, setTrailerOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  // Debrid & Stream Direto
  const [debridToken, setDebridToken] = useState<string>("");
  const [resolvingDebrid, setResolvingDebrid] = useState<string | null>(null);
  const [debridStreamUrl, setDebridStreamUrl] = useState<string | null>(null);

  // Gerenciador de Downloads (yt-dlp)
  const [downloadUrl, setDownloadUrl] = useState("");
  const [downloadTitle, setDownloadTitle] = useState("");
  const [startingDownload, setStartingDownload] = useState(false);
  const [activeDownloads, setActiveDownloads] = useState<DownloadTaskOut[]>([]);
  const downloadPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Importador VOD Inteligente
  const [vodInputUrl, setVodInputUrl] = useState("");
  const [vodInputContent, setVodInputContent] = useState("");
  const [vodVerifying, setVodVerifying] = useState(false);
  const [vodResult, setVodResult] = useState<{
    total: number;
    working: number;
    dead: number;
    movies: number;
    series: number;
  } | null>(null);

  // Carrega token Debrid do LocalStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedToken = localStorage.getItem("silvaflix_debrid_token");
      if (savedToken) setDebridToken(savedToken);
    }
  }, []);

  function handleSaveDebridToken(val: string) {
    setDebridToken(val);
    if (typeof window !== "undefined") {
      localStorage.setItem("silvaflix_debrid_token", val.trim());
    }
  }

  // Polling de Downloads Ativos
  useEffect(() => {
    if (!isOpen || !token) return;

    const fetchDownloads = async () => {
      try {
        const list = await api.listActiveDownloads(token);
        setActiveDownloads(list);
      } catch {
        // Silencioso
      }
    };

    fetchDownloads();
    downloadPollRef.current = setInterval(fetchDownloads, 2500);

    return () => {
      if (downloadPollRef.current) clearInterval(downloadPollRef.current);
    };
  }, [isOpen, token]);

  if (!isOpen) return null;

  async function handleSearch(searchQuery?: string) {
    const q = searchQuery || query;
    if (!q.trim() || !token) return;

    setError(null);
    setAiResult(null);
    setTorrentResult(null);
    setActivePlayer(null);
    setSavedMovie(null);
    setSavedSuccess(null);
    setDebridStreamUrl(null);
    setSearching(true);
    setSearchStage(1);

    const timer1 = setTimeout(() => setSearchStage(2), 400);
    const timer2 = setTimeout(() => setSearchStage(3), 900);

    try {
      // 1. Busca Paralela: Torrents BR / Torrentio + Servidores Web com IA
      const [torrentData, aiData] = await Promise.allSettled([
        api.searchTorrents(q.trim(), token),
        api.aiSearchMovie({ query: q.trim() }, token),
      ]);

      setSearchStage(4);

      if (torrentData.status === "fulfilled" && torrentData.value.found) {
        setTorrentResult(torrentData.value);
      }

      if (aiData.status === "fulfilled" && aiData.value.found) {
        setAiResult(aiData.value);
        const dubbed = aiData.value.providers.find((p) => p.is_dubbed);
        const best = dubbed || aiData.value.best_provider || aiData.value.providers[0];
        if (best) setActivePlayer(best);
      }

      if (
        (torrentData.status === "rejected" || !torrentData.value?.found) &&
        (aiData.status === "rejected" || !aiData.value?.found)
      ) {
        setError(`Nenhum filme ou série encontrado para "${q}". Tente outro nome.`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao pesquisar filme na central.";
      setError(msg);
    } finally {
      clearTimeout(timer1);
      clearTimeout(timer2);
      setSearching(false);
    }
  }

  async function handleStartDownload(urlToDownload: string, titleToDownload?: string, tmdbId?: number) {
    if (!token || !urlToDownload.trim()) return;
    setStartingDownload(true);
    try {
      await api.startDownload(
        {
          url: urlToDownload.trim(),
          title: titleToDownload || downloadTitle || query || "Filme Baixado",
          tmdb_id: tmdbId,
          is_private: false,
        },
        token
      );
      setSavedSuccess("Download iniciado em segundo plano! O filme será salvo diretamente na pasta local.");
      setActiveTab("downloader");
      setDownloadUrl("");
      setDownloadTitle("");
    } catch (err: unknown) {
      alert("Erro ao iniciar download: " + (err instanceof Error ? err.message : "Erro desconhecido"));
    } finally {
      setStartingDownload(false);
    }
  }

  async function handleResolveDebrid(magnet: string) {
    if (!token) return;
    setResolvingDebrid(magnet);
    try {
      const res = await api.resolveTorrentStream(magnet, token, debridToken);
      if (res.stream_url && res.player_type === "direct") {
        setDebridStreamUrl(res.stream_url);
        // Cadastra e abre no player
        if (currentMetadata) {
          const created = await api.aiImportStream(
            {
              player_url: res.stream_url,
              provider_name: "Real-Debrid (1Gbps Direto)",
              metadata: currentMetadata,
              is_private: false,
            },
            token
          );
          if (onMovieAdded) onMovieAdded();
          onClose();
          router.push(`/watch/${created.id}`);
        }
      } else {
        // Abre o link do magnet diretamente no cliente de torrent / Stremio
        window.location.href = magnet;
      }
    } catch {
      window.location.href = magnet;
    } finally {
      setResolvingDebrid(null);
    }
  }

  async function handleSaveExternalToCatalog(streamUrl: string, providerName: string, metadata: AIMetadata) {
    if (!token) return;
    setSavingToCatalog(true);
    setSavedSuccess(null);
    try {
      const created = await api.aiImportStream(
        {
          player_url: streamUrl,
          provider_name: providerName,
          metadata: metadata,
          is_private: false,
        },
        token
      );
      setSavedMovie(created);
      setSavedSuccess(`"${created.title}" foi adicionado com sucesso ao seu catálogo!`);
      if (onMovieAdded) onMovieAdded();
    } catch (err: unknown) {
      alert("Erro ao salvar no catálogo: " + (err instanceof Error ? err.message : "Erro desconhecido"));
    } finally {
      setSavingToCatalog(false);
    }
  }

  async function handleSmartVodImport() {
    if (!token || (!vodInputUrl.trim() && !vodInputContent.trim())) return;
    setVodVerifying(true);
    setVodResult(null);

    try {
      // 1. Faz o parse do M3U
      const parsed = await api.parseMovieM3U({ url: vodInputUrl, content: vodInputContent }, token);
      if (!parsed.items || parsed.items.length === 0) {
        alert("Nenhum item válido encontrado na lista M3U.");
        return;
      }

      // 2. Executa a importação inteligente com verificação de links vivos
      const importRes = await api.smartVodImport(
        {
          items: parsed.items,
          source_name: "Importação VOD Inteligente",
          auto_categorize_series: true,
          verify_live_streams: true,
          is_private: false,
        },
        token
      );

      setVodResult({
        total: importRes.total_submitted,
        working: importRes.verified_working,
        dead: importRes.dead_discarded,
        movies: importRes.movies_added,
        series: importRes.series_episodes_added,
      });

      if (onMovieAdded) onMovieAdded();
      setVodInputUrl("");
      setVodInputContent("");
    } catch (err: unknown) {
      alert("Erro ao importar VOD: " + (err instanceof Error ? err.message : "Erro desconhecido"));
    } finally {
      setVodVerifying(false);
    }
  }

  function handleCopy(text: string, id: string) {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedLink(id);
      setTimeout(() => setCopiedLink(null), 2500);
    }
  }

  const currentMetadata: AIMetadata | null =
    torrentResult?.metadata || aiResult?.metadata || null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 sm:p-6 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative flex flex-col w-full max-w-5xl max-h-[92vh] overflow-hidden rounded-2xl border border-rule bg-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <div className="flex items-center justify-between border-b border-rule bg-panel2/60 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-brand to-rose-500 shadow-md text-white text-lg font-black">
              🚀
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black tracking-wide text-ink flex items-center gap-2">
                <span>SilvaFlix MegaHub</span>
                <span className="rounded-full bg-brand/20 border border-brand/40 px-2 py-0.5 text-[10px] font-bold text-brand2 uppercase">
                  Torrents · Downloads · VOD · Web
                </span>
              </h2>
              <p className="text-xs text-mute hidden sm:block">
                Pesquise qualquer filme ou série com áudio dublado (PT-BR), baixe para o servidor ou transmita direto.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-panel text-mute hover:bg-panel2 hover:text-ink transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Abas de Navegação */}
        <div className="flex items-center border-b border-rule bg-panel px-4 overflow-x-auto">
          <button
            onClick={() => setActiveTab("torrents")}
            className={`flex items-center gap-2 border-b-2 py-3 px-3 text-xs font-bold whitespace-nowrap transition-all ${
              activeTab === "torrents"
                ? "border-brand text-ink"
                : "border-transparent text-mute hover:text-ink"
            }`}
          >
            <span>⚡</span>
            <span>Torrents & Stream Direto</span>
            {torrentResult && (
              <span className="rounded-full bg-emerald-500/20 text-emerald-400 px-1.5 py-0.2 text-[10px]">
                {torrentResult.torrents.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("downloader")}
            className={`flex items-center gap-2 border-b-2 py-3 px-3 text-xs font-bold whitespace-nowrap transition-all ${
              activeTab === "downloader"
                ? "border-brand text-ink"
                : "border-transparent text-mute hover:text-ink"
            }`}
          >
            <span>📥</span>
            <span>Baixar para o Servidor (yt-dlp)</span>
            {activeDownloads.length > 0 && (
              <span className="rounded-full bg-brand text-white px-1.5 py-0.2 text-[10px] animate-pulse">
                {activeDownloads.filter((d) => d.status === "downloading").length || activeDownloads.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("smart_vod")}
            className={`flex items-center gap-2 border-b-2 py-3 px-3 text-xs font-bold whitespace-nowrap transition-all ${
              activeTab === "smart_vod"
                ? "border-brand text-ink"
                : "border-transparent text-mute hover:text-ink"
            }`}
          >
            <span>📂</span>
            <span>Importador VOD Inteligente</span>
          </button>

          <button
            onClick={() => setActiveTab("web_streams")}
            className={`flex items-center gap-2 border-b-2 py-3 px-3 text-xs font-bold whitespace-nowrap transition-all ${
              activeTab === "web_streams"
                ? "border-brand text-ink"
                : "border-transparent text-mute hover:text-ink"
            }`}
          >
            <span>🛡️</span>
            <span>Servidores Web Blindados</span>
          </button>
        </div>

        {/* Conteúdo com Scroll */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* Barra de Pesquisa Geral (válida para Torrents e Web) */}
          {(activeTab === "torrents" || activeTab === "web_streams") && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSearch();
              }}
              className="space-y-3"
            >
              <div className="relative flex items-center">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Digite o filme ou série (Ex: Harry Potter 1, Vingadores Ultimato, Interestelar...)"
                  disabled={searching}
                  className="w-full rounded-xl border border-rule bg-panel2/80 py-3.5 pl-4 pr-32 text-sm text-ink placeholder:text-mute focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30 transition-all shadow-inner"
                />

                <button
                  type="submit"
                  disabled={searching || !query.trim()}
                  className="absolute right-1.5 flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-brand to-brand2 px-4 py-2 text-xs font-black text-white shadow-md hover:opacity-95 transition-all disabled:opacity-50"
                >
                  {searching ? (
                    <>
                      <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      <span>Buscando...</span>
                    </>
                  ) : (
                    <>
                      <span>🔍</span>
                      <span>Pesquisar</span>
                    </>
                  )}
                </button>
              </div>

              {/* Sugestões Rápidas */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[11px] font-semibold text-mute mr-1">Sugestões:</span>
                {QUICK_SUGGESTIONS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => {
                      setQuery(item);
                      handleSearch(item);
                    }}
                    className="rounded-lg border border-rule bg-panel2 px-2.5 py-1 text-[11px] font-medium text-mute hover:border-brand hover:text-ink transition-all hover:scale-105"
                  >
                    {item}
                  </button>
                ))}
              </div>
            </form>
          )}

          {/* Animação de Estágios de Busca */}
          {searching && (
            <div className="rounded-xl border border-brand/30 bg-brand/5 p-5 space-y-4 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-white text-lg">
                  ⚡
                </div>
                <div>
                  <p className="text-sm font-bold text-ink">Buscando em Múltiplos Motores:</p>
                  <p className="text-xs text-brand2 font-semibold">
                    {searchStage === 1 && "🧠 1/3 Identificando filme oficial no TMDB e baixando sinopse..."}
                    {searchStage === 2 && "🇧🇷 2/3 Vasculhando indexadores de Torrents Dublados (PT-BR) e servidores..."}
                    {searchStage === 3 && "⚡ 3/3 Medindo seeders e latência dos streams..."}
                    {searchStage === 4 && "✅ 4/3 Pronto! Versões em alta velocidade encontradas!"}
                  </p>
                </div>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-panel2">
                <div
                  className="h-full bg-gradient-to-r from-brand to-rose-500 transition-all duration-500"
                  style={{ width: `${(searchStage / 4) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Mensagem de Erro */}
          {error && (
            <div className="rounded-xl border border-brand/40 bg-brand/10 p-4 text-xs font-semibold text-brand2 flex items-center justify-between">
              <span>⚠️ {error}</span>
              <button onClick={() => setError(null)} className="text-mute hover:text-ink">
                ✕
              </button>
            </div>
          )}

          {/* Feedback de Sucesso */}
          {savedSuccess && (
            <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-xs text-emerald-300 flex items-center justify-between gap-3 shadow-lg">
              <div className="flex items-center gap-3">
                <span className="text-2xl">🎉</span>
                <p className="font-bold text-sm text-emerald-400">{savedSuccess}</p>
              </div>
              <button
                onClick={() => setSavedSuccess(null)}
                className="text-emerald-400 hover:text-white"
              >
                ✕
              </button>
            </div>
          )}

          {/* Card de Metadados do Filme (TMDB) quando encontrado */}
          {currentMetadata && (
            <div className="relative overflow-hidden rounded-2xl border border-rule bg-panel2 shadow-lg">
              {currentMetadata.backdrop_url && (
                <div
                  className="absolute inset-0 opacity-20 bg-cover bg-center filter blur-sm"
                  style={{ backgroundImage: `url(${currentMetadata.backdrop_url})` }}
                />
              )}
              <div className="relative p-4 sm:p-5 flex flex-col sm:flex-row gap-4">
                {currentMetadata.poster_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={currentMetadata.poster_url}
                    alt={currentMetadata.title}
                    className="h-44 w-32 flex-shrink-0 rounded-xl object-cover shadow-xl border border-rule mx-auto sm:mx-0"
                  />
                ) : (
                  <div className="flex h-44 w-32 flex-shrink-0 items-center justify-center rounded-xl bg-panel text-3xl text-mute border border-rule mx-auto sm:mx-0">
                    🎬
                  </div>
                )}
                <div className="flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-xl font-black text-ink">{currentMetadata.title}</h3>
                    {currentMetadata.year && (
                      <span className="rounded-full bg-panel border border-rule px-2.5 py-0.5 text-xs font-bold text-mute">
                        {currentMetadata.year}
                      </span>
                    )}
                    <span className="rounded-full bg-emerald-500/20 border border-emerald-500/40 px-2.5 py-0.5 text-xs font-bold text-emerald-400">
                      🇧🇷 Dublado PT-BR
                    </span>
                  </div>
                  <p className="text-xs text-mute font-semibold">
                    {[
                      currentMetadata.genre,
                      currentMetadata.duration_minutes && `${currentMetadata.duration_minutes} min`,
                      currentMetadata.director && `Direção: ${currentMetadata.director}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <p className="text-xs text-ink/80 line-clamp-2 sm:line-clamp-3">
                    {currentMetadata.synopsis || "Sem sinopse disponível."}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* ABA 1: TORRENTS & STREAM DIRETO (STREMIO ENGINE)          */}
          {/* ========================================================= */}
          {activeTab === "torrents" && (
            <div className="space-y-4">
              {/* Box de Configuração Opcional de Debrid */}
              <div className="rounded-xl border border-rule bg-panel p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🔑</span>
                  <div>
                    <p className="font-bold text-ink">API Key Real-Debrid / TorBox (Opcional):</p>
                    <p className="text-[11px] text-mute">
                      Transforma qualquer magnet link em stream direto MP4 a 1000 Mbps sem usar torrent local.
                    </p>
                  </div>
                </div>
                <input
                  type="password"
                  value={debridToken}
                  onChange={(e) => handleSaveDebridToken(e.target.value)}
                  placeholder="Insira seu token de API Debrid..."
                  className="rounded-lg border border-rule bg-panel2 px-3 py-1.5 text-xs text-ink w-full sm:w-64 focus:border-brand focus:outline-none"
                />
              </div>

              {/* Lista de Torrents Encontrados */}
              {torrentResult && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-mute flex items-center gap-2">
                      <span>⚡ Magnets & Torrents Disponíveis</span>
                      <span className="rounded-full bg-panel2 border border-rule px-2 py-0.2 text-[10px] font-bold text-ink">
                        {torrentResult.torrents.length} fontes
                      </span>
                    </h4>
                    <span className="text-xs text-emerald-400 font-bold">
                      {torrentResult.torrents.filter((t) => t.is_dubbed).length} Dublados PT-BR
                    </span>
                  </div>

                  <div className="grid gap-2.5">
                    {torrentResult.torrents.map((tor, idx) => (
                      <div
                        key={idx}
                        className={`rounded-xl border p-3.5 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                          tor.is_dubbed
                            ? "border-emerald-500/40 bg-emerald-500/5 hover:border-emerald-500/60"
                            : "border-rule bg-panel2/60 hover:border-brand/40"
                        }`}
                      >
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-xs font-black text-ink truncate max-w-md">
                              {tor.title}
                            </p>
                            <span className="rounded bg-brand/20 text-brand2 px-1.5 py-0.2 text-[10px] font-bold">
                              {tor.quality}
                            </span>
                            {tor.is_dubbed ? (
                              <span className="rounded bg-emerald-500/20 text-emerald-400 px-1.5 py-0.2 text-[10px] font-bold">
                                🇧🇷 Dublado PT-BR
                              </span>
                            ) : (
                              <span className="rounded bg-white/10 text-mute px-1.5 py-0.2 text-[10px]">
                                {tor.language}
                              </span>
                            )}
                          </div>

                          <p className="text-[11px] text-mute flex items-center gap-3">
                            <span>👥 <strong>{tor.seeders}</strong> seeds</span>
                            <span>💾 <strong>{tor.size_str}</strong></span>
                            <span>⚙️ {tor.provider}</span>
                          </p>
                        </div>

                        {/* Botões de Ação do Torrent */}
                        <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => handleResolveDebrid(tor.magnet)}
                            disabled={resolvingDebrid === tor.magnet}
                            className="rounded-lg bg-gradient-to-r from-brand to-rose-600 px-3.5 py-1.5 text-xs font-black text-white shadow hover:scale-105 transition-all flex items-center gap-1.5"
                          >
                            <span>▶</span>
                            <span>{resolvingDebrid === tor.magnet ? "Resolvendo..." : "Assistir Agora (Stream)"}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleCopy(tor.magnet, tor.info_hash)}
                            className="rounded-lg border border-rule bg-panel px-2.5 py-1.5 text-xs font-bold text-mute hover:text-ink transition-all flex items-center gap-1"
                          >
                            <span>{copiedLink === tor.info_hash ? "✓" : "📋"}</span>
                            <span>{copiedLink === tor.info_hash ? "Copiado!" : "Magnet"}</span>
                          </button>

                          {currentMetadata && (
                            <button
                              type="button"
                              onClick={() =>
                                handleSaveExternalToCatalog(
                                  tor.magnet,
                                  `Torrent (${tor.provider} ${tor.quality})`,
                                  currentMetadata
                                )
                              }
                              disabled={savingToCatalog}
                              className="rounded-lg border border-rule bg-panel px-2.5 py-1.5 text-xs font-bold text-mute hover:border-brand hover:text-ink transition-all"
                            >
                              ➕ Salvar
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* ABA 2: GERENCIADOR DE DOWNLOADS (yt-dlp)                  */}
          {/* ========================================================= */}
          {activeTab === "downloader" && (
            <div className="space-y-6">
              {/* Formulário de Novo Download */}
              <div className="rounded-2xl border border-rule bg-panel2 p-5 space-y-4 shadow-md">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white text-base font-bold">
                    ⬇
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-ink">Baixar Vídeo Diretamente para o Servidor Local</h3>
                    <p className="text-xs text-mute">
                      Suporta YouTube, Dailymotion, Vimeo, Google Drive, arquivos MP4/MKV e listas HLS (.m3u8).
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
                  <input
                    type="text"
                    value={downloadUrl}
                    onChange={(e) => setDownloadUrl(e.target.value)}
                    placeholder="Cole a URL do vídeo aqui (Ex: https://.../video.mp4 ou link do YouTube)..."
                    className="rounded-xl border border-rule bg-panel px-4 py-2.5 text-xs text-ink focus:border-brand focus:outline-none"
                  />
                  <input
                    type="text"
                    value={downloadTitle}
                    onChange={(e) => setDownloadTitle(e.target.value)}
                    placeholder="Nome do filme (Opcional)..."
                    className="rounded-xl border border-rule bg-panel px-4 py-2.5 text-xs text-ink focus:border-brand focus:outline-none"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => handleStartDownload(downloadUrl, downloadTitle)}
                    disabled={startingDownload || !downloadUrl.trim()}
                    className="rounded-xl bg-brand px-6 py-2.5 text-xs font-black text-white shadow-md hover:bg-brand2 transition-all disabled:opacity-50 flex items-center gap-2"
                  >
                    <span>⬇</span>
                    <span>{startingDownload ? "Iniciando..." : "Iniciar Download em Segundo Plano"}</span>
                  </button>
                </div>
              </div>

              {/* Lista de Downloads Ativos */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-mute flex items-center gap-2">
                  <span>📊 Downloads Ativos & Concluídos</span>
                  <span className="rounded-full bg-panel2 border border-rule px-2 py-0.2 text-[10px] font-bold text-ink">
                    {activeDownloads.length}
                  </span>
                </h4>

                {activeDownloads.length === 0 ? (
                  <p className="text-xs text-mute py-4 text-center">Nenhum download em andamento no momento.</p>
                ) : (
                  <div className="grid gap-3">
                    {activeDownloads.map((dl) => (
                      <div
                        key={dl.id}
                        className="rounded-xl border border-rule bg-panel p-4 space-y-2.5 shadow-sm"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-ink truncate">{dl.title}</p>
                            <p className="text-[10px] text-mute font-mono truncate">{dl.url}</p>
                          </div>
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase ${
                              dl.status === "finished"
                                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                                : dl.status === "downloading"
                                ? "bg-brand/20 text-brand2 border border-brand/40 animate-pulse"
                                : dl.status === "error"
                                ? "bg-rose-500/20 text-rose-400"
                                : "bg-panel2 text-mute"
                            }`}
                          >
                            {dl.status === "finished" ? "✓ Concluído" : dl.status === "downloading" ? "Baixando" : dl.status}
                          </span>
                        </div>

                        {/* Barra de Progresso */}
                        <div className="h-2 w-full overflow-hidden rounded-full bg-panel2">
                          <div
                            className={`h-full transition-all duration-300 ${
                              dl.status === "finished"
                                ? "bg-emerald-500"
                                : dl.status === "error"
                                ? "bg-rose-500"
                                : "bg-gradient-to-r from-brand to-rose-500"
                            }`}
                            style={{ width: `${Math.max(2, dl.progress_percent)}%` }}
                          />
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-mute">
                          <span>{dl.progress_percent}% {dl.speed_str && `· ${dl.speed_str}`}</span>
                          <span>{dl.eta_str ? `Restante: ${dl.eta_str}` : ""}</span>
                          {dl.status === "downloading" && (
                            <button
                              type="button"
                              onClick={() => token && api.cancelDownload(dl.id, token)}
                              className="text-xs text-rose-400 hover:underline"
                            >
                              Cancelar
                            </button>
                          )}
                          {dl.movie_id && (
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                router.push(`/watch/${dl.movie_id}`);
                              }}
                              className="text-xs text-emerald-400 font-bold hover:underline"
                            >
                              ▶ Assistir no SilvaFlix
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* ABA 3: IMPORTADOR VOD INTELIGENTE (FILTRO ANTI-LINKS MORTOS)*/}
          {/* ========================================================= */}
          {activeTab === "smart_vod" && (
            <div className="space-y-5">
              <div className="rounded-2xl border border-rule bg-panel2 p-5 space-y-4 shadow-md">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 text-white text-base font-bold">
                    🛡️
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-ink">Importador com Teste Automático de Conexão</h3>
                    <p className="text-xs text-mute">
                      Testa 30 links por segundo, descarta 100% dos links quebrados/mortos e separa séries de filmes automaticamente.
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-mute block mb-1">URL da Lista M3U / VOD:</label>
                    <input
                      type="text"
                      value={vodInputUrl}
                      onChange={(e) => setVodInputUrl(e.target.value)}
                      placeholder="http://servidor.com:8080/get.php?username=...&type=m3u_plus"
                      className="w-full rounded-xl border border-rule bg-panel px-4 py-2.5 text-xs text-ink focus:border-brand focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-mute block mb-1">Ou cole o conteúdo M3U diretamente:</label>
                    <textarea
                      value={vodInputContent}
                      onChange={(e) => setVodInputContent(e.target.value)}
                      placeholder="#EXTM3U&#10;#EXTINF:-1 group-title=&quot;Filmes Dublados&quot;,Harry Potter 1&#10;http://..."
                      rows={4}
                      className="w-full rounded-xl border border-rule bg-panel p-3 text-xs font-mono text-ink focus:border-brand focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleSmartVodImport}
                    disabled={vodVerifying || (!vodInputUrl.trim() && !vodInputContent.trim())}
                    className="rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-6 py-2.5 text-xs font-black text-white shadow-md hover:opacity-95 transition-all disabled:opacity-50 flex items-center gap-2"
                  >
                    <span>🛡️</span>
                    <span>{vodVerifying ? "Testando e Importando Streams..." : "Verificar e Importar Streams Vivos"}</span>
                  </button>
                </div>
              </div>

              {/* Resultado do VOD Import */}
              {vodResult && (
                <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-5 space-y-2 text-xs text-emerald-300">
                  <h4 className="text-sm font-bold text-emerald-400 flex items-center gap-2">
                    <span>🎉</span>
                    <span>Importação Concluída com Sucesso!</span>
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
                    <div className="rounded-lg bg-panel p-2.5 border border-rule text-center">
                      <p className="text-lg font-black text-ink">{vodResult.total}</p>
                      <p className="text-[10px] text-mute">Submetidos</p>
                    </div>
                    <div className="rounded-lg bg-panel p-2.5 border border-emerald-500/40 text-center">
                      <p className="text-lg font-black text-emerald-400">{vodResult.working}</p>
                      <p className="text-[10px] text-emerald-400/80">Online & Vivos</p>
                    </div>
                    <div className="rounded-lg bg-panel p-2.5 border border-rose-500/40 text-center">
                      <p className="text-lg font-black text-rose-400">{vodResult.dead}</p>
                      <p className="text-[10px] text-rose-400/80">Mortos Descartados</p>
                    </div>
                    <div className="rounded-lg bg-panel p-2.5 border border-rule text-center">
                      <p className="text-lg font-black text-brand2">{vodResult.movies} F / {vodResult.series} S</p>
                      <p className="text-[10px] text-mute">Filmes / Séries</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* ABA 4: SERVIDORES WEB BLINDADOS (EMBED ANTI-POPUP)        */}
          {/* ========================================================= */}
          {activeTab === "web_streams" && aiResult && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-mute flex items-center gap-2">
                  <span>🛡️ Servidores Web Blindados contra Anúncios</span>
                  <span className="rounded-full bg-panel2 border border-rule px-2 py-0.2 text-[10px] font-bold text-ink">
                    {aiResult.providers.length}
                  </span>
                </h4>
              </div>

              {activePlayer && (
                <div className="rounded-2xl border border-brand/30 bg-panel2 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                      <p className="text-xs font-bold text-ink">
                        Servidor Ativo: <span className="text-brand2">{activePlayer.provider_name}</span>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        currentMetadata &&
                        handleSaveExternalToCatalog(activePlayer.player_url, activePlayer.provider_name, currentMetadata)
                      }
                      disabled={savingToCatalog}
                      className="rounded-lg bg-brand px-3.5 py-1.5 text-xs font-bold text-white hover:bg-brand2"
                    >
                      {savingToCatalog ? "Salvando..." : "➕ Salvar no Catálogo"}
                    </button>
                  </div>

                  <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-rule bg-black">
                    <iframe
                      key={activePlayer.player_url}
                      src={activePlayer.player_url}
                      title={aiResult.metadata.title}
                      sandbox="allow-scripts allow-same-origin allow-forms allow-presentation"
                      referrerPolicy="no-referrer"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                      allowFullScreen
                      className="h-full w-full border-0"
                    />
                  </div>
                </div>
              )}

              <div className="grid gap-2.5 sm:grid-cols-2">
                {aiResult.providers.map((opt, idx) => (
                  <div
                    key={idx}
                    className={`rounded-xl border p-3 flex flex-col justify-between ${
                      activePlayer?.player_url === opt.player_url
                        ? "border-brand bg-brand/10"
                        : "border-rule bg-panel2/60"
                    }`}
                  >
                    <div>
                      <p className="text-xs font-bold text-ink">{opt.provider_name}</p>
                      <p className="text-[11px] text-emerald-400 font-bold">{opt.language} · {opt.quality}</p>
                    </div>
                    <div className="mt-2 flex justify-end">
                      <button
                        type="button"
                        onClick={() => setActivePlayer(opt)}
                        className="rounded bg-panel border border-rule px-2.5 py-1 text-xs font-bold hover:border-brand"
                      >
                        Selecionar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Rodapé */}
        <div className="flex items-center justify-between border-t border-rule bg-panel2/60 px-5 py-3 text-xs text-mute">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span>SilvaFlix MegaHub — 4 Motores de Alta Velocidade</span>
          </span>
          <button
            onClick={onClose}
            className="rounded-lg border border-rule px-3 py-1 font-semibold hover:border-brand hover:text-ink transition-all"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
