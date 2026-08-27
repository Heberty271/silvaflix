"use client";

/**
 * Progresso de "continuar assistindo", guardado no navegador (localStorage) por perfil familiar.
 */

export interface ProgressEntry {
  movieId: number;
  currentTime: number;
  duration: number;
  updatedAt: number;
}

function getKey(): string {
  if (typeof window === "undefined") return "silvaflix_progress_default";
  const profileId = window.localStorage.getItem("silvaflix_active_profile_id") || "default";
  return `silvaflix_progress_${profileId}`;
}

function readAll(): Record<number, ProgressEntry> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(getKey());
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeAll(data: Record<number, ProgressEntry>) {
  window.localStorage.setItem(getKey(), JSON.stringify(data));
}

export function getProgress(movieId: number): ProgressEntry | null {
  return readAll()[movieId] || null;
}

export function setProgress(movieId: number, currentTime: number, duration: number) {
  if (!duration || !isFinite(duration)) return;
  const all = readAll();

  // Filme com mais de 95% assistido conta como concluído
  if (currentTime / duration > 0.95) {
    delete all[movieId];
  } else {
    all[movieId] = { movieId, currentTime, duration, updatedAt: Date.now() };
  }
  writeAll(all);
}

export function removeProgress(movieId: number) {
  const all = readAll();
  delete all[movieId];
  writeAll(all);
}

export function listProgress(): ProgressEntry[] {
  return Object.values(readAll()).sort((a, b) => b.updatedAt - a.updatedAt);
}
