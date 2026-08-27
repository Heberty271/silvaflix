"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { api, Movie } from "@/lib/api";
import { AppShell } from "@/components/AppShell";
import { MovieCard } from "@/components/MovieCard";

export default function FilmesPage() {
  return (
    <Suspense fallback={null}>
      <FilmesContent />
    </Suspense>
  );
}

function FilmesContent() {
  const { token } = useAuth();
  const searchParams = useSearchParams();
  const genre = searchParams.get("genre");
  const query = searchParams.get("q");

  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    api
      .listMovies(token)
      .then(setMovies)
      .finally(() => setLoading(false));
  }, [token]);

  const filtered = movies.filter((m) => {
    if (genre && m.genre !== genre) return false;
    if (query) {
      const q = query.toLowerCase();
      if (!m.title.toLowerCase().includes(q) && !(m.cast || "").toLowerCase().includes(q)) {
        return false;
      }
    }
    return true;
  });

  const title = query ? `Resultados para "${query}"` : genre || "Todos os filmes";

  return (
    <AppShell>
      <div className="px-4 py-8 lg:px-8">
        <h1 className="mb-6 text-2xl font-bold">{title}</h1>

        {!loading && filtered.length === 0 && (
          <p className="text-mute">Nenhum título encontrado nessa categoria ainda.</p>
        )}

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filtered.map((m) => (
            <MovieCard key={m.id} movie={m} />
          ))}
        </div>
      </div>
    </AppShell>
  );
}
