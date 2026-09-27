"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { api, Channel, ApiError, Playlist, CategoryWithCount } from "@/lib/api";
import { AppShell } from "@/components/AppShell";
import { LivePlayer } from "@/components/LivePlayer";
import { ChannelCard } from "@/components/ChannelCard";
import { IptvModal } from "@/components/IptvModal";

const FAV_STORAGE_KEY = "silvaflix_favorite_channels";
const LAST_CHANNEL_KEY = "silvaflix_last_live_channel_id";

function getCategoryIcon(cat: string): string {
  const c = cat.toLowerCase();
  if (c.includes("aberto") || c.includes("brasil")) return "🇧🇷";
  if (c.includes("esporte") || c.includes("futebol")) return "⚽";
  if (c.includes("filme") || c.includes("serie") || c.includes("cine")) return "🎬";
  if (c.includes("notícia") || c.includes("noticia") || c.includes("news")) return "📰";
  if (c.includes("infantil") || c.includes("desenho") || c.includes("kid")) return "👶";
  if (c.includes("variedade") || c.includes("entretenimento")) return "🎭";
  if (c.includes("música") || c.includes("musica")) return "🎵";
  if (c.includes("documentário") || c.includes("doc")) return "📚";
  if (c.includes("público") || c.includes("legislativ")) return "🏛️";
  if (c.includes("religi") || c.includes("gospel")) return "🙏";
  if (c.includes("cultura") || c.includes("educa")) return "🎨";
  return "📺";
}

export default function AoVivoPage() {
  const { token, user } = useAuth();
  const playerSectionRef = useRef<HTMLDivElement>(null);

  const [channels, setChannels] = useState<Channel[]>([]);
  const [categories, setCategories] = useState<CategoryWithCount[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<number | undefined>(undefined);
  const [selectedCategory, setSelectedCategory] = useState<string>("Todos");
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [favorites, setFavorites] = useState<number[]>([]);

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedChannelIds, setSelectedChannelIds] = useState<number[]>([]);

  const [isIptvModalOpen, setIsIptvModalOpen] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const storedFavs = window.localStorage.getItem(FAV_STORAGE_KEY);
        if (storedFavs) {
          setFavorites(JSON.parse(storedFavs));
        }
      } catch {
        // ignore
      }
    }
  }, []);

  const toggleFavorite = (channelId: number) => {
    setFavorites((prev) => {
      const next = prev.includes(channelId)
        ? prev.filter((id) => id !== channelId)
        : [...prev, channelId];
      if (typeof window !== "undefined") {
        window.localStorage.setItem(FAV_STORAGE_KEY, JSON.stringify(next));
      }
      return next;
    });
  };

  const loadMetadata = useCallback(async () => {
    if (!token) return;
    try {
      const [cats, pls] = await Promise.all([
        api.listChannelCategories(token, selectedPlaylistId).catch(() => []),
        api.listPlaylists(token).catch(() => []),
      ]);
      setCategories(cats);
      setPlaylists(pls);
    } catch {
      // ignore
    }
  }, [token, selectedPlaylistId]);

  const fetchChannels = useCallback(async (newPage = 1, append = false) => {
    if (!token) return;
    if (newPage === 1) {
      setLoading(true);
      setError(null);
    } else {
      setLoadingMore(true);
    }

    try {
      const res = await api.listChannels(token, {
        category: selectedCategory === "Favoritos" ? undefined : selectedCategory,
        playlist_id: selectedPlaylistId,
        query: searchQuery.trim() || undefined,
        page: newPage,
        limit: 60,
      });

      let items = res.items;
      if (selectedCategory === "Favoritos") {
        items = items.filter((ch) => favorites.includes(ch.id));
      }

      if (append) {
        setChannels((prev) => [...prev, ...items]);
      } else {
        setChannels(items);
        if (items.length > 0 && (!selectedChannel || !append)) {
          let initial = items[0];
          if (typeof window !== "undefined") {
            const lastId = window.localStorage.getItem(LAST_CHANNEL_KEY);
            if (lastId) {
              const found = items.find((c) => c.id === Number(lastId));
              if (found) initial = found;
            }
          }
          if (!selectedChannel) {
            setSelectedChannel(initial);
          }
        }
      }

      setPage(res.page);
      setTotalPages(res.total_pages);
      setTotalCount(res.total);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Não foi possível carregar a grade de canais ao vivo."
      );
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [token, selectedCategory, selectedPlaylistId, searchQuery, favorites, selectedChannel]);

  useEffect(() => {
    if (token) {
      loadMetadata();
    }
  }, [token, loadMetadata]);

  useEffect(() => {
    if (token) {
      const timeout = setTimeout(() => {
        setPage(1);
        fetchChannels(1, false);
      }, 250);
      return () => clearTimeout(timeout);
    }
  }, [token, selectedCategory, selectedPlaylistId, searchQuery]);

  const handleLoadMore = () => {
    if (page < totalPages && !loadingMore) {
      fetchChannels(page + 1, true);
    }
  };

  const handleSelectChannel = (ch: Channel) => {
    setSelectedChannel(ch);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LAST_CHANNEL_KEY, String(ch.id));
    }
    if (playerSectionRef.current) {
      playerSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const currentFilteredIndex = useMemo(() => {
    if (!selectedChannel) return -1;
    return channels.findIndex((c) => c.id === selectedChannel.id);
  }, [channels, selectedChannel]);

  const handlePreviousChannel = () => {
    if (channels.length === 0) return;
    if (currentFilteredIndex <= 0) {
      handleSelectChannel(channels[channels.length - 1]);
    } else {
      handleSelectChannel(channels[currentFilteredIndex - 1]);
    }
  };

  const handleNextChannel = () => {
    if (channels.length === 0) return;
    if (currentFilteredIndex >= channels.length - 1 || currentFilteredIndex === -1) {
      handleSelectChannel(channels[0]);
    } else {
      handleSelectChannel(channels[currentFilteredIndex + 1]);
    }
  };

  const handleDeleteChannel = async (id: number) => {
    if (!token || !confirm("Deseja realmente remover este canal da grade?")) return;
    try {
      await api.deleteLiveChannel(id, token);
      fetchChannels(1, false);
      loadMetadata();
    } catch {
      alert("Erro ao remover canal.");
    }
  };

  const toggleSelectChannelBulk = (id: number) => {
    setSelectedChannelIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllCurrentPage = () => {
    const currentIds = channels.map((c) => c.id);
    setSelectedChannelIds((prev) => Array.from(new Set([...prev, ...currentIds])));
  };

  const handleDeselectAll = () => {
    setSelectedChannelIds([]);
  };

  const handleExecuteBulkDelete = async () => {
    if (!token || selectedChannelIds.length === 0) return;
    if (!confirm(`Tem certeza que deseja excluir ${selectedChannelIds.length} canais selecionados?`)) {
      return;
    }
    try {
      const res = await api.bulkDeleteChannels(selectedChannelIds, token);
      alert(res.message);
      setSelectedChannelIds([]);
      setIsSelectMode(false);
      fetchChannels(1, false);
      loadMetadata();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Erro ao excluir canais selecionados.");
    }
  };

  const totalChannelsCount = useMemo(() => {
    return categories.reduce((acc, curr) => acc + curr.count, 0);
  }, [categories]);

  return (
    <AppShell showSearch={false}>
      <main className="min-h-screen p-3 sm:p-6 lg:p-8 max-w-[1600px] mx-auto space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-rule/60 pb-5">
          <div className="flex items-center gap-3.5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-600/20 text-2xl border border-red-500/40 shadow-inner">
              📡
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl font-black tracking-tight text-ink">
                  TV Ao Vivo & IPTV
                </h1>
                <span className="flex items-center gap-1.5 rounded-full bg-red-600 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-white shadow-lg animate-pulse">
                  <span className="h-1.5 w-1.5 rounded-full bg-white" />
                  NO AR
                </span>
              </div>
              <p className="text-xs text-mute mt-0.5">
                {totalChannelsCount > 0
                  ? `${totalChannelsCount.toLocaleString("pt-BR")} canais organizados • Suporte a listas M3U e Xtream Codes`
                  : "Canais abertos, notícias, esportes, entretenimento e IPTV"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {playlists.length > 0 && (
              <select
                value={selectedPlaylistId ?? ""}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedPlaylistId(val ? Number(val) : undefined);
                  setSelectedCategory("Todos");
                }}
                className="rounded-xl border border-rule bg-panel px-3 py-2 text-xs font-bold text-ink outline-none focus:border-brand transition-all cursor-pointer"
              >
                <option value="">📁 Todas as Listas ({playlists.length})</option>
                {playlists.map((pl) => (
                  <option key={pl.id} value={pl.id}>
                    {pl.name} ({pl.channel_count.toLocaleString("pt-BR")})
                  </option>
                ))}
              </select>
            )}

            <div className="flex items-center rounded-xl border border-rule bg-panel p-0.5 text-xs">
              <button
                onClick={() => setViewMode("grid")}
                title="Visualização em Grade de Cards"
                className={`flex h-7 w-7 items-center justify-center rounded-lg transition-all ${
                  viewMode === "grid" ? "bg-brand text-white shadow-sm font-bold" : "text-mute hover:text-ink"
                }`}
              >
                🔲
              </button>
              <button
                onClick={() => setViewMode("list")}
                title="Visualização em Lista Compacta"
                className={`flex h-7 w-7 items-center justify-center rounded-lg transition-all ${
                  viewMode === "list" ? "bg-brand text-white shadow-sm font-bold" : "text-mute hover:text-ink"
                }`}
              >
                📜
              </button>
            </div>

            {user?.role === "admin" && (
              <button
                onClick={() => {
                  setIsSelectMode(!isSelectMode);
                  setSelectedChannelIds([]);
                }}
                className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition-all cursor-pointer ${
                  isSelectMode
                    ? "border-red-500 bg-red-600/20 text-red-400"
                    : "border-rule bg-panel text-mute hover:text-ink hover:border-brand"
                }`}
              >
                <span>🔘</span>
                <span>{isSelectMode ? "Sair da Seleção" : "Selecionar"}</span>
              </button>
            )}

            <button
              onClick={() => setIsIptvModalOpen(true)}
              className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white shadow-xl hover:opacity-95 transition-all cursor-pointer"
            >
              <span>⚙️</span>
              <span>Gerenciar Listas IPTV</span>
            </button>
          </div>
        </div>

        <div ref={playerSectionRef} className="scroll-mt-6">
          {selectedChannel ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              <div className="lg:col-span-8 xl:col-span-9">
                <LivePlayer
                  channel={selectedChannel}
                  onPreviousChannel={handlePreviousChannel}
                  onNextChannel={handleNextChannel}
                  isFavorite={favorites.includes(selectedChannel.id)}
                  onToggleFavorite={() => toggleFavorite(selectedChannel.id)}
                />
              </div>

              <div className="lg:col-span-4 xl:col-span-3 rounded-2xl border border-rule bg-panel p-4 shadow-xl space-y-3.5">
                <div className="flex items-center justify-between border-b border-rule/60 pb-2.5">
                  <span className="text-xs font-bold uppercase tracking-wider text-mute">
                    Sintonizado Agora
                  </span>
                  <span className="flex items-center gap-1.5 rounded-full bg-red-600/20 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-red-500 border border-red-500/30">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                    No Ar
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-panel2 text-2xl border border-rule flex-shrink-0">
                    {getCategoryIcon(selectedChannel.category)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-base font-black text-ink">
                      {selectedChannel.name}
                    </h3>
                    <p className="text-xs text-mute truncate">{selectedChannel.category}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => toggleFavorite(selectedChannel.id)}
                    className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold transition-all border ${
                      favorites.includes(selectedChannel.id)
                        ? "bg-amber-500/20 text-amber-400 border-amber-500/40"
                        : "border-rule bg-panel2 text-mute hover:text-ink hover:border-brand"
                    }`}
                  >
                    <span>{favorites.includes(selectedChannel.id) ? "★" : "☆"}</span>
                    <span>{favorites.includes(selectedChannel.id) ? "Favorito" : "Favoritar"}</span>
                  </button>

                  <button
                    onClick={handleNextChannel}
                    className="flex items-center justify-center gap-1 rounded-xl border border-rule bg-panel2 px-4 py-2 text-xs font-bold text-ink hover:border-brand transition-all cursor-pointer"
                    title="Trocar para o próximo canal"
                  >
                    <span>Próximo ▶</span>
                  </button>
                </div>

                <div className="pt-2 border-t border-rule/50">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-mute mb-2">
                    Mais em {selectedChannel.category}
                  </p>
                  <div className="space-y-1 max-h-48 overflow-y-auto pr-1 scrollbar-thin">
                    {channels
                      .filter((c) => c.category === selectedChannel.category && c.id !== selectedChannel.id)
                      .slice(0, 8)
                      .map((c) => (
                        <button
                          key={c.id}
                          onClick={() => handleSelectChannel(c)}
                          className="w-full flex items-center gap-2.5 rounded-xl p-2 text-left hover:bg-panel2 transition-colors border border-transparent hover:border-rule/60 cursor-pointer"
                        >
                          <span className="text-xs">{getCategoryIcon(c.category)}</span>
                          <span className="truncate text-xs font-bold text-ink flex-1">
                            {c.name}
                          </span>
                          <span className="text-[10px] text-mute font-mono">▶</span>
                        </button>
                      ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-rule bg-panel/50 p-10 text-center">
              <span className="text-4xl mb-2">📡</span>
              <h3 className="text-base font-bold text-ink">Nenhum canal selecionado</h3>
              <p className="text-xs text-mute mt-1">
                Escolha um canal abaixo na grade para começar a assistir
              </p>
            </div>
          )}
        </div>

        {isSelectMode && selectedChannelIds.length > 0 && (
          <div className="sticky top-20 z-30 flex items-center justify-between gap-3 rounded-2xl border border-red-500/50 bg-red-950/90 p-4 backdrop-blur-md shadow-2xl animate-fade-in text-white">
            <div className="flex items-center gap-3">
              <span className="text-xl">🗑️</span>
              <div>
                <p className="text-sm font-black">
                  {selectedChannelIds.length} canais selecionados
                </p>
                <p className="text-[11px] text-red-200">
                  Você pode excluir todos eles de uma só vez
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleSelectAllCurrentPage}
                className="rounded-xl border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-bold hover:bg-white/20 transition-all cursor-pointer"
              >
                Marcar Todos da Página
              </button>
              <button
                onClick={handleDeselectAll}
                className="rounded-xl border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-bold hover:bg-white/20 transition-all cursor-pointer"
              >
                Desmarcar
              </button>
              <button
                onClick={handleExecuteBulkDelete}
                className="rounded-xl bg-red-600 px-4 py-2 text-xs font-black text-white hover:bg-red-700 transition-all shadow-lg cursor-pointer"
              >
                Excluir Selecionados
              </button>
            </div>
          </div>
        )}

        <div className="space-y-4 pt-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-ink flex items-center gap-2">
                <span>📋</span>
                <span>Guia de Canais</span>
                {totalCount > 0 && (
                  <span className="text-xs font-normal text-mute">
                    ({totalCount.toLocaleString("pt-BR")} canais nesta categoria)
                  </span>
                )}
              </h2>
              <p className="text-xs text-mute">
                Clique em qualquer canal para sintonizar imediatamente
              </p>
            </div>

            <div className="relative w-full max-w-sm">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Pesquisar canal ou número..."
                className="w-full rounded-xl border border-rule bg-panel px-4 py-2 pl-9 text-xs text-ink outline-none focus:border-brand transition-all"
              />
              <span className="absolute left-3 top-2.5 text-xs text-mute">🔍</span>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-2.5 text-xs text-mute hover:text-ink cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
            <button
              onClick={() => setSelectedCategory("Todos")}
              className={`flex-shrink-0 flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
                selectedCategory === "Todos"
                  ? "bg-brand text-white shadow-md font-black"
                  : "border border-rule bg-panel text-mute hover:bg-panel2 hover:text-ink"
              }`}
            >
              <span>🔥</span>
              <span>Todos</span>
              {totalChannelsCount > 0 && (
                <span className="rounded-full bg-white/20 px-1.5 py-0.2 text-[10px]">
                  {totalChannelsCount.toLocaleString("pt-BR")}
                </span>
              )}
            </button>

            {favorites.length > 0 && (
              <button
                onClick={() => setSelectedCategory("Favoritos")}
                className={`flex-shrink-0 flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
                  selectedCategory === "Favoritos"
                    ? "bg-amber-500 text-black shadow-md font-black"
                    : "border border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
                }`}
              >
                <span>★</span>
                <span>Favoritos</span>
                <span className="rounded-full bg-amber-500/30 px-1.5 py-0.2 text-[10px]">
                  {favorites.length}
                </span>
              </button>
            )}

            {categories.map((cat) => {
              const icon = getCategoryIcon(cat.category);
              const isActive = selectedCategory === cat.category;
              return (
                <button
                  key={cat.category}
                  onClick={() => setSelectedCategory(cat.category)}
                  className={`flex-shrink-0 flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-all cursor-pointer ${
                    isActive
                      ? "bg-brand text-white shadow-md font-black"
                      : "border border-rule bg-panel text-mute hover:bg-panel2 hover:text-ink"
                  }`}
                >
                  <span>{icon}</span>
                  <span>{cat.category}</span>
                  <span className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                    isActive ? "bg-white/20 text-white" : "bg-panel2 text-mute"
                  }`}>
                    {cat.count.toLocaleString("pt-BR")}
                  </span>
                </button>
              );
            })}
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/20 border-t-brand" />
              <p className="mt-3 text-xs font-bold uppercase tracking-wider text-mute">
                Carregando canais ao vivo...
              </p>
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-center text-red-400">
              <span className="text-3xl">⚠️</span>
              <p className="mt-2 text-sm font-bold">{error}</p>
              <button
                onClick={() => fetchChannels(1, false)}
                className="mt-4 rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white shadow hover:opacity-90 cursor-pointer"
              >
                Tentar Novamente
              </button>
            </div>
          ) : channels.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-rule p-10 text-center bg-panel/40">
              <span className="text-4xl mb-2">🔍</span>
              <h3 className="text-sm font-bold text-ink">Nenhum canal encontrado</h3>
              <p className="text-xs text-mute mt-1 max-w-sm">
                Tente buscar com outro termo ou gerencie suas listas no botão superior.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {viewMode === "grid" ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
                  {channels.map((ch) => (
                    <ChannelCard
                      key={ch.id}
                      channel={ch}
                      viewMode="grid"
                      isSelected={selectedChannel?.id === ch.id}
                      isFavorite={favorites.includes(ch.id)}
                      isSelectMode={isSelectMode}
                      isSelectedForBulk={selectedChannelIds.includes(ch.id)}
                      onSelect={() => handleSelectChannel(ch)}
                      onToggleFavorite={() => toggleFavorite(ch.id)}
                      onToggleBulkSelect={() => toggleSelectChannelBulk(ch.id)}
                      onDelete={() => handleDeleteChannel(ch.id)}
                      canDelete={user?.role === "admin" && ch.is_custom}
                    />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {channels.map((ch) => (
                    <ChannelCard
                      key={ch.id}
                      channel={ch}
                      viewMode="list"
                      isSelected={selectedChannel?.id === ch.id}
                      isFavorite={favorites.includes(ch.id)}
                      isSelectMode={isSelectMode}
                      isSelectedForBulk={selectedChannelIds.includes(ch.id)}
                      onSelect={() => handleSelectChannel(ch)}
                      onToggleFavorite={() => toggleFavorite(ch.id)}
                      onToggleBulkSelect={() => toggleSelectChannelBulk(ch.id)}
                      onDelete={() => handleDeleteChannel(ch.id)}
                      canDelete={user?.role === "admin" && ch.is_custom}
                    />
                  ))}
                </div>
              )}

              {page < totalPages && (
                <div className="flex flex-col items-center justify-center pt-4 pb-8">
                  <button
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    className="flex items-center gap-2 rounded-2xl bg-panel2 border border-rule px-6 py-3 text-xs font-bold text-ink hover:border-brand hover:bg-panel shadow-lg transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {loadingMore ? (
                      <>
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-brand" />
                        <span>Carregando mais canais...</span>
                      </>
                    ) : (
                      <>
                        <span>⬇️ Carregar Mais Canais</span>
                        <span className="text-mute font-normal">
                          (Exibindo {channels.length} de {totalCount.toLocaleString("pt-BR")})
                        </span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <IptvModal
          isOpen={isIptvModalOpen}
          onClose={() => setIsIptvModalOpen(false)}
          onSuccess={() => {
            fetchChannels(1, false);
            loadMetadata();
          }}
        />
      </main>
    </AppShell>
  );
}
