"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { api, Movie } from "@/lib/api";
import { AppShell } from "@/components/AppShell";
import { MovieRow } from "@/components/MovieRow";

export default function ExplorarPage() {
  const { token } = useAuth();
  const [movies, setMovies] = useState<Movie[]>([]);

  useEffect(() => {
    if (!token) return;
    api.listMovies(token).then(setMovies);
  }, [token]);

  const genres = Array.from(new Set(movies.map((m) => m.genre).filter(Boolean))) as string[];

  return (
    <AppShell>
      <div className="px-4 pt-8 lg:px-8">
        <h1 className="text-2xl font-bold">Explorar por gênero</h1>
      </div>
      {genres.length === 0 && (
        <p className="px-4 py-8 text-mute lg:px-8">
          Cadastre filmes com gênero definido para eles aparecerem aqui.
        </p>
      )}
      {genres.map((genre) => (
        <MovieRow
          key={genre}
          title={genre}
          movies={movies.filter((m) => m.genre === genre)}
          seeAllHref={`/filmes?genre=${encodeURIComponent(genre)}`}
        />
      ))}
    </AppShell>
  );
}
