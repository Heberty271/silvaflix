"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useFloatingPlayer } from "@/lib/floating-player-context";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { setProgress } from "@/lib/watch-progress";

export function FloatingPlayer() {
  const { state, closeFloating, setFloatingPlaying, setFloatingTime } = useFloatingPlayer();
  const { token } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);

  const movie = state.activeMovie;
  const isCurrentWatchPage = movie && pathname === `/watch/${movie.id}`;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !movie) return;

    video.currentTime = state.currentTime;
    if (state.isPlaying) {
      video.play().catch(() => {});
    }

    const onTimeUpdate = () => {
      setFloatingTime(video.currentTime);
      setProgress(movie.id, video.currentTime, video.duration);
    };

    const onPlay = () => setFloatingPlaying(true);
    const onPause = () => setFloatingPlaying(false);

    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);

    return () => {
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
    };
  }, [movie]);

  if (!state.isVisible || !movie || isCurrentWatchPage || !token) {
    return null;
  }

  function handleExpand() {
    if (!movie) return;
    router.push(`/watch/${movie.id}`);
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-72 sm:w-80 overflow-hidden rounded-2xl border border-rule bg-black shadow-2xl animate-fade-in ring-2 ring-brand/50">
      {/* Header do Mini Player */}
      <div className="flex items-center justify-between bg-panel/90 px-3 py-1.5 backdrop-blur">
        <p className="truncate text-xs font-bold text-ink max-w-[70%]">
          {movie.title}
        </p>
        <div className="flex items-center gap-1">
          <button
            onClick={handleExpand}
            title="Expandir para tela cheia"
            className="flex h-6 w-6 items-center justify-center rounded text-xs text-mute hover:bg-panel2 hover:text-ink transition-colors"
          >
            ⤢
          </button>
          <button
            onClick={closeFloating}
            title="Fechar"
            className="flex h-6 w-6 items-center justify-center rounded text-xs text-mute hover:bg-panel2 hover:text-ink transition-colors"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Video */}
      <div className="relative aspect-video w-full bg-black">
        <video
          ref={videoRef}
          src={api.streamUrl(movie.id, token)}
          playsInline
          controls
          className="h-full w-full object-contain"
        />
      </div>
    </div>
  );
}

