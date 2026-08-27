"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

export interface Profile {
  id: string;
  name: string;
  avatarColor: string;
  avatarIcon: string;
  isKids: boolean;
}

export const AVATAR_COLORS = [
  "#E11D34", // Brand Red
  "#3B82F6", // Blue
  "#10B981", // Emerald
  "#8B5CF6", // Purple
  "#F59E0B", // Amber
  "#EC4899", // Pink
  "#06B6D4", // Cyan
];

export const AVATAR_ICONS = ["🍿", "🚀", "👑", "🎬", "🐼", "🦁", "🎮", "🦄", "⚡", "🦊", "🎧", "⭐"];

interface ProfileContextType {
  profiles: Profile[];
  activeProfile: Profile | null;
  selectProfile: (profile: Profile) => void;
  createProfile: (name: string, avatarColor: string, avatarIcon: string, isKids: boolean) => void;
  deleteProfile: (id: string) => void;
  switchProfile: () => void;
  isSelectingProfile: boolean;
}

const ProfileContext = createContext<ProfileContextType>({
  profiles: [],
  activeProfile: null,
  selectProfile: () => {},
  createProfile: () => {},
  deleteProfile: () => {},
  switchProfile: () => {},
  isSelectingProfile: false,
});

const PROFILES_STORAGE_KEY = "silvaflix_family_profiles";
const ACTIVE_PROFILE_KEY = "silvaflix_active_profile_id";

const DEFAULT_PROFILES: Profile[] = [
  {
    id: "profile_1",
    name: "Família",
    avatarColor: "#E11D34",
    avatarIcon: "🍿",
    isKids: false,
  },
  {
    id: "profile_2",
    name: "Kids",
    avatarColor: "#10B981",
    avatarIcon: "🐼",
    isKids: true,
  },
];

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfile, setActiveProfile] = useState<Profile | null>(null);
  const [isSelectingProfile, setIsSelectingProfile] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(PROFILES_STORAGE_KEY);
      let initialProfiles: Profile[] = DEFAULT_PROFILES;
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          initialProfiles = parsed;
        }
      } else {
        localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(DEFAULT_PROFILES));
      }
      setProfiles(initialProfiles);

      const activeId = localStorage.getItem(ACTIVE_PROFILE_KEY);
      const found = initialProfiles.find((p) => p.id === activeId);
      if (found) {
        setActiveProfile(found);
      } else if (initialProfiles.length > 0) {
        setIsSelectingProfile(true);
      }
    } catch {
      setProfiles(DEFAULT_PROFILES);
    } finally {
      setLoaded(true);
    }
  }, []);

  const selectProfile = (profile: Profile) => {
    setActiveProfile(profile);
    setIsSelectingProfile(false);
    localStorage.setItem(ACTIVE_PROFILE_KEY, profile.id);
  };

  const switchProfile = () => {
    setIsSelectingProfile(true);
  };

  const createProfile = (
    name: string,
    avatarColor: string,
    avatarIcon: string,
    isKids: boolean
  ) => {
    const newProfile: Profile = {
      id: `profile_${Date.now()}`,
      name: name.trim() || "Novo Perfil",
      avatarColor: avatarColor || AVATAR_COLORS[0],
      avatarIcon: avatarIcon || "🎬",
      isKids,
    };
    const updated = [...profiles, newProfile];
    setProfiles(updated);
    localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(updated));
    selectProfile(newProfile);
  };

  const deleteProfile = (id: string) => {
    if (profiles.length <= 1) return; // manter ao menos 1 perfil
    const updated = profiles.filter((p) => p.id !== id);
    setProfiles(updated);
    localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(updated));
    if (activeProfile?.id === id) {
      selectProfile(updated[0]);
    }
  };

  return (
    <ProfileContext.Provider
      value={{
        profiles,
        activeProfile,
        selectProfile,
        createProfile,
        deleteProfile,
        switchProfile,
        isSelectingProfile,
      }}
    >
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  return useContext(ProfileContext);
}

