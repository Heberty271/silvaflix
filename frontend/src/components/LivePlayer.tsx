"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Hls from "hls.js";
import { Channel, api } from "@/lib/api";

export function LivePlayer({
  channel,
  onPreviousChannel,
  onNextChannel,
  isFavorite,
  onToggleFavorite,
}: {
  channel: Channel | null;
  onPreviousChannel?: () => void;
  onNextChannel?: () => void;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [useProxy, setUseProxy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pipSupported, setPipSupported] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const hideControlsTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Determina URL final da transmissão (direta ou via proxy)
  const currentStreamUrl = channel
    ? useProxy
      ? api.getLiveProxyUrl(channel.stream_url)
      : channel.stream_url
    : "";

  // Inicializa ou atualiza a reprodução HLS / HTML5
  useEffect(() => {
    if (!channel || !videoRef.current) return;

    const video = videoRef.current;
    setLoading(true);
    setError(null);

    // Limpa instância anterior do Hls.js
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const streamUrl = currentStreamUrl;

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 60,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        manifestLoadingTimeOut: 15000,
        levelLoadingTimeOut: 15000,
        fragLoadingTimeOut: 20000,
      });
      hlsRef.current = hls;

      hls.loadSource(streamUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setLoading(false);
        video.play().catch(() => {
          // Autoplay policy pode exigir interação do usuário
          setPlaying(false);
        });
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              // Tenta recuperar erro de rede
              if (!useProxy) {
                // Tenta ativar proxy automaticamente para contornar CORS
                setUseProxy(true);
              } else {
                hls.startLoad();
                setError(
                  "Erro de conexão com a transmissão ao vivo. O sinal pode estar temporariamente indisponível."
                );
              }
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              hls.destroy();
              setError("Não foi possível reproduzir este canal ao vivo.");
              break;
          }
          setLoading(false);
        }
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      // Suporte nativo HLS (ex: Safari iOS / macOS)
      video.src = streamUrl;
      video.addEventListener("loadedmetadata", () => {
        setLoading(false);
        video.play().catch(() => setPlaying(false));
      });
      video.addEventListener("error", () => {
        setLoading(false);
        if (!useProxy) {
          setUseProxy(true);
        } else {
          setError("Erro ao carregar o canal no reprodutor nativo.");
        }
      });
    } else {
      setError("Seu navegador não suporta reprodução de transmissões HLS/M3U8.");
      setLoading(false);
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [channel, currentStreamUrl, useProxy]);

  // Checa suporte a Picture-in-Picture
  useEffect(() => {
    setPipSupported(
      typeof document !== "undefined" &&
        "pictureInPictureEnabled" in document &&
        !!videoRef.current
    );
  }, []);

  // Monitora tela cheia
  useEffect(() => {
    const handleFullscreenChange = () => {
      setFullscreen(document.fullscreenElement === containerRef.current);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  // Atalhos de teclado no Player Ao Vivo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      switch (e.key) {
        case " ":
        case "k":
          e.preventDefault();
          togglePlay();
          break;
        case "m":
        case "M":
          toggleMute();
          break;
        case "f":
        case "F":
          toggleFullscreen();
          break;
        case "ArrowUp":
          e.preventDefault();
          if (onPreviousChannel) onPreviousChannel();
          break;
        case "ArrowDown":
          e.preventDefault();
          if (onNextChannel) onNextChannel();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onPreviousChannel, onNextChannel]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      setError(null);
      video.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    } else {
      video.pause();
      setPlaying(false);
    }
  }, []);

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const val = Number(e.target.value);
    video.volume = val;
    setVolume(val);
    setMuted(val === 0);
  };

  const toggleFullscreen = () => {
    const container = containerRef.current;
    if (!container) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      container.requestFullscreen().catch(() => {});
    }
  };

  const togglePip = () => {
    const video = videoRef.current;
    if (!video) return;
    if (document.pictureInPictureElement) {
      document.exitPictureInPicture().catch(() => {});
    } else {
      video.requestPictureInPicture().catch(() => {});
    }
  };

  const handleMouseMove = () => {
    setShowControls(true);
    if (hideControlsTimeout.current) clearTimeout(hideControlsTimeout.current);
    hideControlsTimeout.current = setTimeout(() => {
      if (playing) setShowControls(false);
    }, 3500);
  };

  if (!channel) {
    return (
      <div className="relative aspect-video w-full flex flex-col items-center justify-center rounded-2xl border border-rule bg-panel/60 p-8 text-center backdrop-blur shadow-2xl">
        <span className="text-5xl mb-3">📡</span>
        <h3 className="text-lg font-bold text-ink">Selecione um canal para assistir</h3>
        <p className="text-xs text-mute mt-1 max-w-sm">
          Navegue pelas categorias abaixo ou use a busca para encontrar canais abertos, notícias, filmes, esportes e IPTV.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => playing && setShowControls(false)}
      className="group relative aspect-video w-full overflow-hidden rounded-2xl bg-black shadow-2xl border border-rule/60"
    >
      {/* Vídeo Tag */}
      <video
        ref={videoRef}
        playsInline
        onClick={togglePlay}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onWaiting={() => setLoading(true)}
        onPlaying={() => setLoading(false)}
        className="h-full w-full object-contain cursor-pointer"
      />

      {/* Loading Spinner */}
      {loading && !error && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-[2px]">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-white/20 border-t-red-500" />
          <span className="mt-3 text-xs font-bold uppercase tracking-wider text-white">
            Sintonizando sinal...
          </span>
        </div>
      )}

      {/* Erro de Reprodução com Opção de Proxy Anti-Bloqueio */}
      {error && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/90 p-6 text-center animate-fade-in">
          <span className="text-4xl mb-2">⚠️</span>
          <p className="text-sm font-bold text-ink">{error}</p>
          <p className="text-xs text-mute mt-1 max-w-md">
            Alguns canais exigem cabeçalhos específicos ou têm restrições de transmissão.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <button
              onClick={() => {
                setError(null);
                setUseProxy(!useProxy);
              }}
              className="rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white transition-opacity hover:opacity-90 shadow-md"
            >
              {useProxy ? "🔄 Tentar Conexão Direta" : "🛡️ Ativar Modo Proxy Anti-Bloqueio"}
            </button>
            {onNextChannel && (
              <button
                onClick={onNextChannel}
                className="rounded-xl border border-rule bg-panel px-4 py-2 text-xs font-semibold text-ink hover:border-brand"
              >
                Próximo Canal ⏭
              </button>
            )}
          </div>
        </div>
      )}

      {/* Overlay Superior com Nome do Canal e Badge Ao Vivo */}
      <div
        className={`pointer-events-none absolute left-0 right-0 top-0 z-20 flex items-center justify-between bg-gradient-to-b from-black/80 via-black/40 to-transparent p-4 transition-opacity duration-300 ${
          showControls || !playing ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="pointer-events-auto flex items-center gap-3">
          {channel.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={channel.logo_url}
              alt={channel.name}
              className="h-10 w-10 object-contain rounded-lg bg-black/40 p-1 border border-white/10"
              onError={(e) => {
                (e.target as HTMLElement).style.display = "none";
              }}
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-600/20 text-lg border border-red-500/30">
              📡
            </div>
          )}

          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-black text-white drop-shadow-md">
                {channel.name}
              </h2>
              <span className="flex items-center gap-1.5 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white shadow-lg animate-pulse">
                <span className="h-1.5 w-1.5 rounded-full bg-white" />
                AO VIVO
              </span>
              {useProxy && (
                <span className="rounded-full bg-blue-600/80 px-2 py-0.5 text-[9px] font-bold text-white" title="Stream protegido via proxy anti-CORS">
                  PROXY ATIVO
                </span>
              )}
            </div>
            <p className="text-xs font-medium text-white/70">
              {channel.category} {channel.is_custom ? "• Lista IPTV" : "• Gratuito Aberto"}
            </p>
          </div>
        </div>

        {/* Ações no Topo (Favoritar e Zapping) */}
        <div className="pointer-events-auto flex items-center gap-2">
          {onToggleFavorite && (
            <button
              onClick={onToggleFavorite}
              title={isFavorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
              className={`flex h-9 w-9 items-center justify-center rounded-full backdrop-blur transition-all ${
                isFavorite
                  ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                  : "bg-black/50 text-white/70 hover:text-white border border-white/10"
              }`}
            >
              {isFavorite ? "★" : "☆"}
            </button>
          )}

          {onPreviousChannel && (
            <button
              onClick={onPreviousChannel}
              title="Canal anterior (Seta para cima)"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white border border-white/10 backdrop-blur hover:bg-white/20 transition-all text-xs font-bold"
            >
              ◀
            </button>
          )}
          {onNextChannel && (
            <button
              onClick={onNextChannel}
              title="Próximo canal (Seta para baixo)"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white border border-white/10 backdrop-blur hover:bg-white/20 transition-all text-xs font-bold"
            >
              ▶
            </button>
          )}
        </div>
      </div>

      {/* Botão Play central se estiver pausado */}
      {!playing && !loading && !error && (
        <button
          onClick={togglePlay}
          className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/40 transition-colors"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600 text-white text-2xl shadow-2xl transition-transform hover:scale-110">
            ▶
          </div>
        </button>
      )}

      {/* Barra de Controles Inferior */}
      <div
        className={`absolute bottom-0 left-0 right-0 z-20 flex items-center justify-between bg-gradient-to-t from-black/90 via-black/50 to-transparent p-4 transition-opacity duration-300 ${
          showControls || !playing ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={togglePlay}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
            title={playing ? "Pausar" : "Reproduzir"}
          >
            {playing ? "⏸" : "▶"}
          </button>

          {/* Volume */}
          <div className="flex items-center gap-2">
            <button
              onClick={toggleMute}
              className="text-white/80 hover:text-white transition-colors"
              title={muted ? "Ativar som" : "Silenciar"}
            >
              {muted || volume === 0 ? "🔇" : volume < 0.5 ? "🔉" : "🔊"}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={handleVolumeChange}
              className="h-1.5 w-20 accent-red-500 rounded-full cursor-pointer bg-white/20"
            />
          </div>

          <span className="text-xs font-bold uppercase tracking-wider text-red-500">
            ● Transmissão Contínua
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Alternar Proxy Manual */}
          <button
            onClick={() => setUseProxy((v) => !v)}
            title="Alternar entre conexão direta e proxy anti-CORS"
            className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all border ${
              useProxy
                ? "bg-blue-600/30 text-blue-400 border-blue-500/50"
                : "bg-white/10 text-white/70 border-white/10 hover:text-white"
            }`}
          >
            {useProxy ? "🛡️ Proxy On" : "Proxy Off"}
          </button>

          {/* Picture-in-Picture */}
          {pipSupported && (
            <button
              onClick={togglePip}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors"
              title="Assistir em Picture-in-Picture"
            >
              🖼️
            </button>
          )}

          {/* Tela Cheia */}
          <button
            onClick={toggleFullscreen}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors"
            title={fullscreen ? "Sair da tela cheia (F)" : "Tela cheia (F)"}
          >
            {fullscreen ? "⤓" : "⤢"}
          </button>
        </div>
      </div>
    </div>
  );
}
