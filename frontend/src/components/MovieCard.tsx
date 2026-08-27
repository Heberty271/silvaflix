"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Movie, api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { isInMyList, toggleMyList } from "@/lib/my-list";

export function MovieCard({
  movie,
  rank,
  progressPercent,
  onInfoClick,
}: {
  movie: Movie;
  rank?: number;
  progressPercent?: number;
  onInfoClick?: (movie: Movie) => void;
}) {
  const { token } = useAuth();
  const [isHovered, setIsHovered] = useState(false);
  const [showTrailer, setShowTrailer] = useState(false);
  const [trailerId, setTrailerId] = useState<string | null>(movie.trailer_youtube_id || null);
  const [inList, setInList] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setInList(isInMyList(movie.id));
  }, [movie.id]);

  const handleMouseEnter = () => {
    setIsHovered(true);
    hoverTimer.current = setTimeout(async () => {
      setShowTrailer(true);
      if (!trailerId && token) {
        try {
          const res = await api.getMovieTrailer(movie.id, token);
          if (res.trailer_youtube_id) {
            setTrailerId(res.trailer_youtube_id);
          }
        } catch {
          // Ignore
        }
      }
    }, 600);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    setShowTrailer(false);
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
    }
  };

  const image = movie.backdrop_filename
    ? api.backdropUrl(movie.id)
    : movie.thumbnail_filename
    ? api.thumbnailUrl(movie.id)
    : null;

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`card-hover group relative flex-shrink-0 ${
        rank ? "w-64 pl-8 sm:w-72" : "w-56 sm:w-64"
      }`}
    >
      {rank && (
        <span
          className="pointer-events-none absolute -left-1 bottom-0 z-0 select-none font-sans text-8xl font-black leading-none text-panel2"
          style={{ WebkitTextStroke: "2px var(--color-rule)" }}
        >
          {rank}
        </span>
      )}

      <div
        className={`relative z-10 overflow-hidden rounded-xl border border-rule bg-panel shadow-card transition-all duration-300 ${
          isHovered ? "border-brand shadow-2xl scale-[1.03]" : ""
        }`}
      >
        <Link href={`/watch/${movie.id}`} className="block relative aspect-video bg-panel2 overflow-hidden">
          {showTrailer && trailerId ? (
            <div className="absolute inset-0 pointer-events-none">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${trailerId}?autoplay=1&mute=1&controls=0&modestbranding=1&loop=1&playlist=${trailerId}`}
                title={`Prévia de ${movie.title}`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                className="h-full w-full border-0 scale-125 object-cover"
              />
            </div>
          ) : image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image}
              alt={`Capa de ${movie.title}`}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full items-center justify-center px-3 text-center text-sm text-mute">
              {movie.title}
            </div>
          )}

          {/* Badge de Coleção ou Privado */}
          {movie.collection_name && (
            <span className="absolute left-2 top-2 rounded-full bg-black/75 border border-white/20 px-2 py-0.5 text-[9px] font-bold text-white backdrop-blur">
              🏛️ {movie.collection_name}
            </span>
          )}

          {movie.is_private && (
            <span className="absolute right-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink">
              Privado
            </span>
          )}

          {/* Barra de Progresso */}
          {typeof progressPercent === "number" && (
            <div className="absolute inset-x-0 bottom-0 h-1.5 bg-black/60">
              <div
                className="h-full bg-brand"
                style={{ width: `${Math.min(100, Math.max(2, progressPercent))}%` }}
              />
            </div>
          )}
        </Link>

        {/* Informações e Botões Rápidos */}
        <div className="p-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="truncate text-xs sm:text-sm font-bold text-ink">{movie.title}</h3>
            {movie.is_series && (
              <span className="rounded bg-brand/20 px-1.5 py-0.2 text-[9px] font-black text-brand2">
                SÉRIE
              </span>
            )}
          </div>
          <p className="truncate text-[11px] text-mute mt-0.5">
            {[movie.year, movie.genre?.split(",")[0]].filter(Boolean).join(" · ") || " "}
          </p>

          {/* Ações Rápidas no Hover */}
          {isHovered && (
            <div className="mt-2.5 flex items-center justify-between gap-1.5 pt-2 border-t border-rule/50 animate-fade-in">
              <Link
                href={`/watch/${movie.id}`}
                className="flex-1 rounded-lg bg-brand py-1 text-center text-xs font-black text-white hover:bg-brand2 transition-colors"
              >
                ▶ Play
              </Link>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  setInList(toggleMyList(movie.id));
                }}
                title={inList ? "Remover da Lista" : "Adicionar à Lista"}
                className="rounded-lg border border-rule bg-panel2 p-1 text-xs text-ink hover:border-brand transition-colors"
              >
                {inList ? "✓" : "＋"}
              </button>
              {onInfoClick && (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    onInfoClick(movie);
                  }}
                  title="Mais Informações"
                  className="rounded-lg border border-rule bg-panel2 p-1 text-xs text-ink hover:border-brand transition-colors"
                >
                  ℹ
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
