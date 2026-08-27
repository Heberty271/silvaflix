"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useProfile } from "@/lib/profile-context";
import { useTheme } from "@/lib/theme-context";
import { api, Movie } from "@/lib/api";
import { AppShell } from "@/components/AppShell";
import { listProgress } from "@/lib/watch-progress";
import { getProfileFavoriteIds } from "@/lib/ratings";

export default function ProfilePage() {
  const { user } = useAuth();
  const { activeProfile, switchProfile } = useProfile();
  const { theme, setTheme, themes } = useTheme();
  const { token } = useAuth();

  const [movies, setMovies] = useState<Movie[]>([]);
  const [totalMinutesWatched, setTotalMinutesWatched] = useState(0);

  useEffect(() => {
    if (!token) return;
    api.listMovies(token).then((all) => {
      setMovies(all);
      const progress = listProgress();
      let totalSecs = 0;
      progress.forEach((p) => {
        totalSecs += p.currentTime;
      });
      setTotalMinutesWatched(Math.floor(totalSecs / 60));
    });
  }, [token]);

  const historyEntries = listProgress();
  const favoriteIds = getProfileFavoriteIds(activeProfile?.id);

  // Conquistas Desbloqueadas
  const achievements = [
    {
      id: "first_session",
      title: "Primeira Sessão 🍿",
      desc: "Assistiu ao seu primeiro filme no SilvaFlix",
      unlocked: historyEntries.length > 0,
      icon: "🍿",
    },
    {
      id: "marathon",
      title: "Maratonista da Família 🏆",
      desc: "Assistiu a mais de 3 produções no catálogo",
      unlocked: historyEntries.length >= 3,
      icon: "🏆",
    },
    {
      id: "critic",
      title: "Crítico da Casa 🎬",
      desc: "Marcou seus filmes favoritos com reações",
      unlocked: favoriteIds.length > 0,
      icon: "⭐",
    },
    {
      id: "franchise",
      title: "Mestre das Sagas 🏛️",
      desc: "Explorou franquias e coleções completas",
      unlocked: movies.some((m) => m.collection_name),
      icon: "🏛️",
    },
    {
      id: "vip",
      title: "Cinéfilo VIP 👑",
      desc: "Acumulou mais de 1 hora de entretenimento",
      unlocked: totalMinutesWatched >= 60,
      icon: "👑",
    },
  ];

  const totalHours = (totalMinutesWatched / 60).toFixed(1);

  return (
    <AppShell showSearch={false}>
      <div className="px-4 py-8 lg:px-8 max-w-5xl mx-auto space-y-8">
        {/* Cartão de Perfil */}
        <div className="flex flex-wrap items-center justify-between gap-6 rounded-2xl border border-rule bg-panel p-6 shadow-card">
          <div className="flex items-center gap-4">
            <span
              className="flex h-20 w-20 items-center justify-center rounded-2xl text-4xl shadow-xl ring-4 ring-brand/30"
              style={{ backgroundColor: activeProfile?.avatarColor || "#E11D34" }}
            >
              {activeProfile?.avatarIcon || "🍿"}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black text-ink">
                  {activeProfile?.name || "Meu Perfil"}
                </h1>
                {activeProfile?.isKids && (
                  <span className="rounded-full bg-brand/20 px-2.5 py-0.5 text-xs font-black text-brand2 border border-brand/30">
                    KIDS
                  </span>
                )}
              </div>
              <p className="text-xs text-mute mt-0.5">
                Conta: <strong className="text-ink">{user?.name}</strong> ({user?.email})
              </p>
            </div>
          </div>

          <button
            onClick={switchProfile}
            className="rounded-xl border border-rule bg-panel2 px-5 py-2.5 text-xs font-bold text-ink hover:border-brand transition-all shadow"
          >
            Trocar de Perfil
          </button>
        </div>

        {/* Escolha de Tema Visual */}
        <section className="rounded-2xl border border-rule bg-panel p-6 shadow-card space-y-4">
          <div>
            <h2 className="text-lg font-black text-ink">Personalizar Tema Visual</h2>
            <p className="text-xs text-mute">
              Escolha a paleta de cores perfeita para o seu monitor ou Smart TV.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
            {themes.map((t) => {
              const active = theme === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTheme(t.id)}
                  className={`flex flex-col items-center gap-2 rounded-xl border p-4 text-center transition-all ${
                    active
                      ? "border-brand bg-brand/10 ring-2 ring-brand/50 scale-105"
                      : "border-rule bg-panel2 hover:border-brand/50"
                  }`}
                >
                  <span className="text-2xl">{t.emoji}</span>
                  <p className="text-xs font-bold text-ink">{t.name}</p>
                  <div className="flex gap-1.5 mt-1">
                    <span
                      className="h-3 w-3 rounded-full shadow"
                      style={{ backgroundColor: t.primaryColor }}
                    />
                    <span
                      className="h-3 w-3 rounded-full border border-rule"
                      style={{ backgroundColor: t.bgColor }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Estatísticas do Perfil */}
        <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-2xl border border-rule bg-panel p-5 shadow-card">
            <p className="text-xs font-bold uppercase tracking-wider text-mute">Tempo Assistido</p>
            <p className="mt-2 text-3xl font-black text-brand2">{totalHours}h</p>
          </div>
          <div className="rounded-2xl border border-rule bg-panel p-5 shadow-card">
            <p className="text-xs font-bold uppercase tracking-wider text-mute">Títulos Iniciados</p>
            <p className="mt-2 text-3xl font-black text-emerald-400">{historyEntries.length}</p>
          </div>
          <div className="rounded-2xl border border-rule bg-panel p-5 shadow-card">
            <p className="text-xs font-bold uppercase tracking-wider text-mute">Favoritos ❤️</p>
            <p className="mt-2 text-3xl font-black text-rose-400">{favoriteIds.length}</p>
          </div>
          <div className="rounded-2xl border border-rule bg-panel p-5 shadow-card">
            <p className="text-xs font-bold uppercase tracking-wider text-mute">Conquistas</p>
            <p className="mt-2 text-3xl font-black text-amber-400">
              {achievements.filter((a) => a.unlocked).length} / {achievements.length}
            </p>
          </div>
        </section>

        {/* Conquistas da Família */}
        <section className="rounded-2xl border border-rule bg-panel p-6 shadow-card space-y-4">
          <div>
            <h2 className="text-lg font-black text-ink">Medalhas & Conquistas</h2>
            <p className="text-xs text-mute">
              Desbloqueie conquistas exclusivas maratonando filmes e interagindo com o catálogo.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {achievements.map((ach) => (
              <div
                key={ach.id}
                className={`flex items-center gap-3.5 rounded-xl border p-4 transition-all ${
                  ach.unlocked
                    ? "border-amber-500/40 bg-amber-500/10 shadow-card"
                    : "border-rule bg-panel2/50 opacity-50 grayscale"
                }`}
              >
                <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-panel2 text-2xl shadow">
                  {ach.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-ink flex items-center justify-between">
                    <span>{ach.title}</span>
                    {ach.unlocked && (
                      <span className="text-[10px] font-black uppercase text-amber-400">
                        ✓ Desbloqueada
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] text-mute mt-0.5">{ach.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}

