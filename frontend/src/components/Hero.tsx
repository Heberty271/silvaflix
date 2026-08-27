"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { Movie, api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { isInMyList, toggleMyList } from "@/lib/my-list";

interface HeroProps {
  movie?: Movie;
  movies?: Movie[];
  onInfoClick?: (movie: Movie) => void;
}

export function Hero({ movie, movies, onInfoClick }: HeroProps) {
  const { token } = useAuth();
  const heroList = movies && movies.length > 0 ? movies : movie ? [movie] : [];

  const [currentIndex, setCurrentIndex] = useState(0);
  const [inList, setInList] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [trailerModalId, setTrailerModalId] = useState<string | null>(null);
  const [fetchingTrailer, setFetchingTrailer] = useState(false);

  const currentMovie = heroList[currentIndex] || heroList[0];

  // Auto-avanço do Carrossel a cada 7 segundos com Crossfade
  useEffect(() => {
    if (heroList.length <= 1 || isPaused || trailerModalId) return;

    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % heroList.length);
    }, 7000);

    return () => clearInterval(timer);
  }, [heroList.length, isPaused, trailerModalId]);

  useEffect(() => {
    if (currentMovie) {
      setInList(isInMyList(currentMovie.id));
    }
  }, [currentMovie]);

  if (!currentMovie) return null;

  async function handleOpenTrailer() {
    if (!currentMovie || !token) return;
    if (currentMovie.trailer_youtube_id) {
      setTrailerModalId(currentMovie.trailer_youtube_id);
      return;
    }
    setFetchingTrailer(true);
    try {
      const res = await api.getMovieTrailer(currentMovie.id, token);
      if (res.trailer_youtube_id) {
        setTrailerModalId(res.trailer_youtube_id);
      } else {
        alert("Nenhum trailer oficial encontrado para este título.");
      }
    } catch {
      alert("Erro ao buscar trailer oficial.");
    } finally {
      setFetchingTrailer(false);
    }
  }

  return (
    <section
      className="relative h-[70vh] min-h-[480px] w-full overflow-hidden select-none group/hero"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Imagens de Fundo com Transição Crossfade e Efeito Zoom Lento */}
      {heroList.map((m, idx) => {
        const image = m.backdrop_filename
          ? api.backdropUrl(m.id)
          : m.thumbnail_filename
          ? api.thumbnailUrl(m.id)
          : null;
        const isActive = idx === currentIndex;

        return (
          <div
            key={m.id}
            className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
              isActive ? "opacity-100 z-0" : "opacity-0 pointer-events-none -z-10"
            }`}
          >
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={image}
                alt=""
                className={`h-full w-full object-cover transition-transform duration-[7000ms] ease-out ${
                  isActive ? "scale-105" : "scale-100"
                }`}
              />
            ) : (
              <div className="h-full w-full bg-panel2" />
            )}
          </div>
        );
      })}

      {/* Gradientes de Fusão e Sombra Cinematográfica */}
      <div className="absolute inset-0 bg-gradient-to-r from-void via-void/70 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-void via-transparent to-transparent" />

      {/* Conteúdo Textual e Ações */}
      <div className="relative flex h-full max-w-2xl flex-col justify-end gap-3.5 px-4 pb-14 lg:px-8 z-10">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full bg-brand/20 border border-brand/40 px-3 py-0.5 text-xs font-black tracking-wider text-brand2 uppercase">
            ★ Destaque SilvaFlix
          </span>
          {currentMovie.collection_name && (
            <span className="rounded-full bg-panel2/80 border border-rule px-2.5 py-0.5 text-xs font-bold text-mute">
              🏛️ {currentMovie.collection_name}
            </span>
          )}
        </div>

        <h1 className="text-4xl font-black uppercase leading-tight tracking-tight sm:text-6xl text-ink drop-shadow-lg">
          {currentMovie.title}
        </h1>

        <p className="text-xs sm:text-sm font-semibold text-mute">
          {[
            currentMovie.year,
            currentMovie.genre,
            currentMovie.duration_minutes && `${currentMovie.duration_minutes} min`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>

        <p className="line-clamp-3 max-w-xl text-sm leading-relaxed text-ink/90 sm:text-base drop-shadow">
          {currentMovie.synopsis}
        </p>

        {/* Botões de Ação */}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Link
            href={`/watch/${currentMovie.id}`}
            className="flex items-center gap-2 rounded-xl bg-brand px-7 py-3.5 font-black text-white shadow-2xl transition-all hover:scale-105 hover:bg-brand2"
          >
            <span>▶</span> Assistir Agora
          </Link>

          {/* Botão Ver Trailer */}
          <button
            onClick={handleOpenTrailer}
            disabled={fetchingTrailer}
            className="flex items-center gap-2 rounded-xl border border-rule bg-panel/85 px-5 py-3.5 font-bold text-ink backdrop-blur shadow-lg transition-all hover:scale-105 hover:border-brand hover:bg-panel"
          >
            <span>🎬</span>
            <span>{fetchingTrailer ? "Carregando..." : "Ver Trailer"}</span>
          </button>

          {onInfoClick && (
            <button
              onClick={() => onInfoClick(currentMovie)}
              className="flex items-center gap-2 rounded-xl border border-rule bg-black/40 px-5 py-3.5 font-bold text-ink backdrop-blur transition-all hover:border-brand hover:bg-panel"
            >
              ℹ Detalhes
            </button>
          )}

          <button
            onClick={() => setInList(toggleMyList(currentMovie.id))}
            className="flex items-center gap-2 rounded-xl border border-rule bg-black/40 px-5 py-3.5 font-bold text-ink backdrop-blur transition-all hover:border-brand hover:bg-panel"
          >
            {inList ? "✓ Na Lista" : "＋ Minha Lista"}
          </button>
        </div>
      </div>

      {/* Controles e Indicadores do Carrossel */}
      {heroList.length > 1 && (
        <>
          {/* Setas Laterais */}
          <button
            onClick={() =>
              setCurrentIndex((prev) => (prev - 1 + heroList.length) % heroList.length)
            }
            aria-label="Destaque Anterior"
            className="absolute left-4 top-1/2 -translate-y-1/2 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-xl font-bold text-white backdrop-blur opacity-0 group-hover/hero:opacity-100 transition-all hover:bg-brand hover:scale-110"
          >
            ❮
          </button>
          <button
            onClick={() => setCurrentIndex((prev) => (prev + 1) % heroList.length)}
            aria-label="Próximo Destaque"
            className="absolute right-4 top-1/2 -translate-y-1/2 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-xl font-bold text-white backdrop-blur opacity-0 group-hover/hero:opacity-100 transition-all hover:bg-brand hover:scale-110"
          >
            ❯
          </button>

          {/* Barrinhas / Dots de Progresso */}
          <div className="absolute bottom-4 right-6 z-20 flex items-center gap-2">
            {heroList.map((m, idx) => (
              <button
                key={m.id}
                onClick={() => setCurrentIndex(idx)}
                aria-label={`Ir para destaque ${idx + 1}`}
                className={`h-2 rounded-full transition-all duration-300 ${
                  idx === currentIndex ? "w-8 bg-brand" : "w-2.5 bg-white/40 hover:bg-white/70"
                }`}
              />
            ))}
          </div>
        </>
      )}

      {/* Modal Flutuante de Trailer */}
      {trailerModalId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-md animate-fade-in"
          onClick={() => setTrailerModalId(null)}
        >
          <div
            className="relative w-full max-w-4xl overflow-hidden rounded-2xl border border-rule bg-black shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-rule bg-panel px-4 py-3">
              <p className="text-sm font-bold text-ink flex items-center gap-2">
                <span>🎬</span> Trailer Oficial: {currentMovie.title}
              </p>
              <button
                onClick={() => setTrailerModalId(null)}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-panel2 text-mute hover:text-ink"
              >
                ✕
              </button>
            </div>
            <div className="aspect-video w-full">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${trailerModalId}?autoplay=1`}
                title={`Trailer de ${currentMovie.title}`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="h-full w-full border-0"
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
