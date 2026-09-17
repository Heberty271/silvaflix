const NPOINT_BRIDGE_URL = "https://api.npoint.io/a008871770ac1c671939";

let cachedApiUrl: string =
  (typeof window !== "undefined" && window.localStorage.getItem("silvaflix_api_url")) ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";

let syncPromise: Promise<string> | null = null;

export async function syncApiUrl(force = false): Promise<string> {
  if (syncPromise && !force) return syncPromise;

  syncPromise = (async () => {
    try {
      const res = await fetch(NPOINT_BRIDGE_URL, {
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.url && typeof data.url === "string" && data.url.startsWith("http")) {
          cachedApiUrl = data.url.replace(/\/$/, "");
          if (typeof window !== "undefined") {
            window.localStorage.setItem("silvaflix_api_url", cachedApiUrl);
          }
        }
      }
    } catch {
      // fallback to cachedApiUrl
    }
    return cachedApiUrl;
  })();

  return syncPromise;
}

// Initial background sync in browser
if (typeof window !== "undefined") {
  syncApiUrl();
}

export function getApiUrl(): string {
  if (typeof window !== "undefined") {
    const stored = window.localStorage.getItem("silvaflix_api_url");
    if (stored) return stored;
  }
  return cachedApiUrl;
}

export type Role = "admin" | "viewer";

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
}

export interface Movie {
  id: number;
  title: string;
  synopsis: string;
  year: number | null;
  genre: string | null;
  duration_minutes: number | null;
  director: string | null;
  cast: string | null;
  thumbnail_filename: string | null;
  backdrop_filename: string | null;
  is_private: boolean;
  is_featured: boolean;
  is_series?: boolean;
  series_title?: string | null;
  season_number?: number | null;
  episode_number?: number | null;
  episode_title?: string | null;
  collection_name?: string | null;
  trailer_youtube_id?: string | null;
  created_at: string;
}

export interface MovieCollection {
  name: string;
  count: number;
  movies: Movie[];
}

export interface AdminStats {
  total_movies: number;
  total_episodes: number;
  total_duration_hours: number;
  genres_count: Record<string, number>;
  top_genre: string;
  total_titles: number;
}

export interface Review {
  id: number;
  movie_id: number;
  user_id: number;
  user_name: string;
  profile_name?: string | null;
  rating: number;
  comment: string;
  has_spoiler: boolean;
  created_at: string;
}

export interface AudioTrack {
  index: number;
  stream_id: number;
  language: string;
  language_name: string;
  flag: string;
  title: string;
  codec: string;
}

export interface TMDBSearchResult {
  tmdb_id: number;
  title: string;
  year: string | null;
  poster_url: string | null;
  overview: string;
}

export interface AutoScanResponse {
  scanned: number;
  added: number;
  skipped: number;
  results: Array<{
    filename: string;
    title?: string;
    status: string;
    movie_id?: number;
    error?: string;
  }>;
}

export interface ChatMessage {
  id: string;
  user: string;
  text: string;
  timestamp: number;
  is_system?: boolean;
}

export interface RoomState {
  room_id: string;
  movie_id: number;
  host_name: string;
  current_time: number;
  is_playing: boolean;
  last_sync: number;
  messages: ChatMessage[];
}

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null,
  isRetry = false
): Promise<T> {
  await syncApiUrl();
  let baseUrl = getApiUrl();
  const headers: Record<string, string> = {
    "bypass-tunnel-reminder": "true",
    "Bypass-Tunnel-Reminder": "true",
    ...(options.headers as Record<string, string>),
  };
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, { ...options, headers });
  } catch {
    // If request failed (e.g. backend restarted with a new link), refresh from npoint and retry once!
    if (!isRetry) {
      try {
        baseUrl = await syncApiUrl(true);
        return await request<T>(path, options, token, true);
      } catch {
        // continue to throw below
      }
    }
    throw new ApiError(
      `Não foi possível conectar ao servidor (${baseUrl}). Verifique se o SilvaFlix está rodando.`,
      0
    );
  }

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const data = await res.json();
      detail = data.detail || detail;
    } catch {
      // ignore
    }
    throw new ApiError(detail, res.status);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  login: (email: string, password: string) =>
    request<{ access_token: string; token_type: string; user: User }>(
      "/auth/login",
      { method: "POST", body: JSON.stringify({ email, password }) }
    ),

  me: (token: string) => request<User>("/auth/me", {}, token),

  listMovies: (token: string) => request<Movie[]>("/movies", {}, token),

  listCollections: (token: string) =>
    request<MovieCollection[]>("/movies/collections", {}, token),

  getMovie: (id: number, token: string) =>
    request<Movie>(`/movies/${id}`, {}, token),

  getAudioTracks: (id: number, token: string) =>
    request<AudioTrack[]>(`/movies/${id}/audio-tracks`, {}, token),

  streamUrl: (id: number, token?: string | null, audioTrack?: number) => {
    const params = new URLSearchParams();
    if (token) params.set("token", token);
    if (typeof audioTrack === "number" && audioTrack > 0) {
      params.set("audio_track", String(audioTrack));
    }
    const qs = params.toString();
    return `${getApiUrl()}/movies/${id}/stream${qs ? `?${qs}` : ""}`;
  },

  thumbnailUrl: (id: number) => `${getApiUrl()}/movies/${id}/thumbnail`,
  backdropUrl: (id: number) => `${getApiUrl()}/movies/${id}/backdrop`,
  subtitleUrl: (id: number) => `${getApiUrl()}/movies/${id}/subtitles`,

  getMovieTrailer: (movieId: number, token: string) =>
    request<{ trailer_youtube_id: string | null }>(`/movies/${movieId}/trailer`, {}, token),

  // --- Reviews Familiares ---
  listReviews: (movieId: number, token: string) =>
    request<Review[]>(`/movies/${movieId}/reviews`, {}, token),

  createReview: (
    movieId: number,
    payload: { rating: number; comment: string; has_spoiler?: boolean; profile_name?: string },
    token: string
  ) =>
    request<Review>(
      `/movies/${movieId}/reviews`,
      { method: "POST", body: JSON.stringify(payload) },
      token
    ),

  deleteReview: (movieId: number, reviewId: number, token: string) =>
    request<{ ok: boolean }>(
      `/movies/${movieId}/reviews/${reviewId}`,
      { method: "DELETE" },
      token
    ),

  // --- Watch Party ---
  createWatchParty: (movieId: number, hostName: string) =>
    request<RoomState>("/party/rooms", {
      method: "POST",
      body: JSON.stringify({ movie_id: movieId, host_name: hostName }),
    }),

  getWatchParty: (roomId: string) =>
    request<RoomState>(`/party/rooms/${roomId}`),

  getPartyWsUrl: (roomId: string) => {
    const baseUrl = getApiUrl();
    const wsProto = baseUrl.startsWith("https") ? "wss" : "ws";
    const cleanUrl = baseUrl.replace(/^https?:\/\//, "");
    return `${wsProto}://${cleanUrl}/party/ws/${roomId}`;
  },

  // --- admin ---
  getAdminStats: (token: string) =>
    request<AdminStats>("/admin/stats", {}, token),

  availableFiles: (token: string) =>
    request<string[]>("/admin/movies/available-files", {}, token),

  autoScanMovies: (token: string) =>
    request<AutoScanResponse>("/admin/movies/auto-scan", { method: "POST" }, token),

  createMovie: (
    payload: {
      title: string;
      synopsis: string;
      year?: number;
      genre?: string;
      duration_minutes?: number;
      director?: string;
      cast?: string;
      filename: string;
      is_private: boolean;
      is_series?: boolean;
      series_title?: string;
      season_number?: number;
      episode_number?: number;
      episode_title?: string;
      collection_name?: string;
      trailer_youtube_id?: string;
    },
    token: string
  ) =>
    request<Movie>(
      "/admin/movies",
      { method: "POST", body: JSON.stringify(payload) },
      token
    ),

  updateMovie: (
    id: number,
    payload: Partial<{
      title: string;
      synopsis: string;
      year: number;
      genre: string;
      duration_minutes: number;
      director: string;
      cast: string;
      is_private: boolean;
      is_featured: boolean;
      is_series: boolean;
      series_title: string;
      season_number: number;
      episode_number: number;
      episode_title: string;
      collection_name: string;
      trailer_youtube_id: string;
    }>,
    token: string
  ) =>
    request<Movie>(
      `/admin/movies/${id}`,
      { method: "PUT", body: JSON.stringify(payload) },
      token
    ),

  togglePrivacy: (id: number, token: string) =>
    request<Movie>(
      `/admin/movies/${id}/toggle-privacy`,
      { method: "PATCH" },
      token
    ),

  deleteMovie: (id: number, token: string) =>
    request<{ ok: boolean }>(
      `/admin/movies/${id}`,
      { method: "DELETE" },
      token
    ),

  uploadThumbnail: (id: number, file: File, token: string) => {
    const form = new FormData();
    form.append("file", file);
    return request<Movie>(
      `/admin/movies/${id}/thumbnail`,
      { method: "POST", body: form },
      token
    );
  },

  uploadBackdrop: (id: number, file: File, token: string) => {
    const form = new FormData();
    form.append("file", file);
    return request<Movie>(
      `/admin/movies/${id}/backdrop`,
      { method: "POST", body: form },
      token
    );
  },

  createUser: (
    payload: { name: string; email: string; password: string; role: Role },
    token: string
  ) =>
    request<User>(
      "/admin/users",
      { method: "POST", body: JSON.stringify(payload) },
      token
    ),

  listUsers: (token: string) => request<User[]>("/admin/users", {}, token),

  searchTmdb: (query: string, token: string) =>
    request<TMDBSearchResult[]>(
      `/admin/tmdb/search?query=${encodeURIComponent(query)}`,
      {},
      token
    ),

  createMovieFromTmdb: (
    payload: { tmdb_id: number; filename: string; is_private: boolean },
    token: string
  ) =>
    request<Movie>(
      "/admin/movies/from-tmdb",
      { method: "POST", body: JSON.stringify(payload) },
      token
    ),
};

export { ApiError };
