"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type ThemeName = "cinema" | "amoled" | "cyberpunk" | "emerald" | "sunset";

export interface ThemeOption {
  id: ThemeName;
  name: string;
  emoji: string;
  primaryColor: string;
  bgColor: string;
}

export const THEMES: ThemeOption[] = [
  { id: "cinema", name: "Cinema Clássico", emoji: "🎬", primaryColor: "#E11D34", bgColor: "#0A0A0C" },
  { id: "amoled", name: "Midnight AMOLED", emoji: "🌌", primaryColor: "#E50914", bgColor: "#000000" },
  { id: "cyberpunk", name: "Cyber Neon", emoji: "💜", primaryColor: "#A855F7", bgColor: "#0D0918" },
  { id: "emerald", name: "Emerald Luxury", emoji: "🌿", primaryColor: "#10B981", bgColor: "#04140E" },
  { id: "sunset", name: "Sunset Gold", emoji: "🌅", primaryColor: "#F97316", bgColor: "#140A08" },
];

interface ThemeContextType {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
  themes: ThemeOption[];
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "cinema",
  setTheme: () => {},
  themes: THEMES,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>("cinema");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("silvaflix_theme") as ThemeName;
      if (saved && THEMES.some((t) => t.id === saved)) {
        setThemeState(saved);
        document.documentElement.setAttribute("data-theme", saved);
      }
    } catch {
      // Ignore
    }
  }, []);

  const setTheme = (newTheme: ThemeName) => {
    setThemeState(newTheme);
    try {
      localStorage.setItem("silvaflix_theme", newTheme);
      document.documentElement.setAttribute("data-theme", newTheme);
    } catch {
      // Ignore
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, themes: THEMES }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

