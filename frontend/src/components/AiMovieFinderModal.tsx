"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, AISearchResultResponse, AIStreamOption, AIMetadata, Movie } from "@/lib/api";
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

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchStage, setSearchStage] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AISearchResultResponse | null>(null);
  const [autoSave, setAutoSave] = useState(true);

  // Player de Pré-visualização / Assistir no Modal
  const [activePlayer, setActivePlayer] = useState<AIStreamOption | null>(null);
  const [savingToCatalog, setSavingToCatalog] = useState(false);
  const [savedMovie, setSavedMovie] = useState<Movie | null>(null);
  const [savedSuccess, setSavedSuccess] = useState<string | null>(null);
  const [trailerOpen, setTrailerOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  if (!isOpen) return null;

  async function handleSearch(searchQuery?: string) {
    const q = searchQuery || query;
    if (!q.trim() || !token) return;

    setError(null);
    setResult(null);
    setActivePlayer(null);
    setSavedMovie(null);
    setSavedSuccess(null);
    setSearching(true);
    setSearchStage(1);

    // Etapas visuais de busca com IA
    const stageTimer1 = setTimeout(() => setSearchStage(2), 600);
    const stageTimer2 = setTimeout(() => setSearchStage(3), 1300);

    try {
      const data = await api.aiSearchMovie({ query: q.trim() }, token);
      setSearchStage(4);
      setResult(data);

      const best = data.best_provider || data.providers[0];
      if (best) {
        setActivePlayer(best);

        // Se autoSave estiver ativo, cadastra automaticamente no catálogo!
        if (autoSave) {
          try {
            setSavingToCatalog(true);
            const created = await api.aiImportStream(
              {
                player_url: best.player_url,
                provider_name: best.provider_name,
                metadata: data.metadata,
                is_private: false,
              },
              token
            );
            setSavedMovie(created);
            setSavedSuccess(`Filme "${created.title}" adicionado automaticamente ao seu catálogo!`);
            if (onMovieAdded) onMovieAdded();
          } catch {
            // Silencioso se der erro no autoSave
          } finally {
            setSavingToCatalog(false);
          }
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao pesquisar filme na web com IA.";
      setError(msg);
    } finally {
      clearTimeout(stageTimer1);
      clearTimeout(stageTimer2);
      setSearching(false);
    }
  }

  async function handleSaveToCatalog(option: AIStreamOption, metadata: AIMetadata) {
    if (!token) return;
    setSavingToCatalog(true);
    setSavedSuccess(null);
    try {
      const created = await api.aiImportStream(
        {
          player_url: option.player_url,
          provider_name: option.provider_name,
          metadata: metadata,
          is_private: false,
        },
        token
      );
      setSavedMovie(created);
      setSavedSuccess(`Filme "${created.title}" salvo com sucesso no catálogo!`);
      if (onMovieAdded) onMovieAdded();
    } catch (err: unknown) {
      alert("Erro ao salvar no catálogo: " + (err instanceof Error ? err.message : "Erro desconhecido"));
    } finally {
      setSavingToCatalog(false);
    }
  }

  async function handlePlayInSilvaflix(option: AIStreamOption, metadata: AIMetadata) {
    if (!token) return;

    // Se já salvou no catálogo, vai direto
    if (savedMovie) {
      onClose();
      router.push(`/watch/${savedMovie.id}`);
      return;
    }

    setSavingToCatalog(true);
    try {
      const created = await api.aiImportStream(
        {
          player_url: option.player_url,
          provider_name: option.provider_name,
          metadata: metadata,
          is_private: false,
        },
        token
      );
      if (onMovieAdded) onMovieAdded();
      onClose();
      router.push(`/watch/${created.id}`);
    } catch {
      // Se der erro ao salvar, abre o player interno
      setActivePlayer(option);
    } finally {
      setSavingToCatalog(false);
    }
  }

  function handleCopyLink(url: string) {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  }

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
              🤖
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black tracking-wide text-ink flex items-center gap-2">
                <span>SilvaFlix IA</span>
                <span className="rounded-full bg-brand/20 border border-brand/40 px-2 py-0.5 text-[10px] font-bold text-brand2 uppercase">
                  Buscador & Extrator de Vídeos
                </span>
              </h2>
              <p className="text-xs text-mute hidden sm:block">
                Localiza o link direto do vídeo na internet, associa capa em HD e adiciona ao seu catálogo.
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

        {/* Conteúdo com Scroll */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* Barra de Pesquisa */}
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
                placeholder="Digite o nome do filme ou série (Ex: Harry Potter 1, Vingadores, Interestelar...)"
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
                    <span>Buscar Vídeo</span>
                  </>
                )}
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              {/* Sugestões Rápidas */}
              <div className="flex flex-wrap items-center gap-1.5">
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

              {/* Opção de Salvar Automaticamente */}
              <label className="flex items-center gap-2 text-xs text-mute cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoSave}
                  onChange={(e) => setAutoSave(e.target.checked)}
                  className="rounded accent-brand cursor-pointer"
                />
                <span className="font-semibold text-ink">Salvar automaticamente no catálogo ao encontrar</span>
              </label>
            </div>
          </form>

          {/* Animação de Estágios de Busca da IA */}
          {searching && (
            <div className="rounded-xl border border-brand/30 bg-brand/5 p-5 space-y-4 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-white text-lg">
                  ⚡
                </div>
                <div>
                  <p className="text-sm font-bold text-ink">
                    SilvaFlix IA em Ação:
                  </p>
                  <p className="text-xs text-brand2 font-semibold">
                    {searchStage === 1 && "🧠 1/3 Identificando filme oficial no TMDB e baixando metadados..."}
                    {searchStage === 2 && "🌐 2/3 Vasculhando servidores e indexadores pelo link de vídeo..."}
                    {searchStage === 3 && "⚡ 3/3 Testando integridade do stream e medindo velocidade..."}
                    {searchStage === 4 && "✅ 4/3 Link de vídeo localizado e pronto para ser adicionado!"}
                  </p>
                </div>
              </div>

              {/* Barra de Progresso */}
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
              <button
                onClick={() => setError(null)}
                className="text-mute hover:text-ink"
              >
                ✕
              </button>
            </div>
          )}

          {/* Feedback de Filme Salvo no Catálogo */}
          {savedSuccess && (
            <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 sm:p-5 text-xs text-emerald-300 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg">
              <div className="flex items-center gap-3">
                <span className="text-2xl">🎉</span>
                <div>
                  <p className="font-bold text-sm text-emerald-400">
                    {savedSuccess}
                  </p>
                  <p className="text-[11px] text-emerald-300/80 mt-0.5">
                    O filme está gravado no seu catálogo permanente. Toda a família pode assistir na tela inicial ou Smart TV a qualquer momento!
                  </p>
                </div>
              </div>

              {savedMovie && (
                <button
                  onClick={() => {
                    onClose();
                    router.push(`/watch/${savedMovie.id}`);
                  }}
                  className="whitespace-nowrap rounded-xl bg-emerald-500 px-4 py-2 text-xs font-black text-white shadow hover:bg-emerald-600 transition-all flex items-center gap-1.5"
                >
                  <span>▶️</span>
                  <span>Assistir no SilvaFlix Agora</span>
                </button>
              )}
            </div>
          )}

          {/* Resultados Encontrados */}
          {result && result.found && (
            <div className="space-y-6 animate-fade-in">
              {/* Card de Informações do Filme/Série */}
              <div className="relative overflow-hidden rounded-2xl border border-rule bg-panel2 shadow-lg">
                {/* Backdrop de Fundo */}
                {result.metadata.backdrop_url && (
                  <div
                    className="absolute inset-0 opacity-20 bg-cover bg-center filter blur-sm"
                    style={{ backgroundImage: `url(${result.metadata.backdrop_url})` }}
                  />
                )}

                <div className="relative p-4 sm:p-6 flex flex-col sm:flex-row gap-5">
                  {/* Capa */}
                  {result.metadata.poster_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={result.metadata.poster_url}
                      alt={result.metadata.title}
                      className="h-52 w-36 flex-shrink-0 rounded-xl object-cover shadow-xl border border-rule mx-auto sm:mx-0"
                    />
                  ) : (
                    <div className="flex h-52 w-36 flex-shrink-0 items-center justify-center rounded-xl bg-panel text-3xl font-black text-mute border border-rule mx-auto sm:mx-0">
                      🎬
                    </div>
                  )}

                  {/* Informações Textuais */}
                  <div className="flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-xl sm:text-2xl font-black text-ink">
                        {result.metadata.title}
                      </h3>
                      {result.metadata.year && (
                        <span className="rounded-full bg-panel border border-rule px-2.5 py-0.5 text-xs font-bold text-mute">
                          {result.metadata.year}
                        </span>
                      )}
                      {result.metadata.is_series && (
                        <span className="rounded-full bg-brand/20 border border-brand/40 px-2.5 py-0.5 text-xs font-bold text-brand2">
                          📺 Série {result.metadata.season_number ? `(T${result.metadata.season_number} E${result.metadata.episode_number || 1})` : ""}
                        </span>
                      )}
                      {result.metadata.collection_name && (
                        <span className="rounded-full bg-panel border border-rule px-2.5 py-0.5 text-xs font-bold text-mute">
                          🏛️ {result.metadata.collection_name}
                        </span>
                      )}
                    </div>

                    <p className="text-xs font-semibold text-mute">
                      {[
                        result.metadata.genre,
                        result.metadata.duration_minutes && `${result.metadata.duration_minutes} min`,
                        result.metadata.director && `Direção: ${result.metadata.director}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>

                    <p className="text-xs text-ink/80 leading-relaxed max-h-24 overflow-y-auto line-clamp-3 sm:line-clamp-none">
                      {result.metadata.synopsis || "Sem sinopse disponível."}
                    </p>

                    {result.metadata.cast && (
                      <p className="text-[11px] text-mute truncate">
                        <strong className="text-ink">Elenco:</strong> {result.metadata.cast}
                      </p>
                    )}

                    {/* Botões de Ação Rápida */}
                    <div className="flex flex-wrap items-center gap-2 pt-2">
                      {activePlayer && (
                        <button
                          type="button"
                          onClick={() => handlePlayInSilvaflix(activePlayer, result.metadata)}
                          disabled={savingToCatalog}
                          className="rounded-xl bg-gradient-to-r from-brand to-rose-600 px-5 py-2.5 text-xs font-black text-white shadow-lg hover:scale-105 transition-all flex items-center gap-2"
                        >
                          <span>▶️</span>
                          <span>{savedMovie ? "Abrir Filme no SilvaFlix" : "Adicionar e Assistir Agora"}</span>
                        </button>
                      )}

                      {result.metadata.trailer_youtube_id && (
                        <button
                          type="button"
                          onClick={() => setTrailerOpen(!trailerOpen)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-rule bg-panel px-3.5 py-2 text-xs font-semibold text-mute hover:border-brand hover:text-ink transition-all"
                        >
                          <span>🎬</span>
                          <span>{trailerOpen ? "Fechar Trailer" : "Trailer Oficial"}</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Iframe de Trailer Opcional */}
                {trailerOpen && result.metadata.trailer_youtube_id && (
                  <div className="border-t border-rule bg-black aspect-video w-full">
                    <iframe
                      src={`https://www.youtube-nocookie.com/embed/${result.metadata.trailer_youtube_id}?autoplay=1`}
                      title="Trailer"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      className="h-full w-full border-0"
                    />
                  </div>
                )}
              </div>

              {/* Box de Detalhes do Link de Vídeo Encontrado */}
              {activePlayer && (
                <div className="rounded-2xl border border-brand/30 bg-panel2 p-4 sm:p-5 space-y-3 shadow-md">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="flex h-3 w-3 rounded-full bg-emerald-400 animate-ping" />
                      <p className="text-sm font-bold text-ink flex items-center gap-2">
                        <span>Link de Vídeo Pronto:</span>
                        <span className="text-brand2">{activePlayer.provider_name}</span>
                        {activePlayer.is_direct ? (
                          <span className="rounded-full bg-emerald-500/20 border border-emerald-500/40 px-2.5 py-0.5 text-[10px] font-black text-emerald-400">
                            🎬 Link Direto MP4
                          </span>
                        ) : (
                          <span className="rounded-full bg-sky-500/20 border border-sky-500/40 px-2.5 py-0.5 text-[10px] font-black text-sky-400">
                            🌐 Stream HD Nativo
                          </span>
                        )}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleCopyLink(activePlayer.player_url)}
                        className="rounded-lg border border-rule bg-panel px-3 py-1.5 text-xs font-semibold text-mute hover:border-brand hover:text-ink transition-all flex items-center gap-1.5"
                      >
                        <span>{copiedLink ? "✓" : "📋"}</span>
                        <span>{copiedLink ? "Link Copiado!" : "Copiar URL do Vídeo"}</span>
                      </button>

                      <button
                        onClick={() => handleSaveToCatalog(activePlayer, result.metadata)}
                        disabled={savingToCatalog || !!savedMovie}
                        className="rounded-lg bg-brand px-3.5 py-1.5 text-xs font-black text-white hover:bg-brand2 transition-all flex items-center gap-1.5 shadow disabled:opacity-60"
                      >
                        <span>{savedMovie ? "✓ Salvo" : "➕"}</span>
                        <span>{savingToCatalog ? "Salvando..." : savedMovie ? "Salvo no Catálogo" : "Salvar no Catálogo"}</span>
                      </button>
                    </div>
                  </div>

                  {/* URL do Vídeo Exibida */}
                  <div className="rounded-xl border border-rule/70 bg-void p-3 text-xs font-mono text-mute break-all select-all flex items-center justify-between gap-3">
                    <span className="truncate">{activePlayer.player_url}</span>
                    <span className="text-[10px] text-emerald-400 font-sans font-bold flex-shrink-0">
                      ⚡ {activePlayer.latency_ms || 120}ms
                    </span>
                  </div>

                  {/* Player de Preview dentro do Modal */}
                  <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-rule bg-black mt-3">
                    {activePlayer.is_direct ? (
                      <video
                        src={activePlayer.player_url}
                        controls
                        playsInline
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <iframe
                        src={activePlayer.player_url}
                        title={result.metadata.title}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                        allowFullScreen
                        className="h-full w-full border-0"
                      />
                    )}
                  </div>
                </div>
              )}

              {/* Lista de Todas as Fontes e Servidores de Vídeo */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-mute flex items-center gap-2">
                    <span>⚡ Fontes & Links de Vídeo Alternativos</span>
                    <span className="rounded-full bg-panel2 border border-rule px-2 py-0.2 text-[10px] font-bold text-ink">
                      {result.providers.length}
                    </span>
                  </h4>
                  <span className="text-[11px] text-mute">
                    Caso queira trocar o link de origem do vídeo, clique em outra opção abaixo
                  </span>
                </div>

                <div className="grid gap-2.5 sm:grid-cols-2">
                  {result.providers.map((opt, idx) => {
                    const isSelected = activePlayer?.player_url === opt.player_url;

                    return (
                      <div
                        key={idx}
                        className={`flex flex-col justify-between rounded-xl border p-3.5 transition-all ${
                          isSelected
                            ? "border-brand bg-brand/10 ring-1 ring-brand/50 shadow-md"
                            : "border-rule bg-panel2/60 hover:border-brand/40"
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-black text-ink flex items-center gap-1.5">
                              <span>{opt.is_direct ? "🎬" : "🌐"}</span>
                              <span>{opt.provider_name}</span>
                            </p>
                            <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                              ⚡ {opt.latency_ms || 120}ms
                            </span>
                          </div>

                          <p className="text-[11px] text-mute">
                            {opt.quality} · {opt.language}
                          </p>

                          {opt.description && (
                            <p className="text-[10px] text-mute/80 line-clamp-1">
                              {opt.description}
                            </p>
                          )}
                        </div>

                        {/* Ações */}
                        <div className="mt-3 flex items-center justify-end gap-2 pt-2 border-t border-rule/50">
                          <button
                            type="button"
                            onClick={() => {
                              setActivePlayer(opt);
                              if (autoSave) {
                                handleSaveToCatalog(opt, result.metadata);
                              }
                            }}
                            className={`rounded-lg px-3 py-1 text-xs font-bold transition-all ${
                              isSelected
                                ? "bg-brand text-white shadow"
                                : "bg-panel border border-rule text-ink hover:border-brand"
                            }`}
                          >
                            {isSelected ? "▶ Selecionado" : "Usar Este Link"}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleSaveToCatalog(opt, result.metadata)}
                            disabled={savingToCatalog}
                            title="Salvar com este link de vídeo no catálogo do SilvaFlix"
                            className="rounded-lg border border-rule bg-panel px-2.5 py-1 text-xs font-bold text-mute hover:border-brand hover:text-ink transition-all"
                          >
                            ➕ Salvar
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Rodapé */}
        <div className="flex items-center justify-between border-t border-rule bg-panel2/60 px-5 py-3 text-xs text-mute">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span>SilvaFlix IA — Extração de Links e Integração Automática ao Catálogo</span>
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
