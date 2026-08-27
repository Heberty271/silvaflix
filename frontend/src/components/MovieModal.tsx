"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Movie, api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { isInMyList, toggleMyList } from "@/lib/my-list";

interface MovieModalProps {
  movie: Movie | null;
  onClose: () => void;
}

export function MovieModal({ movie, onClose }: MovieModalProps) {
  const { token } = useAuth();
  const [inList, setInList] = useState(false);
  const [showTrailer, setShowTrailer] = useState(false);
  const [trailerId, setTrailerId] = useState<string | null>(null);
  const [fetchingTrailer, setFetchingTrailer] = useState(false);

  useEffect(() => {
    if (movie) {
      setInList(isInMyList(movie.id));
      setShowTrailer(false);
      setTrailerId(movie.trailer_youtube_id || null);
    }
  }, [movie]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!movie) return null;

  async function handleToggleTrailer() {
    if (showTrailer) {
      setShowTrailer(false);
      return;
    }
    if (trailerId) {
      setShowTrailer(true);
      return;
    }
    if (!token) return;
    setFetchingTrailer(true);
    try {
      const res = await api.getMovieTrailer(movie!.id, token);
      if (res.trailer_youtube_id) {
        setTrailerId(res.trailer_youtube_id);
        setShowTrailer(true);
      } else {
        alert("Nenhum trailer oficial encontrado para este título no TMDB.");
      }
    } catch {
      alert("Erro ao buscar trailer oficial.");
    } finally {
      setFetchingTrailer(false);
    }
  }

  const backdropSrc = movie.backdrop_filename
    ? api.backdropUrl(movie.id)
    : movie.thumbnail_filename
    ? api.thumbnailUrl(movie.id)
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md animate-fade-in">
      <div
        className="relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-rule bg-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header / Imagem / Trailer */}
        <div className="relative aspect-video max-h-80 w-full overflow-hidden bg-void">
          {showTrailer && trailerId ? (
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${trailerId}?autoplay=1`}
              title={`Trailer Oficial de ${movie.title}`}
              className="h-full w-full border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : backdropSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={backdropSrc}
              alt={movie.title}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-panel2 text-mute">
              Sem imagem
            </div>
          )}

          {/* Gradiente de Fusão */}
          {!showTrailer && (
            <div className="absolute inset-0 bg-gradient-to-t from-panel via-panel/40 to-transparent" />
          )}

          {/* Botão Fechar */}
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="absolute right-4 top-4 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-black/70 text-sm font-bold text-white shadow-lg backdrop-blur hover:bg-black/90"
          >
            ✕
          </button>

          {/* Ações Rápidas no Banner */}
          {!showTrailer && (
            <div className="absolute bottom-4 left-6 right-6 flex flex-wrap items-center gap-3">
              <Link
                href={`/watch/${movie.id}`}
                className="flex items-center gap-2 rounded-xl bg-brand px-6 py-2.5 text-sm font-black text-white shadow-xl transition-transform hover:scale-105 hover:bg-brand2"
              >
                <span>▶</span> Assistir Agora
              </Link>

              <button
                onClick={handleToggleTrailer}
                disabled={fetchingTrailer}
                className="flex items-center gap-2 rounded-xl bg-white/20 border border-white/30 px-4 py-2.5 text-sm font-bold text-white backdrop-blur hover:bg-white/30 transition-all shadow"
              >
                <span>🎬</span>
                <span>{fetchingTrailer ? "Buscando..." : "Ver Trailer Oficial"}</span>
              </button>

              <button
                onClick={() => setInList(toggleMyList(movie.id))}
                className="flex items-center gap-2 rounded-xl border border-rule bg-panel/80 px-4 py-2.5 text-sm font-bold text-ink backdrop-blur transition-all hover:border-brand hover:bg-panel"
              >
                {inList ? "✓ Na Lista" : "＋ Minha Lista"}
              </button>
            </div>
          )}
        </div>

        {/* Informações Detalhadas */}
        <div className="p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-2xl font-black text-ink sm:text-3xl">
              {movie.title}
            </h2>
            {movie.collection_name && (
              <span className="rounded-full bg-brand/15 border border-brand/30 px-3 py-1 text-xs font-bold text-brand2">
                🏛️ {movie.collection_name}
              </span>
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs font-semibold text-mute sm:text-sm">
            {movie.year && (
              <span className="rounded bg-white/10 px-2 py-0.5 text-ink">
                {movie.year}
              </span>
            )}
            {movie.genre && (
              <span className="rounded bg-brand/20 px-2 py-0.5 text-brand2">
                {movie.genre}
              </span>
            )}
            {movie.duration_minutes && (
              <span>{movie.duration_minutes} min</span>
            )}
            {movie.is_featured && (
              <span className="text-amber-400 font-bold">★ Destaque</span>
            )}
          </div>

          <p className="mt-4 text-sm leading-relaxed text-ink/90 sm:text-base">
            {movie.synopsis || "Nenhuma sinopse cadastrada para este filme."}
          </p>

          <div className="mt-6 grid gap-2 border-t border-rule pt-4 text-xs sm:text-sm">
            {movie.director && (
              <p>
                <span className="font-bold text-mute">Direção:</span>{" "}
                <span className="text-ink">{movie.director}</span>
              </p>
            )}
            {movie.cast && (
              <p>
                <span className="font-bold text-mute">Elenco:</span>{" "}
                <span className="text-ink">{movie.cast}</span>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
