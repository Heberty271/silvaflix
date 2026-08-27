"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

interface TVContextType {
  isTVMode: boolean;
  toggleTVMode: () => void;
  setTVMode: (val: boolean) => void;
}

const TVContext = createContext<TVContextType>({
  isTVMode: false,
  toggleTVMode: () => {},
  setTVMode: () => {},
});

const TV_STORAGE_KEY = "silvaflix_tv_mode";

export function TVProvider({ children }: { children: React.ReactNode }) {
  const [isTVMode, setIsTVMode] = useState<boolean>(false);

  useEffect(() => {
    // 1. Detectar se foi salvo no localStorage
    const saved = localStorage.getItem(TV_STORAGE_KEY);
    if (saved !== null) {
      setIsTVMode(saved === "true");
      return;
    }

    // 2. Auto-detectar Smart TV pelo User-Agent
    if (typeof window !== "undefined") {
      const ua = navigator.userAgent.toLowerCase();
      const isTV =
        ua.includes("tizen") ||
        ua.includes("webos") ||
        ua.includes("smart-tv") ||
        ua.includes("smarttv") ||
        ua.includes("googletv") ||
        ua.includes("appletv") ||
        ua.includes("hbbtv") ||
        ua.includes("crkey") ||
        ua.includes("android tv") ||
        ua.includes("aftt") || // Fire TV
        ua.includes("aftm");

      if (isTV) {
        setIsTVMode(true);
        localStorage.setItem(TV_STORAGE_KEY, "true");
      }
    }
  }, []);

  const toggleTVMode = () => {
    setIsTVMode((prev) => {
      const next = !prev;
      localStorage.setItem(TV_STORAGE_KEY, String(next));
      return next;
    });
  };

  const setTVMode = (val: boolean) => {
    setIsTVMode(val);
    localStorage.setItem(TV_STORAGE_KEY, String(val));
  };

  // Suporte a Navegação por Teclado / Controle Remoto (D-Pad)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Ignorar se estiver digitando em um campo de texto
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      // Se pressionar setas do controle na TV, ativa o modo TV automaticamente
      const tvKeys = [
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "Enter",
      ];
      if (tvKeys.includes(e.key) && !isTVMode) {
        // Se ainda não estava ativo, podemos ativar o estilo de foco
      }

      // Scroll suave automático ao focar em qualquer elemento com o teclado
      setTimeout(() => {
        const active = document.activeElement as HTMLElement;
        if (active && active !== document.body) {
          active.scrollIntoView({
            behavior: "smooth",
            block: "nearest",
            inline: "center",
          });
        }
      }, 50);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isTVMode]);

  return (
    <TVContext.Provider value={{ isTVMode, toggleTVMode, setTVMode }}>
      <div className={isTVMode ? "tv-mode-active" : ""}>{children}</div>
    </TVContext.Provider>
  );
}

export function useTV() {
  return useContext(TVContext);
}

