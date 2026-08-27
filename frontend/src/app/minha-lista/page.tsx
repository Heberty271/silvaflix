"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { api, Movie } from "@/lib/api";
import { AppShell } from "@/components/AppShell";
import { MovieCard } from "@/components/MovieCard";
import { getMyList } from "@/lib/my-list";

export default function MinhaListaPage() {
  const { token } = useAuth();
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    api
      .listMovies(token)
      .then(setMovies)
      .finally(() => setLoading(false));
  }, [token]);

  const ids = getMyList();
  const filtered = movies.filter((m) => ids.includes(m.id));

  return (
    <AppShell>
      <div className="px-4 py-8 lg:px-8">
        <h1 className="mb-6 text-2xl font-bold">Minha lista</h1>

        {!loading && filtered.length === 0 && (
          <p className="text-mute">
            Você ainda não adicionou nada. Use o botão "＋ Minha lista" na página de um
            filme para guardá-lo aqui.
          </p>
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
