"use client";

import { createContext, useContext, useState } from "react";
import { Movie } from "./api";

interface FloatingPlayerState {
  activeMovie: Movie | null;
  currentTime: number;
  isPlaying: boolean;
  isVisible: boolean;
}

interface FloatingPlayerContextType {
  state: FloatingPlayerState;
  startFloating: (movie: Movie, currentTime: number, isPlaying: boolean) => void;
  closeFloating: () => void;
  setFloatingPlaying: (isPlaying: boolean) => void;
  setFloatingTime: (time: number) => void;
}

const FloatingPlayerContext = createContext<FloatingPlayerContextType>({
  state: { activeMovie: null, currentTime: 0, isPlaying: false, isVisible: false },
  startFloating: () => {},
  closeFloating: () => {},
  setFloatingPlaying: () => {},
  setFloatingTime: () => {},
});

export function FloatingPlayerProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<FloatingPlayerState>({
    activeMovie: null,
    currentTime: 0,
    isPlaying: false,
    isVisible: false,
  });

  const startFloating = (movie: Movie, currentTime: number, isPlaying: boolean) => {
    setState({
      activeMovie: movie,
      currentTime,
      isPlaying,
      isVisible: true,
    });
  };

  const closeFloating = () => {
    setState((prev) => ({ ...prev, isVisible: false, activeMovie: null }));
  };

  const setFloatingPlaying = (isPlaying: boolean) => {
    setState((prev) => ({ ...prev, isPlaying }));
  };

  const setFloatingTime = (currentTime: number) => {
    setState((prev) => ({ ...prev, currentTime }));
  };

  return (
    <FloatingPlayerContext.Provider
      value={{
        state,
        startFloating,
        closeFloating,
        setFloatingPlaying,
        setFloatingTime,
      }}
    >
      {children}
    </FloatingPlayerContext.Provider>
  );
}

export function useFloatingPlayer() {
  return useContext(FloatingPlayerContext);
}

