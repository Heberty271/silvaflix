"use client";

import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { api, Channel, ApiError } from "@/lib/api";
import { AppShell } from "@/components/AppShell";
import { LivePlayer } from "@/components/LivePlayer";
import { IptvModal } from "@/components/IptvModal";

const FAV_STORAGE_KEY = "silvaflix_favorite_channels";
const LAST_CHANNEL_KEY = "silvaflix_last_live_channel_id";

export default function AoVivoPage() {
  const { token, user } = useAuth();

  const [channels, setChannels] = useState<Channel[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("Todos");
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [favorites, setFavorites] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isIptvModalOpen, setIsIptvModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"cinema" | "grid">("cinema");

  // Carrega favoritos do LocalStorage
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

  // Salva favoritos no LocalStorage
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

  // Carrega canais e categorias do backend
  const loadChannels = async (keepSelection = true) => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [chList, catList] = await Promise.all([
        api.listChannels(token),
        api.listChannelCategories(token).catch(() => []),
      ]);

      setChannels(chList);
      setCategories(catList);

      if (chList.length > 0) {
        if (!keepSelection || !selectedChannel) {
          // Tenta carregar último canal assistido
          let initialChannel = chList[0];
          if (typeof window !== "undefined") {
            const lastId = window.localStorage.getItem(LAST_CHANNEL_KEY);
            if (lastId) {
              const found = chList.find((c) => c.id === Number(lastId));
              if (found) initialChannel = found;
            }
          }
          setSelectedChannel(initialChannel);
        } else {
          // Atualiza dados do canal atualmente selecionado
          const found = chList.find((c) => c.id === selectedChannel.id);
          if (found) setSelectedChannel(found);
        }
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Não foi possível carregar a grade de canais ao vivo."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      loadChannels(false);
    }
  }, [token]);

  // Salva o último canal assistido
  const handleSelectChannel = (ch: Channel) => {
    setSelectedChannel(ch);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LAST_CHANNEL_KEY, String(ch.id));
    }
    // Rola suavemente até o player se estiver em tela pequena
    if (window.innerWidth < 1024) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  // Filtragem de canais
  const filteredChannels = useMemo(() => {
    return channels.filter((ch) => {
      // Filtro de Categoria / Favoritos
      if (selectedCategory === "Favoritos") {
        if (!favorites.includes(ch.id)) return false;
      } else if (selectedCategory !== "Todos") {
        if (ch.category !== selectedCategory) return false;
      }

      // Filtro de Busca
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchName = ch.name.toLowerCase().includes(query);
        const matchCat = ch.category.toLowerCase().includes(query);
        if (!matchName && !matchCat) return false;
      }

      return true;
    });
  }, [channels, selectedCategory, searchQuery, favorites]);

  // Navegação Zapping (Canal anterior / próximo)
  const currentFilteredIndex = useMemo(() => {
    if (!selectedChannel) return -1;
    return filteredChannels.findIndex((c) => c.id === selectedChannel.id);
  }, [filteredChannels, selectedChannel]);

  const handlePreviousChannel = () => {
    if (filteredChannels.length === 0) return;
    if (currentFilteredIndex <= 0) {
      handleSelectChannel(filteredChannels[filteredChannels.length - 1]);
    } else {
      handleSelectChannel(filteredChannels[currentFilteredIndex - 1]);
    }
  };

  const handleNextChannel = () => {
    if (filteredChannels.length === 0) return;
    if (currentFilteredIndex >= filteredChannels.length - 1 || currentFilteredIndex === -1) {
      handleSelectChannel(filteredChannels[0]);
    } else {
      handleSelectChannel(filteredChannels[currentFilteredIndex + 1]);
    }
  };

  // Exclusão de canal (Admin)
  const handleDeleteChannel = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!token || !confirm("Deseja realmente remover este canal da grade?")) return;
    try {
      await api.deleteLiveChannel(id, token);
      loadChannels(true);
    } catch {
      alert("Erro ao remover canal.");
    }
  };

  // Restauração de canais padrão (Admin)
  const handleResetDefaults = async () => {
    if (!token || !confirm("Deseja restaurar todos os canais padrão gratuitos?")) return;
    try {
      await api.resetDefaultChannels(token);
      loadChannels(false);
    } catch {
      alert("Erro ao restaurar canais.");
    }
  };

  return (
    <AppShell showSearch={false}>
      <main className="min-h-screen p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto space-y-6">
        {/* Cabeçalho da Seção Ao Vivo */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-rule/60 pb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-600/20 text-2xl border border-red-500/30">
              📡
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl font-black tracking-tight text-ink">
                  TV Ao Vivo & IPTV
                </h1>
                <span className="flex items-center gap-1.5 rounded-full bg-red-600 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-white shadow-lg animate-pulse">
                  <span className="h-1.5 w-1.5 rounded-full bg-white" />
                  ONLINE
                </span>
              </div>
              <p className="text-xs text-mute mt-0.5">
                Canais abertos gratuitos, transmissões ao vivo e suporte completo a IPTV M3U & Xtream
              </p>
            </div>
          </div>

          {/* Ações do Topo */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => setIsIptvModalOpen(true)}
              className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-xs font-bold text-white shadow-lg hover:opacity-95 transition-all cursor-pointer"
            >
              <span>➕</span>
              <span>Transmitir Lista IPTV</span>
            </button>

            {user?.role === "admin" && (
              <button
                onClick={handleResetDefaults}
                title="Restaurar canais abertos padrão"
                className="flex items-center gap-1.5 rounded-xl border border-rule bg-panel px-3 py-2 text-xs font-semibold text-mute hover:text-ink hover:border-brand transition-all"
              >
                <span>🔄</span>
                <span className="hidden sm:inline">Restaurar Padrões</span>
              </button>
            )}

            {/* Alternador de Modo de Visualização */}
            <div className="flex items-center rounded-xl border border-rule bg-panel p-1 text-xs">
              <button
                onClick={() => setViewMode("cinema")}
                title="Modo Player Cinema"
                className={`rounded-lg px-2.5 py-1.5 font-bold transition-all ${
                  viewMode === "cinema"
                    ? "bg-brand text-white shadow"
                    : "text-mute hover:text-ink"
                }`}
              >
                🎬 Player
              </button>
              <button
                onClick={() => setViewMode("grid")}
                title="Modo Grade Completa"
                className={`rounded-lg px-2.5 py-1.5 font-bold transition-all ${
                  viewMode === "grid"
                    ? "bg-brand text-white shadow"
                    : "text-mute hover:text-ink"
                }`}
              >
                ▦ Grade
              </button>
            </div>
          </div>
        </div>

        {/* Player em Destaque (Modo Cinema ou quando um canal está selecionado) */}
        {selectedChannel && viewMode === "cinema" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-8 xl:col-span-9">
              <LivePlayer
                channel={selectedChannel}
                onPreviousChannel={handlePreviousChannel}
                onNextChannel={handleNextChannel}
                isFavorite={favorites.includes(selectedChannel.id)}
                onToggleFavorite={() => toggleFavorite(selectedChannel.id)}
              />
            </div>

            {/* Sidebar de Canal / Informações Rápidas e Zapping */}
            <div className="lg:col-span-4 xl:col-span-3 rounded-2xl border border-rule bg-panel p-4 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-rule/50 pb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-mute">
                  Canal em Reprodução
                </span>
                <span className="rounded-full bg-red-600/20 px-2 py-0.5 text-[10px] font-bold text-red-500">
                  🔴 No Ar
                </span>
              </div>

              <div className="flex items-center gap-3">
                {selectedChannel.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={selectedChannel.logo_url}
                    alt={selectedChannel.name}
                    className="h-12 w-12 object-contain rounded-xl bg-black/40 p-1 border border-rule/60"
                  />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-panel2 text-xl">
                    📡
                  </div>
                )}
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
                  <span>{favorites.includes(selectedChannel.id) ? "Favoritado" : "Favoritar"}</span>
                </button>

                <button
                  onClick={handleNextChannel}
                  className="flex items-center justify-center gap-1 rounded-xl border border-rule bg-panel2 px-3 py-2 text-xs font-bold text-mute hover:text-ink hover:border-brand transition-all"
                  title="Trocar para o próximo canal"
                >
                  <span>Próximo ▶</span>
                </button>
              </div>

              {/* Guia Rápido dos Próximos Canais */}
              <div className="pt-2 border-t border-rule/50">
                <p className="text-[11px] font-bold uppercase tracking-wider text-mute mb-2">
                  Outros canais em {selectedChannel.category}
                </p>
                <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                  {channels
                    .filter((c) => c.category === selectedChannel.category && c.id !== selectedChannel.id)
                    .slice(0, 6)
                    .map((c) => (
                      <button
                        key={c.id}
                        onClick={() => handleSelectChannel(c)}
                        className="w-full flex items-center gap-2.5 rounded-xl p-2 text-left hover:bg-panel2 transition-colors"
                      >
                        <span className="text-xs">📺</span>
                        <span className="truncate text-xs font-bold text-ink flex-1">
                          {c.name}
                        </span>
                      </button>
                    ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Barra de Filtros de Categoria e Pesquisa de Canais */}
        <div className="space-y-3 pt-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Campo de Busca Rápida */}
            <div className="relative w-full max-w-md">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Pesquisar canal por nome ou categoria..."
                className="w-full rounded-2xl border border-rule bg-panel px-4 py-2.5 pl-10 text-sm text-ink outline-none focus:border-brand transition-all"
              />
              <span className="absolute left-3.5 top-3 text-sm text-mute">🔍</span>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3.5 top-3 text-xs text-mute hover:text-ink"
                >
                  ✕
                </button>
              )}
            </div>

            <span className="text-xs text-mute font-semibold">
              {filteredChannels.length}{" "}
              {filteredChannels.length === 1 ? "canal disponível" : "canais disponíveis"}
            </span>
          </div>

          {/* Categorias (Pills Horizontais) */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
            <button
              onClick={() => setSelectedCategory("Todos")}
              className={`flex-shrink-0 flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                selectedCategory === "Todos"
                  ? "bg-brand text-white shadow-md"
                  : "border border-rule bg-panel text-mute hover:bg-panel2 hover:text-ink"
              }`}
            >
              <span>🔥</span>
              <span>Todos ({channels.length})</span>
            </button>

            {favorites.length > 0 && (
              <button
                onClick={() => setSelectedCategory("Favoritos")}
                className={`flex-shrink-0 flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                  selectedCategory === "Favoritos"
                    ? "bg-amber-500 text-black shadow-md"
                    : "border border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
                }`}
              >
                <span>★</span>
                <span>Favoritos ({favorites.length})</span>
              </button>
            )}

            {categories.map((cat) => {
              const count = channels.filter((c) => c.category === cat).length;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`flex-shrink-0 flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                    selectedCategory === cat
                      ? "bg-brand text-white shadow-md"
                      : "border border-rule bg-panel text-mute hover:bg-panel2 hover:text-ink"
                  }`}
                >
                  <span>{cat}</span>
                  <span className="rounded-full bg-panel2 px-1.5 py-0.2 text-[10px] text-mute">
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Grade de Canais */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-white/20 border-t-brand" />
            <p className="mt-3 text-xs font-bold uppercase tracking-wider text-mute">
              Carregando transmissões ao vivo...
            </p>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-center text-red-400">
            <span className="text-3xl">⚠️</span>
            <p className="mt-2 text-sm font-bold">{error}</p>
            <button
              onClick={() => loadChannels(false)}
              className="mt-4 rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white shadow hover:opacity-90"
            >
              Tentar Novamente
            </button>
          </div>
        ) : filteredChannels.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-rule p-12 text-center bg-panel/40">
            <span className="text-4xl mb-2">🔍</span>
            <h3 className="text-sm font-bold text-ink">Nenhum canal encontrado</h3>
            <p className="text-xs text-mute mt-1 max-w-sm">
              Tente pesquisar com outros termos ou adicione novas transmissões IPTV pelo botão acima.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
            {filteredChannels.map((ch) => {
              const isSelected = selectedChannel?.id === ch.id;
              const isFav = favorites.includes(ch.id);

              return (
                <div
                  key={ch.id}
                  onClick={() => handleSelectChannel(ch)}
                  className={`group relative flex flex-col justify-between overflow-hidden rounded-2xl border p-3.5 text-left transition-all cursor-pointer backdrop-blur ${
                    isSelected
                      ? "border-red-500 bg-red-950/20 shadow-xl shadow-red-950/30 ring-2 ring-red-500/40"
                      : "border-rule bg-panel hover:border-brand hover:bg-panel2 hover:shadow-lg"
                  }`}
                >
                  {/* Topo do Card: Badge e Favorito */}
                  <div className="flex items-center justify-between mb-3">
                    <span className="flex items-center gap-1 rounded-full bg-red-600/20 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-red-500 border border-red-500/30">
                      <span className="h-1 w-1 rounded-full bg-red-500 animate-pulse" />
                      AO VIVO
                    </span>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavorite(ch.id);
                      }}
                      className={`flex h-6 w-6 items-center justify-center rounded-full text-xs transition-colors ${
                        isFav
                          ? "text-amber-400"
                          : "text-mute/40 hover:text-amber-400"
                      }`}
                      title={isFav ? "Remover dos favoritos" : "Favoritar canal"}
                    >
                      {isFav ? "★" : "☆"}
                    </button>
                  </div>

                  {/* Logo do Canal */}
                  <div className="flex h-16 w-full items-center justify-center rounded-xl bg-black/40 p-2 border border-rule/40 group-hover:scale-105 transition-transform">
                    {ch.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={ch.logo_url}
                        alt={ch.name}
                        className="max-h-full max-w-full object-contain"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = "none";
                        }}
                      />
                    ) : (
                      <span className="text-2xl">📡</span>
                    )}
                  </div>

                  {/* Info do Canal */}
                  <div className="mt-3">
                    <h3 className="truncate text-xs font-black text-ink group-hover:text-brand transition-colors">
                      {ch.name}
                    </h3>
                    <p className="truncate text-[10px] text-mute font-medium mt-0.5">
                      {ch.category}
                    </p>
                  </div>

                  {/* Botão de Excluir Canal se for Custom e Usuário for Admin */}
                  {user?.role === "admin" && ch.is_custom && (
                    <button
                      onClick={(e) => handleDeleteChannel(ch.id, e)}
                      title="Excluir este canal"
                      className="absolute bottom-2 right-2 flex h-5 w-5 items-center justify-center rounded-md bg-red-600/20 text-[10px] text-red-400 opacity-0 group-hover:opacity-100 hover:bg-red-600 hover:text-white transition-all"
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Modal de Importação IPTV */}
        <IptvModal
          isOpen={isIptvModalOpen}
          onClose={() => setIsIptvModalOpen(false)}
          onSuccess={() => loadChannels(true)}
        />
      </main>
    </AppShell>
  );
}
