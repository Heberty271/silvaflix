"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { api, Movie, User, ApiError, Role, TMDBSearchResult, AutoScanResponse, AdminStats } from "@/lib/api";
import { AppShell } from "@/components/AppShell";

export default function AdminPage() {
  const { token } = useAuth();

  const [movies, setMovies] = useState<Movie[]>([]);
  const [availableFiles, setAvailableFiles] = useState<string[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Auto-Scan
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<AutoScanResponse | null>(null);

  const [form, setForm] = useState({
    title: "",
    synopsis: "",
    year: "",
    genre: "",
    duration_minutes: "",
    director: "",
    cast: "",
    filename: "",
    is_private: true,
  });

  const [userForm, setUserForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "viewer" as Role,
  });

  const [tmdbQuery, setTmdbQuery] = useState("");
  const [tmdbResults, setTmdbResults] = useState<TMDBSearchResult[]>([]);
  const [tmdbSearching, setTmdbSearching] = useState(false);
  const [tmdbFilename, setTmdbFilename] = useState("");
  const [tmdbPrivate, setTmdbPrivate] = useState(true);
  const [tmdbCreatingId, setTmdbCreatingId] = useState<number | null>(null);

  async function refresh() {
    if (!token) return;
    const [m, f, u, st] = await Promise.all([
      api.listMovies(token),
      api.availableFiles(token),
      api.listUsers(token),
      api.getAdminStats(token).catch(() => null),
    ]);
    setMovies(m);
    setAvailableFiles(f);
    setUsers(u);
    setStats(st);
  }

  useEffect(() => {
    if (token) refresh();
  }, [token]);

  async function handleAutoScan() {
    if (!token) return;
    setError(null);
    setMessage(null);
    setScanning(true);
    try {
      const res = await api.autoScanMovies(token);
      setScanResult(res);
      setMessage(`Escaneamento concluído! ${res.added} novos títulos foram adicionados automaticamente.`);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erro ao escanear pasta");
    } finally {
      setScanning(false);
    }
  }

  async function handleCreateMovie(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError(null);
    setMessage(null);
    try {
      await api.createMovie(
        {
          title: form.title,
          synopsis: form.synopsis,
          year: form.year ? Number(form.year) : undefined,
          genre: form.genre || undefined,
          duration_minutes: form.duration_minutes ? Number(form.duration_minutes) : undefined,
          director: form.director || undefined,
          cast: form.cast || undefined,
          filename: form.filename,
          is_private: form.is_private,
        },
        token
      );
      setMessage(`"${form.title}" cadastrado.`);
      setForm({
        title: "",
        synopsis: "",
        year: "",
        genre: "",
        duration_minutes: "",
        director: "",
        cast: "",
        filename: "",
        is_private: true,
      });
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erro ao cadastrar");
    }
  }

  async function handleSearchTmdb(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !tmdbQuery.trim()) return;
    setError(null);
    setMessage(null);
    setTmdbSearching(true);
    try {
      const results = await api.searchTmdb(tmdbQuery.trim(), token);
      setTmdbResults(results);
      if (results.length === 0) setMessage("Nenhum resultado encontrado no TMDB para essa busca.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erro ao buscar no TMDB");
    } finally {
      setTmdbSearching(false);
    }
  }

  async function handleUseTmdbResult(result: TMDBSearchResult) {
    if (!token) return;
    if (!tmdbFilename) {
      setError("Selecione primeiro qual arquivo de vídeo corresponde a esse filme.");
      return;
    }
    setError(null);
    setMessage(null);
    setTmdbCreatingId(result.tmdb_id);
    try {
      await api.createMovieFromTmdb(
        { tmdb_id: result.tmdb_id, filename: tmdbFilename, is_private: tmdbPrivate },
        token
      );
      setMessage(`"${result.title}" cadastrado com dados do TMDB.`);
      setTmdbResults([]);
      setTmdbQuery("");
      setTmdbFilename("");
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erro ao cadastrar a partir do TMDB");
    } finally {
      setTmdbCreatingId(null);
    }
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError(null);
    setMessage(null);
    try {
      await api.createUser(userForm, token);
      setMessage(`Usuário "${userForm.name}" criado.`);
      setUserForm({ name: "", email: "", password: "", role: "viewer" });
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erro ao criar usuário");
    }
  }

  async function handleTogglePrivacy(movie: Movie) {
    if (!token) return;
    await api.togglePrivacy(movie.id, token);
    refresh();
  }

  async function handleToggleFeatured(movie: Movie) {
    if (!token) return;
    await api.updateMovie(movie.id, { is_featured: !movie.is_featured }, token);
    refresh();
  }

  async function handleDelete(movie: Movie) {
    if (!token) return;
    if (!confirm(`Remover "${movie.title}" do catálogo?`)) return;
    await api.deleteMovie(movie.id, token);
    refresh();
  }

  async function handleThumbnail(movie: Movie, file: File | undefined) {
    if (!token || !file) return;
    await api.uploadThumbnail(movie.id, file, token);
    refresh();
  }

  async function handleBackdrop(movie: Movie, file: File | undefined) {
    if (!token || !file) return;
    await api.uploadBackdrop(movie.id, file, token);
    refresh();
  }

  return (
    <AppShell requireAdmin showSearch={false}>
      <main className="space-y-10 px-4 py-8 lg:px-8">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-brand">Bastidores</p>
          <h1 className="text-3xl font-bold">Painel administrativo</h1>
        </div>

        {message && (
          <p className="rounded-lg border border-brand/50 bg-brand/10 p-4 text-sm font-semibold text-brand2">
            {message}
          </p>
        )}
        {error && (
          <p className="rounded-lg border border-brand bg-brand/10 p-4 text-sm font-semibold text-brand2">
            {error}
          </p>
        )}

        {/* Dashboard de Estatísticas da Família */}
        {stats && (
          <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className="rounded-xl border border-rule bg-panel p-5 shadow-card">
              <p className="text-xs font-bold uppercase tracking-wider text-mute">Total de Filmes</p>
              <p className="mt-2 text-3xl font-black text-ink">{stats.total_movies}</p>
            </div>
            <div className="rounded-xl border border-rule bg-panel p-5 shadow-card">
              <p className="text-xs font-bold uppercase tracking-wider text-mute">Episódios de Séries</p>
              <p className="mt-2 text-3xl font-black text-brand2">{stats.total_episodes}</p>
            </div>
            <div className="rounded-xl border border-rule bg-panel p-5 shadow-card">
              <p className="text-xs font-bold uppercase tracking-wider text-mute">Horas de Conteúdo</p>
              <p className="mt-2 text-3xl font-black text-emerald-400">{stats.total_duration_hours}h</p>
            </div>
            <div className="rounded-xl border border-rule bg-panel p-5 shadow-card">
              <p className="text-xs font-bold uppercase tracking-wider text-mute">Gênero Favorito da Casa</p>
              <p className="mt-2 truncate text-2xl font-black text-amber-400">{stats.top_genre}</p>
            </div>
          </section>
        )}

        {/* Auto-Scan Inteligente com TMDB */}
        <section className="rounded-xl border border-rule bg-panel p-6 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-ink">Auto-Scan Inteligente (Escanear Pasta)</h2>
              <p className="mt-1 text-xs text-mute">
                Varre automaticamente todos os arquivos de vídeo do seu HD/pasta, identifica franquias, busca detalhes no TMDB,
                baixa pôsteres e fundos em alta definição e cadastra tudo de uma só vez!
              </p>
            </div>
            <button
              onClick={handleAutoScan}
              disabled={scanning}
              className="flex items-center gap-2 rounded-xl bg-brand px-6 py-3 font-black text-white shadow-xl transition-all hover:scale-105 hover:bg-brand2 disabled:opacity-50"
            >
              {scanning ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>Escaneando HD...</span>
                </>
              ) : (
                <>
                  <span>🚀</span>
                  <span>Escanear Novos Filmes</span>
                </>
              )}
            </button>
          </div>

          {availableFiles.length > 0 && (
            <div className="mt-4 rounded-lg bg-panel2 p-3 text-xs text-mute">
              <strong>{availableFiles.length}</strong> arquivos de vídeo encontrados aguardando cadastro.
            </div>
          )}

          {scanResult && (
            <div className="mt-4 rounded-lg border border-rule bg-panel2 p-4 text-xs">
              <p className="font-bold text-ink mb-2">Resultado do Último Escaneamento:</p>
              <p className="text-mute">
                Arquivos analisados: <strong>{scanResult.scanned}</strong> · Adicionados: <strong>{scanResult.added}</strong>
              </p>
              <div className="mt-3 max-h-40 overflow-y-auto space-y-1">
                {scanResult.results.map((r, i) => (
                  <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-rule/50">
                    <span className="truncate max-w-[70%] text-ink">{r.title || r.filename}</span>
                    <span className={r.status === "added" ? "text-emerald-400 font-bold" : "text-amber-400 font-bold"}>
                      {r.status === "added" ? "✓ Cadastrado" : r.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Cadastrar via TMDB Manual */}
        <section className="rounded-xl border border-rule bg-panel p-6 shadow-card">
          <h2 className="mb-1 text-xl font-bold">Buscar no TMDB (Individual)</h2>
          <p className="mb-4 text-xs text-mute">
            Preenche título, sinopse, ano, gênero, duração, direção, elenco, trailers e coleções automaticamente.
          </p>

          <form onSubmit={handleSearchTmdb} className="mb-4 grid gap-4 sm:grid-cols-[1fr_auto]">
            <input
              value={tmdbQuery}
              onChange={(e) => setTmdbQuery(e.target.value)}
              placeholder="Título do filme, ex: Harry Potter e a Pedra Filosofal"
              className="input"
            />
            <button
              type="submit"
              disabled={tmdbSearching}
              className="rounded-lg bg-brand px-6 py-2 font-semibold hover:opacity-90 disabled:opacity-50"
            >
              {tmdbSearching ? "Buscando..." : "Buscar"}
            </button>
          </form>

          {tmdbResults.length > 0 && (
            <>
              <div className="mb-4 grid gap-4 sm:grid-cols-2">
                <Field label="Arquivo de vídeo correspondente">
                  <select
                    value={tmdbFilename}
                    onChange={(e) => setTmdbFilename(e.target.value)}
                    className="input"
                  >
                    <option value="">Selecione...</option>
                    {availableFiles.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Visibilidade">
                  <select
                    value={tmdbPrivate ? "private" : "public"}
                    onChange={(e) => setTmdbPrivate(e.target.value === "private")}
                    className="input"
                  >
                    <option value="private">Privado (só admin vê)</option>
                    <option value="public">Público (todos veem)</option>
                  </select>
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {tmdbResults.map((r) => (
                  <div key={r.tmdb_id} className="flex gap-3 rounded-lg border border-rule bg-panel2 p-3">
                    {r.poster_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={r.poster_url}
                        alt={`Capa de ${r.title}`}
                        className="h-24 w-16 flex-shrink-0 rounded object-cover"
                      />
                    ) : (
                      <div className="flex h-24 w-16 flex-shrink-0 items-center justify-center rounded bg-void text-[10px] text-mute">
                        sem capa
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{r.title}</p>
                      <p className="text-xs text-mute">{r.year || "?"}</p>
                      <p className="mt-1 line-clamp-2 text-xs text-mute">
                        {r.overview || "Sem sinopse disponível."}
                      </p>
                      <button
                        onClick={() => handleUseTmdbResult(r)}
                        disabled={tmdbCreatingId === r.tmdb_id}
                        className="mt-2 text-xs font-semibold text-brand2 hover:underline disabled:opacity-50"
                      >
                        {tmdbCreatingId === r.tmdb_id ? "Cadastrando..." : "Usar este →"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        {/* Cadastrar filme manualmente */}
        <section className="rounded-xl border border-rule bg-panel p-6 shadow-card">
          <h2 className="mb-4 text-xl font-bold">Cadastrar filme manualmente</h2>
          <form onSubmit={handleCreateMovie} className="grid gap-4 sm:grid-cols-2">
            <Field label="Título">
              <input
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="input"
              />
            </Field>
            <Field label="Arquivo de vídeo">
              <select
                required
                value={form.filename}
                onChange={(e) => setForm({ ...form, filename: e.target.value })}
                className="input"
              >
                <option value="">Selecione...</option>
                {availableFiles.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Ano">
              <input
                type="number"
                value={form.year}
                onChange={(e) => setForm({ ...form, year: e.target.value })}
                className="input"
              />
            </Field>
            <Field label="Gênero">
              <input
                value={form.genre}
                onChange={(e) => setForm({ ...form, genre: e.target.value })}
                className="input"
              />
            </Field>
            <Field label="Duração (min)">
              <input
                type="number"
                value={form.duration_minutes}
                onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })}
                className="input"
              />
            </Field>
            <Field label="Direção">
              <input
                value={form.director}
                onChange={(e) => setForm({ ...form, director: e.target.value })}
                className="input"
              />
            </Field>
            <Field label="Elenco (separado por vírgula)" full>
              <input
                value={form.cast}
                onChange={(e) => setForm({ ...form, cast: e.target.value })}
                className="input"
              />
            </Field>
            <Field label="Visibilidade">
              <select
                value={form.is_private ? "private" : "public"}
                onChange={(e) => setForm({ ...form, is_private: e.target.value === "private" })}
                className="input"
              >
                <option value="private">Privado (só admin vê)</option>
                <option value="public">Público (todos veem)</option>
              </select>
            </Field>
            <Field label="Sinopse" full>
              <textarea
                value={form.synopsis}
                onChange={(e) => setForm({ ...form, synopsis: e.target.value })}
                className="input min-h-[80px]"
              />
            </Field>
            <div className="sm:col-span-2">
              <button
                type="submit"
                className="rounded-lg bg-brand px-6 py-2.5 font-semibold text-white hover:opacity-90"
              >
                Cadastrar
              </button>
            </div>
          </form>
        </section>

        {/* Lista de filmes */}
        <section>
          <h2 className="mb-4 text-xl font-bold">Catálogo ({movies.length})</h2>
          <div className="overflow-x-auto rounded-xl border border-rule bg-panel shadow-card">
            <table className="w-full text-sm">
              <thead className="bg-panel2 text-left text-mute">
                <tr>
                  <th className="px-4 py-3">Título</th>
                  <th className="px-4 py-3">Coleção / Franquia</th>
                  <th className="px-4 py-3">Visibilidade</th>
                  <th className="px-4 py-3">Destaque</th>
                  <th className="px-4 py-3">Capa</th>
                  <th className="px-4 py-3">Fundo</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {movies.map((m) => (
                  <tr key={m.id} className="border-t border-rule hover:bg-panel2/50">
                    <td className="px-4 py-3 font-semibold">{m.title}</td>
                    <td className="px-4 py-3 text-xs text-mute">{m.collection_name || "—"}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleTogglePrivacy(m)}
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          m.is_private ? "bg-brand/20 text-brand2" : "bg-emerald-500/20 text-emerald-400"
                        }`}
                      >
                        {m.is_private ? "Privado" : "Público"}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleToggleFeatured(m)}
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          m.is_featured ? "bg-amber-500/20 text-amber-400 font-bold" : "bg-panel2 text-mute"
                        }`}
                      >
                        {m.is_featured ? "★ Destaque" : "Marcar"}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <label className="cursor-pointer text-brand2 hover:underline">
                        {m.thumbnail_filename ? "Trocar" : "Enviar"}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => handleThumbnail(m, e.target.files?.[0])}
                        />
                      </label>
                    </td>
                    <td className="px-4 py-3">
                      <label className="cursor-pointer text-brand2 hover:underline">
                        {m.backdrop_filename ? "Trocar" : "Enviar"}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => handleBackdrop(m, e.target.files?.[0])}
                        />
                      </label>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => handleDelete(m)} className="text-brand2 hover:underline">
                        Remover
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Usuários */}
        <section className="rounded-xl border border-rule bg-panel p-6 shadow-card">
          <h2 className="mb-4 text-xl font-bold">Convidar familiar</h2>
          <form onSubmit={handleCreateUser} className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome">
              <input
                required
                value={userForm.name}
                onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
                className="input"
              />
            </Field>
            <Field label="Email">
              <input
                required
                type="email"
                value={userForm.email}
                onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                className="input"
              />
            </Field>
            <Field label="Senha">
              <input
                required
                type="password"
                value={userForm.password}
                onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                className="input"
              />
            </Field>
            <Field label="Perfil">
              <select
                value={userForm.role}
                onChange={(e) => setUserForm({ ...userForm, role: e.target.value as Role })}
                className="input"
              >
                <option value="viewer">Viewer (só assiste)</option>
                <option value="admin">Admin (gerencia tudo)</option>
              </select>
            </Field>
            <div className="sm:col-span-2">
              <button
                type="submit"
                className="rounded-lg border border-brand px-6 py-2.5 font-semibold text-brand2 hover:bg-brand hover:text-ink"
              >
                Criar acesso
              </button>
            </div>
          </form>

          <ul className="mt-6 divide-y divide-rule text-sm">
            {users.map((u) => (
              <li key={u.id} className="flex items-center justify-between py-2">
                <span>
                  {u.name} <span className="text-mute">· {u.email}</span>
                </span>
                <span className="text-mute">{u.role}</span>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </AppShell>
  );
}

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <label className={`block text-sm text-mute ${full ? "sm:col-span-2" : ""}`}>
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}
