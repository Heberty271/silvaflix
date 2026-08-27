"use client";

import { Movie } from "@/lib/api";
import { MovieCard } from "./MovieCard";

export function MovieRow({
  title,
  eyebrow,
  movies,
  ranked,
  progressByMovieId,
  seeAllHref,
  onInfoClick,
}: {
  title: string;
  eyebrow?: string;
  movies: Movie[];
  ranked?: boolean;
  progressByMovieId?: Record<number, number>;
  seeAllHref?: string;
  onInfoClick?: (movie: Movie) => void;
}) {
  if (movies.length === 0) return null;

  return (
    <section className="px-4 py-6 lg:px-8">
      <div className="mb-4 flex items-baseline justify-between">
        <div className="flex items-baseline gap-3">
          {eyebrow && (
            <span className="text-xs uppercase tracking-[0.2em] text-brand">
              {eyebrow}
            </span>
          )}
          <h2 className="text-xl font-bold sm:text-2xl">{title}</h2>
        </div>
        {seeAllHref && (
          <a href={seeAllHref} className="text-sm text-mute hover:text-ink">
            Ver tudo →
          </a>
        )}
      </div>
      <div className="scroll-row flex gap-4 overflow-x-auto pb-4">
        {movies.map((m, i) => (
          <MovieCard
            key={m.id}
            movie={m}
            rank={ranked ? i + 1 : undefined}
            onInfoClick={onInfoClick}
            progressPercent={
              progressByMovieId && m.id in progressByMovieId
                ? progressByMovieId[m.id]
                : undefined
            }
          />
        ))}
      </div>
    </section>
  );
}
