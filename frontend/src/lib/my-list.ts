"use client";

/**
 * "Minha lista" - guardado no navegador (localStorage) por perfil familiar ativo.
 */

function getKey(): string {
  if (typeof window === "undefined") return "silvaflix_my_list_default";
  const profileId = window.localStorage.getItem("silvaflix_active_profile_id") || "default";
  return `silvaflix_my_list_${profileId}`;
}

function readAll(): number[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(getKey());
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeAll(ids: number[]) {
  window.localStorage.setItem(getKey(), JSON.stringify(ids));
}

export function getMyList(): number[] {
  return readAll();
}

export function isInMyList(movieId: number): boolean {
  return readAll().includes(movieId);
}

export function toggleMyList(movieId: number): boolean {
  const all = readAll();
  const idx = all.indexOf(movieId);
  if (idx >= 0) {
    all.splice(idx, 1);
    writeAll(all);
    return false;
  }
  all.push(movieId);
  writeAll(all);
  return true;
}
