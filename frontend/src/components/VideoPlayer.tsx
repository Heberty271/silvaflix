"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getProgress, setProgress as saveProgress } from "@/lib/watch-progress";
import { Movie, AudioTrack } from "@/lib/api";
import { useFloatingPlayer } from "@/lib/floating-player-context";

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export function VideoPlayer({
  src,
  title,
  movieId,
  movie,
  subtitleUrl,
  audioTracks = [],
  currentAudioTrack = 0,
  onAudioTrackChange,
  nextEpisode,
}: {
  src: string;
  title: string;
  movieId: number;
  movie?: Movie;
  subtitleUrl?: string;
  audioTracks?: AudioTrack[];
  currentAudioTrack?: number;
  onAudioTrackChange?: (trackIndex: number) => void;
  nextEpisode?: {
    id: number;
    title: string;
    episodeNumber: number;
    seasonNumber?: number;
  } | null;
}) {
  const router = useRouter();
  const { startFloating, closeFloating } = useFloatingPlayer();
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedAt = useRef(0);
  const touchTimer = useRef<{ time: number; x: number } | null>(null);
  const nextEpisodeTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const sleepIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Áudio Web API para Modo Noturno e Equalizador de Som
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const bassFilterRef = useRef<BiquadFilterNode | null>(null);
  const midFilterRef = useRef<BiquadFilterNode | null>(null);
  const trebleFilterRef = useRef<BiquadFilterNode | null>(null);
  const compressorRef = useRef<DynamicsCompressorNode | null>(null);

  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [buffered, setBuffered] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showAudioMenu, setShowAudioMenu] = useState(false);
  const [showSleepMenu, setShowSleepMenu] = useState(false);
  const [showCalibrationMenu, setShowCalibrationMenu] = useState(false);
  const [showEqMenu, setShowEqMenu] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pipSupported, setPipSupported] = useState(false);
  const [resumeBanner, setResumeBanner] = useState<number | null>(null);

  // Sleep Timer
  const [sleepRemaining, setSleepRemaining] = useState<number | null>(null);
  const [sleepLabel, setSleepLabel] = useState<string | null>(null);
  const [sleepToast, setSleepToast] = useState(false);

  // Calibração de Vídeo (Equalizador de Imagem)
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);

  // Equalizador de Áudio (Ganhos em dB)
  const [bassGain, setBassGain] = useState(0);
  const [midGain, setMidGain] = useState(0);
  const [trebleGain, setTrebleGain] = useState(0);
  const [audioPreset, setAudioPreset] = useState<string>("Padrão");

  // Novos Recursos Top
  const [ambilightEnabled, setAmbilightEnabled] = useState(true);
  const [nightMode, setNightMode] = useState(false);
  const [screenLocked, setScreenLocked] = useState(false);
  const [rippleAction, setRippleAction] = useState<"forward" | "backward" | null>(null);

  // Legendas
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(false);

  // Hover Scrubbing
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverPosition, setHoverPosition] = useState<number>(0);

  // Autoplay Séries
  const [nextCountdown, setNextCountdown] = useState<number | null>(null);

  // --- Inicialização Web Audio API & EQ Chain ---
  const initAudioNodes = useCallback(() => {
    const video = videoRef.current;
    if (!video || audioCtxRef.current) return;

    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioContextClass();
      const source = ctx.createMediaElementSource(video);

      const bass = ctx.createBiquadFilter();
      bass.type = "lowshelf";
      bass.frequency.value = 120;
      bass.gain.value = bassGain;

      const mid = ctx.createBiquadFilter();
      mid.type = "peaking";
      mid.frequency.value = 1500;
      mid.gain.value = midGain;

      const treble = ctx.createBiquadFilter();
      treble.type = "highshelf";
      treble.frequency.value = 7000;
      treble.gain.value = trebleGain;

      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-24, ctx.currentTime);
      compressor.knee.setValueAtTime(30, ctx.currentTime);
      compressor.ratio.setValueAtTime(12, ctx.currentTime);
      compressor.attack.setValueAtTime(0.003, ctx.currentTime);
      compressor.release.setValueAtTime(0.25, ctx.currentTime);

      // Cadeia: source -> bass -> mid -> treble -> destination
      source.connect(bass);
      bass.connect(mid);
      mid.connect(treble);
      treble.connect(ctx.destination);

      audioCtxRef.current = ctx;
      sourceNodeRef.current = source;
      bassFilterRef.current = bass;
      midFilterRef.current = mid;
      trebleFilterRef.current = treble;
      compressorRef.current = compressor;
    } catch {
      // Fallback
    }
  }, [bassGain, midGain, trebleGain]);

  function applyAudioEQ(b: number, m: number, t: number, presetName: string) {
    initAudioNodes();
    setBassGain(b);
    setMidGain(m);
    setTrebleGain(t);
    setAudioPreset(presetName);

    if (bassFilterRef.current && audioCtxRef.current) {
      bassFilterRef.current.gain.setValueAtTime(b, audioCtxRef.current.currentTime);
    }
    if (midFilterRef.current && audioCtxRef.current) {
      midFilterRef.current.gain.setValueAtTime(m, audioCtxRef.current.currentTime);
    }
    if (trebleFilterRef.current && audioCtxRef.current) {
      trebleFilterRef.current.gain.setValueAtTime(t, audioCtxRef.current.currentTime);
    }
    if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume();
    }
  }

  // --- Ambilight Glow em Tempo Real ---
  useEffect(() => {
    if (!ambilightEnabled) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    let animId: number;

    const updateGlow = () => {
      if (video && !video.paused && !video.ended && ctx) {
        try {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        } catch {
          // Ignore
        }
      }
      animId = requestAnimationFrame(updateGlow);
    };

    animId = requestAnimationFrame(updateGlow);
    return () => cancelAnimationFrame(animId);
  }, [ambilightEnabled, playing]);

  // --- Sleep Timer Logic com Fade Out ---
  useEffect(() => {
    if (sleepRemaining === null) {
      if (sleepIntervalRef.current) clearInterval(sleepIntervalRef.current);
      return;
    }

    if (sleepIntervalRef.current) clearInterval(sleepIntervalRef.current);
    sleepIntervalRef.current = setInterval(() => {
      setSleepRemaining((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          clearInterval(sleepIntervalRef.current!);
          if (videoRef.current) {
            videoRef.current.pause();
          }
          setSleepToast(true);
          setTimeout(() => setSleepToast(false), 5000);
          return null;
        }

        // Fade Out nos últimos 10s
        if (prev <= 10 && videoRef.current) {
          videoRef.current.volume = Math.max(0, videoRef.current.volume - 0.1);
        }

        return prev - 1;
      });
    }, 1000);

    return () => {
      if (sleepIntervalRef.current) clearInterval(sleepIntervalRef.current);
    };
  }, [sleepRemaining]);

  function setSleepTimer(minutes: number | "end" | null) {
    setShowSleepMenu(false);
    if (minutes === null) {
      setSleepRemaining(null);
      setSleepLabel(null);
      return;
    }
    if (minutes === "end") {
      const remainingSecs = Math.max(10, Math.floor(duration - current));
      setSleepRemaining(remainingSecs);
      setSleepLabel("Fim do vídeo");
    } else {
      setSleepRemaining(minutes * 60);
      setSleepLabel(`${minutes} min`);
    }
  }

  // Presets de Imagem
  function applyPreset(b: number, c: number, s: number) {
    setBrightness(b);
    setContrast(c);
    setSaturation(s);
  }

  // --- Áudio Web API: Modo Noturno ---
  const toggleNightMode = useCallback(() => {
    initAudioNodes();
    setNightMode((prev) => {
      const next = !prev;
      if (next) {
        applyAudioEQ(-2, 6, 1, "Voz Limpa (Noturno)");
      } else {
        applyAudioEQ(0, 0, 0, "Padrão");
      }
      return next;
    });
  }, [initAudioNodes]);

  // --- Autoplay Contagem Regressiva para Próximo Episódio ---
  useEffect(() => {
    if (!nextEpisode || duration <= 0) return;

    if (current / duration >= 0.95 && nextCountdown === null) {
      setNextCountdown(5);
      if (nextEpisodeTimer.current) clearInterval(nextEpisodeTimer.current);
      nextEpisodeTimer.current = setInterval(() => {
        setNextCountdown((prev) => {
          if (prev === null || prev <= 1) {
            clearInterval(nextEpisodeTimer.current!);
            router.push(`/watch/${nextEpisode.id}`);
            return null;
          }
          return prev - 1;
        });
      }, 1000);
    }
  }, [current, duration, nextEpisode, nextCountdown, router]);

  const cancelNextCountdown = () => {
    if (nextEpisodeTimer.current) clearInterval(nextEpisodeTimer.current);
    setNextCountdown(null);
  };

  // --- eventos do <video> ---
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTime = () => {
      setCurrent(video.currentTime);
      const now = Date.now();
      if (now - lastSavedAt.current > 4000) {
        lastSavedAt.current = now;
        saveProgress(movieId, video.currentTime, video.duration);
      }
    };
    const onLoaded = () => {
      setDuration(video.duration);
      setLoading(false);
      const saved = getProgress(movieId);
      if (saved && saved.currentTime > 5 && saved.currentTime < video.duration - 10) {
        setResumeBanner(saved.currentTime);
      }
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => {
      setPlaying(false);
      saveProgress(movieId, video.currentTime, video.duration);
    };
    const onWaiting = () => setLoading(true);
    const onPlaying = () => setLoading(false);
    const onProgress = () => {
      if (video.buffered.length > 0) {
        setBuffered(video.buffered.end(video.buffered.length - 1));
      }
    };
    const onError = () => {
      setLoading(false);
      const code = video.error?.code;
      const messages: Record<number, string> = {
        1: "O carregamento do vídeo foi interrompido.",
        2: "Falha de rede ao carregar o vídeo. Confira sua conexão.",
        3: "Não foi possível decodificar este arquivo de vídeo.",
        4: "Formato de vídeo não suportado nativamente pelo navegador.",
      };
      setError(
        (code && messages[code]) ||
          "Não foi possível carregar o vídeo. Confira se o arquivo existe no servidor."
      );
    };
    const onEnded = () => {
      saveProgress(movieId, video.duration, video.duration);
      if (nextEpisode) {
        router.push(`/watch/${nextEpisode.id}`);
      }
    };

    video.addEventListener("timeupdate", onTime);
    video.addEventListener("loadedmetadata", onLoaded);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("progress", onProgress);
    video.addEventListener("error", onError);
    video.addEventListener("ended", onEnded);

    return () => {
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("progress", onProgress);
      video.removeEventListener("error", onError);
      video.removeEventListener("ended", onEnded);
      saveProgress(movieId, video.currentTime, video.duration);

      const shouldFloat = video && movie && video.currentTime > 5 && !video.ended && !video.paused;
      if (shouldFloat) {
        startFloating(movie, video.currentTime, true);
      }

      // Pausa e cancela o carregamento de rede pendente do vídeo para não travar outras abas/páginas
      video.pause();
      if (!shouldFloat) {
        video.removeAttribute("src");
        video.load();
      }
    };
  }, [movieId, movie, nextEpisode, router, startFloating]);

  useEffect(() => {
    closeFloating();
  }, [closeFloating]);

  useEffect(() => {
    setPipSupported(
      typeof document !== "undefined" &&
        "pictureInPictureEnabled" in document &&
        !!videoRef.current &&
        !(videoRef.current as HTMLVideoElement & { disablePictureInPicture?: boolean })
          .disablePictureInPicture
    );
  }, []);

  useEffect(() => {
    const onFsChange = () =>
      setFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  // --- controles ---
  const togglePlay = useCallback(() => {
    if (screenLocked) return;
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() =>
        setError("O navegador bloqueou a reprodução automática. Clique novamente.")
      );
    } else {
      video.pause();
    }
  }, [screenLocked]);

  const skip = useCallback(
    (delta: number) => {
      if (screenLocked) return;
      const video = videoRef.current;
      if (!video) return;
      video.currentTime = Math.min(
        Math.max(0, video.currentTime + delta),
        video.duration || 0
      );
      setRippleAction(delta > 0 ? "forward" : "backward");
      setTimeout(() => setRippleAction(null), 600);
    },
    [screenLocked]
  );

  function handleTouchStart(e: React.TouchEvent) {
    if (screenLocked) return;
    const touch = e.touches[0];
    const now = Date.now();
    const rect = e.currentTarget.getBoundingClientRect();
    const x = touch.clientX - rect.left;

    if (touchTimer.current && now - touchTimer.current.time < 300) {
      if (x < rect.width * 0.35) {
        skip(-10);
      } else if (x > rect.width * 0.65) {
        skip(10);
      }
      touchTimer.current = null;
    } else {
      touchTimer.current = { time: now, x };
    }
  }

  function seek(e: React.ChangeEvent<HTMLInputElement>) {
    const video = videoRef.current;
    if (!video) return;
    const value = Number(e.target.value);
    video.currentTime = value;
    setCurrent(value);
  }

  function handleTimelineMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    const clampedPos = Math.max(0, Math.min(1, pos));
    setHoverPosition(clampedPos * 100);
    setHoverTime(clampedPos * (duration || 0));
  }

  function changeVolume(e: React.ChangeEvent<HTMLInputElement>) {
    const video = videoRef.current;
    if (!video) return;
    const value = Number(e.target.value);
    video.volume = value;
    setVolume(value);
    setMuted(value === 0);
  }

  function toggleMute() {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  }

  function toggleFullscreen() {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen().catch(() => {});
  }

  function togglePip() {
    const video = videoRef.current;
    if (!video) return;
    if (document.pictureInPictureElement) {
      document.exitPictureInPicture().catch(() => {});
    } else {
      video.requestPictureInPicture().catch(() => {});
    }
  }

  function changeSpeed(value: number) {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = value;
    setSpeed(value);
    setShowSpeedMenu(false);
  }

  function resumeFromSaved() {
    const video = videoRef.current;
    if (!video || resumeBanner === null) return;
    video.currentTime = resumeBanner;
    setResumeBanner(null);
    video.play().catch(() => {});
  }

  function selectAudio(trackIndex: number) {
    const video = videoRef.current;
    const savedTime = video ? video.currentTime : 0;
    setShowAudioMenu(false);
    if (onAudioTrackChange) {
      onAudioTrackChange(trackIndex);
    }
    setTimeout(() => {
      if (videoRef.current) {
        videoRef.current.currentTime = savedTime;
        videoRef.current.play().catch(() => {});
      }
    }, 200);
  }

  // --- atalhos de teclado e TV ---
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const video = videoRef.current;
      if (!video) return;

      switch (e.key) {
        case " ":
        case "k":
          e.preventDefault();
          togglePlay();
          break;
        case "ArrowRight":
          skip(10);
          break;
        case "ArrowLeft":
          skip(-10);
          break;
        case "ArrowUp":
          e.preventDefault();
          video.volume = Math.min(1, video.volume + 0.1);
          setVolume(video.volume);
          break;
        case "ArrowDown":
          e.preventDefault();
          video.volume = Math.max(0, video.volume - 0.1);
          setVolume(video.volume);
          break;
        case "m":
        case "M":
          toggleMute();
          break;
        case "f":
        case "F":
          toggleFullscreen();
          break;
        case "s":
        case "S":
          skip(85);
          break;
        case "c":
        case "C":
          setSubtitlesEnabled((v) => !v);
          break;
        case "n":
        case "N":
          toggleNightMode();
          break;
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [togglePlay, skip, toggleNightMode]);

  function handleMouseMove() {
    setShowControls(true);
    if (hideTimeout.current) clearTimeout(hideTimeout.current);
    hideTimeout.current = setTimeout(() => {
      if (
        playing &&
        !showSpeedMenu &&
        !showAudioMenu &&
        !showSleepMenu &&
        !showCalibrationMenu &&
        !showEqMenu
      ) {
        setShowControls(false);
      }
    }, 2800);
  }

  const activeTrackObj =
    audioTracks.find((t) => t.index === currentAudioTrack) || audioTracks[0];

  const showSkipIntro = current > 5 && current < 130 && (duration > 180 || duration === 0);

  return (
    <div
      ref={containerRef}
      className="group relative w-full overflow-hidden rounded-xl bg-black shadow-2xl transition-all"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => playing && setShowControls(false)}
      onTouchStart={handleTouchStart}
    >
      {/* Canvas Ambilight (Glow Dinâmico) */}
      {ambilightEnabled && (
        <div className="pointer-events-none absolute -inset-6 -z-10 overflow-hidden opacity-70 blur-3xl transition-opacity">
          <canvas
            ref={canvasRef}
            width={32}
            height={18}
            className="h-full w-full object-cover"
          />
        </div>
      )}

      {/* Elemento de Vídeo com Calibração */}
      <video
        ref={videoRef}
        src={src}
        className="aspect-video w-full bg-black object-contain"
        style={{
          filter: `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`,
        }}
        onClick={togglePlay}
        playsInline
        crossOrigin="anonymous"
      >
        {subtitleUrl && (
          <track
            kind="subtitles"
            src={subtitleUrl}
            srcLang="pt"
            label="Português"
            default={subtitlesEnabled}
          />
        )}
      </video>

      {/* Sleep Toast */}
      {sleepToast && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 rounded-xl border border-rule bg-panel px-6 py-3 text-sm font-bold text-ink shadow-2xl backdrop-blur animate-fade-in">
          <span>😴</span>
          <span>Sleep Timer ativado: Vídeo pausado para dormir.</span>
        </div>
      )}

      {/* Ripple Animation de Duplo Toque (+10s / -10s) */}
      {rippleAction === "backward" && (
        <div className="pointer-events-none absolute left-8 top-1/2 -translate-y-1/2 flex flex-col items-center justify-center rounded-full bg-black/60 p-6 text-white animate-ping">
          <span className="text-3xl font-black">⏪</span>
          <span className="text-xs font-bold mt-1">-10s</span>
        </div>
      )}
      {rippleAction === "forward" && (
        <div className="pointer-events-none absolute right-8 top-1/2 -translate-y-1/2 flex flex-col items-center justify-center rounded-full bg-black/60 p-6 text-white animate-ping">
          <span className="text-3xl font-black">⏩</span>
          <span className="text-xs font-bold mt-1">+10s</span>
        </div>
      )}

      {/* Spinner de Carregamento */}
      {loading && !error && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-14 w-14 animate-spin rounded-full border-4 border-white/20 border-t-brand" />
        </div>
      )}

      {/* Botão Central de Play quando Pausado */}
      {!playing && !loading && !error && !screenLocked && (
        <button
          onClick={togglePlay}
          aria-label="Reproduzir"
          className="absolute inset-0 flex items-center justify-center bg-black/30 transition-all hover:bg-black/40"
        >
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-brand/90 text-3xl text-white shadow-2xl transition-transform hover:scale-110">
            ▶
          </span>
        </button>
      )}

      {/* Tela de Erro */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/95 px-6 text-center z-30">
          <p className="text-4xl text-brand">⚠</p>
          <p className="max-w-md text-sm text-mute">{error}</p>
          <button
            onClick={() => {
              setError(null);
              setLoading(true);
              videoRef.current?.load();
            }}
            className="rounded-lg bg-brand px-6 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Tentar de novo
          </button>
        </div>
      )}

      {/* Banner de Retomar de Onde Parou */}
      {resumeBanner !== null && !error && !screenLocked && (
        <div className="absolute left-6 top-6 z-20 flex items-center gap-3 rounded-lg border border-rule bg-panel/95 px-5 py-2.5 text-sm shadow-card backdrop-blur">
          <span>Continuar de <strong>{formatTime(resumeBanner)}</strong>?</span>
          <button
            onClick={resumeFromSaved}
            className="rounded-md bg-brand px-3 py-1 text-xs font-semibold text-white shadow"
          >
            Continuar
          </button>
          <button
            onClick={() => setResumeBanner(null)}
            className="text-xs text-mute hover:text-ink"
          >
            Do início
          </button>
        </div>
      )}

      {/* Botão Pular Abertura (Skip Intro) */}
      {showSkipIntro && !screenLocked && (
        <button
          onClick={() => skip(85)}
          className="absolute bottom-20 left-6 z-20 flex items-center gap-2 rounded-xl border border-white/20 bg-black/80 px-4 py-2 text-xs font-bold text-white backdrop-blur hover:bg-black hover:border-brand transition-all shadow-2xl animate-fade-in"
        >
          <span>⏭ Pular Abertura (+85s)</span>
          <kbd className="hidden sm:inline rounded bg-white/20 px-1 text-[10px]">S</kbd>
        </button>
      )}

      {/* Card de Autoplay: Próximo Episódio */}
      {nextCountdown !== null && nextEpisode && (
        <div className="absolute bottom-16 right-6 z-30 flex max-w-sm flex-col gap-2 rounded-xl border border-rule bg-panel/95 p-4 shadow-2xl backdrop-blur animate-fade-in">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-brand2">
              Próximo Episódio em {nextCountdown}s
            </span>
            <button
              onClick={cancelNextCountdown}
              className="text-xs text-mute hover:text-ink"
            >
              ✕ Cancelar
            </button>
          </div>
          <p className="truncate text-sm font-bold text-ink">
            E{nextEpisode.episodeNumber} — {nextEpisode.title}
          </p>
          <div className="mt-1 flex gap-2">
            <button
              onClick={() => router.push(`/watch/${nextEpisode.id}`)}
              className="flex-1 rounded-lg bg-brand py-2 text-xs font-bold text-white shadow hover:bg-brand2"
            >
              ▶ Assistir Agora
            </button>
          </div>
        </div>
      )}

      {/* Botão de Bloqueio de Tela */}
      <button
        onClick={() => setScreenLocked((v) => !v)}
        aria-label={screenLocked ? "Desbloquear tela" : "Bloquear tela"}
        className={`absolute right-4 top-4 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-sm backdrop-blur transition-opacity ${
          showControls || screenLocked ? "opacity-100" : "opacity-0"
        } hover:bg-black/80`}
      >
        {screenLocked ? "🔒" : "🔓"}
      </button>

      {/* Barra e Controles Principais */}
      {!screenLocked && (
        <div
          className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/70 to-transparent px-4 pb-3 pt-12 transition-opacity duration-300 sm:px-6 ${
            showControls || !playing ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
        >
          {/* Timeline com Hover Scrubbing */}
          <div
            className="group/timeline relative mb-3 h-2 w-full cursor-pointer rounded-full bg-white/20 transition-all hover:h-3"
            onMouseMove={handleTimelineMouseMove}
            onMouseLeave={() => setHoverTime(null)}
          >
            {hoverTime !== null && (
              <div
                className="pointer-events-none absolute -top-8 -translate-x-1/2 rounded bg-panel px-2 py-0.5 text-[11px] font-bold text-ink shadow-card"
                style={{ left: `${hoverPosition}%` }}
              >
                {formatTime(hoverTime)}
              </div>
            )}

            <div
              className="absolute h-full rounded-full bg-white/30"
              style={{ width: `${(buffered / (duration || 1)) * 100}%` }}
            />
            <div
              className="absolute h-full rounded-full bg-brand shadow-sm"
              style={{ width: `${(current / (duration || 1)) * 100}%` }}
            />
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.1}
              value={current}
              onChange={seek}
              aria-label="Linha do tempo"
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </div>

          {/* Botões de Ação */}
          <div className="flex items-center gap-2.5 text-ink sm:gap-4 flex-wrap">
            <button
              onClick={() => skip(-10)}
              aria-label="Voltar 10 segundos"
              className="rounded p-1.5 text-lg hover:bg-white/10"
            >
              ⏪
            </button>
            <button
              onClick={togglePlay}
              aria-label={playing ? "Pausar" : "Reproduzir"}
              className="rounded p-1.5 text-2xl hover:bg-white/10"
            >
              {playing ? "❚❚" : "▶"}
            </button>
            <button
              onClick={() => skip(10)}
              aria-label="Avançar 10 segundos"
              className="rounded p-1.5 text-lg hover:bg-white/10"
            >
              ⏩
            </button>

            {/* Tempo */}
            <span className="text-xs tabular-nums text-mute sm:text-sm">
              <strong className="text-ink">{formatTime(current)}</strong> / {formatTime(duration)}
            </span>

            <span className="ml-auto truncate max-w-[15%] text-xs font-semibold text-mute sm:max-w-[20%] sm:text-sm">
              {title}
            </span>

            {/* Volume */}
            <div className="hidden items-center gap-2 sm:flex">
              <button
                onClick={toggleMute}
                aria-label={muted ? "Reativar som" : "Mudo"}
                className="rounded p-1.5 text-base hover:bg-white/10"
              >
                {muted || volume === 0 ? "🔇" : volume < 0.5 ? "🔉" : "🔊"}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={muted ? 0 : volume}
                onChange={changeVolume}
                aria-label="Volume"
                className="h-1.5 w-16 accent-brand cursor-pointer"
              />
            </div>

            {/* Seletor de Áudio (Dual Áudio) */}
            {audioTracks.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setShowAudioMenu((v) => !v)}
                  title="Trocar Faixa de Áudio"
                  className="flex items-center gap-1.5 rounded-md bg-white/10 px-2.5 py-1 text-xs font-bold hover:bg-white/20"
                >
                  <span>{activeTrackObj?.flag || "🎧"}</span>
                  <span className="hidden md:inline">{activeTrackObj?.language_name || "Áudio"}</span>
                </button>
                {showAudioMenu && (
                  <div className="absolute bottom-10 right-0 w-48 rounded-lg border border-rule bg-panel py-1 shadow-2xl z-40">
                    <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-mute border-b border-rule/50">
                      Faixas de Áudio
                    </p>
                    {audioTracks.map((t) => (
                      <button
                        key={t.index}
                        onClick={() => selectAudio(t.index)}
                        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-panel2 ${
                          t.index === currentAudioTrack ? "font-bold text-brand" : "text-ink"
                        }`}
                      >
                        <span>{t.flag}</span>
                        <span className="truncate">{t.title}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Equalizador de Áudio (Bass Boost / EQ) */}
            <div className="relative">
              <button
                onClick={() => setShowEqMenu((v) => !v)}
                title="Equalizador de Som (Bass Boost / Diálogo)"
                className="hidden rounded p-1.5 text-xs font-bold bg-white/10 hover:bg-white/20 sm:inline"
              >
                🔊 EQ
              </button>
              {showEqMenu && (
                <div className="absolute bottom-10 right-0 w-60 rounded-xl border border-rule bg-panel p-4 shadow-2xl z-40 space-y-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-mute border-b border-rule/50 pb-1">
                    Equalizador de Áudio
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      onClick={() => applyAudioEQ(0, 0, 0, "Padrão")}
                      className={`rounded py-1 text-[10px] font-bold ${
                        audioPreset === "Padrão" ? "bg-brand text-white" : "bg-panel2 text-ink hover:bg-white/10"
                      }`}
                    >
                      Padrão
                    </button>
                    <button
                      onClick={() => applyAudioEQ(8, 0, 3, "Bass Boost")}
                      className={`rounded py-1 text-[10px] font-bold ${
                        audioPreset === "Bass Boost" ? "bg-brand text-white" : "bg-panel2 text-ink hover:bg-white/10"
                      }`}
                    >
                      🔊 Bass Boost
                    </button>
                    <button
                      onClick={() => applyAudioEQ(-2, 7, 2, "Voz Cristalina")}
                      className={`rounded py-1 text-[10px] font-bold ${
                        audioPreset === "Voz Cristalina" ? "bg-brand text-white" : "bg-panel2 text-ink hover:bg-white/10"
                      }`}
                    >
                      🎙️ Diálogo
                    </button>
                    <button
                      onClick={() => applyAudioEQ(5, 1, 5, "Cinema 3D")}
                      className={`rounded py-1 text-[10px] font-bold ${
                        audioPreset === "Cinema 3D" ? "bg-brand text-white" : "bg-panel2 text-ink hover:bg-white/10"
                      }`}
                    >
                      🎬 Cinema 3D
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Sleep Timer */}
            <div className="relative">
              <button
                onClick={() => setShowSleepMenu((v) => !v)}
                title="Timer de Desligamento (Sleep Timer)"
                className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold transition-colors ${
                  sleepRemaining !== null
                    ? "bg-brand text-white"
                    : "bg-white/10 text-mute hover:text-ink"
                }`}
              >
                <span>⏱️</span>
                <span className="hidden lg:inline">{sleepLabel || "Timer"}</span>
              </button>
              {showSleepMenu && (
                <div className="absolute bottom-10 right-0 w-40 rounded-lg border border-rule bg-panel py-1 shadow-2xl z-40">
                  <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-mute border-b border-rule/50">
                    Sleep Timer
                  </p>
                  {[
                    { label: "Desativado", val: null },
                    { label: "15 minutos", val: 15 },
                    { label: "30 minutos", val: 30 },
                    { label: "45 minutos", val: 45 },
                    { label: "60 minutos", val: 60 },
                    { label: "Fim do vídeo", val: "end" as const },
                  ].map((opt) => (
                    <button
                      key={opt.label}
                      onClick={() => setSleepTimer(opt.val)}
                      className="block w-full px-3 py-1.5 text-left text-xs hover:bg-panel2 text-ink"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Equalizador de Imagem (Calibração) */}
            <div className="relative">
              <button
                onClick={() => setShowCalibrationMenu((v) => !v)}
                title="Calibrar Imagem do Vídeo"
                className="hidden rounded p-1.5 text-base bg-white/10 hover:bg-white/20 sm:inline"
              >
                🎛️
              </button>
              {showCalibrationMenu && (
                <div className="absolute bottom-10 right-0 w-64 rounded-xl border border-rule bg-panel p-4 shadow-2xl z-40 space-y-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-mute border-b border-rule/50 pb-1">
                    Equalizador de Imagem
                  </p>
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] font-semibold text-mute">
                      <span>Brilho</span>
                      <span>{brightness}%</span>
                    </div>
                    <input
                      type="range"
                      min={50}
                      max={180}
                      value={brightness}
                      onChange={(e) => setBrightness(Number(e.target.value))}
                      className="w-full accent-brand"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] font-semibold text-mute">
                      <span>Contraste</span>
                      <span>{contrast}%</span>
                    </div>
                    <input
                      type="range"
                      min={50}
                      max={180}
                      value={contrast}
                      onChange={(e) => setContrast(Number(e.target.value))}
                      className="w-full accent-brand"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] font-semibold text-mute">
                      <span>Saturação</span>
                      <span>{saturation}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={200}
                      value={saturation}
                      onChange={(e) => setSaturation(Number(e.target.value))}
                      className="w-full accent-brand"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 pt-2 border-t border-rule/50">
                    <button
                      onClick={() => applyPreset(100, 100, 100)}
                      className="rounded bg-panel2 py-1 text-[10px] font-bold text-ink hover:bg-white/10"
                    >
                      Padrão
                    </button>
                    <button
                      onClick={() => applyPreset(140, 110, 105)}
                      className="rounded bg-panel2 py-1 text-[10px] font-bold text-ink hover:bg-white/10"
                    >
                      Cenas Escuras
                    </button>
                    <button
                      onClick={() => applyPreset(105, 120, 130)}
                      className="rounded bg-panel2 py-1 text-[10px] font-bold text-ink hover:bg-white/10"
                    >
                      Vívido
                    </button>
                    <button
                      onClick={() => applyPreset(105, 115, 95)}
                      className="rounded bg-panel2 py-1 text-[10px] font-bold text-ink hover:bg-white/10"
                    >
                      Cinema
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Modo Noturno (Dialogue Boost) */}
            <button
              onClick={toggleNightMode}
              title={nightMode ? "Modo Noturno Ativado" : "Ativar Modo Noturno de Áudio"}
              className={`hidden rounded px-2 py-1 text-xs font-bold transition-colors sm:inline ${
                nightMode ? "bg-brand text-white" : "bg-white/10 text-mute hover:text-ink"
              }`}
            >
              🌙 Diálogo {nightMode ? "ON" : "OFF"}
            </button>

            {/* Ambilight Glow */}
            <button
              onClick={() => setAmbilightEnabled((v) => !v)}
              title="Luz Ambiente (Ambilight)"
              className={`hidden rounded px-2 py-1 text-xs font-bold transition-colors sm:inline ${
                ambilightEnabled ? "bg-brand/20 text-brand border border-brand/40" : "bg-white/10 text-mute"
              }`}
            >
              ✨ Glow
            </button>

            {/* Menu de Velocidade */}
            <div className="relative">
              <button
                onClick={() => setShowSpeedMenu((v) => !v)}
                aria-label="Velocidade"
                className="rounded px-2 py-1 text-xs font-bold bg-white/10 hover:bg-white/20"
              >
                {speed}x
              </button>
              {showSpeedMenu && (
                <div className="absolute bottom-10 right-0 w-24 rounded-lg border border-rule bg-panel py-1 shadow-card z-30">
                  {SPEEDS.map((s) => (
                    <button
                      key={s}
                      onClick={() => changeSpeed(s)}
                      className={`block w-full px-3 py-1.5 text-left text-xs hover:bg-panel2 ${
                        s === speed ? "font-bold text-brand" : "text-ink"
                      }`}
                    >
                      {s}x
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Picture-in-Picture */}
            {pipSupported && (
              <button
                onClick={togglePip}
                aria-label="Picture-in-picture"
                className="hidden rounded p-1.5 text-base hover:bg-white/10 sm:inline"
              >
                ⧉
              </button>
            )}

            {/* Tela Cheia */}
            <button
              onClick={toggleFullscreen}
              aria-label={fullscreen ? "Sair da tela cheia" : "Tela cheia"}
              className="rounded p-1.5 text-base hover:bg-white/10"
            >
              {fullscreen ? "⤡" : "⤢"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
