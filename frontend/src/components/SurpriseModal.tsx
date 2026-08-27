"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Movie, api } from "@/lib/api";

interface SurpriseModalProps {
  movies: Movie[];
  isOpen: boolean;
  onClose: () => void;
}

export function SurpriseModal({ movies, isOpen, onClose }: SurpriseModalProps) {
  const [spinning, setSpinning] = useState(false);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [flashIndex, setFlashIndex] = useState(0);

  function spin() {
    if (movies.length === 0) return;
    setSpinning(true);
    let count = 0;
    const totalSpins = 20 + Math.floor(Math.random() * 10);
    const interval = setInterval(() => {
      setFlashIndex((prev) => (prev + 1) % movies.length);
      count++;
      if (count >= totalSpins) {
        clearInterval(interval);
        const chosen = movies[Math.floor(Math.random() * movies.length)];
        setSelectedMovie(chosen);
        setSpinning(false);
      }
    }, 80);
  }

  useEffect(() => {
    if (isOpen) {
      setSelectedMovie(null);
      spin();
    }
  }, [isOpen]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const currentDisplayed = spinning ? movies[flashIndex] : selectedMovie;

  const backdropSrc = currentDisplayed?.backdrop_filename
    ? api.backdropUrl(currentDisplayed.id)
    : currentDisplayed?.thumbnail_filename
    ? api.thumbnailUrl(currentDisplayed.id)
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md animate-fade-in">
      <div
        className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-rule bg-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-rule p-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">🎲</span>
            <h2 className="text-base font-black text-ink">Roleta SilvaFlix: Surpreenda-me!</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-panel2 text-mute hover:text-ink"
          >
            ✕
          </button>
        </div>

        {/* Card do Filme Sorteado */}
        <div className="p-6 text-center">
          <div className="relative mx-auto aspect-video w-full overflow-hidden rounded-xl bg-void shadow-2xl">
            {backdropSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={backdropSrc}
                alt={currentDisplayed?.title || ""}
                className={`h-full w-full object-cover transition-transform duration-200 ${
                  spinning ? "scale-110 blur-sm" : "scale-100 blur-0"
                }`}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-panel2 text-2xl font-black text-mute">
                🍿 Sorteando...
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
            <div className="absolute bottom-3 left-4 right-4 text-left">
              <p className="truncate text-lg font-black text-white">
                {currentDisplayed?.title || "Sorteando filme..."}
              </p>
              <p className="text-xs text-white/80">
                {[
                  currentDisplayed?.year,
                  currentDisplayed?.genre,
                  currentDisplayed?.duration_minutes && `${currentDisplayed.duration_minutes} min`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
          </div>

          {!spinning && selectedMovie && (
            <p className="mt-4 line-clamp-3 text-xs leading-relaxed text-mute">
              {selectedMovie.synopsis || "Pronto para maratonar esta recomendação especial!"}
            </p>
          )}

          {/* Ações */}
          <div className="mt-6 flex gap-3">
            <button
              onClick={spin}
              disabled={spinning}
              className="flex-1 rounded-xl border border-rule bg-panel2 py-3 text-xs font-bold text-ink hover:border-brand hover:bg-panel transition-all disabled:opacity-50"
            >
              🎲 Rodar de Novo
            </button>

            {!spinning && selectedMovie && (
              <Link
                href={`/watch/${selectedMovie.id}`}
                onClick={onClose}
                className="flex-1 rounded-xl bg-brand py-3 text-xs font-black text-white shadow-xl hover:bg-brand2 transition-all flex items-center justify-center gap-1.5"
              >
                <span>▶</span> Assistir Agora
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

