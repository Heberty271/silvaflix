"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { api, Channel, ApiError } from "@/lib/api";
import { AppShell } from "@/components/AppShell";
import { LivePlayer } from "@/components/LivePlayer";
import { ChannelCard } from "@/components/ChannelCard";
import { IptvModal } from "@/components/IptvModal";

const FAV_STORAGE_KEY = "silvaflix_favorite_channels";
const LAST_CHANNEL_KEY = "silvaflix_last_live_channel_id";

export default function AoVivoPage() {
  const { token, user } = useAuth();
  const playerSectionRef = useRef<HTMLDivElement>(null);

  const [channels, setChannels] = useState<Channel[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("Todos");
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [favorites, setFavorites] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isIptvModalOpen, setIsIptvModalOpen] = useState(false);

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

  // Ao clicar em qualquer canal
  const handleSelectChannel = (ch: Channel) => {
    setSelectedChannel(ch);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LAST_CHANNEL_KEY, String(ch.id));
    }
    // Rola suavemente até o player no topo para começar a assistir
    if (playerSectionRef.current) {
      playerSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  // Filtragem de canais
  const filteredChannels = useMemo(() => {
    return channels.filter((ch) => {
      if (selectedCategory === "Favoritos") {
        if (!favorites.includes(ch.id)) return false;
      } else if (selectedCategory !== "Todos") {
        if (ch.category !== selectedCategory) return false;
      }

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchName = ch.name.toLowerCase().includes(query);
        const matchCat = ch.category.toLowerCase().includes(query);
        if (!matchName && !matchCat) return false;
      }

      return true;
    });
  }, [channels, selectedCategory, searchQuery, favorites]);

  // Zapping
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
  const handleDeleteChannel = async (id: number) => {
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
      <main className="min-h-screen p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto space-y-8">
        {/* Cabeçalho da Seção Ao Vivo */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-rule/60 pb-5">
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
                  AO VIVO
                </span>
              </div>
              <p className="text-xs text-mute mt-0.5">
                Canais abertos, notícias, esportes, entretenimento e suporte a listas IPTV M3U & Xtream
              </p>
            </div>
          </div>

          {/* Ações do Topo */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => setIsIptvModalOpen(true)}
              className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-xs font-bold text-white shadow-xl hover:opacity-95 transition-all cursor-pointer"
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
          </div>
        </div>

        {/* PLAYER EM DESTAQUE (Fixado no Topo com Informações do Canal) */}
        <div ref={playerSectionRef} className="scroll-mt-6">
          {selectedChannel ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Player Principal */}
              <div className="lg:col-span-8 xl:col-span-9">
                <LivePlayer
                  channel={selectedChannel}
                  onPreviousChannel={handlePreviousChannel}
                  onNextChannel={handleNextChannel}
                  isFavorite={favorites.includes(selectedChannel.id)}
                  onToggleFavorite={() => toggleFavorite(selectedChannel.id)}
                />
              </div>

              {/* Painel Lateral do Canal Selecionado & Zapping */}
              <div className="lg:col-span-4 xl:col-span-3 rounded-2xl border border-rule bg-panel p-5 shadow-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-rule/60 pb-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-mute">
                    Sintonizado Agora
                  </span>
                  <span className="flex items-center gap-1.5 rounded-full bg-red-600/20 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-red-500 border border-red-500/30">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                    No Ar
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-panel2 text-2xl border border-rule">
                    📡
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
                    className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold transition-all border ${
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
                    className="flex items-center justify-center gap-1 rounded-xl border border-rule bg-panel2 px-4 py-2.5 text-xs font-bold text-ink hover:border-brand transition-all"
                    title="Trocar para o próximo canal"
                  >
                    <span>Próximo ▶</span>
                  </button>
                </div>

                {/* Lista Rápida dos Canais da Mesma Categoria */}
                <div className="pt-2 border-t border-rule/50">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-mute mb-2">
                    Mais em {selectedChannel.category}
                  </p>
                  <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                    {channels
                      .filter((c) => c.category === selectedChannel.category && c.id !== selectedChannel.id)
                      .slice(0, 6)
                      .map((c) => (
                        <button
                          key={c.id}
                          onClick={() => handleSelectChannel(c)}
                          className="w-full flex items-center gap-2.5 rounded-xl p-2.5 text-left hover:bg-panel2 transition-colors border border-transparent hover:border-rule/60"
                        >
                          <span className="text-sm">📺</span>
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
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-rule bg-panel/50 p-12 text-center">
              <span className="text-4xl mb-2">📡</span>
              <h3 className="text-base font-bold text-ink">Nenhum canal selecionado</h3>
              <p className="text-xs text-mute mt-1">
                Escolha um canal abaixo na grade para começar a assistir
              </p>
            </div>
          )}
        </div>

        {/* GUIA DE CANAIS & GRADE EPG */}
        <div className="space-y-4 pt-4 border-t border-rule/60">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-ink flex items-center gap-2">
                <span>📋</span>
                <span>Guia de Canais & Transmissões</span>
              </h2>
              <p className="text-xs text-mute">
                Clique em qualquer canal para sintonizar imediatamente
              </p>
            </div>

            {/* Campo de Busca Rápida */}
            <div className="relative w-full max-w-sm">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Pesquisar canal ou gênero..."
                className="w-full rounded-xl border border-rule bg-panel px-4 py-2 pl-9 text-xs text-ink outline-none focus:border-brand transition-all"
              />
              <span className="absolute left-3 top-2.5 text-xs text-mute">🔍</span>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-2.5 text-xs text-mute hover:text-ink"
                >
                  ✕
                </button>
              )}
            </div>
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
                    ? "bg-amber-500 text-black shadow-md font-black"
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

          {/* Renderização dos Canais */}
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
                onClick={() => loadChannels(false)}
                className="mt-4 rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white shadow hover:opacity-90"
              >
                Tentar Novamente
              </button>
            </div>
          ) : filteredChannels.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-rule p-10 text-center bg-panel/40">
              <span className="text-4xl mb-2">🔍</span>
              <h3 className="text-sm font-bold text-ink">Nenhum canal encontrado</h3>
              <p className="text-xs text-mute mt-1 max-w-sm">
                Tente buscar com outro termo ou adicione novas listas IPTV pelo botão no topo.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3.5 sm:gap-4">
              {filteredChannels.map((ch) => (
                <ChannelCard
                  key={ch.id}
                  channel={ch}
                  isSelected={selectedChannel?.id === ch.id}
                  isFavorite={favorites.includes(ch.id)}
                  onSelect={() => handleSelectChannel(ch)}
                  onToggleFavorite={() => toggleFavorite(ch.id)}
                  onDelete={() => handleDeleteChannel(ch.id)}
                  canDelete={user?.role === "admin" && ch.is_custom}
                />
              ))}
            </div>
          )}
        </div>

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
