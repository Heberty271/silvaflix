from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from . import models, party
from .database import engine
from .config import CORS_ORIGINS
from .routers import auth_routes, movies_routes, live_routes

# 1. Cria tabelas caso nao existam
models.Base.metadata.create_all(bind=engine)

# 2. Migracao automatica de colunas novas no SQLite
def run_sqlite_migrations():
    with engine.connect() as conn:
        # Migrações da tabela movies
        result = conn.execute(text("PRAGMA table_info(movies)")).fetchall()
        existing_movie_cols = {row[1] for row in result}
        
        new_movie_cols = [
            ("director", "VARCHAR"),
            ("cast", "VARCHAR"),
            ("backdrop_filename", "VARCHAR"),
            ("is_featured", "BOOLEAN NOT NULL DEFAULT 0"),
            ("is_series", "BOOLEAN NOT NULL DEFAULT 0"),
            ("series_title", "VARCHAR"),
            ("season_number", "INTEGER"),
            ("episode_number", "INTEGER"),
            ("episode_title", "VARCHAR"),
            ("collection_name", "VARCHAR"),
            ("trailer_youtube_id", "VARCHAR"),
            ("video_url", "VARCHAR"),
            ("is_external", "BOOLEAN NOT NULL DEFAULT 0"),
            ("source_name", "VARCHAR"),
        ]
        for col_name, col_type in new_movie_cols:
            if col_name not in existing_movie_cols:
                try:
                    conn.execute(text(f"ALTER TABLE movies ADD COLUMN {col_name} {col_type}"))
                    conn.commit()
                except Exception:
                    pass

        # Migrações da tabela channels
        result_ch = conn.execute(text("PRAGMA table_info(channels)")).fetchall()
        existing_ch_cols = {row[1] for row in result_ch}

        if "playlist_id" not in existing_ch_cols:
            try:
                conn.execute(text("ALTER TABLE channels ADD COLUMN playlist_id INTEGER REFERENCES playlists(id) ON DELETE CASCADE"))
                conn.commit()
            except Exception:
                pass

        # Cria índices de alta performance para busca e filtros de canais
        try:
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_channels_cat ON channels(category)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_channels_playlist ON channels(playlist_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_channels_active ON channels(is_active)"))
            conn.commit()
        except Exception:
            pass

        # Agrupa canais customizados legados sem playlist em uma playlist gerenciável
        try:
            orphan_count = conn.execute(text("SELECT count(*) FROM channels WHERE is_custom=1 AND (playlist_id IS NULL OR playlist_id=0)")).scalar()
            if orphan_count and orphan_count > 0:
                conn.execute(text(
                    "INSERT INTO playlists (name, type, channel_count, created_at) "
                    "VALUES ('Lista IPTV Importada Anteriormente', 'm3u', :cnt, datetime('now'))"
                ), {"cnt": orphan_count})
                conn.commit()
                playlist_id = conn.execute(text("SELECT last_insert_rowid()")).scalar()
                if playlist_id:
                    conn.execute(text("UPDATE channels SET playlist_id = :pid WHERE is_custom=1 AND (playlist_id IS NULL OR playlist_id=0)"), {"pid": playlist_id})
                    conn.commit()
        except Exception:
            pass

run_sqlite_migrations()

app = FastAPI(title="SilvaFlix API — Streaming Familiar")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_routes.router)
app.include_router(movies_routes.router)
app.include_router(movies_routes.admin_router)
app.include_router(live_routes.router)
app.include_router(live_routes.admin_router)
app.include_router(party.router)


@app.get("/health")
def health():
    return {"status": "ok"}
