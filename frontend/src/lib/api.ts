const STORAGE_KEY = "silvaflix_backend_url";
const DEFAULT_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const NPOINT_URL = "https://api.npoint.io/a008871770ac1c671939";

let cachedUrl: string | null = null;
let lastSyncTime = 0;

export async function syncApiUrl(force = false): Promise<string> {
  const now = Date.now();
  if (!force && cachedUrl && now - lastSyncTime < 10000) {
    return cachedUrl;
  }

  if (typeof window !== "undefined") {
    try {
      const res = await fetch(NPOINT_URL, {
        headers: { "bypass-tunnel-reminder": "true" },
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        if (data.url && typeof data.url === "string" && data.url.startsWith("http")) {
          const fresh = data.url.replace(/\/+$/, "");
          localStorage.setItem(STORAGE_KEY, fresh);
          cachedUrl = fresh;
          lastSyncTime = now;
          return fresh;
        }
      }
    } catch {
      // ignore
    }
  }

  if (typeof window !== "undefined") {
    const local = localStorage.getItem(STORAGE_KEY);
    if (local) {
      cachedUrl = local;
      return local;
    }
  }

  cachedUrl = DEFAULT_URL;
  return DEFAULT_URL;
}

export function getApiUrl(): string {
  if (cachedUrl) return cachedUrl;
  if (typeof window !== "undefined") {
    const local = localStorage.getItem(STORAGE_KEY);
    if (local) {
      cachedUrl = local;
      return local;
    }
  }
  return DEFAULT_URL;
}

export function setApiUrl(url: string) {
  const clean = url.replace(/\/+$/, "");
  cachedUrl = clean;
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, clean);
  }
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
  year?: number | null;
  genre?: string | null;
  duration_minutes?: number | null;
  director?: string | null;
  cast?: string | null;
  filename: string;
  thumbnail_filename?: string | null;
  backdrop_filename?: string | null;
  is_private: boolean;
  is_featured: boolean;

  is_series: boolean;
  series_title?: string | null;
  season_number?: number | null;
  episode_number?: number | null;
  episode_title?: string | null;

  collection_name?: string | null;
  trailer_youtube_id?: string | null;

  video_url?: string | null;
  is_external?: boolean;
  source_name?: string | null;

  created_at: string;
}

export interface MovieCollection {
  name: string;
  movies: Movie[];
}

export interface AudioTrack {
  index: number;
  title: string;
  language: string;
  language_name?: string;
  flag?: string;
  codec: string;
  is_default: boolean;
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

export interface AdminStats {
  total_movies: number;
  total_episodes?: number;
  total_duration_hours?: number;
  top_genre?: string;
  total_private: number;
  total_public: number;
  total_users: number;
  total_views: number;
  top_movies: Array<{
    id: number;
    title: string;
    views_count: number;
    year?: number;
    genre?: string;
  }>;
  recent_views: Array<{
    id: number;
    movie_id: number;
    movie_title: string;
    user_id: number;
    user_name: string;
    profile_name?: string;
    duration_watched_seconds: number;
    watched_at: string;
  }>;
}

export interface HistoryItem {
  id: number;
  movie_id: number;
  movie: Movie;
  profile_name?: string;
  last_position_seconds: number;
  duration_watched_seconds: number;
  completed: boolean;
  updated_at: string;
}

export interface TMDBSearchResult {
  tmdb_id: number;
  title: string;
  year?: string | null;
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

export interface Playlist {
  id: number;
  name: string;
  url?: string | null;
  type: string;
  channel_count: number;
  created_at: string;
}

export interface CategoryWithCount {
  category: string;
  count: number;
}

export interface Channel {
  id: number;
  name: string;
  stream_url: string;
  category: string;
  logo_url?: string | null;
  epg_id?: string | null;
  is_custom: boolean;
  playlist_id?: number | null;
  user_id?: number | null;
  is_active: boolean;
  order: number;
  created_at: string;
}

export interface PaginatedChannels {
  items: Channel[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export interface ParsedChannel {
  name: string;
  stream_url: string;
  category: string;
  logo_url?: string | null;
  epg_id?: string | null;
}

export interface ParseM3UResponse {
  success: boolean;
  total_channels: number;
  categories: Array<{ name: string; count: number }>;
  sample_channels: ParsedChannel[];
}

export interface XtreamResponse {
  success: boolean;
  server_info: Record<string, unknown>;
  user_info: Record<string, unknown>;
  total_channels?: number;
  channels_count?: number;
  categories?: Array<{ name: string; count: number }>;
  sample_channels?: ParsedChannel[];
  channels?: ParsedChannel[];
}

export interface MovieFromUrlCreate {
  video_url: string;
  title?: string;
  tmdb_id?: number;
  synopsis?: string;
  year?: number;
  genre?: string;
  director?: string;
  cast?: string;
  duration_minutes?: number;
  poster_url?: string;
  backdrop_url?: string;
  trailer_youtube_id?: string;
  is_private?: boolean;
  source_name?: string;
  is_series?: boolean;
  series_title?: string;
  season_number?: number;
  episode_number?: number;
}

export interface BatchMovieUrlItem {
  video_url: string;
  title?: string;
  category?: string;
  poster_url?: string;
  is_series?: boolean;
  series_title?: string;
  season_number?: number;
  episode_number?: number;
  episode_title?: string;
}

export interface BatchMovieImportRequest {
  items: BatchMovieUrlItem[];
  source_name?: string;
  fetch_tmdb?: boolean;
  is_private?: boolean;
}

export interface ParseMovieM3URequest {
  url?: string;
  content?: string;
}

export interface ParsedMovieItem {
  title: string;
  video_url: string;
  category: string;
  poster_url?: string | null;
  clean_title: string;
  year?: number | null;
  is_series?: boolean;
  series_title?: string;
  season_number?: number;
  episode_number?: number;
  episode_title?: string;
}

export interface ParseMovieM3UResponse {
  total: number;
  total_movies?: number;
  total_episodes?: number;
  categories: CategoryWithCount[];
  items: ParsedMovieItem[];
}

export interface MovieSource {
  name: string;
  is_external: boolean;
  count: number;
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
    if (!isRetry) {
      try {
        baseUrl = await syncApiUrl(true);
        return await request<T>(path, options, token, true);
      } catch {
        // continue
      }
    }
    throw new ApiError(
      `Não foi possível conectar ao servidor (${baseUrl}). Verifique se o SilvaFlix está rodando.`,
      0
    );
  }

  if (!res.ok) {
    let errorDetail = `Erro ${res.status}`;
    try {
      const data = await res.json();
      if (data.detail) errorDetail = data.detail;
    } catch {
      // ignore
    }
    throw new ApiError(errorDetail, res.status);
  }

  return res.json();
}

export const api = {
  // --- Autenticação ---
  login: (email: string, password: string) =>
    request<{ access_token: string; token_type: string; user: User }>(
      "/auth/login",
      { method: "POST", body: JSON.stringify({ email, password }) }
    ),

  me: (token: string) => request<User>("/auth/me", {}, token),

  // --- Filmes / Catálogo ---
  listMovies: (token: string, genre?: string, query?: string) => {
    const params = new URLSearchParams();
    if (genre && genre !== "Todos") params.set("genre", genre);
    if (query) params.set("q", query);
    const qs = params.toString();
    return request<Movie[]>(`/movies${qs ? `?${qs}` : ""}`, {}, token);
  },

  listFeaturedMovies: (token: string) =>
    request<Movie[]>("/movies/featured", {}, token),

  listMovieCollections: (token: string) =>
    request<Record<string, Movie[]>>("/movies/collections", {}, token),

  listCollections: (token: string) =>
    request<MovieCollection[]>("/movies/collections", {}, token),

  getMovie: (id: number, token: string) =>
    request<Movie>(`/movies/${id}`, {}, token),

  getAudioTracks: (id: number, token: string) =>
    request<AudioTrack[]>(`/movies/${id}/audio-tracks`, {}, token),

  getStreamUrl: (id: number, token: string) => {
    return `${getApiUrl()}/movies/${id}/stream?token=${encodeURIComponent(token)}`;
  },

  streamUrl: (id: number, token?: string | null, audioTrack?: number) => {
    const params = new URLSearchParams();
    if (token) params.set("token", token);
    if (typeof audioTrack === "number" && audioTrack > 0) {
      params.set("audio_track", String(audioTrack));
    }
    const qs = params.toString();
    return `${getApiUrl()}/movies/${id}/stream${qs ? `?${qs}` : ""}`;
  },

  getThumbnailUrl: (id: number) => {
    return `${getApiUrl()}/movies/${id}/thumbnail`;
  },

  thumbnailUrl: (id: number) => `${getApiUrl()}/movies/${id}/thumbnail`,
  backdropUrl: (id: number) => `${getApiUrl()}/movies/${id}/backdrop`,
  subtitleUrl: (id: number) => `${getApiUrl()}/movies/${id}/subtitles`,

  getBackdropUrl: (id: number) => {
    return `${getApiUrl()}/movies/${id}/backdrop`;
  },

  getMovieTrailer: (movieId: number, token: string) =>
    request<{ trailer_youtube_id: string | null }>(`/movies/${movieId}/trailer`, {}, token),

  // --- Resenhas ---
  listReviews: (movieId: number, token: string) =>
    request<Review[]>(`/movies/${movieId}/reviews`, {}, token),

  createReview: (
    movieId: number,
    payload: { rating: number; comment: string; profile_name?: string; has_spoiler?: boolean },
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

  // --- Histórico & Progresso ---
  updateProgress: (
    movieId: number,
    payload: {
      position_seconds: number;
      duration_watched_seconds: number;
      profile_name?: string;
      completed?: boolean;
    },
    token: string
  ) =>
    request<{ ok: boolean }>(
      `/movies/${movieId}/progress`,
      { method: "POST", body: JSON.stringify(payload) },
      token
    ),

  listHistory: (token: string, profileName?: string) => {
    const qs = profileName ? `?profile_name=${encodeURIComponent(profileName)}` : "";
    return request<HistoryItem[]>(`/movies/user/history${qs}`, {}, token);
  },

  // --- Watch Party ---
  createPartyRoom: (movieId: number, hostName: string, token: string) =>
    request<{ room_id: string }>(
      "/party/rooms",
      {
        method: "POST",
        body: JSON.stringify({ movie_id: movieId, host_name: hostName }),
      },
      token
    ),

  getPartyRoom: (roomId: string, token: string) =>
    request<RoomState>(`/party/rooms/${roomId}`, {}, token),

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

  // --- Admin ---
  getAdminStats: (token: string) =>
    request<AdminStats>("/admin/stats", {}, token),

  availableFiles: (token: string) =>
    request<string[]>("/admin/movies/available-files", {}, token),

  createMovie: (
    data: Record<string, unknown> | FormData,
    token: string
  ) =>
    request<Movie>(
      "/admin/movies",
      {
        method: "POST",
        body: data instanceof FormData ? data : JSON.stringify(data),
      },
      token
    ),

  updateMovie: (
    id: number,
    payload: Partial<Movie>,
    token: string
  ) =>
    request<Movie>(
      `/admin/movies/${id}`,
      { method: "PUT", body: JSON.stringify(payload) },
      token
    ),

  deleteMovie: (id: number, token: string) =>
    request<{ ok: boolean; message?: string }>(
      `/admin/movies/${id}`,
      { method: "DELETE" },
      token
    ),

  autoScanMovies: (token: string) =>
    request<AutoScanResponse>(
      "/admin/movies/auto-scan",
      { method: "POST" },
      token
    ),

  togglePrivacy: (movieId: number, token: string) =>
    request<Movie>(
      `/admin/movies/${movieId}/toggle-privacy`,
      { method: "PATCH" },
      token
    ),

  // --- Filmes Web / Importação em Lote ---
  createMovieFromUrl: (payload: MovieFromUrlCreate, token: string) =>
    request<Movie>(
      "/admin/movies/from-url",
      { method: "POST", body: JSON.stringify(payload) },
      token
    ),

  parseMovieM3U: (payload: ParseMovieM3URequest, token: string) =>
    request<ParseMovieM3UResponse>(
      "/admin/movies/parse-m3u",
      { method: "POST", body: JSON.stringify(payload) },
      token
    ),

  batchImportMovies: (payload: BatchMovieImportRequest, token: string) =>
    request<{
      total: number;
      added: number;
      errors: number;
      results: Array<{ id?: number; title?: string; url?: string; status: string; error?: string }>;
    }>(
      "/admin/movies/batch-import",
      { method: "POST", body: JSON.stringify(payload) },
      token
    ),

  bulkDeleteMovies: (movie_ids: number[], token: string) =>
    request<{ deleted: number }>(
      "/admin/movies/bulk-delete",
      { method: "POST", body: JSON.stringify({ movie_ids }) },
      token
    ),

  deleteMoviesBySource: (source_name: string, token: string) =>
    request<{ deleted: number; source_name: string }>(
      "/admin/movies/delete-by-source",
      { method: "POST", body: JSON.stringify({ source_name }) },
      token
    ),

  clearAllExternalMovies: (token: string) =>
    request<{ deleted: number; ok: boolean }>(
      "/admin/movies/clear-external",
      { method: "POST" },
      token
    ),

  abortAllImports: (token: string) =>
    request<{ ok: boolean; message: string }>(
      "/admin/movies/abort-all-imports",
      { method: "POST" },
      token
    ),

  resetImportLock: (token: string) =>
    request<{ ok: boolean; message: string }>(
      "/admin/movies/reset-import-lock",
      { method: "POST" },
      token
    ),

  listMovieSources: (token: string) =>
    request<MovieSource[]>("/movies/sources", {}, token),

  uploadThumbnail: (movieId: number, file: File, token: string) => {
    const data = new FormData();
    data.append("file", file);
    return request<Movie>(
      `/admin/movies/${movieId}/thumbnail`,
      { method: "POST", body: data },
      token
    );
  },

  uploadBackdrop: (movieId: number, file: File, token: string) => {
    const data = new FormData();
    data.append("file", file);
    return request<Movie>(
      `/admin/movies/${movieId}/backdrop`,
      { method: "POST", body: data },
      token
    );
  },

  createUser: (
    payload: { name: string; email: string; password: string; role?: Role },
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

  // --- TV Ao Vivo & IPTV ---
  listChannels: (
    token: string,
    params?: {
      category?: string;
      playlist_id?: number;
      query?: string;
      page?: number;
      limit?: number;
      all?: boolean;
    }
  ) => {
    const qs = new URLSearchParams();
    if (params?.category && params.category !== "Todos" && params.category !== "Favoritos") {
      qs.set("category", params.category);
    }
    if (params?.playlist_id) qs.set("playlist_id", String(params.playlist_id));
    if (params?.query) qs.set("q", params.query);
    if (params?.page) qs.set("page", String(params.page));
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.all) qs.set("all", "true");
    const qStr = qs.toString();
    return request<PaginatedChannels>(`/live/channels${qStr ? `?${qStr}` : ""}`, {}, token);
  },

  listChannelCategories: (token: string, playlist_id?: number) => {
    const qs = playlist_id ? `?playlist_id=${playlist_id}` : "";
    return request<CategoryWithCount[]>(`/live/categories${qs}`, {}, token);
  },

  listPlaylists: (token: string) =>
    request<Playlist[]>("/live/playlists", {}, token),

  getChannel: (id: number, token: string) =>
    request<Channel>(`/live/channels/${id}`, {}, token),

  parseM3U: (
    payload: { url?: string; content?: string; category_override?: string },
    token: string
  ) =>
    request<ParseM3UResponse>("/live/parse-m3u", {
      method: "POST",
      body: JSON.stringify(payload),
    }, token),

  connectXtream: (
    payload: { server_url: string; username: string; password: string },
    token: string
  ) =>
    request<XtreamResponse>("/live/xtream-connect", {
      method: "POST",
      body: JSON.stringify(payload),
    }, token),

  getLiveProxyUrl: (streamUrl: string) => {
    return `${getApiUrl()}/live/proxy?url=${encodeURIComponent(streamUrl)}`;
  },

  createLiveChannel: (
    payload: {
      name: string;
      stream_url: string;
      category?: string;
      logo_url?: string;
      epg_id?: string;
      playlist_id?: number;
      order?: number;
    },
    token: string
  ) =>
    request<Channel>(
      "/admin/live/channels",
      { method: "POST", body: JSON.stringify(payload) },
      token
    ),

  updateLiveChannel: (
    id: number,
    payload: Partial<Channel>,
    token: string
  ) =>
    request<Channel>(
      `/admin/live/channels/${id}`,
      { method: "PUT", body: JSON.stringify(payload) },
      token
    ),

  deleteLiveChannel: (id: number, token: string) =>
    request<{ ok: boolean; message: string }>(
      `/admin/live/channels/${id}`,
      { method: "DELETE" },
      token
    ),

  deletePlaylist: (id: number, token: string) =>
    request<{ ok: boolean; deleted_channels_count: number; message: string }>(
      `/admin/live/playlists/${id}`,
      { method: "DELETE" },
      token
    ),

  clearAllCustomChannels: (token: string) =>
    request<{ ok: boolean; deleted_channels_count: number; deleted_playlists_count: number; message: string }>(
      "/admin/live/clear-all-custom",
      { method: "POST" },
      token
    ),

  bulkDeleteChannels: (channelIds: number[], token: string) =>
    request<{ ok: boolean; deleted_count: number; message: string }>(
      "/admin/live/channels/bulk-delete",
      { method: "POST", body: JSON.stringify({ channel_ids: channelIds }) },
      token
    ),

  deleteChannelsByCategory: (category: string, token: string, playlist_id?: number) =>
    request<{ ok: boolean; deleted_count: number; message: string }>(
      "/admin/live/channels/delete-by-category",
      { method: "POST", body: JSON.stringify({ category, playlist_id }) },
      token
    ),

  organizeCategories: (token: string) =>
    request<{ ok: boolean; updated_count: number; message: string }>(
      "/admin/live/organize-categories",
      { method: "POST" },
      token
    ),

  importM3U: (
    payload: {
      name?: string;
      url?: string;
      content?: string;
      category_override?: string;
      selected_categories?: string[];
    },
    token: string
  ) =>
    request<{ ok: boolean; playlist_id: number; playlist_name: string; imported_count: number; message: string }>(
      "/admin/live/import-m3u",
      { method: "POST", body: JSON.stringify(payload) },
      token
    ),

  resetDefaultChannels: (token: string) =>
    request<{ ok: boolean; message: string }>(
      "/admin/live/reset-defaults",
      { method: "POST" },
      token
    ),
};

export { ApiError };
