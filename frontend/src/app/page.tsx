"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useProfile } from "@/lib/profile-context";
import { api, Movie, MovieCollection } from "@/lib/api";
import { AppShell } from "@/components/AppShell";
import { Hero } from "@/components/Hero";
import { MovieRow } from "@/components/MovieRow";
import { MovieModal } from "@/components/MovieModal";
import { listProgress } from "@/lib/watch-progress";
import { getProfileFavoriteIds } from "@/lib/ratings";

export default function HomePage() {
  const { token } = useAuth();
  const { activeProfile } = useProfile();
  const [movies, setMovies] = useState<Movie[]>([]);
  const [collections, setCollections] = useState<MovieCollection[]>([]);
  const [fetching, setFetching] = useState(true);
  const [progressMap, setProgressMap] = useState<Record<number, number>>({});
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [activeFilter, setActiveFilter] = useState<"all" | "movies" | "series" | "collections">("all");

  useEffect(() => {
    if (!token) return;
    Promise.all([
      api.listMovies(token),
      api.listCollections(token).catch(() => []),
    ])
      .then(([mList, cList]) => {
        setMovies(mList);
        setCollections(cList);
      })
      .finally(() => setFetching(false));

    const entries = listProgress();
    const map: Record<number, number> = {};
    entries.forEach((e) => {
      map[e.movieId] = (e.currentTime / e.duration) * 100;
    });
    setProgressMap(map);
  }, [token, activeProfile?.id]);

  // Filtro para Perfil Kids
  const visibleMovies = activeProfile?.isKids
    ? movies.filter(
        (m) =>
          !m.is_private &&
          !["Terror", "Horror", "Crime", "Suspense"].includes(m.genre || "")
      )
    : movies;

  if (!fetching && visibleMovies.length === 0) {
    return (
      <AppShell>
        <div className="px-4 py-24 text-center lg:px-8">
          <p className="text-2xl font-bold text-mute">
            {activeProfile?.isKids
              ? "Nenhum filme infantil encontrado no momento."
              : "O catálogo ainda está vazio."}
          </p>
          <p className="mt-2 text-sm text-mute">
            Vá em Gerenciar para cadastrar ou escanear novos filmes.
          </p>
        </div>
      </AppShell>
    );
  }

  const featuredList = visibleMovies.filter((m) => m.is_featured);
  const heroMovies = featuredList.length > 0 ? featuredList : visibleMovies.slice(0, 5);
  const trending = visibleMovies.slice(0, 6);
  const continueWatching = listProgress()
    .map((p) => visibleMovies.find((m) => m.id === p.movieId))
    .filter((m): m is Movie => !!m);

  // Favoritos do Perfil Ativo
  const favIds = getProfileFavoriteIds(activeProfile?.id);
  const favorites = visibleMovies.filter((m) => favIds.includes(m.id));

  // Séries agrupadas
  const seriesTitles = Array.from(
    new Set(visibleMovies.filter((m) => m.is_series && m.series_title).map((m) => m.series_title!))
  );

  const genres = Array.from(
    new Set(visibleMovies.map((m) => m.genre).filter(Boolean))
  ) as string[];

  return (
    <AppShell>
      {heroMovies.length > 0 && (
        <Hero
          movies={heroMovies}
          onInfoClick={(m) => setSelectedMovie(m)}
        />
      )}

      {/* Chips de Filtro Rápido */}
      <div className="flex items-center gap-2 px-4 pt-4 lg:px-8 overflow-x-auto pb-2">
        <button
          onClick={() => setActiveFilter("all")}
          className={`rounded-full px-4 py-1.5 text-xs font-bold transition-all ${
            activeFilter === "all"
              ? "bg-brand text-white shadow"
              : "bg-panel border border-rule text-mute hover:text-ink"
          }`}
        >
          🍿 Tudo
        </button>
        <button
          onClick={() => setActiveFilter("movies")}
          className={`rounded-full px-4 py-1.5 text-xs font-bold transition-all ${
            activeFilter === "movies"
              ? "bg-brand text-white shadow"
              : "bg-panel border border-rule text-mute hover:text-ink"
          }`}
        >
          🎬 Filmes
        </button>
        <button
          onClick={() => setActiveFilter("series")}
          className={`rounded-full px-4 py-1.5 text-xs font-bold transition-all ${
            activeFilter === "series"
              ? "bg-brand text-white shadow"
              : "bg-panel border border-rule text-mute hover:text-ink"
          }`}
        >
          📺 Séries & Animes
        </button>
        {collections.length > 0 && (
          <button
            onClick={() => setActiveFilter("collections")}
            className={`rounded-full px-4 py-1.5 text-xs font-bold transition-all ${
              activeFilter === "collections"
                ? "bg-brand text-white shadow"
                : "bg-panel border border-rule text-mute hover:text-ink"
            }`}
          >
            🏛️ Franquias & Universos
          </button>
        )}
      </div>

      {activeFilter === "all" && (
        <>
          <MovieRow
            title="Em alta no SilvaFlix"
            eyebrow="★"
            movies={trending}
            ranked
            onInfoClick={(m) => setSelectedMovie(m)}
          />

          {continueWatching.length > 0 && (
            <MovieRow
              title="Continue assistindo"
              movies={continueWatching}
              progressByMovieId={progressMap}
              onInfoClick={(m) => setSelectedMovie(m)}
            />
          )}

          {favorites.length > 0 && (
            <MovieRow
              title={`Favoritos de ${activeProfile?.name || "Você"}`}
              eyebrow="❤️"
              movies={favorites}
              onInfoClick={(m) => setSelectedMovie(m)}
            />
          )}

          {/* Coleções / Franquias */}
          {collections.map((col) => (
            <MovieRow
              key={col.name}
              title={`Coleção: ${col.name}`}
              eyebrow="🏛️"
              movies={col.movies}
              onInfoClick={(m) => setSelectedMovie(m)}
            />
          ))}

          {genres.map((genre) => (
            <MovieRow
              key={genre}
              title={genre}
              movies={visibleMovies.filter((m) => m.genre === genre)}
              seeAllHref={`/search?genre=${encodeURIComponent(genre)}`}
              onInfoClick={(m) => setSelectedMovie(m)}
            />
          ))}
        </>
      )}

      {activeFilter === "movies" && (
        <div className="space-y-6 pt-4">
          <MovieRow
            title="Todos os Filmes"
            movies={visibleMovies.filter((m) => !m.is_series)}
            onInfoClick={(m) => setSelectedMovie(m)}
          />
          {genres.map((genre) => (
            <MovieRow
              key={genre}
              title={genre}
              movies={visibleMovies.filter((m) => !m.is_series && m.genre === genre)}
              onInfoClick={(m) => setSelectedMovie(m)}
            />
          ))}
        </div>
      )}

      {activeFilter === "series" && (
        <div className="space-y-6 pt-4">
          {seriesTitles.map((st) => (
            <MovieRow
              key={st}
              title={st}
              eyebrow="📺 Série"
              movies={visibleMovies.filter((m) => m.is_series && m.series_title === st)}
              onInfoClick={(m) => setSelectedMovie(m)}
            />
          ))}
        </div>
      )}

      {activeFilter === "collections" && (
        <div className="space-y-6 pt-4">
          {collections.map((col) => (
            <MovieRow
              key={col.name}
              title={col.name}
              eyebrow="🏛️ Saga"
              movies={col.movies}
              onInfoClick={(m) => setSelectedMovie(m)}
            />
          ))}
        </div>
      )}

      <MovieModal
        movie={selectedMovie}
        onClose={() => setSelectedMovie(null)}
      />
    </AppShell>
  );
}
