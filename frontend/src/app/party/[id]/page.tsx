"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useProfile } from "@/lib/profile-context";
import { api, Movie, RoomState, ChatMessage, AudioTrack } from "@/lib/api";
import { AppShell } from "@/components/AppShell";
import { VideoPlayer } from "@/components/VideoPlayer";

export default function WatchPartyPage() {
  const { id } = useParams<{ id: string }>();
  const { token, user } = useAuth();
  const { activeProfile } = useProfile();
  const router = useRouter();

  const [room, setRoom] = useState<RoomState | null>(null);
  const [movie, setMovie] = useState<Movie | null>(null);
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
  const [currentTrack, setCurrentTrack] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMsg, setInputMsg] = useState("");
  const [connected, setConnected] = useState(false);
  const [copied, setCopied] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const userName = activeProfile?.name || user?.name || "Familiar";

  useEffect(() => {
    if (!id || !token) return;

    // 1. Carrega dados da sala
    api
      .getWatchParty(id)
      .then((r) => {
        setRoom(r);
        setMessages(r.messages);
        return api.getMovie(r.movie_id, token).then((m) => {
          setMovie(m);
          return api.getAudioTracks(m.id, token).then(setAudioTracks);
        });
      })
      .catch(() => {
        // Se a sala não existir
      });

    // 2. Conecta ao WebSocket da Watch Party
    const wsUrl = api.getPartyWsUrl(id);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
    };

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "INIT_STATE") {
          setRoom(data.room);
          setMessages(data.room.messages);
        } else if (data.type === "CHAT") {
          setMessages((prev) => [...prev, data.message]);
        }
      } catch {
        // Ignore
      }
    };

    ws.onclose = () => {
      setConnected(false);
    };

    return () => {
      ws.close();
    };
  }, [id, token]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSendChat(e: React.FormEvent) {
    e.preventDefault();
    if (!inputMsg.trim() || !wsRef.current) return;
    wsRef.current.send(
      JSON.stringify({
        type: "CHAT",
        user: userName,
        text: inputMsg.trim(),
      })
    );
    setInputMsg("");
  }

  function handleCopyLink() {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  }

  return (
    <AppShell showSearch={false}>
      <div className="px-4 py-6 lg:px-8">
        {/* Header da Sala */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-rule bg-panel p-4 shadow-card">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-xl shadow">
              🍿
            </span>
            <div>
              <h1 className="text-lg font-black text-ink">
                Watch Party: {movie?.title || "Carregando..."}
              </h1>
              <p className="text-xs text-mute flex items-center gap-2">
                <span
                  className={`h-2 w-2 rounded-full ${
                    connected ? "bg-emerald-400 animate-pulse" : "bg-brand2"
                  }`}
                />
                {connected ? "Conectado à sala familiar" : "Reconectando..."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleCopyLink}
              className="flex items-center gap-1.5 rounded-lg border border-rule bg-panel2 px-4 py-2 text-xs font-bold text-ink hover:border-brand transition-all"
            >
              <span>🔗</span>
              <span>{copied ? "Link Copiado!" : "Copiar Link de Convite"}</span>
            </button>
            <Link
              href="/"
              className="rounded-lg border border-rule bg-panel2 px-4 py-2 text-xs font-bold text-mute hover:text-ink"
            >
              Sair da Sala
            </Link>
          </div>
        </div>

        {/* Player + Chat ao Vivo */}
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          {/* Player de Vídeo */}
          <div>
            {movie && (
              <VideoPlayer
                src={api.streamUrl(movie.id, token, currentTrack)}
                title={movie.title}
                movieId={movie.id}
                subtitleUrl={api.subtitleUrl(movie.id)}
                audioTracks={audioTracks}
                currentAudioTrack={currentTrack}
                onAudioTrackChange={setCurrentTrack}
              />
            )}
          </div>

          {/* Chat Lateral em Tempo Real */}
          <div className="flex h-[480px] flex-col rounded-xl border border-rule bg-panel shadow-card">
            <div className="border-b border-rule p-3">
              <h2 className="text-xs font-black uppercase tracking-wider text-mute">
                Chat da Família
              </h2>
            </div>

            {/* Mensagens */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`text-xs ${
                    m.is_system
                      ? "rounded bg-brand/10 p-2 text-center text-brand2 font-semibold"
                      : "space-y-0.5"
                  }`}
                >
                  {!m.is_system && (
                    <p className="font-bold text-mute">
                      <span className="text-ink">{m.user}</span>
                      <span className="ml-1 text-[10px] text-mute/60">
                        {new Date(m.timestamp * 1000).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </p>
                  )}
                  <p className={m.is_system ? "" : "text-ink/90"}>{m.text}</p>
                </div>
              ))}
              <div ref={chatBottomRef} />
            </div>

            {/* Input do Chat */}
            <form onSubmit={handleSendChat} className="border-t border-rule p-3 flex gap-2">
              <input
                value={inputMsg}
                onChange={(e) => setInputMsg(e.target.value)}
                placeholder="Escreva uma mensagem..."
                className="input flex-1 text-xs"
              />
              <button
                type="submit"
                disabled={!inputMsg.trim()}
                className="rounded-lg bg-brand px-4 text-xs font-bold text-white shadow hover:bg-brand2 disabled:opacity-50"
              >
                Enviar
              </button>
            </form>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

