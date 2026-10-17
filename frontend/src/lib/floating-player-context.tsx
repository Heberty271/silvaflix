"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
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

  const startFloating = useCallback((movie: Movie, currentTime: number, isPlaying: boolean) => {
    setState({
      activeMovie: movie,
      currentTime,
      isPlaying,
      isVisible: true,
    });
  }, []);

  const closeFloating = useCallback(() => {
    setState((prev) => {
      if (!prev.isVisible && !prev.activeMovie) return prev;
      return { ...prev, isVisible: false, activeMovie: null };
    });
  }, []);

  const setFloatingPlaying = useCallback((isPlaying: boolean) => {
    setState((prev) => (prev.isPlaying === isPlaying ? prev : { ...prev, isPlaying }));
  }, []);

  const setFloatingTime = useCallback((currentTime: number) => {
    setState((prev) => (prev.currentTime === currentTime ? prev : { ...prev, currentTime }));
  }, []);

  const value = useMemo(
    () => ({
      state,
      startFloating,
      closeFloating,
      setFloatingPlaying,
      setFloatingTime,
    }),
    [state, startFloating, closeFloating, setFloatingPlaying, setFloatingTime]
  );

  return (
    <FloatingPlayerContext.Provider value={value}>
      {children}
    </FloatingPlayerContext.Provider>
  );
}

export function useFloatingPlayer() {
  return useContext(FloatingPlayerContext);
}

