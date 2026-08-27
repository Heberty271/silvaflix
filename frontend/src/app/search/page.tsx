"use client";

import { Suspense, useEffect, useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useProfile } from "@/lib/profile-context";
import { api, Movie } from "@/lib/api";
import { AppShell } from "@/components/AppShell";
import { MovieModal } from "@/components/MovieModal";
import { getProfileRating } from "@/lib/ratings";

const DECADES = [
  { label: "Todas", val: null },
  { label: "2020+", min: 2020, max: 2099 },
  { label: "Anos 2010", min: 2010, max: 2019 },
  { label: "Anos 2000", min: 2000, max: 2009 },
  { label: "Anos 90", min: 1990, max: 1999 },
  { label: "Anos 80", min: 1980, max: 1989 },
];

export default function SearchPage() {
  return (
    <Suspense fallback={null}>
      <SearchContent />
    </Suspense>
  );
}

function SearchContent() {
  const searchParams = useSearchParams();
  const initialQ = searchParams.get("q") || "";
  const initialGenre = searchParams.get("genre") || "";

  const { token } = useAuth();
  const { activeProfile } = useProfile();

  const [movies, setMovies] = useState<Movie[]>([]);
  const [query, setQuery] = useState(initialQ);
  const [selectedGenre, setSelectedGenre] = useState(initialGenre);
  const [selectedType, setSelectedType] = useState<"all" | "movies" | "series" | "collections">("all");
  const [selectedDecade, setSelectedDecade] = useState<string>("Todas");
  const [sortBy, setSortBy] = useState<"recent" | "title" | "year" | "loved">("recent");
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  useEffect(() => {
    if (!token) return;
    api.listMovies(token).then(setMovies);

    // Carrega buscas recentes do localStorage
    try {
      const stored = localStorage.getItem("silvaflix_recent_searches");
      if (stored) setRecentSearches(JSON.parse(stored));
    } catch {
      // Ignore
    }
  }, [token]);

  useEffect(() => {
    if (initialQ) setQuery(initialQ);
    if (initialGenre) setSelectedGenre(initialGenre);
  }, [initialQ, initialGenre]);

  function saveRecentSearch(text: string) {
    if (!text.trim()) return;
    const clean = text.trim();
    const updated = [clean, ...recentSearches.filter((s) => s.toLowerCase() !== clean.toLowerCase())].slice(0, 8);
    setRecentSearches(updated);
    try {
      localStorage.setItem("silvaflix_recent_searches", JSON.stringify(updated));
    } catch {
      // Ignore
    }
  }

  function clearRecentSearches() {
    setRecentSearches([]);
    localStorage.removeItem("silvaflix_recent_searches");
  }

  // Lista de todos os gêneros disponíveis
  const allGenres = useMemo(() => {
    const set = new Set<string>();
    movies.forEach((m) => {
      if (m.genre) {
        m.genre.split(",").forEach((g) => set.add(g.trim()));
      }
    });
    return Array.from(set).sort();
  }, [movies]);

  // Filtragem combinada
  const filteredMovies = useMemo(() => {
    let list = movies;

    // Filtro Perfil Kids
    if (activeProfile?.isKids) {
      list = list.filter(
        (m) =>
          !m.is_private &&
          !["Terror", "Horror", "Crime", "Suspense"].includes(m.genre || "")
      );
    }

    // Filtro por Texto (Título, Diretor, Elenco, Sinopse, Coleção)
    if (query.trim()) {
      const q = query.toLowerCase().trim();
      list = list.filter(
        (m) =>
          m.title.toLowerCase().includes(q) ||
          m.director?.toLowerCase().includes(q) ||
          m.cast?.toLowerCase().includes(q) ||
          m.synopsis?.toLowerCase().includes(q) ||
          m.collection_name?.toLowerCase().includes(q)
      );
    }

    // Filtro por Gênero
    if (selectedGenre) {
      list = list.filter((m) =>
        m.genre?.toLowerCase().includes(selectedGenre.toLowerCase())
      );
    }

    // Filtro por Tipo
    if (selectedType === "movies") {
      list = list.filter((m) => !m.is_series);
    } else if (selectedType === "series") {
      list = list.filter((m) => m.is_series);
    } else if (selectedType === "collections") {
      list = list.filter((m) => !!m.collection_name);
    }

    // Filtro por Década
    if (selectedDecade !== "Todas") {
      const dec = DECADES.find((d) => d.label === selectedDecade);
      if (dec && dec.min && dec.max) {
        list = list.filter((m) => m.year && m.year >= dec.min! && m.year <= dec.max!);
      }
    }

    // Ordenação
    return [...list].sort((a, b) => {
      if (sortBy === "title") return a.title.localeCompare(b.title);
      if (sortBy === "year") return (b.year || 0) - (a.year || 0);
      if (sortBy === "loved") {
        const ratingA = getProfileRating(a.id, activeProfile?.id) === "loved" ? 1 : 0;
        const ratingB = getProfileRating(b.id, activeProfile?.id) === "loved" ? 1 : 0;
        return ratingB - ratingA;
      }
      // Padrão: mais recentes adicionados
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [movies, query, selectedGenre, selectedType, selectedDecade, sortBy, activeProfile]);

  return (
    <AppShell showSearch={false}>
      <div className="px-4 py-6 lg:px-8 space-y-6">
        {/* Header e Barra de Busca */}
        <div>
          <h1 className="text-2xl font-black text-ink sm:text-3xl">
            Explorar Catálogo
          </h1>
          <p className="text-xs text-mute mt-1">
            Encontre filmes, séries, franquias, diretores e atores favoritos da família.
          </p>
        </div>

        {/* Input de Busca Grande */}
        <div className="relative max-w-2xl">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && saveRecentSearch(query)}
            placeholder="Digite um título, ator, diretor ou palavra-chave..."
            className="w-full rounded-2xl border border-rule bg-panel py-3.5 pl-12 pr-10 text-sm outline-none focus:border-brand shadow-card transition-all"
          />
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg text-mute">
            🔍
          </span>
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-mute hover:text-ink"
            >
              ✕
            </button>
          )}
        </div>

        {/* Buscas Recentes */}
        {recentSearches.length > 0 && !query && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-mute font-bold">Buscas recentes:</span>
            {recentSearches.map((s, idx) => (
              <button
                key={idx}
                onClick={() => setQuery(s)}
                className="rounded-full border border-rule bg-panel px-3 py-1 text-ink hover:border-brand hover:bg-brand/10 transition-colors"
              >
                {s}
              </button>
            ))}
            <button
              onClick={clearRecentSearches}
              className="text-[11px] text-mute hover:text-brand2 ml-1"
            >
              Limpar
            </button>
          </div>
        )}

        {/* Filtros em Chips */}
        <div className="space-y-3 pt-2">
          {/* Tipo */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <span className="text-xs font-bold text-mute mr-1">Tipo:</span>
            {[
              { label: "🍿 Todos", val: "all" as const },
              { label: "🎬 Filmes", val: "movies" as const },
              { label: "📺 Séries", val: "series" as const },
              { label: "🏛️ Franquias", val: "collections" as const },
            ].map((t) => (
              <button
                key={t.val}
                onClick={() => setSelectedType(t.val)}
                className={`rounded-full px-3.5 py-1 text-xs font-bold transition-all ${
                  selectedType === t.val
                    ? "bg-brand text-white shadow"
                    : "border border-rule bg-panel text-mute hover:text-ink"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Gêneros */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <span className="text-xs font-bold text-mute mr-1">Gênero:</span>
            <button
              onClick={() => setSelectedGenre("")}
              className={`rounded-full px-3 py-1 text-xs font-bold transition-all ${
                selectedGenre === ""
                  ? "bg-brand text-white shadow"
                  : "border border-rule bg-panel text-mute hover:text-ink"
              }`}
            >
              Todos
            </button>
            {allGenres.map((g) => (
              <button
                key={g}
                onClick={() => setSelectedGenre(selectedGenre === g ? "" : g)}
                className={`rounded-full px-3 py-1 text-xs font-bold transition-all whitespace-nowrap ${
                  selectedGenre === g
                    ? "bg-brand text-white shadow"
                    : "border border-rule bg-panel text-mute hover:text-ink"
                }`}
              >
                {g}
              </button>
            ))}
          </div>

          {/* Décadas & Ordenação */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-rule/50">
            <div className="flex items-center gap-2 overflow-x-auto">
              <span className="text-xs font-bold text-mute mr-1">Época:</span>
              {DECADES.map((d) => (
                <button
                  key={d.label}
                  onClick={() => setSelectedDecade(d.label)}
                  className={`rounded-full px-3 py-0.5 text-xs font-semibold transition-all ${
                    selectedDecade === d.label
                      ? "bg-brand/20 text-brand2 border border-brand/40"
                      : "text-mute hover:text-ink"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>

            {/* Ordenar por */}
            <div className="flex items-center gap-2 text-xs">
              <span className="text-mute font-bold">Ordenar:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="rounded-lg border border-rule bg-panel px-3 py-1 text-ink outline-none focus:border-brand font-semibold"
              >
                <option value="recent">Mais Recentes</option>
                <option value="loved">❤️ Meus Favoritos</option>
                <option value="year">Ano de Lançamento</option>
                <option value="title">Ordem Alfabética (A-Z)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Grade de Resultados */}
        <div>
          <p className="text-xs text-mute mb-4 font-semibold">
            {filteredMovies.length}{" "}
            {filteredMovies.length === 1 ? "título encontrado" : "títulos encontrados"}
          </p>

          {filteredMovies.length === 0 ? (
            <div className="py-16 text-center text-mute space-y-2">
              <p className="text-3xl">🍿</p>
              <p className="text-sm font-bold">Nenhum resultado encontrado para os filtros selecionados.</p>
              <p className="text-xs">Tente limpar a busca ou selecionar outro gênero.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {filteredMovies.map((m) => {
                const thumb = m.thumbnail_filename
                  ? api.thumbnailUrl(m.id)
                  : m.backdrop_filename
                  ? api.backdropUrl(m.id)
                  : null;

                return (
                  <div
                    key={m.id}
                    onClick={() => setSelectedMovie(m)}
                    className="group relative cursor-pointer overflow-hidden rounded-xl border border-rule bg-panel shadow-card transition-all hover:scale-105 hover:border-brand"
                  >
                    <div className="aspect-[2/3] w-full bg-panel2">
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={thumb}
                          alt={m.title}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs text-mute p-2 text-center">
                          {m.title}
                        </div>
                      )}
                    </div>
                    <div className="p-2.5">
                      <p className="truncate text-xs font-bold text-ink">{m.title}</p>
                      <p className="text-[11px] text-mute mt-0.5">
                        {m.year || ""} {m.genre ? `· ${m.genre.split(",")[0]}` : ""}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal de Detalhes com Trailer */}
        <MovieModal
          movie={selectedMovie}
          onClose={() => setSelectedMovie(null)}
        />
      </div>
    </AppShell>
  );
}

