"use client";

import React, { useState } from "react";
import {
  useProfile,
  AVATAR_COLORS,
  AVATAR_ICONS,
  Profile,
} from "@/lib/profile-context";

export function ProfileSelector() {
  const {
    profiles,
    selectProfile,
    createProfile,
    deleteProfile,
    isSelectingProfile,
  } = useProfile();

  const [isManaging, setIsManaging] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [selectedColor, setSelectedColor] = useState(AVATAR_COLORS[0]);
  const [selectedIcon, setSelectedIcon] = useState(AVATAR_ICONS[0]);
  const [isKids, setIsKids] = useState(false);

  if (!isSelectingProfile) return null;

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    createProfile(newName, selectedColor, selectedIcon, isKids);
    setNewName("");
    setIsKids(false);
    setIsAdding(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-void/95 px-4 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-2xl text-center">
        {!isAdding ? (
          <>
            <h1 className="text-3xl font-black tracking-tight text-ink sm:text-5xl">
              Quem está assistindo?
            </h1>
            <p className="mt-2 text-sm text-mute">
              Escolha seu perfil para continuar
            </p>

            <div className="mt-10 flex flex-wrap items-center justify-center gap-6 sm:gap-8">
              {profiles.map((p) => (
                <div
                  key={p.id}
                  className="group flex flex-col items-center gap-3 cursor-pointer"
                >
                  <button
                    onClick={() => {
                      if (isManaging) {
                        deleteProfile(p.id);
                      } else {
                        selectProfile(p);
                      }
                    }}
                    className="relative flex h-24 w-24 sm:h-32 sm:w-32 items-center justify-center rounded-2xl text-4xl sm:text-5xl shadow-2xl transition-all group-hover:scale-105 group-focus-visible:scale-105"
                    style={{ backgroundColor: p.avatarColor }}
                  >
                    <span>{p.avatarIcon}</span>
                    {p.isKids && (
                      <span className="absolute -bottom-2 -right-2 rounded-full bg-brand px-2 py-0.5 text-[10px] font-black uppercase text-white shadow">
                        Kids
                      </span>
                    )}
                    {isManaging && profiles.length > 1 && (
                      <span className="absolute -top-2 -right-2 flex h-7 w-7 items-center justify-center rounded-full bg-brand2 text-xs font-bold text-white shadow">
                        ✕
                      </span>
                    )}
                  </button>
                  <span className="text-sm font-semibold text-mute group-hover:text-ink sm:text-base">
                    {p.name}
                  </span>
                </div>
              ))}

              {/* Botão Adicionar Perfil */}
              <div className="flex flex-col items-center gap-3">
                <button
                  onClick={() => setIsAdding(true)}
                  aria-label="Adicionar Perfil"
                  className="flex h-24 w-24 sm:h-32 sm:w-32 items-center justify-center rounded-2xl border-2 border-dashed border-rule bg-panel text-3xl text-mute transition-all hover:border-brand hover:text-ink hover:scale-105"
                >
                  ＋
                </button>
                <span className="text-sm font-semibold text-mute sm:text-base">
                  Adicionar
                </span>
              </div>
            </div>

            <div className="mt-12">
              <button
                onClick={() => setIsManaging((v) => !v)}
                className="rounded-lg border border-rule px-6 py-2 text-xs font-bold uppercase tracking-wider text-mute hover:border-brand hover:text-ink"
              >
                {isManaging ? "Concluído" : "Gerenciar Perfis"}
              </button>
            </div>
          </>
        ) : (
          /* Formulário de Criação de Perfil */
          <form
            onSubmit={handleCreate}
            className="mx-auto max-w-md rounded-2xl border border-rule bg-panel p-6 text-left shadow-2xl"
          >
            <h2 className="text-xl font-bold text-ink sm:text-2xl">
              Criar Perfil
            </h2>
            <p className="text-xs text-mute mt-1">
              Personalize o nome e o avatar para este perfil
            </p>

            <div className="mt-5">
              <label className="block text-xs font-semibold text-mute uppercase">
                Nome
              </label>
              <input
                type="text"
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ex: Maria, Carlos..."
                className="input mt-1"
                autoFocus
              />
            </div>

            {/* Escolha de Ícone */}
            <div className="mt-5">
              <label className="block text-xs font-semibold text-mute uppercase mb-2">
                Escolha um Ícone
              </label>
              <div className="flex flex-wrap gap-2">
                {AVATAR_ICONS.map((icon) => (
                  <button
                    key={icon}
                    type="button"
                    onClick={() => setSelectedIcon(icon)}
                    className={`flex h-10 w-10 items-center justify-center rounded-lg text-xl transition-transform hover:scale-110 ${
                      selectedIcon === icon
                        ? "bg-brand text-white ring-2 ring-brand"
                        : "bg-panel2"
                    }`}
                  >
                    {icon}
                  </button>
                ))}
              </div>
            </div>

            {/* Escolha de Cor */}
            <div className="mt-5">
              <label className="block text-xs font-semibold text-mute uppercase mb-2">
                Escolha a Cor
              </label>
              <div className="flex gap-3">
                {AVATAR_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setSelectedColor(c)}
                    className={`h-8 w-8 rounded-full transition-transform hover:scale-110 ${
                      selectedColor === c ? "ring-4 ring-white" : ""
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            {/* Perfil Infantil */}
            <div className="mt-6 flex items-center justify-between rounded-lg bg-panel2 p-3">
              <div>
                <p className="text-sm font-semibold text-ink">Perfil Infantil?</p>
                <p className="text-xs text-mute">
                  Oculta filmes para maiores e conteúdos privados
                </p>
              </div>
              <input
                type="checkbox"
                checked={isKids}
                onChange={(e) => setIsKids(e.target.checked)}
                className="h-5 w-5 accent-brand cursor-pointer"
              />
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="submit"
                className="flex-1 rounded-lg bg-brand py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              >
                Salvar Perfil
              </button>
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="rounded-lg border border-rule px-4 py-2.5 text-sm font-semibold text-mute hover:text-ink"
              >
                Cancelar
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

