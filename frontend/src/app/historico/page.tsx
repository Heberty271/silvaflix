"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { api, Movie } from "@/lib/api";
import { AppShell } from "@/components/AppShell";
import { MovieCard } from "@/components/MovieCard";
import { listProgress } from "@/lib/watch-progress";

export default function HistoricoPage() {
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

  const entries = listProgress();
  const progressMap: Record<number, number> = {};
  entries.forEach((e) => {
    progressMap[e.movieId] = (e.currentTime / e.duration) * 100;
  });
  const filtered = entries
    .map((e) => movies.find((m) => m.id === e.movieId))
    .filter((m): m is Movie => !!m);

  return (
    <AppShell>
      <div className="px-4 py-8 lg:px-8">
        <h1 className="mb-6 text-2xl font-bold">Histórico</h1>
        <p className="mb-6 text-sm text-mute">
          Guardado neste navegador — se assistir em outro dispositivo, o histórico não
          é compartilhado entre eles.
        </p>

        {!loading && filtered.length === 0 && (
          <p className="text-mute">Você ainda não começou a assistir nada.</p>
        )}

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filtered.map((m) => (
            <MovieCard key={m.id} movie={m} progressPercent={progressMap[m.id]} />
          ))}
        </div>
      </div>
    </AppShell>
  );
}
