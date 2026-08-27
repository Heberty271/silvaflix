"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth-context";

export function Navbar() {
  const { user, logout } = useAuth();

  return (
    <header className="sticky top-0 z-30 bg-void/90 backdrop-blur border-b border-rule">
      <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <span className="font-display italic text-2xl text-marquee marquee-glow">
            Cine
          </span>
          <span className="font-display text-2xl">em Casa</span>
        </Link>

        {user && (
          <nav className="flex items-center gap-6 text-sm">
            <Link href="/" className="text-mute hover:text-ink transition-colors">
              Catalogo
            </Link>
            {user.role === "admin" && (
              <Link
                href="/admin"
                className="text-mute hover:text-ink transition-colors"
              >
                Gerenciar
              </Link>
            )}
            <span className="hidden sm:inline text-mute">
              Ola, <span className="text-ink">{user.name}</span>
            </span>
            <button
              onClick={logout}
              className="rounded-full border border-rule px-4 py-1.5 text-ink hover:border-marquee hover:text-marquee transition-colors"
            >
              Sair
            </button>
          </nav>
        )}
      </div>
    </header>
  );
}
