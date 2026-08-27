"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useProfile } from "@/lib/profile-context";
import { api, Movie, ApiError, AudioTrack, Review } from "@/lib/api";
import { AppShell } from "@/components/AppShell";
import { VideoPlayer } from "@/components/VideoPlayer";
import { toggleMyList, isInMyList } from "@/lib/my-list";
import { getProfileRating, setProfileRating, RatingType } from "@/lib/ratings";

export default function WatchPage() {
  const { id } = useParams<{ id: string }>();
  const { token, user } = useAuth();
  const { activeProfile } = useProfile();
  const router = useRouter();

  const [movie, setMovie] = useState<Movie | null>(null);
  const [related, setRelated] = useState<Movie[]>([]);
  const [seriesEpisodes, setSeriesEpisodes] = useState<Movie[]>([]);
  const [collectionMovies, setCollectionMovies] = useState<Movie[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
  const [currentTrack, setCurrentTrack] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"info" | "episodes" | "collection" | "reviews" | "related">("info");
  const [inList, setInList] = useState(false);
  const [userRating, setUserRating] = useState<RatingType | null>(null);
  const [creatingParty, setCreatingParty] = useState(false);
  const [trailerModalId, setTrailerModalId] = useState<string | null>(null);
  const [fetchingTrailer, setFetchingTrailer] = useState(false);

  // Formulário de Resenha
  const [reviewStars, setReviewStars] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewSpoiler, setReviewSpoiler] = useState(false);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [revealedSpoilers, setRevealedSpoilers] = useState<Record<number, boolean>>({});

  const userName = activeProfile?.name || user?.name || "Família";

  function refreshReviews(movieId: number) {
    if (!token) return;
    api.listReviews(movieId, token).then(setReviews).catch(() => {});
  }

  useEffect(() => {
    if (!token || !id) return;
    const movieId = Number(id);

    setUserRating(getProfileRating(movieId, activeProfile?.id));
    refreshReviews(movieId);

    api
      .getMovie(movieId, token)
      .then((m) => {
        setMovie(m);
        setInList(isInMyList(m.id));

        // Carrega faixas de áudio
        api.getAudioTracks(m.id, token).then(setAudioTracks).catch(() => {});

        // Carrega todos os filmes para relacionados, coleções e episódios
        return api.listMovies(token).then((all) => {
          // 1. Episódios de Séries
          if (m.is_series && m.series_title) {
            const episodes = all
              .filter((x) => x.is_series && x.series_title === m.series_title)
              .sort((a, b) => {
                if ((a.season_number || 1) !== (b.season_number || 1)) {
                  return (a.season_number || 1) - (b.season_number || 1);
                }
                return (a.episode_number || 1) - (b.episode_number || 1);
              });
            setSeriesEpisodes(episodes);
            setTab("episodes");
          }

          // 2. Filmes da mesma Coleção / Franquia
          if (m.collection_name) {
            const col = all
              .filter((x) => x.collection_name === m.collection_name)
              .sort((a, b) => (a.year || 0) - (b.year || 0));
            setCollectionMovies(col);
            if (!m.is_series) {
              setTab("collection");
            }
          }

          // 3. Relacionados por Gênero
          setRelated(
            all.filter((x) => x.id !== m.id && x.genre === m.genre).slice(0, 6)
          );
        });
      })
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : "Erro ao carregar filme")
      );
  }, [token, id, activeProfile?.id]);

  // Identifica o próximo episódio da série
  let nextEpisode = null;
  if (movie && movie.is_series && seriesEpisodes.length > 0) {
    const currentIndex = seriesEpisodes.findIndex((e) => e.id === movie.id);
    if (currentIndex >= 0 && currentIndex < seriesEpisodes.length - 1) {
      const next = seriesEpisodes[currentIndex + 1];
      nextEpisode = {
        id: next.id,
        title: next.title,
        episodeNumber: next.episode_number || currentIndex + 2,
        seasonNumber: next.season_number || 1,
      };
    }
  }

  function handleRate(type: RatingType) {
    if (!movie) return;
    const newRating = userRating === type ? null : type;
    setUserRating(newRating);
    setProfileRating(movie.id, newRating, activeProfile?.id);
  }

  async function handleAddReview(e: React.FormEvent) {
    e.preventDefault();
    if (!movie || !token || !reviewComment.trim()) return;
    setSubmittingReview(true);
    try {
      await api.createReview(
        movie.id,
        {
          rating: reviewStars,
          comment: reviewComment.trim(),
          has_spoiler: reviewSpoiler,
          profile_name: userName,
        },
        token
      );
      setReviewComment("");
      setReviewSpoiler(false);
      refreshReviews(movie.id);
    } catch {
      alert("Não foi possível enviar sua resenha.");
    } finally {
      setSubmittingReview(false);
    }
  }

  async function handleDeleteReview(reviewId: number) {
    if (!movie || !token) return;
    if (!confirm("Excluir esta resenha?")) return;
    try {
      await api.deleteReview(movie.id, reviewId, token);
      refreshReviews(movie.id);
    } catch {
      alert("Erro ao excluir resenha.");
    }
  }

  async function handleStartWatchParty() {
    if (!movie) return;
    setCreatingParty(true);
    try {
      const room = await api.createWatchParty(movie.id, userName);
      router.push(`/party/${room.room_id}`);
    } catch {
      alert("Não foi possível criar a sala de Watch Party.");
    } finally {
      setCreatingParty(false);
    }
  }

  async function handleOpenTrailer() {
    if (!movie || !token) return;
    if (movie.trailer_youtube_id) {
      setTrailerModalId(movie.trailer_youtube_id);
      return;
    }
    setFetchingTrailer(true);
    try {
      const res = await api.getMovieTrailer(movie.id, token);
      if (res.trailer_youtube_id) {
        setTrailerModalId(res.trailer_youtube_id);
      } else {
        alert("Nenhum trailer oficial encontrado no TMDB.");
      }
    } catch {
      alert("Erro ao buscar trailer oficial.");
    } finally {
      setFetchingTrailer(false);
    }
  }

  return (
    <AppShell showSearch={false}>
      <div className="px-4 py-6 lg:px-8">
        {error && (
          <p className="rounded-xl border border-brand bg-brand/10 p-4 text-brand2 mb-6">
            {error}
          </p>
        )}

        {movie && (
          <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
            <div>
              <div className="mb-4 flex items-center justify-between">
                <Link
                  href="/"
                  className="inline-flex items-center gap-2 rounded-lg border border-rule bg-panel px-3 py-1.5 text-xs font-bold text-mute hover:border-brand hover:text-ink transition-all"
                >
                  ← Voltar ao Início
                </Link>

                <button
                  onClick={handleStartWatchParty}
                  disabled={creatingParty}
                  className="flex items-center gap-1.5 rounded-lg bg-brand/20 border border-brand/40 px-3.5 py-1.5 text-xs font-black text-brand2 hover:bg-brand hover:text-white transition-all shadow"
                >
                  <span>🍿</span>
                  <span>{creatingParty ? "Criando Sala..." : "Assistir Juntos (Watch Party)"}</span>
                </button>
              </div>

              {/* Player com Dual Áudio, Skip Intro, Equalizador e Autoplay */}
              <VideoPlayer
                src={api.streamUrl(movie.id, token, currentTrack)}
                title={movie.title}
                movieId={movie.id}
                movie={movie}
                subtitleUrl={api.subtitleUrl(movie.id)}
                audioTracks={audioTracks}
                currentAudioTrack={currentTrack}
                onAudioTrackChange={setCurrentTrack}
                nextEpisode={nextEpisode}
              />

              <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-2xl font-bold sm:text-3xl">{movie.title}</h1>
                    {movie.collection_name && (
                      <span className="rounded-full bg-brand/15 border border-brand/30 px-3 py-0.5 text-xs font-bold text-brand2">
                        🏛️ {movie.collection_name}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-mute">
                    {[
                      movie.year,
                      movie.genre,
                      movie.duration_minutes && `${movie.duration_minutes} min`,
                      movie.is_series &&
                        `T${movie.season_number || 1} E${movie.episode_number || 1}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>

                {/* Botões de Ação e Avaliações Familiares */}
                <div className="flex flex-wrap items-center gap-2">
                  {/* Reações / Avaliações Rápidas */}
                  <div className="flex items-center rounded-lg border border-rule bg-panel p-1">
                    <button
                      onClick={() => handleRate("loved")}
                      title="Amei ❤️"
                      className={`rounded px-2.5 py-1 text-sm transition-transform hover:scale-110 ${
                        userRating === "loved" ? "bg-rose-500/20 text-rose-400 font-bold" : "text-mute hover:text-ink"
                      }`}
                    >
                      ❤️
                    </button>
                    <button
                      onClick={() => handleRate("liked")}
                      title="Gostei 👍"
                      className={`rounded px-2.5 py-1 text-sm transition-transform hover:scale-110 ${
                        userRating === "liked" ? "bg-emerald-500/20 text-emerald-400 font-bold" : "text-mute hover:text-ink"
                      }`}
                    >
                      👍
                    </button>
                    <button
                      onClick={() => handleRate("disliked")}
                      title="Não Gostei 👎"
                      className={`rounded px-2.5 py-1 text-sm transition-transform hover:scale-110 ${
                        userRating === "disliked" ? "bg-brand/20 text-brand font-bold" : "text-mute hover:text-ink"
                      }`}
                    >
                      👎
                    </button>
                  </div>

                  <button
                    onClick={() => setInList(toggleMyList(movie.id))}
                    className="rounded-lg border border-rule px-4 py-2 text-xs font-semibold hover:border-brand transition-all"
                  >
                    {inList ? "✓ Na lista" : "＋ Minha lista"}
                  </button>
                  <button
                    onClick={handleOpenTrailer}
                    disabled={fetchingTrailer}
                    className="rounded-lg border border-rule bg-panel px-4 py-2 text-xs font-semibold hover:border-brand transition-all flex items-center gap-1.5"
                  >
                    <span>🎬</span>
                    <span>{fetchingTrailer ? "Buscando..." : "Ver Trailer"}</span>
                  </button>
                  <a
                    href={api.streamUrl(movie.id, token)}
                    download
                    className="rounded-lg border border-rule px-4 py-2 text-xs font-semibold hover:border-brand transition-all"
                  >
                    ⬇ Baixar
                  </a>
                </div>
              </div>

              {/* Abas */}
              <div className="mt-6 border-b border-rule">
                <div className="flex gap-6 text-sm overflow-x-auto">
                  {movie.is_series && (
                    <button
                      onClick={() => setTab("episodes")}
                      className={`border-b-2 pb-3 font-bold whitespace-nowrap ${
                        tab === "episodes"
                          ? "border-brand text-ink"
                          : "border-transparent text-mute"
                      }`}
                    >
                      Episódios ({seriesEpisodes.length})
                    </button>
                  )}
                  {collectionMovies.length > 1 && (
                    <button
                      onClick={() => setTab("collection")}
                      className={`border-b-2 pb-3 font-bold whitespace-nowrap ${
                        tab === "collection"
                          ? "border-brand text-ink"
                          : "border-transparent text-mute"
                      }`}
                    >
                      🏛️ Coleção ({collectionMovies.length})
                    </button>
                  )}
                  <button
                    onClick={() => setTab("reviews")}
                    className={`border-b-2 pb-3 font-bold whitespace-nowrap ${
                      tab === "reviews"
                        ? "border-brand text-ink"
                        : "border-transparent text-mute"
                    }`}
                  >
                    ⭐ Resenhas ({reviews.length})
                  </button>
                  <button
                    onClick={() => setTab("info")}
                    className={`border-b-2 pb-3 font-bold whitespace-nowrap ${
                      tab === "info"
                        ? "border-brand text-ink"
                        : "border-transparent text-mute"
                    }`}
                  >
                    Informações
                  </button>
                  <button
                    onClick={() => setTab("related")}
                    className={`border-b-2 pb-3 font-bold whitespace-nowrap ${
                      tab === "related"
                        ? "border-brand text-ink"
                        : "border-transparent text-mute"
                    }`}
                  >
                    Relacionados
                  </button>
                </div>
              </div>

              {/* Aba Episódios da Série */}
              {tab === "episodes" && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {seriesEpisodes.map((ep) => {
                    const isCurrent = ep.id === movie.id;
                    return (
                      <Link
                        key={ep.id}
                        href={`/watch/${ep.id}`}
                        className={`flex gap-3 rounded-xl border p-3 transition-all ${
                          isCurrent
                            ? "border-brand bg-brand/10 ring-2 ring-brand/40"
                            : "border-rule bg-panel hover:border-brand/60"
                        }`}
                      >
                        <div className="flex h-16 w-24 flex-shrink-0 items-center justify-center rounded-lg bg-panel2 text-xs font-black text-brand2">
                          {isCurrent ? "▶ Tocando" : `E${ep.episode_number || "?"}`}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-ink">
                            {ep.title}
                          </p>
                          <p className="text-xs text-mute mt-1">
                            {ep.duration_minutes ? `${ep.duration_minutes} min` : "Episódio"}
                          </p>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}

              {/* Aba Coleção / Sequência da Franquia */}
              {tab === "collection" && (
                <div className="mt-4 space-y-3">
                  <p className="text-xs font-semibold text-mute">
                    Ordem cronológica da <strong>{movie.collection_name}</strong>:
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {collectionMovies.map((colMovie, idx) => {
                      const isCurrent = colMovie.id === movie.id;
                      return (
                        <Link
                          key={colMovie.id}
                          href={`/watch/${colMovie.id}`}
                          className={`flex gap-3 rounded-xl border p-3 transition-all ${
                            isCurrent
                              ? "border-brand bg-brand/10 ring-2 ring-brand/40"
                              : "border-rule bg-panel hover:border-brand/60"
                          }`}
                        >
                          <div className="flex h-16 w-24 flex-shrink-0 items-center justify-center rounded-lg bg-panel2 text-xs font-black text-brand2">
                            {isCurrent ? "▶ Tocando" : `#${idx + 1}`}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold text-ink">
                              {colMovie.title}
                            </p>
                            <p className="text-xs text-mute mt-1">
                              {colMovie.year || "Filme"} · {colMovie.duration_minutes ? `${colMovie.duration_minutes} min` : ""}
                            </p>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Aba Resenhas Familiares */}
              {tab === "reviews" && (
                <div className="mt-4 space-y-6 max-w-2xl">
                  {/* Formulário para Escrever Resenha */}
                  <form onSubmit={handleAddReview} className="rounded-xl border border-rule bg-panel p-4 space-y-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-mute">
                      Deixar sua Resenha ({userName})
                    </p>

                    {/* Estrelas */}
                    <div className="flex items-center gap-1.5">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          type="button"
                          key={star}
                          onClick={() => setReviewStars(star)}
                          className={`text-xl transition-transform hover:scale-125 ${
                            star <= reviewStars ? "text-amber-400" : "text-mute/40"
                          }`}
                        >
                          ★
                        </button>
                      ))}
                      <span className="text-xs font-bold text-ink ml-2">
                        {reviewStars} de 5 estrelas
                      </span>
                    </div>

                    <textarea
                      required
                      value={reviewComment}
                      onChange={(e) => setReviewComment(e.target.value)}
                      placeholder="O que você achou deste filme? Vale a pena assistir?"
                      className="input min-h-[80px] text-xs"
                    />

                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <label className="flex items-center gap-2 text-xs text-mute cursor-pointer">
                        <input
                          type="checkbox"
                          checked={reviewSpoiler}
                          onChange={(e) => setReviewSpoiler(e.target.checked)}
                          className="rounded accent-brand cursor-pointer"
                        />
                        <span>⚠️ Contém Spoiler</span>
                      </label>

                      <button
                        type="submit"
                        disabled={submittingReview || !reviewComment.trim()}
                        className="rounded-lg bg-brand px-5 py-2 text-xs font-bold text-white shadow hover:bg-brand2 transition-all disabled:opacity-50"
                      >
                        {submittingReview ? "Enviando..." : "Publicar Resenha"}
                      </button>
                    </div>
                  </form>

                  {/* Lista de Resenhas */}
                  <div className="space-y-3">
                    {reviews.length === 0 ? (
                      <p className="text-xs text-mute py-4 text-center">
                        Nenhum familiar deixou uma resenha ainda. Seja o primeiro a opinar!
                      </p>
                    ) : (
                      reviews.map((rev) => {
                        const isAuthor = rev.user_id === user?.id || user?.role === "admin";
                        const isRevealed = revealedSpoilers[rev.id];

                        return (
                          <div key={rev.id} className="rounded-xl border border-rule bg-panel p-4 space-y-2">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-xs font-bold text-ink flex items-center gap-2">
                                  <span>{rev.profile_name || rev.user_name}</span>
                                  <span className="text-amber-400">
                                    {"★".repeat(rev.rating)}{"☆".repeat(5 - rev.rating)}
                                  </span>
                                </p>
                                <p className="text-[10px] text-mute">
                                  {new Date(rev.created_at).toLocaleDateString("pt-BR")}
                                </p>
                              </div>

                              {isAuthor && (
                                <button
                                  onClick={() => handleDeleteReview(rev.id)}
                                  className="text-xs text-mute hover:text-brand transition-colors"
                                >
                                  ✕ Excluir
                                </button>
                              )}
                            </div>

                            {rev.has_spoiler && !isRevealed ? (
                              <div
                                onClick={() =>
                                  setRevealedSpoilers((prev) => ({ ...prev, [rev.id]: true }))
                                }
                                className="cursor-pointer rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-center text-xs font-bold text-amber-300 hover:bg-amber-500/20 transition-all"
                              >
                                ⚠️ Esta resenha contém Spoilers! Clique aqui para ler.
                              </div>
                            ) : (
                              <p className="text-xs text-ink/90 leading-relaxed whitespace-pre-wrap">
                                {rev.comment}
                              </p>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* Aba Informações */}
              {tab === "info" && (
                <div className="mt-4 max-w-2xl space-y-3 text-sm">
                  <p className="text-ink/90">{movie.synopsis}</p>
                  {movie.director && (
                    <p>
                      <span className="text-mute font-semibold">Direção: </span>
                      {movie.director}
                    </p>
                  )}
                  {movie.cast && (
                    <p>
                      <span className="text-mute font-semibold">Elenco: </span>
                      {movie.cast}
                    </p>
                  )}
                </div>
              )}

              {/* Aba Relacionados */}
              {tab === "related" && (
                <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
                  {related.length === 0 && (
                    <p className="col-span-full text-sm text-mute">
                      Nenhum outro título do mesmo gênero cadastrado ainda.
                    </p>
                  )}
                  {related.map((m) => (
                    <Link
                      key={m.id}
                      href={`/watch/${m.id}`}
                      className="overflow-hidden rounded-xl border border-rule bg-panel hover:border-brand transition-all hover:scale-105"
                    >
                      <div className="aspect-video bg-panel2">
                        {m.backdrop_filename || m.thumbnail_filename ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={
                              m.backdrop_filename
                                ? api.backdropUrl(m.id)
                                : api.thumbnailUrl(m.id)
                            }
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : null}
                      </div>
                      <p className="truncate p-2.5 text-xs font-bold">{m.title}</p>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Sidebar Relacionados */}
            <aside>
              <h2 className="mb-3 text-sm font-semibold text-mute">Talvez você goste</h2>
              <div className="space-y-3">
                {related.slice(0, 5).map((m) => (
                  <Link
                    key={m.id}
                    href={`/watch/${m.id}`}
                    className="flex gap-3 rounded-lg p-1.5 hover:bg-panel2 transition-colors"
                  >
                    <div className="h-16 w-28 flex-shrink-0 overflow-hidden rounded-lg bg-panel2">
                      {m.backdrop_filename || m.thumbnail_filename ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={
                            m.backdrop_filename
                              ? api.backdropUrl(m.id)
                              : api.thumbnailUrl(m.id)
                          }
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : null}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{m.title}</p>
                      <p className="text-xs text-mute">{m.year}</p>
                    </div>
                  </Link>
                ))}
                {related.length === 0 && (
                  <p className="text-sm text-mute">Nada parecido cadastrado ainda.</p>
                )}
              </div>
            </aside>
          </div>
        )}

        {/* Modal de Trailer */}
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
                  <span>🎬</span> Trailer Oficial: {movie?.title}
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
                  title={`Trailer de ${movie?.title}`}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="h-full w-full border-0"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
