"use client";

import Link from "next/link";
import { Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

const NAV_ITEMS = [
  { label: "Início", href: "/", icon: "🏠" },
  { label: "Filmes", href: "/filmes", icon: "🎬" },
  { label: "Explorar & Busca", href: "/search", icon: "🔍" },
  { label: "Meu Perfil", href: "/profile", icon: "👤" },
  { label: "Minha Lista", href: "/minha-lista", icon: "＋" },
  { label: "Histórico", href: "/historico", icon: "🕘" },
];

const DISABLED_ITEMS = [{ label: "Ao vivo", icon: "📡" }];

const CATEGORIES = [
  "Ação",
  "Aventura",
  "Comédia",
  "Drama",
  "Ficção Científica",
  "Terror",
  "Romance",
  "Animação",
  "Documentário",
];

export function Sidebar() {
  return (
    <Suspense fallback={null}>
      <SidebarContent />
    </Suspense>
  );
}

function SidebarContent() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeGenre = searchParams.get("genre");

  if (!user) return null;

  return (
    <aside className="fixed left-0 top-0 z-40 hidden h-screen w-60 flex-col justify-between border-r border-rule bg-panel px-4 py-6 lg:flex">
      <div>
        <Link href="/" className="mb-8 block px-2">
          <span className="text-xl font-black tracking-tight">
            SILVA<span className="text-brand">FLIX</span>
          </span>
        </Link>

        <nav className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const active =
              pathname === item.href && (item.href !== "/filmes" || !activeGenre);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all ${
                  active
                    ? "bg-brand text-white shadow-md"
                    : "text-mute hover:bg-panel2 hover:text-ink"
                }`}
              >
                <span aria-hidden>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}

          {DISABLED_ITEMS.map((item) => (
            <div
              key={item.label}
              className="flex cursor-not-allowed items-center justify-between rounded-xl px-3 py-2 text-sm text-mute/50"
              title="Ainda não disponível nesta versão"
            >
              <span className="flex items-center gap-3">
                <span aria-hidden>{item.icon}</span>
                {item.label}
              </span>
              <span className="rounded-full bg-panel2 px-2 py-0.5 text-[10px]">
                em breve
              </span>
            </div>
          ))}
        </nav>

        <p className="mb-2 mt-8 px-3 text-xs uppercase tracking-wider text-mute">
          Categorias
        </p>
        <nav className="space-y-1">
          {CATEGORIES.map((genre) => (
            <Link
              key={genre}
              href={`/search?genre=${encodeURIComponent(genre)}`}
              className={`block truncate rounded-lg px-3 py-1.5 text-sm transition-colors ${
                activeGenre === genre
                  ? "bg-panel2 text-ink font-bold"
                  : "text-mute hover:bg-panel2 hover:text-ink"
              }`}
            >
              {genre}
            </Link>
          ))}
        </nav>
      </div>

      <div className="space-y-3 px-2">
        {user.role === "admin" && (
          <Link
            href="/admin"
            className="block rounded-xl border border-rule px-3 py-2 text-center text-sm font-semibold text-mute hover:border-brand hover:text-ink transition-all"
          >
            Gerenciar
          </Link>
        )}
        <div className="flex items-center justify-between">
          <span className="truncate text-sm text-mute">
            Olá, <span className="text-ink font-semibold">{user.name}</span>
          </span>
          <button
            onClick={logout}
            className="flex-shrink-0 text-sm font-semibold text-mute hover:text-brand transition-colors"
          >
            Sair
          </button>
        </div>
      </div>
    </aside>
  );
}
