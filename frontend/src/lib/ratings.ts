export type RatingType = "liked" | "loved" | "disliked";

export interface RatingRecord {
  movieId: number;
  rating: RatingType;
  updatedAt: number;
}

const STORAGE_KEY = "silvaflix_family_ratings";

function getAllRatings(): Record<string, Record<number, RatingType>> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveAllRatings(data: Record<string, Record<number, RatingType>>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore
  }
}

export function getProfileRating(movieId: number, profileId: string = "default"): RatingType | null {
  const all = getAllRatings();
  return all[profileId]?.[movieId] || null;
}

export function setProfileRating(
  movieId: number,
  rating: RatingType | null,
  profileId: string = "default"
) {
  const all = getAllRatings();
  if (!all[profileId]) {
    all[profileId] = {};
  }

  if (rating === null) {
    delete all[profileId][movieId];
  } else {
    all[profileId][movieId] = rating;
  }

  saveAllRatings(all);
}

export function getProfileFavoriteIds(profileId: string = "default"): number[] {
  const all = getAllRatings();
  const profileRatings = all[profileId] || {};
  return Object.entries(profileRatings)
    .filter(([_, r]) => r === "loved" || r === "liked")
    .map(([id]) => Number(id));
}

