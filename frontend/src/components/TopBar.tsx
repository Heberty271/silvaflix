"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useProfile } from "@/lib/profile-context";
import { useTV } from "@/lib/tv-context";
import { api, Movie } from "@/lib/api";
import { SurpriseModal } from "@/components/SurpriseModal";

export function TopBar() {
  const { user, token } = useAuth();
  const { activeProfile, switchProfile } = useProfile();
  const { isTVMode, toggleTVMode } = useTV();
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [showSurprise, setShowSurprise] = useState(false);
  const [surprisePool, setSurprisePool] = useState<Movie[]>([]);

  // Notificações de Lançamentos Recentes
  const [recentMovies, setRecentMovies] = useState<Movie[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!token) return;
    api.listMovies(token).then((all) => {
      const sorted = [...all].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setRecentMovies(sorted.slice(0, 5));
    }).catch(() => {});
  }, [token]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query.trim())}`);
    } else {
      router.push("/search");
    }
  }

  async function handleOpenSurprise() {
    if (!token) return;
    try {
      const all = await api.listMovies(token);
      const filtered = activeProfile?.isKids
        ? all.filter(
            (m) =>
              !m.is_private &&
              !["Terror", "Horror", "Crime", "Suspense"].includes(m.genre || "")
          )
        : all.filter((m) => !m.is_private);
      setSurprisePool(filtered);
      setShowSurprise(true);
    } catch {
      // Ignore
    }
  }

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center gap-4 border-b border-rule bg-void/90 px-4 py-3 backdrop-blur lg:px-8">
        <span className="text-lg font-black tracking-tight lg:hidden">
          SILVA<span className="text-brand">FLIX</span>
        </span>

        <form onSubmit={handleSubmit} className="mx-auto w-full max-w-md">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Pesquisar títulos, atores, gêneros..."
            aria-label="Pesquisar filmes"
            className="w-full rounded-full border border-rule bg-panel px-4 py-2 text-sm outline-none focus:border-brand transition-all"
          />
        </form>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Botão Surpreenda-me */}
          <button
            onClick={handleOpenSurprise}
            title="Sortear um filme aleatório para assistir agora"
            className="flex items-center gap-1.5 rounded-full border border-rule bg-panel px-3 py-1.5 text-xs font-bold text-ink hover:border-brand hover:bg-brand/10 transition-all shadow-sm"
          >
            <span>🎲</span>
            <span className="hidden md:inline">Surpreenda-me</span>
          </button>

          {/* Sino de Notificações */}
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => setShowNotifications((v) => !v)}
              title="Novidades e Lançamentos"
              className="relative flex h-8 w-8 items-center justify-center rounded-full border border-rule bg-panel text-sm text-mute hover:border-brand hover:text-ink transition-all"
            >
              <span>🔔</span>
              {recentMovies.length > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-brand text-[9px] font-black text-white shadow">
                  {recentMovies.length}
                </span>
              )}
            </button>

            {showNotifications && (
              <div className="absolute right-0 top-11 w-72 sm:w-80 rounded-2xl border border-rule bg-panel p-3 shadow-2xl z-50 animate-fade-in space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-mute border-b border-rule/50 pb-2 px-1">
                  Novidades da Semana 🍿
                </p>
                <div className="space-y-1.5 max-h-72 overflow-y-auto">
                  {recentMovies.map((m) => {
                    const thumb = m.thumbnail_filename
                      ? api.thumbnailUrl(m.id)
                      : m.backdrop_filename
                      ? api.backdropUrl(m.id)
                      : null;
                    return (
                      <Link
                        key={m.id}
                        href={`/watch/${m.id}`}
                        onClick={() => setShowNotifications(false)}
                        className="flex items-center gap-3 rounded-xl p-2 hover:bg-panel2 transition-colors"
                      >
                        <div className="h-12 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-panel2">
                          {thumb ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={thumb}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : null}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-bold text-ink">{m.title}</p>
                          <p className="text-[10px] text-brand2 font-semibold">Novo no Catálogo</p>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Toggle Modo TV */}
          <button
            onClick={toggleTVMode}
            title={isTVMode ? "Desativar Modo TV" : "Ativar Modo TV (Controle Remoto)"}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-all ${
              isTVMode
                ? "bg-brand text-white ring-2 ring-brand/50"
                : "bg-panel border border-rule text-mute hover:text-ink hover:border-brand"
            }`}
          >
            <span>📺</span>
            <span className="hidden sm:inline">{isTVMode ? "Modo TV Ativo" : "Modo TV"}</span>
          </button>

          {/* Perfil Familiar Ativo */}
          {activeProfile && (
            <button
              onClick={switchProfile}
              title="Clique para trocar de perfil"
              className="flex items-center gap-2 rounded-full border border-rule bg-panel p-1 pr-3 transition-all hover:border-brand"
            >
              <span
                className="flex h-7 w-7 items-center justify-center rounded-full text-sm shadow"
                style={{ backgroundColor: activeProfile.avatarColor }}
              >
                {activeProfile.avatarIcon}
              </span>
              <span className="hidden text-xs font-semibold text-ink sm:inline">
                {activeProfile.name}
              </span>
            </button>
          )}
        </div>
      </header>

      {/* Roleta Surpreenda-me Modal */}
      <SurpriseModal
        isOpen={showSurprise}
        movies={surprisePool}
        onClose={() => setShowSurprise(false)}
      />
    </>
  );
}
